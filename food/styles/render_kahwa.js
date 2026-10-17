const { chromium } = require("/opt/node-tools/node_modules/playwright");
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("file://" + __dirname + "/kahwa.html"); await p.waitForTimeout(600);
  await (await p.$("#kahwa")).screenshot({ path: __dirname + "/kahwa-v2.png" }); await b.close(); })();
