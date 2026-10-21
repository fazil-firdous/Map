// Adds the real restaurants in data/restaurants/*.json. Safe to run on every install: a restaurant that already exists
// is left alone, and a menu is only added while the restaurant has no dishes, so nothing a restaurant edits is ever
// overwritten. New restaurants start hidden ("pending"): the owner makes them live from the dashboard.
// Menu prices in the files are what the restaurant receives; the customer price adds the restaurant's commission.
const fs = require("fs");
const path = require("path");
const db = require("../src/db");
const { ratePct, priced } = require("../src/pricing");

(async () => {
  const dir = path.join(__dirname, "..", "data", "restaurants");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const added = await db.one(`INSERT INTO restaurants (id, name, phone, area, address, lat, lon, cuisines, photo, status, is_open, cod, prep_min, commission_pct)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', false, $10, $11, $12) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [r.id, r.name, r.phone, r.area, r.address, r.lat, r.lon, r.cuisines, r.photo, r.cod !== false, r.prep_min || 25, r.commission_pct ?? null]);
    const has = await db.one("SELECT count(*)::int n FROM menu_items WHERE restaurant_id = $1", [r.id]);
    let dishes = 0;
    if (!has.n && r.sections && r.sections.length) {
      const pct = await ratePct(r.id);
      await db.tx(async c => {
        for (const [i, s] of r.sections.entries()) {
          const sec = (await c.query("INSERT INTO menu_sections (restaurant_id, name, sort) VALUES ($1, $2, $3) RETURNING id", [r.id, s.name, i])).rows[0];
          for (const [j, it] of s.items.entries()) {
            const p = priced({ net_price: it.net, variants: it.variants }, pct);
            await c.query(`INSERT INTO menu_items (restaurant_id, section_id, name, description, price, net_price, variants, veg, photo, bestseller, sort)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [r.id, sec.id, it.name, it.description || null, p.price, p.net_price, p.variants ? JSON.stringify(p.variants) : null, !!it.veg, it.photo || null, !!it.bestseller, j]);
            dishes++;
          }
        }
      });
    }
    if (r.banner && !(await db.one("SELECT 1 FROM banners WHERE restaurant_id = $1", [r.id])))
      await db.q("INSERT INTO banners (kicker, title, subtitle, photo, restaurant_id, sort) VALUES ($1, $2, $3, $4, $5, 0)", [r.banner.kicker, r.banner.title, r.banner.subtitle, r.banner.photo, r.id]);
    console.log(`${r.name}: ${added ? "added" : "already there"}${dishes ? `, ${dishes} dishes` : ""}`);
  }
  await db.pool.end();
})().catch(e => { console.error(e); process.exit(1); });
