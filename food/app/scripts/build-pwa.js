// The web version of the app for iPhone (and any browser): served by the API at kezia.<domain>/app/.
// Builds www/ for "same origin", copies it to ../server/public/app, then rebuilds www/ for the Android app.
// Usage: npm run pwa
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, ".."), www = path.join(root, "www"), out = path.join(root, "..", "server", "public", "app");
const run = api => execFileSync(process.execPath, [path.join(__dirname, "build-web.js")], { stdio: "inherit", env: { ...process.env, KF_API: api } });
run("same-origin");
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(www, out, { recursive: true });
run(process.env.KF_API_APP || "");
const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`web app copied to ${path.relative(root, out)} (${Math.round(size(out) / 1024)} KB)`);
