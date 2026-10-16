// Loads the merged open-data dataset into an empty (or partly filled) database.
// Safe to run again: existing shops are left alone, so owner and user changes are never overwritten.
// Usage: node scripts/seed.js [path/to/srinagar_businesses.csv] [path/to/app-data-dir]
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { pool } = require("../src/db");

const repo = path.join(__dirname, "..", "..");
const csvPath = process.argv[2] || path.join(repo, "data", "srinagar_businesses.csv");
const appDir = process.argv[3] || path.join(repo, "app");

(async () => {
  const appData = JSON.parse(fs.readFileSync(path.join(appDir, "shops.json"), "utf8"));
  const sights = JSON.parse(fs.readFileSync(path.join(appDir, "sights.json"), "utf8"));
  const rows = parse(fs.readFileSync(csvPath, "utf8"), { columns: true, skip_empty_lines: true });
  console.log(`${rows.length} shops in CSV`);

  // Taxonomy: keep the order the app already uses, so ids stay stable.
  const catGroup = {};
  rows.forEach(r => catGroup[r.category] = r.group);
  for (const g of appData.groups) await pool.query("INSERT INTO taxonomy_groups (name) VALUES ($1) ON CONFLICT DO NOTHING", [g]);
  for (const c of appData.categories) {
    await pool.query(`INSERT INTO taxonomy (category, grp_id) SELECT $1, id FROM taxonomy_groups WHERE name = $2 ON CONFLICT DO NOTHING`, [c, catGroup[c] || "Other"]);
  }
  for (const [name, , lat, lon] of appData.areas) {
    await pool.query("INSERT INTO areas (name, geom) VALUES ($1, ST_MakePoint($3, $2)::geography) ON CONFLICT DO NOTHING", [name, lat, lon]);
  }
  const haveSights = (await pool.query("SELECT count(*)::int n FROM sights")).rows[0].n;
  if (!haveSights) for (const [name, kind, lat, lon, fame] of sights) {
    await pool.query("INSERT INTO sights (name, kind, fame, geom) VALUES ($1, $2, $3, ST_MakePoint($5, $4)::geography)", [name, kind, fame, lat, lon]);
  }

  const list = v => (v ? v.split(" | ").filter(Boolean) : []);
  const nz = v => (v === "" || v === undefined ? null : v);
  let added = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000).map(r => ({
      id: r.place_id, name: r.name, grp: r.group, category: r.category, brand: nz(r.brand), phone: nz(r.phone),
      phones_other: list(r.phones_other), phone_is_chain: r.phone_is_chain === "True", whatsapp: nz(r.whatsapp),
      website: nz(r.website), instagram: nz(r.instagram), facebook: nz(r.facebook), email: nz(r.email), address: nz(r.address),
      locality: nz(r.locality), pincode: nz(r.pincode), lat: Number(r.lat), lon: Number(r.lon), location_precise: r.location_precise === "True",
      opening_hours: nz(r.opening_hours), sources: list(r.sources), source_ids: list(r.source_ids), quality_score: Number(r.quality_score) || 50,
    }));
    const res = await pool.query(`
      INSERT INTO shops (id, name, grp, category, brand, phone, phones_other, phone_is_chain, whatsapp, website, instagram, facebook, email,
                         address, locality, pincode, geom, location_precise, opening_hours, sources, source_ids, quality_score)
      SELECT id, name, grp, category, brand, phone, phones_other, phone_is_chain, whatsapp, website, instagram, facebook, email,
             address, locality, pincode, ST_MakePoint(lon, lat)::geography, location_precise, opening_hours, sources, source_ids, quality_score
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, grp text, category text, brand text, phone text, phones_other text[],
           phone_is_chain boolean, whatsapp text, website text, instagram text, facebook text, email text, address text, locality text,
           pincode text, lat float8, lon float8, location_precise boolean, opening_hours text, sources text[], source_ids text[], quality_score int)
      ON CONFLICT (id) DO NOTHING`, [JSON.stringify(batch)]);
    added += res.rowCount;
  }
  const n = (await pool.query("SELECT count(*)::int n FROM shops")).rows[0].n;
  console.log(`added ${added} new shops; ${n} in database`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
