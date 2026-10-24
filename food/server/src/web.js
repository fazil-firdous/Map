// Share links for restaurants: kezia.<domain>/r/<id>. WhatsApp and Instagram show a preview card (photo, name),
// and the page opens the restaurant in the app (or installs it, or opens the web version on iPhone).
const db = require("./db");
const growth = require("./growth");
// link previews (WhatsApp, Instagram, Facebook…) fetch the page too: don't count those as visits
const PREVIEW = /bot|crawler|spider|facebookexternalhit|whatsapp|telegram|slack|discord|preview|instagram|twitter/i;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const photo = p => !p ? "/app/img/icons/icon-512.png" : p.startsWith("asset:") ? "/app/img/food/" + p.slice(6) : p;

function routes(app) {
  app.get("/r/:id", async (req, reply) => {
    const r = await db.one("SELECT id, name, area, cuisines, photo, status FROM restaurants WHERE id = $1 AND status IN ('active', 'test')", [req.params.id]);
    const base = `https://${req.headers.host}`;
    if (!r) return reply.redirect("/");
    const id = encodeURIComponent(r.id), img = base + photo(r.photo), ref = encodeURIComponent("r-" + r.id);
    if (!PREVIEW.test(req.headers["user-agent"] || "") && !req.query.app) growth.record("r-" + r.id, "visit", req).catch(() => {});
    const intent = `intent://r/${id}#Intent;scheme=kezia;package=in.keziasfood.app;S.browser_fallback_url=${encodeURIComponent(base + "/r/" + id + "?app=none")};end`;
    reply.type("text/html; charset=utf-8").header("cache-control", "public, max-age=300");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.name)} on Kezia's Food</title>
<meta property="og:title" content="${esc(r.name)} · order on Kezia's Food"><meta property="og:description" content="${esc(r.cuisines || "")}${r.area ? " · " + esc(r.area) : ""}. Order online in Kulgam: pay the restaurant directly, watch your rider live.">
<meta property="og:image" content="${esc(img)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0f8a4f">
<link rel="icon" href="/app/img/icons/icon-192.png">
<style>body{margin:0;font:15px/1.5 system-ui,-apple-system,Roboto,sans-serif;color:#13201a;background:#fbfcf8}main{max-width:560px;margin:0 auto;padding:0 16px 32px}
.hero{height:240px;background:#e7f5ec center/cover no-repeat;border-radius:0 0 26px 26px;margin:0 -16px}.card{margin:-56px 0 0;position:relative;background:#fff;border-radius:22px;padding:18px;box-shadow:0 18px 40px -16px rgb(0 0 0 / .3)}
h1{margin:0;font-size:25px;letter-spacing:-.02em}.sub{color:#56655c;font-size:14px}.btn{display:flex;align-items:center;justify-content:center;height:50px;border-radius:14px;background:linear-gradient(120deg,#0f8a4f,#22b46a);color:#fff;font-weight:800;text-decoration:none;margin-top:12px;box-shadow:0 12px 26px -10px rgb(15 138 79 / .65)}
.btn.ghost{background:#fff;color:#13201a;box-shadow:inset 0 0 0 1px #e4ece7}.brand{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:22px;color:#0f8a4f;font-weight:800}.brand img{width:26px;height:26px;border-radius:8px}</style></head>
<body><main><div class="hero" style="background-image:url('${esc(photo(r.photo))}')"></div>
<div class="card"><h1>${esc(r.name)}</h1><div class="sub">${esc(r.cuisines || "")}${r.area ? " · " + esc(r.area) : ""}</div>
<a class="btn" id="open" href="kezia://r/${id}">Open in Kezia's Food</a>
<a class="btn ghost" href="/dl/${ref}">Install the app (Android)</a>
<a class="btn ghost" href="/app/?ref=${ref}#r=${id}">Order in the browser · iPhone</a></div>
<div class="brand"><img src="/app/img/icons/icon-192.png" alt="">Kezia's Food · Kulgam</div></main>
<script>if (/Android/.test(navigator.userAgent)) document.getElementById("open").href = ${JSON.stringify(intent)};</script></body></html>`;
  });
}

module.exports = { routes };
