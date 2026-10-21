// What customers browse: restaurants near them (distance by road), menus, banners, search, and price quotes.
const db = require("./db");
const { roadKm, roadRoute, deliveryFee, etaMin } = require("./geo");
const { bad, notFound, HttpError } = require("./util");

async function setting(key) { const r = await db.one("SELECT value FROM settings WHERE key = $1", [key]); return r ? r.value : null; }
const visible = "r.status IN ('active', 'test')";

function pubRest(r, lat, lon) {
  const km = Number.isFinite(lat) && Number.isFinite(lon) ? Math.round(roadKm(lat, lon, r.lat, r.lon) * 10) / 10 : null;
  return {
    id: r.id, name: r.name, area: r.area, address: r.address, cuisines: r.cuisines, photo: r.photo, phone: r.phone, lat: r.lat, lon: r.lon,
    status: r.status, is_open: r.is_open, cod: r.cod, prep_min: r.prep_min, min_order: r.min_order, packing: r.packing,
    rating: r.rating_count ? Math.round(r.rating_sum / r.rating_count * 10) / 10 : null, ratings: r.rating_count, hours: r.hours,
    rules: { base_fee: r.base_fee, base_km: Number(r.base_km), per_km: r.per_km, max_km: Number(r.max_km), free_above: r.free_above, cancel_min: r.cancel_min, accept_min: r.accept_min, pay_min: r.pay_min },
    km, fee: km === null ? null : deliveryFee(r, km, 0), eta: km === null ? r.prep_min + 10 : etaMin(r, km),
  };
}

/** New-customer offer: free delivery on a customer's first order(s) up to a food value (Kezia pays the fee). */
async function promoFor(user, itemTotal, fee) {
  if (!user || !fee) return null;
  const [n, max] = await Promise.all([setting("promo_new_orders"), setting("promo_new_max")]);
  if (!(Number(n) > 0)) return null;
  const done = await db.one("SELECT count(*)::int c FROM orders WHERE user_id = $1 AND status NOT IN ('rejected', 'expired', 'cancelled')", [user.id]);
  if (done.c >= Number(n) || (Number(max) > 0 && itemTotal > Number(max))) return null;
  return { code: "new_free_delivery", label: "Free delivery · new customer offer", amount: fee };
}

/** Price an order on the server: only in-stock items of this restaurant, at today's prices. */
async function quote(r, items, lat, lon, user) {
  const ids = (Array.isArray(items) ? items : []).map(i => [Number(i.id), Math.min(50, Math.max(0, Math.floor(Number(i.qty) || 0))), i.v === undefined || i.v === null ? null : Math.floor(Number(i.v))])
    .filter(([id, q]) => id > 0 && q > 0);
  if (!ids.length) throw bad("Your cart is empty");
  const rows = await db.many("SELECT * FROM menu_items WHERE restaurant_id = $1 AND id = ANY($2::int[])", [r.id, ids.map(i => i[0])]);
  const by = new Map(rows.map(x => [x.id, x]));
  const lines = [];
  for (const [id, qty, vi] of ids) {
    const it = by.get(id);
    if (!it) throw bad("An item in your cart is no longer on the menu");
    if (!it.in_stock) throw bad(`${it.name} is out of stock right now`);
    const sizes = Array.isArray(it.variants) && it.variants.length ? it.variants : null;
    if (sizes) {
      const v = sizes[vi ?? -1];
      if (!v) throw bad(`Choose a size for ${it.name}`);
      lines.push({ id, v: vi, size: v.n, name: `${it.name} (${v.n})`, price: v.p, qty, veg: it.veg });
    } else lines.push({ id, name: it.name, price: it.price, qty, veg: it.veg });
  }
  const itemTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const km = Math.round(roadKm(lat, lon, r.lat, r.lon) * 10) / 10;
  const fee = deliveryFee(r, km, itemTotal);
  const problems = [];
  if (fee === null) problems.push(`${r.name} delivers within ${Number(r.max_km)} km. You are ${km} km away by road`);
  if (itemTotal < r.min_order) problems.push(`Minimum order is ₹${r.min_order}. Add ₹${r.min_order - itemTotal} more`);
  if (!r.is_open) problems.push(`${r.name} is closed right now`);
  const promo = problems.length ? null : await promoFor(user, itemTotal, fee);
  const off = promo ? promo.amount : 0;
  return { lines, item_total: itemTotal, km, delivery_fee: fee ?? 0, packing: r.packing, promo, total: itemTotal + (fee ?? 0) - off + r.packing, eta: etaMin(r, km), problems };
}

