// Restaurant mode: settings, menu, team, photos, earnings and the platform commission.
//
// Commission: Kezia's Food takes a percentage of the FOOD value (not delivery or packing) of every delivered order.
// The rate is fixed on each order when it's placed, so later rate changes never touch old orders. Restaurants see
// "you keep" on every price, and pay what they owe by UPI from the Earnings screen; the admin confirms it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const config = require("./config");
const { needUser, needRole, myPlaces } = require("./auth");
const { setting } = require("./catalog");
const { ratePct, priced, customerPrice } = require("./pricing");
const { bad, notFound, str, normPhone, isMobile } = require("./util");

async function savePhoto(file) {
  const buf = await file.toBuffer();
  if (buf.length > 3 * 1024 * 1024) throw bad("Photo too large (max 3 MB)");
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf.slice(0, 4).toString("hex") === "89504e47" ? "png"
    : buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP" ? "webp" : null;
  if (!ext) throw bad("Only JPEG, PNG or WebP photos");
  const name = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  fs.mkdirSync(path.join(config.uploadsDir, name.split("/")[0]), { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  return "/uploads/" + name;
}
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const dec = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
async function pctFor(r) { return r.commission_pct !== null ? Number(r.commission_pct) : Number(await setting("commission_pct")) || 0; }

// Fields a restaurant can change, with their checks
const FIELDS = {
  name: v => str(v, 60), phone: v => { const p = normPhone(v); return p && isMobile(p) ? p : null; }, area: v => str(v, 60), address: v => str(v, 160),
  cuisines: v => str(v, 80), hours: v => str(v, 80), upi_id: v => { const s = str(v, 60); return s && /^[\w.\-]{2,}@[a-z][a-z0-9]{1,}$/i.test(s) ? s.toLowerCase() : null; },
  upi_name: v => str(v, 60), is_open: v => !!v, cod: v => !!v, prep_min: v => int(v, 5, 120), base_fee: v => int(v, 0, 300), base_km: v => dec(v, 0, 20),
  per_km: v => int(v, 0, 100), max_km: v => dec(v, 1, 30), min_order: v => int(v, 0, 2000), packing: v => int(v, 0, 100), free_above: v => v === null || v === "" ? null : int(v, 0, 10000),
  accept_min: v => int(v, 1, 15), pay_min: v => int(v, 3, 30), cancel_min: v => int(v, 0, 5),
};

function routes(app) {
  const mgr = needRole("owner", "manager"), any = needRole("owner", "manager", "rider"), own = needRole("owner");

  app.get("/v1/restaurant/:rid", { preHandler: any }, async (req) => {
    const r = await db.one("SELECT * FROM restaurants WHERE id = $1", [req.params.rid]);
    if (!r) throw notFound();
    const [sections, items, staff, offers] = await Promise.all([
      db.many("SELECT * FROM menu_sections WHERE restaurant_id = $1 ORDER BY sort, id", [r.id]),
      db.many("SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY sort, id", [r.id]),
      db.many("SELECT phone, name, role FROM staff WHERE restaurant_id = $1 ORDER BY role, name", [r.id]),
      db.many("SELECT * FROM offers WHERE restaurant_id = $1 AND ends_at > now() ORDER BY created_at DESC", [r.id]),
    ]);
    return { offers, restaurant: { ...r, base_km: Number(r.base_km), max_km: Number(r.max_km), commission_pct: await pctFor(r) }, sections, items, staff, role: req.role };
  });

  app.patch("/v1/restaurant/:rid", { preHandler: mgr }, async (req) => {
    const set = [], vals = [req.params.rid];
    for (const [k, check] of Object.entries(FIELDS)) {
      if (!(k in (req.body || {}))) continue;
      const v = check(req.body[k]);
      if (v === null && !["free_above", "hours", "upi_name"].includes(k)) throw bad(k === "upi_id" ? "That UPI ID doesn't look right (like name@ybl)" : `Check the value for ${k.replace("_", " ")}`);
      vals.push(v); set.push(`${k} = $${vals.length}`);
    }
    if (!set.length) throw bad("Nothing to save");
    const r = await db.one(`UPDATE restaurants SET ${set.join(", ")} WHERE id = $1 RETURNING *`, vals);
    return { restaurant: r };
  });

  // Menu
  app.post("/v1/restaurant/:rid/sections", { preHandler: mgr }, async (req) => {
    const name = str(req.body?.name, 40); if (!name) throw bad("Name the section");
    return { section: await db.one("INSERT INTO menu_sections (restaurant_id, name, sort) VALUES ($1, $2, (SELECT COALESCE(max(sort), 0) + 1 FROM menu_sections WHERE restaurant_id = $1)) RETURNING *", [req.params.rid, name]) };
  });
  app.patch("/v1/restaurant/:rid/sections/:id", { preHandler: mgr }, async (req) => {
    const s = await db.one("UPDATE menu_sections SET name = COALESCE($3, name), sort = COALESCE($4, sort) WHERE id = $1 AND restaurant_id = $2 RETURNING *",
      [Number(req.params.id), req.params.rid, str(req.body?.name, 40), int(req.body?.sort, 0, 1000)]);
    if (!s) throw notFound(); return { section: s };
  });
  app.delete("/v1/restaurant/:rid/sections/:id", { preHandler: mgr }, async (req) => {
    await db.q("DELETE FROM menu_sections WHERE id = $1 AND restaurant_id = $2", [Number(req.params.id), req.params.rid]); return { ok: true };
  });
  const sizes = v => {
    if (v === null || (Array.isArray(v) && !v.length)) return null;
    if (!Array.isArray(v) || v.length > 6) throw bad("Up to 6 sizes per dish");
    return v.map(x => { const n = str(x.n, 20), net = int(x.net, 1, 20000); if (!n || !net) throw bad("Each size needs a name and a price"); return { n, net }; });
  };
  const itemFields = b => ({ name: str(b.name, 60), description: str(b.description, 200), price: int(b.price, 1, 20000), net_price: int(b.net_price, 1, 20000),
    variants: "variants" in b ? sizes(b.variants) : undefined, veg: "veg" in b ? !!b.veg : undefined,
    in_stock: "in_stock" in b ? !!b.in_stock : undefined, bestseller: "bestseller" in b ? !!b.bestseller : undefined, section_id: b.section_id ? Number(b.section_id) : undefined });
  /** Restaurants give what they want to receive (net, or per size); work out the customer price at their rate. */
  async function withPrices(rid, f, b) {
    if (f.variants || f.net_price) {
      const p = priced({ net_price: f.net_price, variants: f.variants }, await ratePct(rid));
      Object.assign(f, { price: p.price, net_price: p.net_price, variants: p.variants ? JSON.stringify(p.variants) : null });
    } else if ("variants" in b) f.variants = null;
    else if (f.price) f.net_price = null; // an old-style direct price: stop recalculating it
    return f;
  }
  app.post("/v1/restaurant/:rid/items", { preHandler: mgr }, async (req) => {
    const b = req.body || {}, f = await withPrices(req.params.rid, itemFields(b), b);
    if (!f.name || !f.price) throw bad("Add a name and a price");
    return { item: await db.one(`INSERT INTO menu_items (restaurant_id, section_id, name, description, price, net_price, variants, veg, bestseller, sort)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(max(sort), 0) + 1 FROM menu_items WHERE restaurant_id = $1)) RETURNING *`,
      [req.params.rid, f.section_id || null, f.name, f.description, f.price, f.net_price ?? null, f.variants ?? null, !!f.veg, !!f.bestseller]) };
  });
  app.patch("/v1/restaurant/:rid/items/:id", { preHandler: mgr }, async (req) => {
    const b = req.body || {}, f = await withPrices(req.params.rid, itemFields(b), b), set = [], vals = [Number(req.params.id), req.params.rid];
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || (v === null && ["name", "price"].includes(k))) continue;
      if (k === "description" && !("description" in b)) continue;
      if (k === "net_price" && v === null && !("price" in b)) continue;
      vals.push(v); set.push(`${k} = $${vals.length}`);
    }
    if (!set.length) throw bad("Nothing to save");
    const it = await db.one(`UPDATE menu_items SET ${set.join(", ")} WHERE id = $1 AND restaurant_id = $2 RETURNING *`, vals);
    if (!it) throw notFound(); return { item: it };
  });
  app.delete("/v1/restaurant/:rid/items/:id", { preHandler: mgr }, async (req) => {
    await db.q("DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2", [Number(req.params.id), req.params.rid]); return { ok: true };
  });
  app.post("/v1/restaurant/:rid/items/:id/photo", { preHandler: mgr, config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req) => {
    const file = await req.file(); if (!file) throw bad("Attach a photo");
    const it = await db.one("UPDATE menu_items SET photo = $3 WHERE id = $1 AND restaurant_id = $2 RETURNING *", [Number(req.params.id), req.params.rid, await savePhoto(file)]);
    if (!it) throw notFound(); return { item: it };
  });
  app.post("/v1/restaurant/:rid/photo", { preHandler: mgr, config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const file = await req.file(); if (!file) throw bad("Attach a photo");
    return { restaurant: await db.one("UPDATE restaurants SET photo = $2 WHERE id = $1 RETURNING *", [req.params.rid, await savePhoto(file)]) };
  });

  // Today's specials: a dish (or a size) at a special price until the end of today, or for a few days
  app.post("/v1/restaurant/:rid/offers", { preHandler: mgr }, async (req) => {
    const b = req.body || {}, rid = req.params.rid;
    const title = str(b.title, 50) || "Today's special", note = str(b.note, 140), days = int(b.days, 1, 7) || 1;
    const live = await db.one("SELECT count(*)::int n FROM offers WHERE restaurant_id = $1 AND ends_at > now()", [rid]);
    if (live.n >= 6) throw bad("You can run up to 6 specials at a time. Remove one first");
    let item = null, v = null, net = null, price = null;
    if (b.item_id) {
      item = await db.one("SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2", [Number(b.item_id), rid]);
      if (!item) throw bad("That dish isn't on your menu");
      const sizes = Array.isArray(item.variants) && item.variants.length ? item.variants : null;
      if (sizes) { v = int(b.v, 0, sizes.length - 1); if (v === null) throw bad("Choose which size is on offer"); }
      net = int(b.net_price, 1, 20000);
      if (!net) throw bad("Enter the special price you want to receive");
      price = customerPrice(net, await ratePct(rid));
      const normal = sizes ? sizes[v].p : item.price;
      if (price >= normal) throw bad(`A special must cost less than the usual ${normal}`);
    }
    // ends at midnight India time after `days` days
    const o = await db.one(`INSERT INTO offers (restaurant_id, item_id, v, title, note, net_price, price, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + make_interval(days => $8)) AT TIME ZONE 'Asia/Kolkata') RETURNING *`,
      [rid, item ? item.id : null, v, title, note, net, price, days]);
    return { offer: o };
  });
  app.delete("/v1/restaurant/:rid/offers/:id", { preHandler: mgr }, async (req) => {
    await db.q("DELETE FROM offers WHERE id = $1 AND restaurant_id = $2", [Number(req.params.id), req.params.rid]); return { ok: true };
  });

  // Team: managers and riders, by phone
  app.post("/v1/restaurant/:rid/staff", { preHandler: own }, async (req) => {
    const phone = normPhone(req.body?.phone); if (!isMobile(phone)) throw bad("Enter a 10-digit mobile number");
    const role = req.body?.role === "manager" ? "manager" : "rider";
    await db.q("INSERT INTO staff (restaurant_id, phone, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (restaurant_id, phone) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role",
      [req.params.rid, phone, str(req.body?.name, 40), role]);
    return { staff: await db.many("SELECT phone, name, role FROM staff WHERE restaurant_id = $1 ORDER BY role, name", [req.params.rid]) };
  });
  app.delete("/v1/restaurant/:rid/staff/:phone", { preHandler: own }, async (req) => {
    await db.q("DELETE FROM staff WHERE restaurant_id = $1 AND phone = $2", [req.params.rid, normPhone(req.params.phone)]); return { ok: true };
  });

  // Earnings and commission. Billing is weekly: every Monday the restaurant gets the bill for the week before
  // (Monday to Sunday, India time), to pay by Wednesday. This week's commission goes on next Monday's bill.
  const WEEK = "(date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')";
  app.get("/v1/restaurant/:rid/earnings", { preHandler: mgr }, async (req) => {
    const r = await db.one("SELECT * FROM restaurants WHERE id = $1", [req.params.rid]);
    const sum = (where) => db.one(`SELECT count(*)::int orders, COALESCE(sum(item_total), 0)::int food, COALESCE(sum(delivery_fee + packing), 0)::int fees, COALESCE(sum(commission), 0)::int commission,
        min(delivered_at) first, max(delivered_at) last
      FROM orders WHERE restaurant_id = $1 AND status = 'delivered' AND ${where}`, [r.id]);
    const [today, week, month, due, bill, current, settlements, days, w] = await Promise.all([
      sum("delivered_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'"), sum(`delivered_at >= ${WEEK}`), sum("delivered_at >= now() - interval '30 days'"),
      sum("settlement_id IS NULL"), sum(`settlement_id IS NULL AND delivered_at < ${WEEK}`), sum(`settlement_id IS NULL AND delivered_at >= ${WEEK}`),
      db.many("SELECT * FROM settlements WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 20", [r.id]),
      db.many(`SELECT to_char(delivered_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') d, count(*)::int n, sum(item_total)::int food FROM orders
        WHERE restaurant_id = $1 AND status = 'delivered' AND delivered_at >= ${WEEK} - interval '7 days' GROUP BY 1 ORDER BY 1`, [r.id]),
      db.one(`SELECT ${WEEK} week_start, ${WEEK} + interval '2 days 23 hours 59 minutes' due_by`),
    ]);
    return { commission_pct: await pctFor(r), platform_upi: await setting("platform_upi"), platform_name: await setting("platform_name"), today, week, month, due, settlements, days,
      bill: { ...bill, amount: bill.commission, week_start: w.week_start, due_by: w.due_by, late: bill.commission > 0 && new Date() > new Date(w.due_by) }, current };
  });
  // Pay the weekly bill: delivered, unpaid orders from before this Monday go into one payment
  app.post("/v1/restaurant/:rid/settle", { preHandler: mgr }, async (req) => {
    const utr = String(req.body?.utr || "").replace(/\D/g, "").slice(-12);
    if (utr.length < 4) throw bad("Enter the UPI reference number of your payment");
    return db.tx(async c => {
      const where = `restaurant_id = $1 AND status = 'delivered' AND settlement_id IS NULL AND delivered_at < ${WEEK}`;
      const due = (await c.query(`SELECT count(*)::int n, COALESCE(sum(item_total), 0)::int food, COALESCE(sum(commission), 0)::int amount FROM orders WHERE ${where}`, [req.params.rid])).rows[0];
      if (!(due.amount > 0)) throw bad("Nothing to pay right now. This week's commission comes on next Monday's bill");
      const s = (await c.query("INSERT INTO settlements (restaurant_id, orders, food_total, amount, utr) VALUES ($1, $2, $3, $4, $5) RETURNING *", [req.params.rid, due.n, due.food, due.amount, utr])).rows[0];
      await c.query(`UPDATE orders SET settlement_id = $2 WHERE ${where}`, [req.params.rid, s.id]);
      return { settlement: s };
    });
  });

  // Join as a restaurant: creates a pending listing the admin approves
  app.post("/v1/restaurants/apply", { preHandler: needUser, config: { rateLimit: { max: 3, timeWindow: "1 day" } } }, async (req) => {
    const b = req.body || {}, name = str(b.name, 60), area = str(b.area, 60), lat = Number(b.lat), lon = Number(b.lon), bb = config.bbox;
    if (!name || !area) throw bad("Add the restaurant's name and area");
    if (!(lat > bb.minLat && lat < bb.maxLat && lon > bb.minLon && lon < bb.maxLon)) throw bad("We work in Kulgam district only for now");
    const id = "KF-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    await db.q("INSERT INTO restaurants (id, name, owner_id, phone, area, address, lat, lon, cuisines, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')",
      [id, name, req.user.id, req.user.phone, area, str(b.address, 160), lat, lon, str(b.cuisines, 80)]);
    return { id, places: await myPlaces(req.user) };
  });
}

module.exports = { routes, savePhoto };
