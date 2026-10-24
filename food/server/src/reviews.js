// Reviews: after a delivered order the customer gives stars, a few words and optionally a photo of the food. They show
// on the restaurant's page (newest first, with the average and how the stars spread). The restaurant can reply once;
// the owner of Kezia's Food can hide a review (its stars then stop counting too).
const db = require("./db");
const { needUser, needAdmin, needRole } = require("./auth");
const { savePhoto } = require("./owner");
const { bad, forbidden, notFound, str } = require("./util");

const firstName = n => (String(n || "").trim().split(/\s+/)[0] || "Customer").slice(0, 20);
const dishes = items => (items || []).map(i => i.name).slice(0, 3).join(", ");
const pub = o => ({ id: o.id, name: firstName(o.customer_name), stars: o.rating, text: o.review, photo: o.review_photo, reply: o.review_reply, at: o.rated_at, dishes: dishes(o.items) });

function routes(app) {
  // the customer adds a photo to their review (within a week)
  app.post("/v1/orders/:id/review-photo", { preHandler: needUser, config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const o = await db.one("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (!o) throw notFound("Order not found");
    if (o.user_id !== req.user.id) throw forbidden();
    if (!o.rating || !o.rated_at || Date.now() - new Date(o.rated_at) > 7 * 86400000) throw bad("Rate the order first");
    const file = await req.file();
    if (!file) throw bad("Choose a photo");
    const photo = await savePhoto(file);
    await db.q("UPDATE orders SET review_photo = $2 WHERE id = $1", [o.id, photo]);
    return { photo };
  });

  // public: a restaurant's reviews
  app.get("/v1/restaurants/:id/reviews", async (req) => {
    const r = await db.one("SELECT id, rating_sum, rating_count FROM restaurants WHERE id = $1", [req.params.id]);
    if (!r) throw notFound("Restaurant not found");
    const offset = Math.max(0, Math.min(500, Number(req.query.offset) || 0));
    const rows = await db.many(`SELECT * FROM orders WHERE restaurant_id = $1 AND rating IS NOT NULL AND NOT review_hidden AND (review IS NOT NULL AND review <> '' OR review_photo IS NOT NULL)
      ORDER BY rated_at DESC NULLS LAST LIMIT 20 OFFSET $2`, [r.id, offset]);
    const spread = await db.many("SELECT rating, count(*)::int n FROM orders WHERE restaurant_id = $1 AND rating IS NOT NULL AND NOT review_hidden GROUP BY rating", [r.id]);
    return { rating: r.rating_count ? Math.round(r.rating_sum / r.rating_count * 10) / 10 : null, count: r.rating_count,
      spread: [5, 4, 3, 2, 1].map(s => (spread.find(x => x.rating === s) || { n: 0 }).n), reviews: rows.map(pub) };
  });

  // the restaurant's team: every review, and a reply
  app.get("/v1/restaurant/:rid/reviews", { preHandler: needRole("owner", "manager") }, async (req) => {
    const rows = await db.many("SELECT * FROM orders WHERE restaurant_id = $1 AND rating IS NOT NULL ORDER BY rated_at DESC NULLS LAST LIMIT 100", [req.params.rid]);
    return { reviews: rows.map(o => ({ ...pub(o), hidden: o.review_hidden })) };
  });
  app.post("/v1/restaurant/:rid/reviews/:oid/reply", { preHandler: needRole("owner", "manager") }, async (req) => {
    const text = str(req.body?.text, 300);
    const o = await db.one("UPDATE orders SET review_reply = $3 WHERE id = $2 AND restaurant_id = $1 AND rating IS NOT NULL RETURNING *", [req.params.rid, req.params.oid, text || null]);
    if (!o) throw notFound("Review not found");
    return { review: pub(o) };
  });

  // the owner of Kezia's Food: recent reviews everywhere, and hide or show one
  app.get("/v1/admin/reviews", { preHandler: needAdmin }, async () => {
    const rows = await db.many(`SELECT o.*, r.name restaurant FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE o.rating IS NOT NULL ORDER BY o.rated_at DESC NULLS LAST LIMIT 100`);
    return { reviews: rows.map(o => ({ ...pub(o), restaurant: o.restaurant, hidden: o.review_hidden, phone: o.customer_phone })) };
  });
  app.patch("/v1/admin/reviews/:oid", { preHandler: needAdmin }, async (req) => {
    const hide = !!req.body?.hidden;
    const o = await db.one("UPDATE orders SET review_hidden = $2 WHERE id = $1 AND rating IS NOT NULL AND review_hidden <> $2 RETURNING *", [req.params.oid, hide]);
    if (o) await db.q(`UPDATE restaurants SET rating_sum = rating_sum ${hide ? "-" : "+"} $2, rating_count = rating_count ${hide ? "- 1" : "+ 1"} WHERE id = $1`, [o.restaurant_id, o.rating]);
    return { ok: true };
  });
}

module.exports = { routes };
