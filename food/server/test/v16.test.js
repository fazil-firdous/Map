// 1.6 against a running API started with DEV_RETURN_OTP=1, FCM_URL=http://localhost:8099 and a test Firebase key whose token_uri is
// http://localhost:8099/token: install links, reviews with photos and replies, and push notifications.
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const crypto = require("crypto");
const pg = require("pg");
const API = process.env.API_URL || "http://localhost:8090";
const ADMIN = { "x-admin-token": process.env.ADMIN_TOKEN || "admintest" };
const CODE = process.env.TEST_CODE || "246810";

async function call(method, path, body, token, extra = {}) {
  const r = await fetch(API + path, { method, redirect: "manual", headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, location: r.headers.get("location"), ...(await r.json().catch(() => ({}))) };
}
// test numbers have a fixed code; other numbers use the code the test server returns (DEV_RETURN_OTP=1)
const login = async (phone, extra = {}) => { const st = await call("POST", "/v1/auth/otp/start", { phone }); return call("POST", "/v1/auth/otp/verify", { phone, code: st.dev_code || CODE, ...extra }); };
let db, owner, cust, custId, mock, pushed = [];
async function newCustomer() {
  const phone = "+9192" + String(Date.now()).slice(-8);
  const u = (await db.query("INSERT INTO users (phone, name) VALUES ($1, 'Rafiq Ahmad') RETURNING id", [phone])).rows[0];
  const t = crypto.randomBytes(24).toString("hex");
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [crypto.createHash("sha256").update(t).digest("hex"), u.id]);
  return { token: t, id: u.id };
}

test.before(async () => {
  db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/kezia" }); await db.connect();
  // stand-in for Google: hands out a token and records every push
  mock = http.createServer((req, res) => {
    let b = ""; req.on("data", c => b += c); req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/token") return res.end(JSON.stringify({ access_token: "test-access", expires_in: 3600 }));
      pushed.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b) }); res.end("{}");
    });
  }).listen(8099);
  owner = (await login("9000000101")).token;
  const c = await newCustomer(); cust = c.token; custId = c.id;
  await call("PATCH", "/v1/restaurant/KF-TEST", { is_open: true, cod: true, min_order: 100 }, owner);
});
test.after(async () => { mock.close(); await db.end(); });

test("install links: visits and downloads counted once a day per person; web sign-ups and answers credited", async () => {
  const l = (await call("POST", "/v1/admin/links", { label: "Poster at Chunk City" }, null, ADMIN)).link;
  assert.match(l.code, /^poster-at-chunk-city/);
  const v = await call("GET", `/i/${l.code}`); assert.equal(v.status, 302); assert.match(v.location, new RegExp(`\\?ref=${l.code}$`));
  await call("GET", `/i/${l.code}`);
  assert.match((await call("GET", `/dl/${l.code}`)).location, /kezias-food\.apk$/);
  assert.equal((await call("GET", "/i/no-such-link")).location, "/", "unknown links still reach the install page");
  // a new customer signs up in the web app after coming through the link
  const phone = "93" + String(Date.now()).slice(-8);
  const s = await login(phone, { ref: l.code, name: "Web Visitor" });
  assert.ok(s.token);
  assert.equal(s.push, true, "the app is told push is on");
  await call("PATCH", "/v1/me", { heard: "Poster or restaurant" }, s.token);
  const j = await call("GET", "/v1/admin/links", null, null, ADMIN);
  const row = j.links.find(x => x.code === l.code);
  assert.deepEqual([row.visits, row.downloads, row.signups], [1, 1, 1]);
  assert.ok(j.heard.some(h => h.heard === "Poster or restaurant" && h.n >= 1));
  assert.equal((await call("PATCH", "/v1/me", { heard: "Hacker News" }, cust)).user.heard, null, "only the listed answers");
});

