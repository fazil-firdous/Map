// The order engine. Every step is a guarded state change (UPDATE … WHERE status = expected), so two taps or two
// phones can never push an order through the same step twice.
//
//   placed ──accept──▶ accepted (UPI: customer pays the restaurant) ──"I've paid"──▶ pay_claimed ──restaurant: received──▶ confirmed
//      │                  (cash orders go straight to confirmed)                                                              │
//      └─reject/expire                                                         confirmed ──▶ preparing ──▶ out (live GPS) ──▶ delivered
//
// Customers cancel free before paying, and for a short window after payment is confirmed; then the kitchen starts.
const db = require("./db");
const config = require("./config");
const { needUser, roleAt } = require("./auth");
const { quote, setting, visible } = require("./catalog");
const { bad, forbidden, notFound, str } = require("./util");

const OPEN = ["placed", "accepted", "pay_claimed", "confirmed", "preparing", "out"];
const PAID = ["confirmed", "preparing", "out"];

function view(o, r, as) {
  const v = {
    id: o.id, status: o.status, pay_method: o.pay_method, items: o.items, item_total: o.item_total, delivery_fee: o.delivery_fee, packing: o.packing,
    total: o.total, km: Number(o.km), address: o.address, note: o.note, utr: o.utr, pay_issue: o.pay_issue, reject_reason: o.reject_reason,
    cancel_by: o.cancel_by, cancel_reason: o.cancel_reason, refund: o.refund, rating: o.rating, review: o.review,
    rider: o.out_at ? { name: o.rider_name, phone: o.rider_phone, lat: o.rider_lat, lon: o.rider_lon, at: o.rider_at } : null,
    times: { created: o.created_at, accept_by: o.accept_by, accepted: o.accepted_at, pay_by: o.pay_by, pay_claimed: o.pay_claimed_at, confirmed: o.confirmed_at,
      cancel_until: o.cancel_until, preparing: o.preparing_at, out: o.out_at, delivered: o.delivered_at, closed: o.closed_at },
    restaurant: { id: r.id, name: r.name, phone: r.phone, area: r.area, lat: r.lat, lon: r.lon, photo: r.photo, prep_min: r.prep_min },
    now: new Date(),
  };
  if (o.pay_method === "upi" && o.accepted_at) v.pay = { upi_id: r.upi_id, upi_name: r.upi_name || r.name };
  if (as !== "customer") Object.assign(v, { customer: { name: o.customer_name, phone: o.status === "placed" ? null : o.customer_phone }, commission: o.commission, commission_pct: Number(o.commission_pct) });
  return v;
}
async function load(id) {
  const o = await db.one("SELECT * FROM orders WHERE id = $1", [String(id || "").toUpperCase()]);
  if (!o) throw notFound("Order not found");
  const r = await db.one("SELECT * FROM restaurants WHERE id = $1", [o.restaurant_id]);
  return { o, r };
}
/** Who is looking: the customer, or the restaurant's team (owner/manager/rider). */
async function access(req, o) {
  if (o.user_id === req.user.id) return "customer";
  const role = await roleAt(req.user, o.restaurant_id);
  if (role || req.user.role === "admin") return role || "admin";
  throw forbidden();
}
/** Guarded transition: set fields only if the order is still in one of the expected states. */
async function step(id, from, set, extra = "") {
  const keys = Object.keys(set), vals = Object.values(set);
  const sql = `UPDATE orders SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}${extra ? ", " + extra : ""} WHERE id = $1 AND status = ANY($2) RETURNING *`;
  const o = await db.one(sql, [id, from, ...vals]);
  if (!o) throw bad("This order has already moved on. Pull to refresh");
  return o;
}
const team = (role, ...allowed) => { if (!allowed.includes(role) && role !== "admin") throw forbidden("Only the restaurant's team can do this"); };
const mins = m => new Date(Date.now() + m * 60000);

