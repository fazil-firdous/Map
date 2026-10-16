// Prepares mobile/www for Capacitor:
//  - shared request-reader, Leaflet and QR libraries copied in (no CDN: the app must work offline)
//  - an offline snapshot of all shops (from the API's /v1/bundle) and the city basemap
// Usage: SB_API=https://api.srinagarbazaar.in node scripts/build-web.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const repo = path.join(root, "..");
const www = path.join(root, "www");
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

cp(path.join(repo, "shared", "intent.js"), path.join(www, "js", "intent.js"));
const lf = path.join(root, "node_modules", "leaflet", "dist");
cp(path.join(lf, "leaflet.js"), path.join(www, "vendor", "leaflet", "leaflet.js"));
cp(path.join(lf, "leaflet.css"), path.join(www, "vendor", "leaflet", "leaflet.css"));
cp(path.join(root, "node_modules", "qrcode-generator", "dist", "qrcode.js"), path.join(www, "vendor", "qrcode.js"));
cp(path.join(repo, "app", "basemap.json"), path.join(www, "data", "basemap.json"));
for (const f of ["icon-192.png", "logo-horizontal-white.png", "logo-horizontal.png"]) cp(path.join(repo, "brand", "png", f), path.join(www, "img", f));

const api = process.env.SB_API || "http://localhost:8080";
(async () => {
  const out = path.join(www, "data", "bundle.json");
  try {
    const r = await fetch(api + "/v1/bundle");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const text = await r.text();
    const j = JSON.parse(text);
    fs.writeFileSync(out, text);
    console.log(`offline snapshot: ${j.shops.length} shops, version ${j.version} from ${api}`);
  } catch (e) {
    if (fs.existsSync(out)) console.warn(`Could not reach ${api} (${e.message}); keeping the existing snapshot.`);
    else { console.error(`Could not reach ${api} (${e.message}) and no snapshot exists. Start the API or set SB_API.`); process.exit(1); }
  }
})();
