// Applies db/*.sql files once each, in name order.
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

(async () => {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
  const dir = path.join(__dirname, "..", "db");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [f]);
    if (done.rowCount) continue;
    console.log("applying", f);
    await pool.query("BEGIN");
    try {
      await pool.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await pool.query("COMMIT");
    } catch (e) { await pool.query("ROLLBACK"); throw e; }
  }
  console.log("migrations done");
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
