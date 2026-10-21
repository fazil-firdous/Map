// 1.2 features against a running API (same setup as e2e.test.js): sizes, prices that pay restaurants exactly,
// the new-customer free delivery, suggestions, the private support number, and handing a restaurant to its owner.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const pg = require("pg");
const API = process.env.API_URL || "http://localhost:8090";
const ADMIN = { "x-admin-token": process.env.ADMIN_TOKEN || "admintest" };
const CODE = process.env.TEST_CODE || "246810";

async function call(method, path, body, token, extra = {}) {
  const r = await fetch(API + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const login = async phone => { await call("POST", "/v1/auth/otp/start", { phone }); return (await call("POST", "/v1/auth/otp/verify", { phone, code: CODE })).token; };
let db, fresh, freshPhone;
/** A brand-new customer (no orders), logged in without an SMS. */
async function newCustomer() {
  freshPhone = "+9191" + String(Date.now()).slice(-8);
  const u = (await db.query("INSERT INTO users (phone, name) VALUES ($1, 'New Customer') RETURNING id", [freshPhone])).rows[0];
  const t = crypto.randomBytes(24).toString("hex");
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [crypto.createHash("sha256").update(t).digest("hex"), u.id]);
  return t;
}

test.before(async () => {
  db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/kezia" }); await db.connect();
  await db.query("UPDATE restaurants SET status = 'active', is_open = true WHERE id = '80-degrees'");
  fresh = await newCustomer();
});
test.after(async () => { await db.query("UPDATE restaurants SET status = 'pending', is_open = false, commission_pct = 2 WHERE id = '80-degrees'"); await db.end(); });

test("sizes: the customer must pick one, and pays the size's price", async () => {
  const items = (await call("GET", "/v1/restaurants/80-degrees")).items;
  const pizza = items.find(i => i.name === "Chicken Blast");
  assert.deepEqual(pizza.variants.map(v => v.n), ["Small", "Medium", "Large"]);
  assert.ok(!("net" in pizza.variants[0]), "what the restaurant receives is not shown to customers");
  const q0 = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: pizza.id, qty: 1 }], lat: 33.6431, lon: 75.0172 });
  assert.equal(q0.status, 400, "no size chosen");
  const q = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: pizza.id, qty: 2, v: 1 }], lat: 33.6431, lon: 75.0172 });
  assert.equal(q.lines[0].name, "Chicken Blast (Medium)"); assert.equal(q.lines[0].price, 408);
});

test("prices pay the restaurant exactly what it asked for, also after a rate change", async () => {
  const blast = async () => (await db.query("SELECT price, variants FROM menu_items WHERE restaurant_id = '80-degrees' AND name = 'Chicken Blast'")).rows[0];
  let b = await blast();
  for (const v of b.variants) assert.equal(v.p - Math.round(v.p * 0.02), v.net, `${v.n} at 2%`);
  await call("PATCH", "/v1/admin/restaurants/80-degrees", { commission_pct: 5 }, null, ADMIN);
  b = await blast();
  for (const v of b.variants) assert.equal(v.p - Math.round(v.p * 0.05), v.net, `${v.n} at 5%`);
  assert.equal(b.variants[0].p, 253);
  await call("PATCH", "/v1/admin/restaurants/80-degrees", { commission_pct: 2 }, null, ADMIN);
  assert.equal((await blast()).variants[0].p, 245);
});

test("new customers get free delivery on their first order up to ₹400 (when switched on); Kezia pays the restaurant the fee", async () => {
  await db.query("UPDATE settings SET value = '1' WHERE key = 'promo_new_orders'");
  const items = (await call("GET", "/v1/restaurants/80-degrees")).items, fries = items.find(i => i.name === "Peri Peri Fries");
  const lat = 33.6431, lon = 75.0172;
  const addr = (await call("POST", "/v1/addresses", { label: "Home", landmark: "Test lane", lat, lon }, fresh)).address;
  const q = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: fries.id, qty: 2 }], lat, lon }, fresh);
  assert.ok(q.promo && q.promo.amount === q.delivery_fee && q.delivery_fee > 0, "free delivery offered");
  assert.equal(q.total, q.item_total + q.packing);
  const big = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: fries.id, qty: 4 }], lat, lon }, fresh);
  assert.equal(big.promo, null, "over ₹400 food value: no offer");
  const o = (await call("POST", "/v1/orders", { restaurant_id: "80-degrees", items: [{ id: fries.id, qty: 2 }], address_id: addr.id, pay_method: "cod" }, fresh)).order;
  assert.equal(o.promo_amount, q.delivery_fee); assert.equal(o.total, q.total);
  const row = (await db.query("SELECT commission FROM orders WHERE id = $1", [o.id])).rows[0];
  assert.equal(row.commission, Math.round(o.item_total * 0.02) - o.promo_amount, "fee comes off the commission");
  const again = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: fries.id, qty: 2 }], lat, lon }, fresh);
  assert.equal(again.promo, null, "only the first order");
  await call("POST", `/v1/orders/${o.id}/cancel`, {}, fresh);
  await db.query("UPDATE settings SET value = '0' WHERE key = 'promo_new_orders'");
});
test("restaurants can give free delivery above an amount (they pay it, not Kezia)", async () => {
  const items = (await call("GET", "/v1/restaurants/80-degrees")).items, fries = items.find(i => i.name === "Peri Peri Fries");
  await db.query("UPDATE restaurants SET free_above = 300 WHERE id = '80-degrees'");
  const q = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: fries.id, qty: 3 }], lat: 33.6431, lon: 75.0172 }, fresh);
  assert.equal(q.delivery_fee, 0); assert.equal(q.promo, null, "not a Kezia offer");
  await db.query("UPDATE restaurants SET free_above = NULL WHERE id = '80-degrees'");
});

