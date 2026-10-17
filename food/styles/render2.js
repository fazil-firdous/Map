// node render2.js -> style2-01.png … style2-12.png + styles2-overview.jpg source shots
const { chromium } = require("/opt/node-tools/node_modules/playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + __dirname + "/styles2.html"); await p.waitForTimeout(800);
  const n = await p.$$eval(".card-wrap", e => e.length);
  for (let i = 1; i <= n; i++) await (await p.$("#w" + i)).screenshot({ path: `${__dirname}/style2-${String(i).padStart(2, "0")}.png` });
  await b.close();
})();
