// Render brand/src/*.svg to the PNG sizes stores and Android need (headless Chromium via Playwright).
// Run: node brand/render.js   (after python brand/make_logo.py)
const path = require("path"), fs = require("fs");
let pw; try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const SRC = path.join(__dirname, "src"), PNG = path.join(__dirname, "png");
const JOBS = [ // [svg, out, width (null = keep ratio), height, transparent]
  ["icon.svg", "play-icon-512.png", 512, 512], ["icon.svg", "icon-1024.png", 1024, 1024], ["icon.svg", "icon-192.png", 192, 192], ["icon.svg", "icon-48.png", 48, 48],
  ["icon-foreground.svg", "icon-foreground-1024.png", 1024, 1024, true], ["icon-background.svg", "icon-background-1024.png", 1024, 1024],
  ["icon-monochrome.svg", "icon-monochrome-1024.png", 1024, 1024, true], ["feature-graphic.svg", "play-feature-graphic-1024x500.png", 1024, 500],
  ["logo-horizontal.svg", "logo-horizontal.png", null, 400, true], ["logo-horizontal-white.svg", "logo-horizontal-white.png", null, 400, true],
  ["wordmark.svg", "wordmark.png", null, 140, true], ["splash.svg", "splash-2732.png", 2732, 2732], ["splash-dark.svg", "splash-dark-2732.png", 2732, 2732],
];
(async () => {
  const b = await pw.chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined }).catch(() => pw.chromium.launch());
  for (const [src, out, w0, h, tr] of JOBS) {
    const svg = fs.readFileSync(path.join(SRC, src), "utf8"); const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const w = w0 || Math.round(vb[2] * h / vb[3]);
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:${w}px;height:${h}px;display:block"></body></html>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(PNG, out), omitBackground: !!tr, clip: { x: 0, y: 0, width: w, height: h } }); await p.close();
    console.log(out, w, h);
  }
  await b.close();
})();