test("suggestions reach the owner; support number only for restaurant teams", async () => {
  assert.equal((await call("POST", "/v1/suggestions", { text: "Please add Wazwan on Fridays" }, fresh)).ok, true);
  const list = (await call("GET", "/v1/admin/suggestions", null, null, ADMIN)).suggestions;
  const s = list.find(x => x.text === "Please add Wazwan on Fridays"); assert.ok(s); assert.equal(s.kind, "customer");
  assert.equal((await call("PATCH", `/v1/admin/suggestions/${s.id}`, { status: "done" }, null, ADMIN)).suggestion.status, "done");
  await db.query("UPDATE settings SET value = '\"+919876500001\"' WHERE key = 'support_phone'");
  assert.equal((await call("GET", "/v1/me", null, fresh)).support, null, "customers don't get the number");
  const kitchen = await login("9000000101");
  assert.ok((await call("GET", "/v1/me", null, kitchen)).support, "restaurant teams do");
  assert.equal((await call("GET", "/v1/home")).support, undefined, "not on the public home feed");
});

test("hand a restaurant to its owner by phone", async () => {
  const r = await call("POST", "/v1/admin/restaurants/chunk-city/owner", { phone: freshPhone.slice(-10) }, null, ADMIN);
  assert.equal(r.done, "owner");
  const me = await call("GET", "/v1/me", null, fresh);
  assert.ok(me.places.some(p => p.id === "chunk-city" && p.role === "owner"));
  const p = await call("POST", "/v1/admin/restaurants/chunk-city/owner", { phone: "9123499999" }, null, ADMIN);
  assert.equal(p.done, "pending", "not yet a user: becomes theirs when they log in");
  await db.query("UPDATE restaurants SET owner_id = NULL, pending_owner_phone = NULL WHERE id = 'chunk-city'");
});

test("today's specials: a dish on a special price, shown to customers and used in the order", async () => {
  const admin = { "x-admin-token": process.env.ADMIN_TOKEN || "admintest" };
  const items = (await call("GET", "/v1/restaurants/80-degrees")).items, blast = items.find(i => i.name === "Chicken Blast");
  const tooHigh = await call("POST", "/v1/restaurant/80-degrees/offers", { item_id: blast.id, v: 2, net_price: 600 }, null, admin);
  assert.equal(tooHigh.status, 401, "restaurant login needed");
  const kitchenToken = await login("9000000101");
  await db.query("UPDATE restaurants SET owner_id = (SELECT id FROM users WHERE phone = '+919000000101') WHERE id = '80-degrees'");
  assert.equal((await call("POST", "/v1/restaurant/80-degrees/offers", { item_id: blast.id, v: 2, net_price: 600 }, kitchenToken)).status, 400, "must be cheaper than usual");
  const o = (await call("POST", "/v1/restaurant/80-degrees/offers", { item_id: blast.id, v: 2, net_price: 450, title: "Weekend Large" }, kitchenToken)).offer;
  assert.equal(o.price, 459, "₹450 to the restaurant at 2% → ₹459 (2% of 459 rounds to 9)");
  const r = await call("GET", "/v1/restaurants/80-degrees");
  assert.ok(r.specials.some(s => s.id === o.id && s.size === "Large" && s.was === 561));
  assert.ok((await call("GET", "/v1/home")).specials.some(s => s.id === o.id), "on the home screen");
  const q = await call("POST", "/v1/quote", { restaurant_id: "80-degrees", items: [{ id: blast.id, qty: 1, v: 2 }, { id: blast.id, qty: 1, v: 0 }], lat: 33.6431, lon: 75.0172 });
  assert.equal(q.lines[0].price, 459); assert.equal(q.lines[0].special, true); assert.equal(q.lines[1].price, 245, "other sizes unchanged");
  await call("DELETE", `/v1/restaurant/80-degrees/offers/${o.id}`, null, kitchenToken);
  assert.ok(!(await call("GET", "/v1/restaurants/80-degrees")).specials.length, "removed");
  await db.query("UPDATE restaurants SET owner_id = NULL WHERE id = '80-degrees'");
});
