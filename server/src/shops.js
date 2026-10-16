// Public shop data: the offline bundle, incremental sync, shop details, product search, sights, stats pings.
const db = require("./db");
const { bad, notFound, str } = require("./util");

const SRC_BITS = { overture: 1, osm: 2, alltheplaces: 4, foursquare: 8, users: 16, owner: 32 };

// Row layout shared with the app (keep in sync with mobile/www/js/data.js):
// 0 id, 1 name, 2 group id, 3 category id, 4 locality, 5 area id, 6 phone, 7 whatsapp, 8 website, 9 instagram,
// 10 facebook, 11 address, 12 lat, 13 lon, 14 precise, 15 hours, 16 source bits, 17 score, 18 chain phone,
// 19 pincode, 20 verified, 21 live status, 22 deal ends (unix s, 0 none), 23 claimed by owner
const ROW_SQL = `
  SELECT s.id, s.name, t.grp_id, t.id AS cat_id, s.locality, s.phone, s.whatsapp, s.website, s.instagram, s.facebook, s.address,
         ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lon, s.location_precise, s.opening_hours, s.sources, s.quality_score,
         s.phone_is_chain, s.pincode, s.verified, s.status, s.version,
         CASE WHEN s.live_until IS NULL OR s.live_until > now() THEN s.live_status END AS live_status,
         (SELECT extract(epoch FROM max(d.ends_at))::bigint FROM deals d WHERE d.shop_id = s.id AND d.ends_at > now() AND d.starts_at <= now()) AS deal_ends,
         s.owner_id IS NOT NULL AS claimed
  FROM shops s JOIN taxonomy t ON t.category = s.category`;

const toRow = r => [r.id, r.name, r.grp_id, r.cat_id, r.locality, -1, r.phone, r.whatsapp, r.website, r.instagram, r.facebook, r.address,
  Math.round(r.lat * 1e5) / 1e5, Math.round(r.lon * 1e5) / 1e5, r.location_precise ? 1 : 0, r.opening_hours,
  (r.sources || []).reduce((m, s) => m | (SRC_BITS[s] || 0), 0), r.quality_score, r.phone_is_chain ? 1 : 0, r.pincode,
  r.verified ? 1 : 0, r.live_status, Number(r.deal_ends || 0), r.claimed ? 1 : 0];

async function taxonomy() {
  const t = await db.many("SELECT t.id, t.category, t.grp_id, g.name AS grp FROM taxonomy t JOIN taxonomy_groups g ON g.id = t.grp_id ORDER BY t.id");
  const g = await db.many("SELECT id, name FROM taxonomy_groups ORDER BY id");
  const cats = []; const groups = [];
  t.forEach(r => cats[r.id] = r.category); g.forEach(r => groups[r.id] = r.name);
  return { categories: cats, groups };
}

let cache = { version: -1, body: null };
async function bundle() {
  const v = (await db.one("SELECT last_value FROM sync_seq")).last_value;
  if (cache.version === Number(v) && cache.body) return cache.body;
  const [{ categories, groups }, rows, areas, sights] = await Promise.all([
    taxonomy(),
    db.many(ROW_SQL + " WHERE s.status = 'active'"),
    db.many("SELECT name, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lon, (SELECT count(*) FROM shops s WHERE s.status = 'active' AND ST_DWithin(s.geom, a.geom, 1000))::int n FROM areas a ORDER BY id"),
    db.many("SELECT name, kind, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lon, fame FROM sights ORDER BY id"),
  ]);
  cache = {
    version: Number(v),
    body: JSON.stringify({
      version: Number(v), groups, categories,
      areas: areas.map(a => [a.name, a.n, +a.lat.toFixed(5), +a.lon.toFixed(5)]),
      sights: sights.map(s => [s.name, s.kind, +s.lat.toFixed(5), +s.lon.toFixed(5), s.fame]),
      shops: rows.map(toRow),
    }),
  };
  return cache.body;
}

