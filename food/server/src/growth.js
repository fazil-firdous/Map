// Install links: the owner makes one link per Instagram post, poster or restaurant (kezia.<domain>/i/<code>), and sees
// what each brought in: visits, APK downloads, web app opens, sign-ups and orders. Restaurants' own share links
// (/r/<id>) are counted too, as "r-<id>". People are counted once a day per link, without storing who they are.
const db = require("./db");
const { needAdmin } = require("./auth");
const { sha256, bad, str } = require("./util");

const CODE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const cleanCode = c => { c = String(c || "").toLowerCase().trim(); return CODE.test(c) ? c : null; };
const who = req => sha256(`${req.ip}|${req.headers["user-agent"] || ""}|${new Date().toISOString().slice(0, 10)}`).slice(0, 16);
async function known(code) {
  if (!code) return false;
  if (code === "direct") return true;
  if (code.startsWith("r-")) return !!(await db.one("SELECT 1 FROM restaurants WHERE lower(id) = $1", [code.slice(2)]));
  return !!(await db.one("SELECT 1 FROM links WHERE code = $1", [code]));
}
async function record(code, kind, req) {
  code = cleanCode(code);
  if (!(await known(code))) return false;
  const w = req ? who(req) : null;
  if (w && await db.one("SELECT 1 FROM link_events WHERE code = $1 AND kind = $2 AND who = $3", [code, kind, w])) return true;
  await db.q("INSERT INTO link_events (code, kind, who) VALUES ($1, $2, $3)", [code, kind, w]);
  return true;
}
/** A new customer signed up in the web app after arriving through a link. */
async function signup(userId, ref) {
  const code = cleanCode(ref);
  if (!(await known(code))) return;
  await db.q("UPDATE users SET ref = $2 WHERE id = $1 AND ref IS NULL", [userId, code]);
  await db.q("INSERT INTO link_events (code, kind) VALUES ($1, 'signup')", [code]);
}

function routes(app) {
  // kezia.<domain>/i/<code> → the install page, remembering the link
  app.get("/i/:code", async (req, reply) => {
    const code = cleanCode(req.params.code);
    const ok = await record(code, "visit", req);
    return reply.redirect(ok ? `/?ref=${code}` : "/");
  });
  // the install page's download button
  app.get("/dl/:code", async (req, reply) => {
    await record(req.params.code, "download", req);
    return reply.redirect("/kezias-food.apk");
  });
  // the web app, opened from a link
  app.post("/v1/ref", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req) => ({ ok: await record(req.body?.code, "open", req) }));

  app.get("/v1/admin/links", { preHandler: needAdmin }, async () => {
    const stats = await db.many(`SELECT code,
        count(*) FILTER (WHERE kind = 'visit')::int visits, count(*) FILTER (WHERE kind = 'download')::int downloads,
        count(*) FILTER (WHERE kind = 'open')::int opens, count(*) FILTER (WHERE kind = 'signup')::int signups
      FROM link_events GROUP BY code`);
    const orders = await db.many(`SELECT u.ref code, count(*)::int n FROM orders o JOIN users u ON u.id = o.user_id WHERE u.ref IS NOT NULL AND o.status = 'delivered' GROUP BY u.ref`);
    const by = Object.fromEntries(stats.map(s => [s.code, s])), ord = Object.fromEntries(orders.map(o => [o.code, o.n]));
    const row = (code, label, extra = {}) => ({ code, label, visits: 0, downloads: 0, opens: 0, signups: 0, ...(by[code] || {}), orders: ord[code] || 0, ...extra });
    const links = (await db.many("SELECT * FROM links ORDER BY created_at DESC")).map(l => row(l.code, l.label, { created_at: l.created_at }));
    const shares = (await db.many("SELECT id, name FROM restaurants WHERE status IN ('active', 'test') ORDER BY name"))
      .map(r => row("r-" + r.id.toLowerCase(), r.name + " (share link)", { share: `/r/${r.id}` })).filter(r => r.visits || r.downloads || r.signups);
    const heard = await db.many("SELECT heard, count(*)::int n FROM users WHERE heard IS NOT NULL GROUP BY heard ORDER BY n DESC");
    return { links, shares, direct: row("direct", "Install page, no link"), heard };
  });
  app.post("/v1/admin/links", { preHandler: needAdmin }, async (req) => {
    const label = str(req.body?.label, 60);
    if (!label) throw bad("Give the link a name, e.g. Instagram reel 1");
    let base = cleanCode(req.body?.code) || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "link";
    if (base.startsWith("r-") || base === "direct") base = "l-" + base;
    let code = base;
    for (let i = 2; await db.one("SELECT 1 FROM links WHERE code = $1", [code]); i++) code = `${base}-${i}`;
    await db.q("INSERT INTO links (code, label) VALUES ($1, $2)", [code, label]);
    return { link: { code, label } };
  });
  app.delete("/v1/admin/links/:code", { preHandler: needAdmin }, async (req) => {
    await db.q("DELETE FROM links WHERE code = $1", [req.params.code]); return { ok: true };
  });
}

module.exports = { routes, record, signup };
