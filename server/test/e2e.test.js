// End-to-end test against a running API (API_URL, default http://localhost:8080) with DEV_RETURN_OTP=1.
const test = require("node:test");
const assert = require("node:assert");
const API = process.env.API_URL || "http://localhost:8080";
const ADMIN = process.env.ADMIN_TOKEN || "admintest";

async function call(method, path, body, token, extra = {}) {
  const r = await fetch(API + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
const device = async (name) => (await call("POST", "/v1/auth/device", { device_id: "test-device-" + name + "-" + Date.now() + Math.random(), name })).token;

test("full flow", async () => {
  assert.equal((await call("GET", "/v1/health")).ok, true);

  const b = await (await fetch(API + "/v1/bundle")).json();
  assert.ok(b.shops.length > 10000, "bundle has shops");
  assert.ok(b.categories.includes("Bakery & Sweets"));
  const C = b.categories;

  // Owner: a shop with its own mobile number
  const shop = b.shops.find(s => s[6] && /^\+91[6-9]/.test(s[6]) && !s[18] && C[s[3]] === "Bakery & Sweets");
  const owner = await device("owner");
  const st = await call("POST", "/v1/auth/otp/start", { phone: shop[6] }, owner);
  assert.equal(st.sent, true);
  const v = await call("POST", "/v1/auth/otp/verify", { phone: shop[6], code: st.dev_code }, owner);
  assert.ok(v.token, "verified");
  const ot = v.token;
  const claim = await call("POST", `/v1/shops/${shop[0]}/claim`, {}, ot);
  assert.equal(claim.status, "approved");

  assert.equal((await call("PATCH", `/v1/owner/shops/${shop[0]}`, { live_status: "open", live_note: "Fresh kulcha now", live_hours: 6 }, ot)).ok, true);
  assert.ok((await call("POST", `/v1/owner/shops/${shop[0]}/deals`, { title: "20% off cakes", days: 2 }, ot)).id);
  assert.equal((await call("PUT", `/v1/owner/shops/${shop[0]}/prices`, { prices: [{ item: "Kulcha", price: "Rs 10" }] }, ot)).saved, 1);
  assert.equal((await call("POST", `/v1/owner/shops/${shop[0]}/products`, { lines: "Chocolate truffle cake 1kg | Rs 650\nBakarkhani | Rs 15" }, ot)).added, 2);

  // Someone else cannot use owner tools
  const stranger = await device("stranger");
  assert.equal((await call("PATCH", `/v1/owner/shops/${shop[0]}`, { live_status: "closed_today" }, stranger)).status, 403);
  assert.equal((await call("GET", `/v1/owner/shops/${shop[0]}/stats`, null, stranger)).status, 403);

  // Visits/calls counters, visible only to the owner
  await call("POST", "/v1/events", { events: [{ shop_id: shop[0], kind: "view" }, { shop_id: shop[0], kind: "view" }, { shop_id: shop[0], kind: "call" }] });
  const stats = await call("GET", `/v1/owner/shops/${shop[0]}/stats`, null, ot);
  assert.equal(stats.totals.view, 2); assert.equal(stats.totals.call, 1);

  // Public detail shows deal, prices, products, live status
  const d = await call("GET", `/v1/shops/${shop[0]}`);
  assert.equal(d.row[21], "open"); assert.ok(d.row[22] > 0); assert.equal(d.prices.length, 1); assert.equal(d.products.length, 2);
  assert.equal(d.row[23], 1);

  // Product search
  const ps = await call("GET", "/v1/products?q=" + encodeURIComponent("truffle cake"));
  assert.ok(ps.items.some(i => i.shop_id === shop[0]));

  // Ask the bazaar: a customer near the shop asks for cake
  const cust = await device("customer");
  const ask = await call("POST", "/v1/asks", { text: "I want a birthday cake today", lat: shop[12], lon: shop[13] }, cust);
  assert.equal(ask.category, "Bakery & Sweets");
  assert.ok(ask.in_app >= 1, "claimed bakery gets it in the app");
  const inbox = await call("GET", "/v1/owner/inbox", null, ot);
  const item = inbox.asks.find(a => a.id === ask.id);
  assert.ok(item);
  assert.equal((await call("POST", `/v1/owner/asks/${ask.id}/reply`, { shop_id: shop[0], text: "Yes, ready by 5 pm" }, ot)).ok, true);
  const mine = await call("GET", "/v1/asks/mine", null, cust);
  assert.equal(mine.asks[0].replies[0].text, "Yes, ready by 5 pm");

  // Add a shop -> admin approves -> champion points
  const champ = await device("champ");
  const add = await call("POST", "/v1/shops", { name: "Test Kandur Wan " + Date.now(), category: "Bakery & Sweets", lat: 34.05 + Math.random() * 0.06, lon: 74.78 + Math.random() * 0.06, phone: "9419000000" }, champ);
  assert.equal(add.status, "pending");
  const q = await call("GET", "/v1/admin/queue", null, null, { "x-admin-token": ADMIN });
  assert.ok(q.shops.some(s => s.id === add.id));
  assert.equal((await call("POST", `/v1/admin/shops/${add.id}/approve`, null, null, { "x-admin-token": ADMIN })).ok, true);
  const lb = await call("GET", "/v1/champions", null, champ);
  assert.ok(lb.top.some(t => t.me && t.points >= 10));
  // Duplicate is refused
  const dup = await call("POST", "/v1/shops", { name: shop[1], category: "Bakery & Sweets", lat: shop[12], lon: shop[13] }, champ);
  assert.equal(dup.status, 409);

  // Sync returns only changes after a version
  const s1 = await call("GET", `/v1/sync?since=${b.version}`);
  assert.ok(s1.shops.some(r => r[0] === shop[0]) && s1.shops.some(r => r[0] === add.id));

  // Admin endpoints need the token
  assert.equal((await call("GET", "/v1/admin/queue")).status, 403);
});

test("delete my data", async () => {
  const tk = await device("deleter");
  assert.equal((await call("DELETE", "/v1/me", null, tk)).deleted, true);
  assert.equal((await call("GET", "/v1/me", null, tk)).status, 401);
});

test("play reviewer gets the hidden demo shop only", async () => {
  if (!process.env.REVIEW_PHONE) return;
  const tk = await device("reviewer");
  const st = await call("POST", "/v1/auth/otp/start", { phone: process.env.REVIEW_PHONE }, tk);
  const v = await call("POST", "/v1/auth/otp/verify", { phone: process.env.REVIEW_PHONE, code: process.env.REVIEW_CODE }, tk);
  assert.ok(v.token);
  const me = await call("GET", "/v1/me", null, v.token);
  assert.deepEqual(me.shops.map(s => s.id), ["SXR-REVIEW01"]);
  const b = await (await fetch(API + "/v1/bundle")).json();
  assert.ok(!b.shops.some(s => s[0] === "SXR-REVIEW01"), "demo shop hidden from public");
});
