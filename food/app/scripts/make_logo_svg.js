// Renders brand/logo.svg (K monogram with steam) to every size the app, Play Store and website need.
// Usage: node scripts/make_logo_svg.js   (needs Playwright with Chromium on the build machine)
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright");
const root = path.join(__dirname, ".."), svg = fs.readFileSync(path.join(root, "brand/logo.svg"), "utf8");
const mark = svg.match(/<g id="mark">[\s\S]*?<\/g>\s*<\/g>/)[0];
const markOn = (k, steam) => mark.replace('fill="#fff"', `fill="${k}"`).replace('stroke="#f5b829"', `stroke="${steam}"`);
const font = "data:font/woff2;base64," + fs.readFileSync(path.join(root, "..", "styles/fonts/Fraunces-800.woff2")).toString("base64");
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e3d"/><stop offset="1" stop-color="#1fb066"/></linearGradient></defs>`;
const page = (body, w, h, bg = "transparent") => `<!doctype html><html><head><style>@font-face{font-family:F;src:url(${font})}html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}</style></head><body>${body}</body></html>`;
const tile = (r = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">${grad}<rect width="100" height="100" rx="${r}" fill="url(#g)"/>${mark}</svg>`;
const OUT = [
  ["assets/icon-only.png", 1024, 1024, tile(0)],
  ["assets/icon-background.png", 1024, 1024, `<svg viewBox="0 0 100 100" width="100%" height="100%">${grad}<rect width="100" height="100" fill="url(#g)"/></svg>`],
  ["assets/icon-foreground.png", 1024, 1024, `<svg viewBox="-20 -20 140 140" width="100%" height="100%">${mark}</svg>`, true],
  ["assets/store-icon-512.png", 512, 512, tile(0)],
  ["assets/logo-2048-square.png", 2048, 2048, tile(0)],
  ["assets/logo-2048-rounded.png", 2048, 2048, tile(22), true],
  // for light backgrounds: green K, saffron steam
  ["assets/logo-2048-transparent.png", 2048, 2048, `<svg viewBox="8 4 88 88" width="100%" height="100%">${markOn("#0f8a4f", "#e8a317")}</svg>`, true],
  ["www/img/logo.png", 256, 256, tile(22), true],
  ["www/img/icons/icon-192.png", 192, 192, tile(0)],
  ["www/img/icons/icon-512.png", 512, 512, tile(0)],
  ["www/img/icons/apple-touch-icon.png", 180, 180, tile(0)],
  ["assets/splash.png", 2732, 2732, `<div style="width:2732px;height:2732px;background:linear-gradient(180deg,#c9ecd6,#fbfcf8 60%);display:grid;place-items:center;align-content:center;gap:60px">
     <div style="width:460px;height:460px;border-radius:104px;overflow:hidden;box-shadow:0 60px 120px -40px rgba(15,138,79,.6)">${tile(0)}</div>
     <div style="font:800 170px F,serif;color:#0a6b3c;letter-spacing:-3px">Kezia's Food</div></div>`],
  ["assets/feature-graphic.png", 1024, 500, `<div style="width:1024px;height:500px;background:linear-gradient(120deg,#0b6e3d,#1fb066);display:flex;align-items:center;gap:56px;padding:0 70px;box-sizing:border-box;color:#fff;font-family:F,serif">
     <div style="width:250px;height:250px;flex:none;border-radius:58px;overflow:hidden;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);outline:6px solid rgba(255,255,255,.25)">${tile(0)}</div>
     <div><div style="font:800 86px F,serif;letter-spacing:-2px;line-height:1">Kezia's Food</div>
     <div style="font:600 34px system-ui,sans-serif;margin-top:20px;opacity:.95">Kulgam's own food app</div>
     <div style="font:600 25px system-ui,sans-serif;margin-top:14px;color:#ffd25e">Order · Pay the restaurant · Track live</div></div></div>`],
  // Instagram: profile picture (the K sits inside the round crop) and a launch post
  ["brand/instagram/profile-1080.png", 1080, 1080, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 128 128" width="100%" height="100%">${grad}<rect x="-14" y="-14" width="128" height="128" fill="url(#g)"/>${mark}</svg>`],
  ["brand/instagram/post-launch-1080.png", 1080, 1350, `<div style="width:1080px;height:1350px;background:linear-gradient(160deg,#0b6e3d,#1fb066);color:#fff;font-family:F,serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:34px">
     <div style="width:330px;height:330px;border-radius:78px;overflow:hidden;box-shadow:0 40px 80px -24px rgba(0,0,0,.5);outline:8px solid rgba(255,255,255,.22)">${tile(0)}</div>
     <div style="font:800 118px F,serif;letter-spacing:-3px;line-height:1">Kezia's Food</div>
     <div style="font:700 46px system-ui,sans-serif">Kulgam's own food app</div>
     <div style="font:600 34px system-ui,sans-serif;color:#ffd25e;max-width:820px;line-height:1.35">Order from Kulgam's best restaurants · pay the restaurant by UPI or cash · watch your rider live</div>
     <div style="margin-top:20px;background:#fff;color:#0b6e3d;font:800 40px system-ui,sans-serif;padding:26px 56px;border-radius:999px">Link in bio to install</div></div>`],
];
const only = process.argv[2]; // e.g. "instagram" renders just those files
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
  for (const [file, w, h, body, alpha] of OUT.filter(o => !only || o[0].includes(only))) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(page(body, w, h)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    await p.screenshot({ path: path.join(root, file), omitBackground: !!alpha });
    await p.close(); console.log("wrote", file);
  }
  await b.close();
})();
