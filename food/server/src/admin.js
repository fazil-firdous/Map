// Admin (x-admin-token): approve restaurants, commission rates, confirm commission payments, banners, block users.
const db = require("./db");
const { needAdmin } = require("./auth");
const { bad, notFound, str } = require("./util");

function routes(app) {
  app.get("/v1/admin/overview", { preHandler: needAdmin }, async () => {
    const [restaurants, settlements, orders, stats, settings, banners] = await Promise.all([
      db.many(`SELECT r.id, r.name, r.area, r.status, r.is_open, r.phone, r.upi_id, r.commission_pct, u.phone owner_phone,
          (SELECT COALESCE(sum(commission), 0)::int FROM orders o WHERE o.restaurant_id = r.id AND o.status = 'delivered' AND o.settlement_id IS NULL) due,
          (SELECT count(*)::int FROM orders o WHERE o.restaurant_id = r.id AND o.status = 'delivered') delivered
        FROM restaurants r LEFT JOIN users u ON u.id = r.owner_id ORDER BY r.status = 'pending' DESC, r.name`),
      db.many(`SELECT s.*, r.name restaurant FROM settlements s JOIN restaurants r ON r.id = s.restaurant_id ORDER BY s.status = 'claimed' DESC, s.created_at DESC LIMIT 50`),
      db.many(`SELECT o.id, o.status, o.total, o.commission, o.pay_method, o.created_at, o.refund, r.name restaurant, o.customer_phone FROM orders o JOIN restaurants r ON r.id = o.restaurant_id ORDER BY o.created_at DESC LIMIT 60`),
      db.one(`SELECT count(*) FILTER (WHERE status = 'delivered')::int delivered, COALESCE(sum(item_total) FILTER (WHERE status = 'delivered'), 0)::int food,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered'), 0)::int commission, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int today,
          (SELECT count(*)::int FROM users) users FROM orders`),
      db.many("SELECT key, value FROM settings"),
      db.many("SELECT * FROM banners ORDER BY sort, id"),
    ]);
    return { restaurants, settlements, orders, stats, settings: Object.fromEntries(settings.map(s => [s.key, s.value])), banners };
  });
  app.patch("/v1/admin/restaurants/:id", { preHandler: needAdmin }, async (req) => {
    const b = req.body || {}, set = [], vals = [req.params.id];
    if (b.status) { if (!["pending", "active", "suspended", "test"].includes(b.status)) throw bad("Bad status"); vals.push(b.status); set.push(`status = $${vals.length}`); }
    if ("commission_pct" in b) { const v = b.commission_pct === "" || b.commission_pct === null ? null : Number(b.commission_pct); if (v !== null && !(v >= 0 && v <= 50)) throw bad("Commission must be 0–50%"); vals.push(v); set.push(`commission_pct = $${vals.length}`); }
    if (!set.length) throw bad("Nothing to change");
    const r = await db.one(`UPDATE restaurants SET ${set.join(", ")} WHERE id = $1 RETURNING id, status, commission_pct`, vals);
    if (!r) throw notFound(); return { restaurant: r };
  });
  app.post("/v1/admin/settlements/:id/:action", { preHandler: needAdmin }, async (req) => {
    const ok = req.params.action === "paid";
    return db.tx(async c => {
      const s = (await c.query(`UPDATE settlements SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() END WHERE id = $1 AND status = 'claimed' RETURNING *`, [Number(req.params.id), ok ? "paid" : "rejected"])).rows[0];
      if (!s) throw notFound();
      if (!ok) await c.query("UPDATE orders SET settlement_id = NULL WHERE settlement_id = $1", [s.id]); // back to "due"
      return { settlement: s };
    });
  });
  app.put("/v1/admin/settings", { preHandler: needAdmin }, async (req) => {
    const b = req.body || {};
    if ("commission_pct" in b) { const v = Number(b.commission_pct); if (!(v >= 0 && v <= 50)) throw bad("Commission must be 0–50%"); await db.q("UPDATE settings SET value = $1 WHERE key = 'commission_pct'", [JSON.stringify(v)]); }
    for (const k of ["platform_upi", "platform_name", "support_phone"]) if (k in b) await db.q("UPDATE settings SET value = $2 WHERE key = $1", [k, JSON.stringify(str(b[k], 80) || "")]);
    return { ok: true };
  });
  app.post("/v1/admin/banners", { preHandler: needAdmin }, async (req) => {
    const b = req.body || {}; if (!str(b.title, 60)) throw bad("Title needed");
    return { banner: await db.one("INSERT INTO banners (kicker, title, subtitle, photo, restaurant_id, sort) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [str(b.kicker, 30), str(b.title, 60), str(b.subtitle, 80), str(b.photo, 200), b.restaurant_id || null, Number(b.sort) || 0]) };
  });
  app.patch("/v1/admin/banners/:id", { preHandler: needAdmin }, async (req) => {
    return { banner: await db.one("UPDATE banners SET active = COALESCE($2, active) WHERE id = $1 RETURNING *", [Number(req.params.id), "active" in (req.body || {}) ? !!req.body.active : null]) };
  });
  app.delete("/v1/admin/banners/:id", { preHandler: needAdmin }, async (req) => { await db.q("DELETE FROM banners WHERE id = $1", [Number(req.params.id)]); return { ok: true }; });
  app.post("/v1/admin/users/ban", { preHandler: needAdmin }, async (req) => {
    const u = await db.one("UPDATE users SET banned = $2 WHERE phone = $1 RETURNING phone, banned", [req.body?.phone, req.body?.banned !== false]);
    if (!u) throw notFound("No user with that number"); return { user: u };
  });
}
module.exports = { routes };
