// node render.js -> style-A.png ... style-D.png (one board per theme)
const { chromium } = require("/opt/node-tools/node_modules/playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + __dirname + "/styles.html"); await p.waitForTimeout(500);
  for (const [i, n] of ["A", "B", "C", "D"].entries()) await (await p.$("#s" + i)).screenshot({ path: `${__dirname}/style-${n}.png` });
  await b.close();
})();