function routes(app) {
  app.get("/v1/health", async () => ({ ok: true, time: new Date().toISOString() }));

  // Whole city in one response (about 2 MB, gzipped ~500 KB). The app also ships a copy for offline first launch.
  app.get("/v1/bundle", async (req, reply) => {
    const body = await bundle();
    reply.header("content-type", "application/json; charset=utf-8").header("cache-control", "public, max-age=300");
    return body;
  });

  // Only what changed since the app's last sync. Removed/closed shops come back in `removed`.
  app.get("/v1/sync", async (req) => {
    const since = Number(req.query.since || 0);
    if (!Number.isFinite(since) || since < 0) throw bad("since must be a number");
    const rows = await db.many(ROW_SQL + " WHERE s.version > $1 ORDER BY s.version LIMIT 5000", [since]);
    const { categories, groups } = await taxonomy();
    const v = rows.length ? Number(rows[rows.length - 1].version) : since;
    return {
      version: v, more: rows.length === 5000, groups, categories,
      shops: rows.filter(r => r.status === "active").map(toRow),
      removed: rows.filter(r => r.status !== "active").map(r => r.id),
    };
  });

  app.get("/v1/shops/:id", async (req) => {
    const s = await db.one(ROW_SQL + " WHERE s.id = $1 AND s.status IN ('active', 'pending')", [req.params.id]);
    if (!s) throw notFound("Shop not found");
    const [deals, prices, products, photos] = await Promise.all([
      db.many("SELECT id, title, details, ends_at FROM deals WHERE shop_id = $1 AND ends_at > now() AND starts_at <= now() ORDER BY ends_at", [s.id]),
      db.many("SELECT item, price, updated_at FROM prices WHERE shop_id = $1 ORDER BY item", [s.id]),
      db.many("SELECT id, name, brand, price, in_stock FROM products WHERE shop_id = $1 ORDER BY in_stock DESC, updated_at DESC LIMIT 100", [s.id]),
      db.many("SELECT id, file FROM photos WHERE shop_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 12", [s.id]),
    ]);
    const live = await db.one("SELECT live_note FROM shops WHERE id = $1", [s.id]);
    return { row: toRow(s), live_note: live.live_note, deals, prices, products, photos: photos.map(p => ({ id: p.id, url: `/uploads/${p.file}` })) };
  });

  // "Nike shoes size 9", "iPhone 15 cover": searches owners' product lists.
  app.get("/v1/products", async (req) => {
    const q = str(req.query.q, 80);
    if (!q || q.length < 2) return { items: [] };
    const items = await db.many(`
      SELECT p.id, p.name, p.brand, p.price, p.in_stock, p.shop_id, s.name AS shop_name,
             ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lon
      FROM products p JOIN shops s ON s.id = p.shop_id AND s.status = 'active'
      WHERE p.search @@ plainto_tsquery('simple', $1) OR p.name ILIKE '%' || $1 || '%' OR similarity(p.name, $1) > 0.35
      ORDER BY p.in_stock DESC, similarity(p.name, $1) DESC LIMIT 40`, [q]);
    return { items };
  });

  // Anonymous counters for the owner's stats screen. Batched by the app.
  const KINDS = new Set(["view", "call", "whatsapp", "directions", "share", "search_hit"]);
  app.post("/v1/events", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req) => {
    const evs = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    const ok = evs.filter(e => e && typeof e.shop_id === "string" && KINDS.has(e.kind));
    if (!ok.length) return { saved: 0 };
    await db.q(`INSERT INTO shop_stats (shop_id, day, kind, n)
      SELECT e.shop_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, e.kind, count(*)
      FROM jsonb_to_recordset($1::jsonb) AS e(shop_id text, kind text)
      WHERE EXISTS (SELECT 1 FROM shops s WHERE s.id = e.shop_id) GROUP BY 1, 2, 3
      ON CONFLICT (shop_id, day, kind) DO UPDATE SET n = shop_stats.n + EXCLUDED.n`, [JSON.stringify(ok)]);
    return { saved: ok.length };
  });

  app.get("/v1/champions", async (req) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : new Date().toISOString().slice(0, 7);
    const top = await db.many(`
      SELECT u.id, COALESCE(u.name, 'Champion') AS name, sum(l.delta)::int AS points
      FROM points_ledger l JOIN users u ON u.id = l.user_id AND NOT u.banned
      WHERE to_char(l.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = $1
      GROUP BY u.id ORDER BY points DESC LIMIT 50`, [month]);
    return { month, top: top.map((r, i) => ({ rank: i + 1, name: r.name, points: r.points, me: req.user?.id === r.id })) };
  });
}

module.exports = { routes, toRow, ROW_SQL, SRC_BITS, taxonomy };
