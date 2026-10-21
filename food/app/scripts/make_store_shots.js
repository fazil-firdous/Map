// Play Store phone screenshots (1080x1920): a caption on the brand green, with a real app screen in a phone frame.
// Usage: node scripts/make_store_shots.js <dir with app screenshots>
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright");
const root = path.join(__dirname, ".."), src = process.argv[2];
const font = "data:font/woff2;base64," + fs.readFileSync(path.join(root, "..", "styles/fonts/Fraunces-800.woff2")).toString("base64");
const SHOTS = [
  ["shots3/01-home.png", "Kulgam's best food,", "in one app"],
  ["shots3/02-80-degrees.png", "Real menus,", "real restaurants"],
  ["shots3/03-sizes.png", "Pick your size,", "see the price"],
  ["shots/14-pay.png", "Pay the restaurant", "directly by UPI"],
  ["shots2/30-customer-route.png", "Watch your rider", "live on the map"],
  ["shots2/20-kitchen-orders.png", "For restaurants:", "orders ring loud"],
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
  for (const [i, [file, a, c]] of SHOTS.entries()) {
    const img = "data:image/png;base64," + fs.readFileSync(path.join(src, file)).toString("base64");
    const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.setContent(`<!doctype html><html><head><style>@font-face{font-family:F;src:url(${font})}
      body{margin:0;width:1080px;height:1920px;overflow:hidden;background:linear-gradient(160deg,#0b6e3d,#1fb066);font-family:F,serif;color:#fff;text-align:center}
      h1{font-size:92px;line-height:1.05;margin:120px 60px 0;letter-spacing:-2px}h1 span{color:#ffd25e}
      .ph{width:700px;height:1515px;margin:70px auto 0;border-radius:70px;background:#13201a;padding:18px;box-shadow:0 60px 120px -30px rgba(0,0,0,.55)}
      .ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:54px;display:block}</style></head>
      <body><h1>${a}<br><span>${c}</span></h1><div class="ph"><img src="${img}"></div></body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(root, "store", `phone-${i + 1}.png`) }); await p.close();
    console.log("wrote store/phone-" + (i + 1) + ".png");
  }
  await b.close();
})();