function routes(app) {
  app.get("/v1/health", async () => ({ ok: true, time: new Date().toISOString() }));

  app.get("/v1/home", async (req) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    const [rs, banners] = await Promise.all([
      db.many(`SELECT r.* FROM restaurants r WHERE ${visible} ORDER BY r.name`),
      db.many(`SELECT b.* FROM banners b LEFT JOIN restaurants r ON r.id = b.restaurant_id WHERE b.active AND (b.restaurant_id IS NULL OR ${visible}) ORDER BY b.sort, b.id`),
    ]);
    const tags = await db.many(`SELECT restaurant_id, array_agg(DISTINCT s.name) secs FROM menu_sections s GROUP BY 1`);
    const secs = new Map(tags.map(t => [t.restaurant_id, t.secs]));
    return { restaurants: rs.map(r => ({ ...pubRest(r, lat, lon), sections: secs.get(r.id) || [] })), banners };
  });

  app.get("/v1/restaurants/:id", async (req) => {
    const r = await db.one(`SELECT r.* FROM restaurants r WHERE r.id = $1 AND (${visible} OR r.owner_id = $2)`, [req.params.id, req.user?.id || null]);
    if (!r) throw notFound("Restaurant not found");
    const [sections, items] = await Promise.all([
      db.many("SELECT id, name FROM menu_sections WHERE restaurant_id = $1 ORDER BY sort, id", [r.id]),
      db.many("SELECT id, section_id, name, description, price, veg, photo, in_stock, bestseller, (SELECT jsonb_agg(jsonb_build_object('n', v->'n', 'p', v->'p')) FROM jsonb_array_elements(variants) v) variants FROM menu_items WHERE restaurant_id = $1 ORDER BY sort, id", [r.id]),
    ]);
    return { restaurant: pubRest(r, Number(req.query.lat), Number(req.query.lon)), sections, items };
  });

  app.post("/v1/quote", async (req) => {
    const b = req.body || {};
    const r = await db.one(`SELECT r.* FROM restaurants r WHERE r.id = $1 AND ${visible}`, [b.restaurant_id]);
    if (!r) throw notFound("Restaurant not found");
    const lat = Number(b.lat), lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw bad("Choose where to deliver");
    return quote(r, b.items, lat, lon, req.user);
  });

  // Road route for the in-app maps (rider navigation, customer tracking). Logged-in users only.
  app.get("/v1/route", async (req) => {
    if (!req.user) throw new HttpError(401, "Please log in first");
    const [a, b, c, d] = [req.query.from, req.query.to].flatMap(x => String(x || "").split(",").map(Number));
    const ok = v => Number.isFinite(v) && Math.abs(v) <= 180;
    if (![a, b, c, d].every(ok)) throw bad("from and to must be lat,lon");
    const r = roadRoute(a, b, c, d);
    return { km: r.km, line: r.line.map(([y, x]) => [Math.round(y * 1e5) / 1e5, Math.round(x * 1e5) / 1e5]) };
  });

  app.get("/v1/search", async (req) => {
    const q = String(req.query.q || "").trim().slice(0, 60);
    if (q.length < 2) return { restaurants: [], items: [] };
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    const [restaurants, items] = await Promise.all([
      db.many(`SELECT r.id, r.name, r.area, r.cuisines, r.photo, r.is_open FROM restaurants r WHERE ${visible} AND (r.name ILIKE $1 OR r.cuisines ILIKE $1) LIMIT 10`, [like]),
      db.many(`SELECT i.id, i.name, i.price, i.veg, i.photo, i.in_stock, r.id AS restaurant_id, r.name AS restaurant FROM menu_items i JOIN restaurants r ON r.id = i.restaurant_id
               WHERE ${visible} AND (i.name ILIKE $1 OR i.description ILIKE $1) ORDER BY i.in_stock DESC, i.price LIMIT 30`, [like]),
    ]);
    return { restaurants, items };
  });
}

module.exports = { routes, quote, pubRest, setting, visible };