function routes(app) {
  // ---- Customer ----
  app.post("/v1/orders", { preHandler: needUser, config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const b = req.body || {};
    const r = await db.one(`SELECT r.* FROM restaurants r WHERE r.id = $1 AND ${visible}`, [b.restaurant_id]);
    if (!r) throw notFound("Restaurant not found");
    const a = b.address_id ? await db.one("SELECT * FROM addresses WHERE id = $1 AND user_id = $2", [Number(b.address_id), req.user.id]) : null;
    if (!a) throw bad("Choose a delivery address");
    const pay = b.pay_method === "cod" ? "cod" : "upi";
    if (pay === "cod" && !r.cod) throw bad(`${r.name} takes UPI only`);
    if (pay === "cod" && req.user.no_shows >= 2) throw bad("Cash on delivery isn't available on your account. Please pay by UPI");
    if (pay === "upi" && !r.upi_id) throw bad(`${r.name} hasn't set up UPI yet. Choose cash on delivery`);
    const live = await db.one(`SELECT count(*)::int n FROM orders WHERE user_id = $1 AND status = ANY($2)`, [req.user.id, OPEN]);
    if (live.n >= 3) throw bad("You have 3 orders in progress. Wait for one to finish");
    const qt = await quote(r, b.items, a.lat, a.lon);
    if (qt.problems.length) throw bad(qt.problems[0]);
    const pct = r.commission_pct !== null ? Number(r.commission_pct) : Number(await setting("commission_pct")) || 0;
    const o = await db.one(`INSERT INTO orders (id, user_id, restaurant_id, status, pay_method, items, item_total, delivery_fee, packing, total, km, commission_pct, commission,
        address, customer_phone, customer_name, note, accept_by)
      VALUES ('KF' || nextval('order_no'), $1, $2, 'placed', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now() + make_interval(mins => $16)) RETURNING *`,
      [req.user.id, r.id, pay, JSON.stringify(qt.lines), qt.item_total, qt.delivery_fee, qt.packing, qt.total, qt.km, pct, Math.round(qt.item_total * pct / 100),
       JSON.stringify({ label: a.label, landmark: a.landmark, lat: a.lat, lon: a.lon }), req.user.phone, req.user.name, str(b.note, 200), r.accept_min]);
    return { order: view(o, r, "customer") };
  });

  app.get("/v1/orders", { preHandler: needUser }, async (req) => {
    const rows = await db.many(`SELECT o.*, r.name rname, r.photo rphoto FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 50`, [req.user.id]);
    return { orders: rows.map(o => ({ id: o.id, status: o.status, total: o.total, items: o.items, created: o.created_at, restaurant: { id: o.restaurant_id, name: o.rname, photo: o.rphoto }, rating: o.rating, refund: o.refund })) };
  });

  app.get("/v1/orders/:id", { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    return { order: view(o, r, await access(req, o)) };
  });

  app.post("/v1/orders/:id/paid", { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    if (await access(req, o) !== "customer") throw forbidden();
    const utr = String(req.body?.utr || "").replace(/\D/g, "").slice(-12) || null;
    const n = await step(o.id, ["accepted"], { status: "pay_claimed", utr, pay_issue: false }, "pay_claimed_at = now()");
    return { order: view(n, r, "customer") };
  });

  app.post("/v1/orders/:id/cancel", { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    const as = await access(req, o), reason = str(req.body?.reason, 160);
    let n;
    if (as === "customer") {
      if (["placed", "accepted"].includes(o.status)) n = await step(o.id, ["placed", "accepted"], { status: "cancelled", cancel_by: "customer", cancel_reason: reason }, "closed_at = now()");
      else if (o.status === "pay_claimed") n = await step(o.id, ["pay_claimed"], { status: "cancelled", cancel_by: "customer", cancel_reason: reason, refund: "due" }, "closed_at = now()");
      else if (o.status === "confirmed" && o.cancel_until && new Date(o.cancel_until) > new Date())
        n = await step(o.id, ["confirmed"], { status: "cancelled", cancel_by: "customer", cancel_reason: reason, refund: o.pay_method === "upi" ? "due" : null }, "closed_at = now()");
      else throw bad("The kitchen has started your order, so it can't be cancelled now. Call the restaurant if there's a problem");
    } else {
      team(as, "owner", "manager");
      const paid = PAID.includes(o.status) && o.pay_method === "upi" || o.status === "pay_claimed";
      n = await step(o.id, OPEN, { status: "cancelled", cancel_by: "restaurant", cancel_reason: reason || "Cancelled by the restaurant", refund: paid ? "due" : null }, "closed_at = now()");
    }
    return { order: view(n, r, as) };
  });

  app.post("/v1/orders/:id/rate", { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    if (await access(req, o) !== "customer") throw forbidden();
    const stars = Math.round(Number(req.body?.rating));
    if (!(stars >= 1 && stars <= 5)) throw bad("Choose 1 to 5 stars");
    const n = await db.one("UPDATE orders SET rating = $2, review = $3 WHERE id = $1 AND status = 'delivered' AND rating IS NULL RETURNING *", [o.id, stars, str(req.body?.review, 300)]);
    if (!n) throw bad("You can rate a delivered order once");
    await db.q("UPDATE restaurants SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE id = $1", [r.id, stars]);
    return { order: view(n, r, "customer") };
  });

  app.post("/v1/orders/:id/refund-received", { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    if (await access(req, o) !== "customer") throw forbidden();
    const n = await db.one("UPDATE orders SET refund = 'received' WHERE id = $1 AND refund IN ('due', 'sent') RETURNING *", [o.id]);
    if (!n) throw bad("No refund pending on this order");
    return { order: view(n, r, "customer") };
  });

  // ---- Restaurant team ----
  app.get("/v1/restaurant/:rid/orders", { preHandler: needUser }, async (req) => {
    const role = await roleAt(req.user, req.params.rid);
    if (!role && req.user.role !== "admin") throw forbidden();
    const r = await db.one("SELECT * FROM restaurants WHERE id = $1", [req.params.rid]);
    const active = req.query.scope !== "history";
    const rows = await db.many(`SELECT * FROM orders WHERE restaurant_id = $1 AND ${active ? "status = ANY($2)" : "NOT (status = ANY($2)) AND created_at > now() - interval '30 days'"}
      ${role === "rider" ? "AND status IN ('preparing', 'out', 'confirmed')" : ""} ORDER BY created_at ${active ? "ASC" : "DESC"} LIMIT 100`, [r.id, OPEN]);
    return { orders: rows.map(o => view(o, r, role || "admin")), role: role || "admin", is_open: r.is_open, now: new Date() };
  });

  const act = (path, fn) => app.post("/v1/orders/:id/" + path, { preHandler: needUser }, async (req) => {
    const { o, r } = await load(req.params.id);
    const as = await access(req, o);
    if (as === "customer") throw forbidden("Only the restaurant's team can do this");
    const n = await fn(o, r, as, req);
    return { order: view(n, r, as) };
  });
  act("accept", (o, r, as) => { team(as, "owner", "manager");
    return o.pay_method === "cod" ? step(o.id, ["placed"], { status: "confirmed", cancel_until: mins(r.cancel_min) }, "accepted_at = now(), confirmed_at = now()")
      : step(o.id, ["placed"], { status: "accepted", pay_by: mins(r.pay_min) }, "accepted_at = now()"); });
  act("reject", (o, r, as, req) => { team(as, "owner", "manager");
    return step(o.id, ["placed"], { status: "rejected", reject_reason: str(req.body?.reason, 160) || "The restaurant can't take this order right now" }, "closed_at = now()"); });
  act("payment", (o, r, as, req) => { team(as, "owner", "manager");
    return req.body?.received ? step(o.id, ["pay_claimed", "accepted"], { status: "confirmed", cancel_until: mins(r.cancel_min), pay_issue: false }, "confirmed_at = now()")
      : step(o.id, ["pay_claimed"], { status: "accepted", pay_issue: true, pay_by: mins(5) }); });
  act("preparing", (o, r, as) => { team(as, "owner", "manager");
    return step(o.id, ["confirmed"], { status: "preparing" }, "preparing_at = now(), cancel_until = LEAST(cancel_until, now())"); });
  act("dispatch", async (o, r, as, req) => { team(as, "owner", "manager", "rider");
    let rider = { phone: req.user.phone, name: req.user.name || "Rider" };
    if (req.body?.rider_phone && as !== "rider") { const s = await db.one("SELECT * FROM staff WHERE restaurant_id = $1 AND phone = $2 AND role = 'rider'", [r.id, req.body.rider_phone]); if (s) rider = { phone: s.phone, name: s.name || "Rider" }; }
    return step(o.id, ["confirmed", "preparing"], { status: "out", rider_phone: rider.phone, rider_name: rider.name }, "out_at = now(), preparing_at = COALESCE(preparing_at, now()), cancel_until = LEAST(cancel_until, now())"); });
  act("delivered", (o, r, as) => { team(as, "owner", "manager", "rider");
    return step(o.id, ["out"], { status: "delivered" }, "delivered_at = now(), closed_at = now()"); });
  act("no-show", async (o, r, as) => { team(as, "owner", "manager", "rider");
    if (o.pay_method !== "cod") throw bad("Only for cash orders the customer didn't take");
    const n = await step(o.id, ["out"], { status: "cancelled", cancel_by: "restaurant", cancel_reason: "Customer didn't take the order" }, "closed_at = now()");
    await db.q("UPDATE users SET no_shows = no_shows + 1 WHERE id = $1", [o.user_id]);
    return n; });
  act("refund-sent", async (o, r, as) => { team(as, "owner", "manager");
    const n = await db.one("UPDATE orders SET refund = 'sent' WHERE id = $1 AND refund = 'due' RETURNING *", [o.id]); if (!n) throw bad("No refund due"); return n; });

  // Live location from the rider's phone while the order is out
  app.post("/v1/orders/:id/location", { preHandler: needUser, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req) => {
    const { o } = await load(req.params.id);
    const as = await access(req, o);
    if (as === "customer") throw forbidden();
    const lat = Number(req.body?.lat), lon = Number(req.body?.lon), bb = config.bbox;
    if (!(lat > bb.minLat - .2 && lat < bb.maxLat + .2 && lon > bb.minLon - .2 && lon < bb.maxLon + .2)) throw bad("Location outside the area");
    await db.q("UPDATE orders SET rider_lat = $2, rider_lon = $3, rider_at = now() WHERE id = $1 AND status = 'out'", [o.id, lat, lon]);
    return { ok: true };
  });

  // Orders a rider should deliver, across the restaurants they ride for
  app.get("/v1/rider/orders", { preHandler: needUser }, async (req) => {
    const rows = await db.many(`SELECT o.*, row_to_json(r.*) AS r FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.status IN ('confirmed', 'preparing', 'out') AND (o.rider_phone = $1 OR (o.status <> 'out' AND (r.owner_id = $2 OR EXISTS (SELECT 1 FROM staff s WHERE s.restaurant_id = r.id AND s.phone = $1))))
      ORDER BY o.created_at`, [req.user.phone, req.user.id]);
    return { orders: rows.map(o => view(o, o.r, "rider")) };
  });
}

/** Expire orders the restaurant didn't accept, or the customer didn't pay, in time. */
function startSweeper(log) {
  const run = async () => {
    try {
      await db.q(`UPDATE orders SET status = 'expired', cancel_by = 'system', cancel_reason = 'The restaurant didn''t respond in time', closed_at = now() WHERE status = 'placed' AND accept_by < now()`);
      await db.q(`UPDATE orders SET status = 'expired', cancel_by = 'system', cancel_reason = 'Payment wasn''t made in time', closed_at = now() WHERE status = 'accepted' AND pay_by < now()`);
    } catch (e) { log.error(e); }
  };
  run(); return setInterval(run, 15000);
}

module.exports = { routes, startSweeper, view, OPEN };