test("reviews: stars, words and a photo show on the restaurant page; the restaurant replies; the owner can hide one", async () => {
  await call("POST", "/v1/push/token", { token: "owner-phone-token-0123456789", platform: "android" }, owner);
  await call("POST", "/v1/push/token", { token: "customer-phone-token-0123456789", platform: "android" }, cust);
  pushed = [];
  const addr = (await call("POST", "/v1/addresses", { label: "Home", landmark: "Near Jamia Masjid", lat: 33.6431, lon: 75.0172 }, cust)).address;
  const items = (await call("GET", "/v1/restaurants/KF-TEST")).items;
  const dish = items.find(i => !i.variants && i.price >= 150) || items[0];
  const o = (await call("POST", "/v1/orders", { restaurant_id: "KF-TEST", items: [{ id: dish.id, qty: 1 }], address_id: addr.id, pay_method: "cod" }, cust)).order;
  assert.ok(o && o.id);
  for (const step of ["accept", "dispatch", "delivered"]) assert.equal((await call("POST", `/v1/orders/${o.id}/${step}`, {}, owner)).status, 200, step);
  await new Promise(r => setTimeout(r, 400));
  // push: the kitchen got the new order on the loud channel, the customer got the updates
  const toOwner = pushed.filter(p => p.body.message.token === "owner-phone-token-0123456789");
  assert.ok(toOwner.some(p => /New order/.test(p.body.message.notification.title) && p.body.message.android.notification.channel_id === "orders"), "kitchen rang");
  const toCust = pushed.filter(p => p.body.message.token === "customer-phone-token-0123456789").map(p => p.body.message.notification.title);
  assert.ok(toCust.includes("Order confirmed") && toCust.includes("On the way") && toCust.includes("Delivered. Enjoy!"), toCust.join(" | "));
  assert.ok(pushed.every(p => p.auth === "Bearer test-access" && p.url === "/v1/projects/kezia-test/messages:send"));

  assert.equal((await call("POST", `/v1/orders/${o.id}/rate`, { rating: 5, review: "Best pizza in Kulgam" }, cust)).status, 200);
  // photo: a tiny real JPEG
  const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  const fd = new FormData(); fd.append("file", new Blob([jpg], { type: "image/jpeg" }), "food.jpg");
  const up = await fetch(`${API}/v1/orders/${o.id}/review-photo`, { method: "POST", headers: { authorization: "Bearer " + cust }, body: fd }).then(r => r.json());
  assert.match(up.photo, /^\/uploads\/.+\.jpg$/);
  let pub = await call("GET", "/v1/restaurants/KF-TEST/reviews");
  const mine = pub.reviews.find(r => r.id === o.id);
  assert.equal(mine.text, "Best pizza in Kulgam"); assert.equal(mine.photo, up.photo); assert.equal(mine.name, "Rafiq");
  assert.ok(!("phone" in mine), "no phone numbers in public reviews");
  const count = pub.count;
  assert.equal((await call("POST", `/v1/restaurant/KF-TEST/reviews/${o.id}/reply`, { text: "Thank you, Rafiq!" }, owner)).review.reply, "Thank you, Rafiq!");
  assert.equal((await call("POST", `/v1/restaurant/KF-TEST/reviews/${o.id}/reply`, { text: "x" }, cust)).status, 403, "customers can't reply");
  await call("PATCH", `/v1/admin/reviews/${o.id}`, { hidden: true }, null, ADMIN);
  pub = await call("GET", "/v1/restaurants/KF-TEST/reviews");
  assert.ok(!pub.reviews.some(r => r.id === o.id)); assert.equal(pub.count, count - 1, "hidden stars stop counting");
  await call("PATCH", `/v1/admin/reviews/${o.id}`, { hidden: false }, null, ADMIN);
  assert.equal((await call("GET", "/v1/restaurants/KF-TEST/reviews")).count, count);
});

test("push: unknown or uninstalled phones are forgotten", async () => {
  await call("POST", "/v1/push/token", { token: "short" }, cust);
  assert.equal((await db.query("SELECT count(*)::int n FROM push_tokens WHERE token = 'short'")).rows[0].n, 0);
  await call("POST", "/v1/push/forget", { token: "customer-phone-token-0123456789" }, cust);
  assert.equal((await db.query("SELECT count(*)::int n FROM push_tokens WHERE user_id = $1", [custId])).rows[0].n, 0);
});

test("restaurant share links count real visits, not link previews", async () => {
  const n = async () => (await db.query("SELECT count(*)::int n FROM link_events WHERE code = 'r-kf-test' AND kind = 'visit'")).rows[0].n;
  await db.query("DELETE FROM link_events WHERE code = 'r-kf-test'");
  await fetch(`${API}/r/KF-TEST`, { headers: { "user-agent": "WhatsApp/2.23.20 A" } }); await new Promise(r => setTimeout(r, 300));
  assert.equal(await n(), 0, "WhatsApp's preview isn't a visit");
  const page = await (await fetch(`${API}/r/KF-TEST`, { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14)" } })).text();
  await new Promise(r => setTimeout(r, 300)); // counted right after the page is sent
  assert.equal(await n(), 1);
  assert.match(page, /href="\/dl\/r-KF-TEST"/); assert.match(page, /\/app\/\?ref=r-KF-TEST#r=KF-TEST/);
});
