// Shop owner tools. Everything here needs the signed-in user to be the shop's verified owner.
// Visits/calls stats are only ever returned here, never to the public.
const db = require("./db");
const { needUser } = require("./auth");
const { bad, forbidden, notFound, str, url, normPhone, isMobile, num } = require("./util");

async function ownShop(req) {
  const s = await db.one("SELECT * FROM shops WHERE id = $1", [req.params.id]);
  if (!s) throw notFound();
  if (s.owner_id !== req.user.id && req.user.role !== "admin") throw forbidden("Only the shop's owner can do this");
  return s;
}
const LIVE = new Set(["open", "closed_today", "opens_late", "busy"]);

function routes(app) {
  app.get("/v1/owner/shops", { preHandler: needUser }, async (req) => {
    const shops = await db.many(`SELECT s.id, s.name, s.category, s.locality, s.live_status, s.live_note, s.verified,
        COALESCE((SELECT json_object_agg(kind, n) FROM (SELECT kind, sum(n)::int n FROM shop_stats WHERE shop_id = s.id AND day > current_date - 7 GROUP BY kind) x), '{}') AS week
      FROM shops s WHERE s.owner_id = $1 ORDER BY s.name`, [req.user.id]);
    return { shops };
  });

  app.get("/v1/owner/shops/:id/stats", { preHandler: needUser }, async (req) => {
    const s = await ownShop(req);
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const rows = await db.many(`SELECT day, kind, n FROM shop_stats WHERE shop_id = $1 AND day > current_date - $2::int ORDER BY day`, [s.id, days]);
    const totals = {}; rows.forEach(r => totals[r.kind] = (totals[r.kind] || 0) + r.n);
    return { days, totals, daily: rows };
  });

  app.patch("/v1/owner/shops/:id", { preHandler: needUser }, async (req) => {
    const s = await ownShop(req);
    const b = req.body || {};
    const set = {}, vals = [];
    if ("opening_hours" in b) set.opening_hours = str(b.opening_hours, 120);
    if ("address" in b) set.address = str(b.address, 200);
    if ("website" in b) set.website = url(b.website);
    if ("instagram" in b) set.instagram = b.instagram ? url(/^https?:/.test(b.instagram) ? b.instagram : "instagram.com/" + String(b.instagram).replace(/^@/, "")) : null;
    if ("whatsapp" in b) { const w = normPhone(b.whatsapp); if (b.whatsapp && !isMobile(w)) throw bad("WhatsApp must be a mobile number"); set.whatsapp = w; }
    if ("phone" in b) { const p = normPhone(b.phone); if (b.phone && !p) throw bad("Phone number looks wrong"); set.phone = p; set.phone_is_chain = false; }
    if ("live_status" in b) {
      if (b.live_status && !LIVE.has(b.live_status)) throw bad("Unknown status");
      set.live_status = b.live_status || null;
      set.live_note = str(b.live_note, 120);
      const hrs = num(b.live_hours, 1, 72);
      set.live_until = hrs ? new Date(Date.now() + hrs * 3600e3) : null;
    }
    const keys = Object.keys(set);
    if (!keys.length) return { ok: true };
    keys.forEach((k, i) => vals.push(set[k]));
    await db.q(`UPDATE shops SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [s.id, ...vals]);
    return { ok: true };
  });

  // ---- Deals today (free for now; a paid feature later) ----
  app.post("/v1/owner/shops/:id/deals", { preHandler: needUser }, async (req) => {
    const s = await ownShop(req);
    const title = str(req.body?.title, 80);
    const days = Math.min(14, Math.max(1, Number(req.body?.days) || 1));
    if (!title) throw bad("Write the offer, e.g. 20% off all pherans");
    const active = await db.one("SELECT count(*)::int n FROM deals WHERE shop_id = $1 AND ends_at > now()", [s.id]);
    if (active.n >= 3) throw bad("You can run 3 offers at a time");
    const d = await db.one("INSERT INTO deals (shop_id, title, details, ends_at) VALUES ($1, $2, $3, now() + $4::interval) RETURNING id, ends_at",
      [s.id, title, str(req.body?.details, 300), `${days} days`]);
    await db.q("UPDATE shops SET updated_at = now() WHERE id = $1", [s.id]); // bumps version so phones see the deal badge
    return d;
  });
  app.delete("/v1/owner/deals/:dealId", { preHandler: needUser }, async (req) => {
    const d = await db.one("SELECT d.id, s.owner_id, s.id AS shop_id FROM deals d JOIN shops s ON s.id = d.shop_id WHERE d.id = $1", [req.params.dealId]);
    if (!d) throw notFound();
    if (d.owner_id !== req.user.id) throw forbidden();
    await db.q("DELETE FROM deals WHERE id = $1", [d.id]);
    await db.q("UPDATE shops SET updated_at = now() WHERE id = $1", [d.shop_id]);
    return { ok: true };
  });

  // ---- Bazaar rates: the owner's own price list (replaces the whole list) ----
  app.put("/v1/owner/shops/:id/prices", { preHandler: needUser }, async (req) => {
    const s = await ownShop(req);
    const list = (Array.isArray(req.body?.prices) ? req.body.prices : []).slice(0, 40)
      .map(p => ({ item: str(p?.item, 60), price: str(p?.price, 40) })).filter(p => p.item && p.price);
    await db.tx(async c => {
      await c.query("DELETE FROM prices WHERE shop_id = $1", [s.id]);
      for (const p of list) await c.query("INSERT INTO prices (shop_id, item, price) VALUES ($1, $2, $3)", [s.id, p.item, p.price]);
    });
    return { saved: list.length };
  });

  // ---- Product catalogue (powers "Nike shoes size 9" search) ----
  app.post("/v1/owner/shops/:id/products", { preHandler: needUser }, async (req) => {
    const s = await ownShop(req);
    // Accept one product, or many lines of "name | price" pasted at once.
    let items = [];
    if (typeof req.body?.lines === "string") {
      items = req.body.lines.split(/\r?\n/).map(l => l.split("|")).map(([n, p]) => ({ name: str(n, 100), price: str(p, 40) })).filter(i => i.name);
    } else {
      items = [{ name: str(req.body?.name, 100), brand: str(req.body?.brand, 50), price: str(req.body?.price, 40), tags: str(req.body?.tags, 200) }];
    }
    items = items.filter(i => i.name).slice(0, 200);
    if (!items.length) throw bad("Add at least one product name");
    const count = await db.one("SELECT count(*)::int n FROM products WHERE shop_id = $1", [s.id]);
    if (count.n + items.length > 2000) throw bad("Catalogue limit is 2,000 products");
    for (const i of items) {
      await db.q("INSERT INTO products (shop_id, name, brand, price, tags) VALUES ($1, $2, $3, $4, $5)", [s.id, i.name, i.brand || null, i.price || null, i.tags || null]);
    }
    return { added: items.length };
  });
  app.patch("/v1/owner/products/:pid", { preHandler: needUser }, async (req) => {
    const p = await db.one("SELECT p.id, s.owner_id FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1", [req.params.pid]);
    if (!p) throw notFound();
    if (p.owner_id !== req.user.id) throw forbidden();
    await db.q(`UPDATE products SET name = COALESCE($2, name), price = COALESCE($3, price),
      in_stock = COALESCE($4, in_stock), updated_at = now() WHERE id = $1`,
      [p.id, str(req.body?.name, 100), str(req.body?.price, 40), typeof req.body?.in_stock === "boolean" ? req.body.in_stock : null]);
    return { ok: true };
  });
  app.delete("/v1/owner/products/:pid", { preHandler: needUser }, async (req) => {
    const p = await db.one("SELECT p.id, s.owner_id FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1", [req.params.pid]);
    if (!p) throw notFound();
    if (p.owner_id !== req.user.id) throw forbidden();
    await db.q("DELETE FROM products WHERE id = $1", [p.id]);
    return { ok: true };
  });

  // ---- Ask the bazaar inbox ----
  app.get("/v1/owner/inbox", { preHandler: needUser }, async (req) => {
    const asks = await db.many(`SELECT a.id, a.text, a.created_at, t.shop_id, s.name AS shop_name,
        round(ST_Distance(a.geom, s.geom))::int AS meters,
        EXISTS (SELECT 1 FROM ask_replies r WHERE r.ask_id = a.id AND r.shop_id = t.shop_id) AS replied
      FROM ask_targets t JOIN asks a ON a.id = t.ask_id JOIN shops s ON s.id = t.shop_id
      WHERE s.owner_id = $1 AND a.expires_at > now() ORDER BY a.created_at DESC LIMIT 50`, [req.user.id]);
    await db.q(`UPDATE ask_targets t SET seen_at = now() FROM shops s WHERE s.id = t.shop_id AND s.owner_id = $1 AND t.seen_at IS NULL`, [req.user.id]);
    return { asks };
  });
  app.post("/v1/owner/asks/:askId/reply", { preHandler: needUser }, async (req) => {
    const shopId = str(req.body?.shop_id, 20), text = str(req.body?.text, 300);
    if (!text) throw bad("Write a reply");
    const t = await db.one(`SELECT t.shop_id FROM ask_targets t JOIN shops s ON s.id = t.shop_id
      WHERE t.ask_id = $1 AND t.shop_id = $2 AND s.owner_id = $3`, [req.params.askId, shopId, req.user.id]);
    if (!t) throw forbidden();
    await db.q("INSERT INTO ask_replies (ask_id, shop_id, text) VALUES ($1, $2, $3)", [req.params.askId, shopId, text]);
    return { ok: true };
  });
}

module.exports = { routes };
