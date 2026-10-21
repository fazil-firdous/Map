// Going live: the Play Store demo login can look around but never sends an order to a restaurant; every login SMS is
// counted (for the daily spending limit); new restaurants come in hidden.
const test = require("node:test");
const assert = require("node:assert");
const pg = require("pg");
const API = process.env.API_URL || "http://localhost:8090";
async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
let db;
test.before(async () => { db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/kezia" }); await db.connect(); });
test.after(async () => db.end());

test("demo login for app review: fixed code, can't place orders", async () => {
  const phone = process.env.REVIEW_PHONE || "9000000199";
  assert.equal((await call("POST", "/v1/auth/otp/start", { phone })).sent, true);
  const v = await call("POST", "/v1/auth/otp/verify", { phone, code: process.env.REVIEW_CODE || "112233" });
  assert.ok(v.token, "logs in with the fixed code");
  const items = (await call("GET", "/v1/restaurants/KF-TEST")).items;
  const addr = (await call("POST", "/v1/addresses", { label: "Home", landmark: "Review lane", lat: 33.6431, lon: 75.0172 }, v.token)).address;
  const o = await call("POST", "/v1/orders", { restaurant_id: "KF-TEST", items: [{ id: items[0].id, qty: 1 }], address_id: addr.id, pay_method: "cod" }, v.token);
  assert.equal(o.status, 403); assert.match(o.error || o.message || "", /demo/i);
});

test("each login SMS is logged for the daily limit", async () => {
  const phone = "91" + String(Date.now()).slice(-8);
  const before = (await db.query("SELECT count(*)::int n FROM sms_log WHERE phone = $1", ["+91" + phone])).rows[0].n;
  assert.equal((await call("POST", "/v1/auth/otp/start", { phone })).sent, true);
  const after = (await db.query("SELECT count(*)::int n FROM sms_log WHERE phone = $1", ["+91" + phone])).rows[0].n;
  assert.equal(after, before + 1);
});

test("new restaurants are added hidden, with prices that pay them exactly", async () => {
  for (const id of ["panda-cafe", "zoon-and-zafran"]) {
    const r = (await db.query("SELECT status, (SELECT count(*)::int FROM menu_items WHERE restaurant_id = $1) n FROM restaurants WHERE id = $1", [id])).rows[0];
    assert.equal(r.status, "pending", id); assert.ok(r.n > 50, id);
  }
  const blast = (await db.query("SELECT variants FROM menu_items WHERE restaurant_id = 'zoon-and-zafran' AND name = 'Chicken Blast'")).rows[0];
  assert.deepEqual(blast.variants.map(v => v.net), [199, 349, 499]);
  for (const v of blast.variants) assert.equal(v.p - Math.round(v.p * 0.02), v.net);
});
