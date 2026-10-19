// Admin (x-admin-token on the web page, or the owner's login in the app): approve restaurants, commission rates, confirm commission payments, banners, block users.
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
  // ---- The owner's dashboard in the app ----
  const IST = "AT TIME ZONE 'Asia/Kolkata'";
  app.get("/v1/admin/dashboard", { preHandler: needAdmin }, async () => {
    const [totals, users, places, days, top, active, claims, settings] = await Promise.all([
      db.one(`SELECT
          count(*) FILTER (WHERE created_at >= date_trunc('day', now() ${IST}) ${IST})::int orders_today,
          count(*) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('day', now() ${IST}) ${IST})::int delivered_today,
          COALESCE(sum(item_total) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('day', now() ${IST}) ${IST}), 0)::int food_today,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('day', now() ${IST}) ${IST}), 0)::int commission_today,
          count(*) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '30 days')::int delivered_30,
          COALESCE(sum(item_total) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '30 days'), 0)::int food_30,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '30 days'), 0)::int commission_30,
          count(*) FILTER (WHERE status = 'delivered')::int delivered_all,
          COALESCE(sum(item_total) FILTER (WHERE status = 'delivered'), 0)::int food_all,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered'), 0)::int commission_all,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered' AND settlement_id IS NULL), 0)::int commission_due,
          (SELECT COALESCE(sum(amount), 0)::int FROM settlements WHERE status = 'paid') commission_received,
          (SELECT COALESCE(sum(amount), 0)::int FROM settlements WHERE status = 'claimed') commission_checking,
          count(*) FILTER (WHERE status IN ('placed', 'accepted', 'pay_claimed', 'confirmed', 'preparing', 'out'))::int live,
          count(*) FILTER (WHERE status IN ('rejected', 'expired', 'cancelled') AND created_at > now() - interval '30 days')::int failed_30
        FROM orders`),
      db.one(`SELECT count(*)::int total, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int new_7,
          (SELECT count(DISTINCT user_id)::int FROM orders WHERE created_at > now() - interval '30 days') ordering_30 FROM users WHERE role = 'customer'`),
      db.one(`SELECT count(*) FILTER (WHERE status = 'active')::int active, count(*) FILTER (WHERE status = 'pending')::int pending,
          count(*) FILTER (WHERE status = 'active' AND is_open)::int open_now, count(*)::int total FROM restaurants`),
      db.many(`SELECT to_char(created_at ${IST}, 'YYYY-MM-DD') d, count(*)::int orders, COALESCE(sum(item_total) FILTER (WHERE status = 'delivered'), 0)::int food,
          COALESCE(sum(commission) FILTER (WHERE status = 'delivered'), 0)::int commission FROM orders WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
      db.many(`SELECT r.id, r.name, r.photo, count(o.*)::int orders, COALESCE(sum(o.item_total), 0)::int food, COALESCE(sum(o.commission), 0)::int commission
          FROM restaurants r JOIN orders o ON o.restaurant_id = r.id AND o.status = 'delivered' AND o.delivered_at > now() - interval '30 days'
          GROUP BY r.id ORDER BY food DESC LIMIT 5`),
      db.many(`SELECT u.id, u.name, u.phone, count(o.*)::int orders, COALESCE(sum(o.total) FILTER (WHERE o.status = 'delivered'), 0)::int spent, max(o.created_at) last
          FROM users u JOIN orders o ON o.user_id = u.id WHERE o.created_at > now() - interval '30 days' GROUP BY u.id ORDER BY orders DESC, spent DESC LIMIT 5`),
      db.many(`SELECT s.*, r.name restaurant FROM settlements s JOIN restaurants r ON r.id = s.restaurant_id WHERE s.status = 'claimed' ORDER BY s.created_at`),
      db.many("SELECT key, value FROM settings"),
    ]);
    return { totals, users, places, days, top, active, claims, settings: Object.fromEntries(settings.map(x => [x.key, x.value])), now: new Date() };
  });

  // Every restaurant with its numbers: sales, orders, the platform's commission (earned, due, received)
  app.get("/v1/admin/restaurants", { preHandler: needAdmin }, async () => {
    const pct = Number((await db.one("SELECT value FROM settings WHERE key = 'commission_pct'"))?.value) || 0;
    const rows = await db.many(`SELECT r.id, r.name, r.area, r.address, r.cuisines, r.photo, r.status, r.is_open, r.phone, r.upi_id, r.cod, r.commission_pct, r.created_at, r.lat, r.lon,
        r.rating_sum, r.rating_count, u.phone owner_phone, u.name owner_name,
        count(o.*) FILTER (WHERE o.status = 'delivered')::int delivered,
        count(o.*)::int orders,
        count(o.*) FILTER (WHERE o.status IN ('rejected', 'expired'))::int missed,
        COALESCE(sum(o.item_total) FILTER (WHERE o.status = 'delivered'), 0)::int food,
        COALESCE(sum(o.item_total) FILTER (WHERE o.status = 'delivered' AND o.delivered_at > now() - interval '30 days'), 0)::int food_30,
        COALESCE(sum(o.commission) FILTER (WHERE o.status = 'delivered'), 0)::int commission,
        COALESCE(sum(o.commission) FILTER (WHERE o.status = 'delivered' AND o.settlement_id IS NULL), 0)::int due,
        (SELECT COALESCE(sum(amount), 0)::int FROM settlements s WHERE s.restaurant_id = r.id AND s.status = 'paid') received,
        (SELECT count(*)::int FROM menu_items m WHERE m.restaurant_id = r.id) dishes,
        max(o.created_at) last_order
      FROM restaurants r LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN orders o ON o.restaurant_id = r.id
      GROUP BY r.id, u.phone, u.name ORDER BY r.status = 'pending' DESC, food DESC, r.name`);
    return { restaurants: rows.map(r => ({ ...r, rate: r.commission_pct !== null ? Number(r.commission_pct) : pct, rating: r.rating_count ? Math.round(r.rating_sum / r.rating_count * 10) / 10 : null })), default_pct: pct };
  });

  app.get("/v1/admin/orders", { preHandler: needAdmin }, async (req) => {
    const st = String(req.query.status || ""), rid = String(req.query.restaurant || "");
    const where = [], vals = [];
    if (st === "live") where.push("o.status IN ('placed', 'accepted', 'pay_claimed', 'confirmed', 'preparing', 'out')");
    else if (st === "failed") where.push("o.status IN ('rejected', 'expired', 'cancelled')");
    else if (st) { vals.push(st); where.push(`o.status = $${vals.length}`); }
    if (rid) { vals.push(rid); where.push(`o.restaurant_id = $${vals.length}`); }
    const rows = await db.many(`SELECT o.id, o.status, o.pay_method, o.items, o.item_total, o.delivery_fee, o.packing, o.total, o.commission, o.commission_pct, o.km, o.refund,
        o.created_at, o.delivered_at, o.customer_name, o.customer_phone, o.address, o.rating, o.cancel_reason, o.reject_reason, r.name restaurant, r.id restaurant_id
      FROM orders o JOIN restaurants r ON r.id = o.restaurant_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.created_at DESC LIMIT 150`, vals);
    return { orders: rows };
  });

  app.get("/v1/admin/users", { preHandler: needAdmin }, async (req) => {
    const order = { active: "orders_30 DESC, orders DESC", spent: "spent DESC", new: "u.created_at DESC" }[req.query.sort] || "orders_30 DESC, orders DESC";
    const q = String(req.query.q || "").replace(/[%_]/g, "").slice(0, 40);
    const rows = await db.many(`SELECT u.id, u.name, u.phone, u.role, u.banned, u.no_shows, u.created_at,
        count(o.*)::int orders, count(o.*) FILTER (WHERE o.created_at > now() - interval '30 days')::int orders_30,
        count(o.*) FILTER (WHERE o.status = 'delivered')::int delivered, count(o.*) FILTER (WHERE o.status = 'cancelled' AND o.cancel_by = 'customer')::int cancelled,
        COALESCE(sum(o.total) FILTER (WHERE o.status = 'delivered'), 0)::int spent, max(o.created_at) last_order,
        (SELECT string_agg(r.name, ', ') FROM restaurants r WHERE r.owner_id = u.id) owns
      FROM users u LEFT JOIN orders o ON o.user_id = u.id ${q ? "WHERE u.phone ILIKE $1 OR u.name ILIKE $1" : ""}
      GROUP BY u.id ORDER BY ${order} LIMIT 200`, q ? ["%" + q + "%"] : []);
    return { users: rows };
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
