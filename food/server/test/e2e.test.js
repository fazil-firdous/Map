// End-to-end test against a running API (API_URL, default http://localhost:8090), with the test phones from .env.
const test = require("node:test");
const assert = require("node:assert");
const API = process.env.API_URL || "http://localhost:8090";
const ADMIN = process.env.ADMIN_TOKEN || "admintest";
const OWNER = process.env.TEST_OWNER_PHONE || "9000000101", CUSTOMER = process.env.TEST_CUSTOMER_PHONE || "9000000102", CODE = process.env.TEST_CODE || "246810";

async function call(method, path, body, token, extra = {}) {
  const r = await fetch(API + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
async function login(phone, name) {
  await call("POST", "/v1/auth/otp/start", { phone });
  const v = await call("POST", "/v1/auth/otp/verify", { phone, code: CODE, name });
  assert.ok(v.token, "logged in " + phone);
  return v;
}
let cust, owner, addr, menu;
const order = async (items, pay = "upi") => (await call("POST", "/v1/orders", { restaurant_id: "KF-TEST", items, address_id: addr.id, pay_method: pay }, cust)).order;
const as = (tok, id, path, body = {}) => call("POST", `/v1/orders/${id}/${path}`, body, tok);

test("setup: logins, address, menu", async () => {
  owner = (await login(OWNER, "Test Owner")).token;
  const c = await login(CUSTOMER, "Test Customer"); cust = c.token;
  const me = await call("GET", "/v1/me", null, owner);
  assert.ok(me.places.some(p => p.id === "KF-TEST" && p.role === "owner"), "owner manages the test restaurant");
  await call("PATCH", "/v1/restaurant/KF-TEST", { is_open: true, cod: true, min_order: 150 }, owner);
  addr = (await call("POST", "/v1/addresses", { label: "Home", landmark: "Green gate behind Jamia Masjid", lat: 33.6431, lon: 75.0172 }, cust)).address;
  assert.ok(addr.id);
  menu = (await call("GET", "/v1/restaurants/KF-TEST?lat=33.6431&lon=75.0172")).items;
  assert.ok(menu.length > 10);
  assert.equal((await call("POST", "/v1/addresses", { landmark: "x", lat: 34.08, lon: 74.8 }, cust)).status, 400, "outside Kulgam refused");
});

test("quote: road distance, fee rules, minimum order", async () => {
  const cheap = menu.find(i => i.price < 150);
  const q1 = await call("POST", "/v1/quote", { restaurant_id: "KF-TEST", items: [{ id: cheap.id, qty: 1 }], lat: addr.lat, lon: addr.lon });
  assert.ok(q1.problems.some(p => /Minimum order/.test(p)));
  const q2 = await call("POST", "/v1/quote", { restaurant_id: "KF-TEST", items: [{ id: menu[0].id, qty: 2 }], lat: addr.lat, lon: addr.lon });
  assert.equal(q2.problems.length, 0); assert.equal(q2.delivery_fee, 30); assert.equal(q2.total, q2.item_total + 30 + q2.packing);
  const far = await call("POST", "/v1/quote", { restaurant_id: "KF-TEST", items: [{ id: menu[0].id, qty: 2 }], lat: 33.6113, lon: 74.9263 });
  assert.ok(far.problems.some(p => /delivers within/.test(p)), "too far by road");
});

test("UPI order: accept, pay, confirm, cook, deliver, rate; commission is charged", async () => {
  const pizza = menu.find(i => i.name === "Chicken Tikka Pizza");
  let o = await order([{ id: pizza.id, qty: 2 }]);
  assert.equal(o.status, "placed"); assert.ok(!o.pay, "no UPI details before acceptance");
  assert.equal((await as(cust, o.id, "accept")).status, 403, "customer can't accept");
  o = (await as(owner, o.id, "accept")).order; assert.equal(o.status, "accepted");
  o = (await call("GET", `/v1/orders/${o.id}`, null, cust)).order; assert.equal(o.pay.upi_id, "kezias.test@upi", "UPI shown after acceptance");
  o = (await as(cust, o.id, "paid", { utr: "312345678901" })).order; assert.equal(o.status, "pay_claimed");
  o = (await as(owner, o.id, "payment", { received: false })).order; assert.equal(o.status, "accepted"); assert.ok(o.pay_issue);
  o = (await as(cust, o.id, "paid", { utr: "312345678901" })).order;
  o = (await as(owner, o.id, "payment", { received: true })).order; assert.equal(o.status, "confirmed");
  assert.equal(o.commission, Math.round(538 * 8 / 100), "8% of food value");
  o = (await as(owner, o.id, "preparing")).order; assert.equal(o.status, "preparing");
  assert.equal((await as(cust, o.id, "cancel")).status, 400, "no cancel once cooking");
  o = (await as(owner, o.id, "dispatch")).order; assert.equal(o.status, "out");
  assert.equal((await as(owner, o.id, "location", { lat: 33.645, lon: 75.018 })).ok, true);
  o = (await call("GET", `/v1/orders/${o.id}`, null, cust)).order; assert.ok(o.rider && o.rider.lat, "customer sees rider position");
  o = (await as(owner, o.id, "delivered")).order; assert.equal(o.status, "delivered");
  o = (await as(cust, o.id, "rate", { rating: 5, review: "Hot and fresh" })).order; assert.equal(o.rating, 5);
  assert.equal((await as(cust, o.id, "rate", { rating: 1 })).status, 400, "rate once");
});

test("commission: earnings show what's owed, settle, admin confirms", async () => {
  let e = await call("GET", "/v1/restaurant/KF-TEST/earnings", null, owner);
  assert.equal(e.commission_pct, 8); assert.ok(e.current.commission > 0, "this week's commission is counted"); assert.equal(e.platform_upi, "kezias.platform@upi");
  assert.equal((await call("GET", "/v1/restaurant/KF-TEST/earnings", null, cust)).status, 403, "customers can't see earnings");
  // weekly bills: this week's orders wait for Monday's bill; last week's are billed now
  if (!e.bill.amount) assert.equal((await call("POST", "/v1/restaurant/KF-TEST/settle", { utr: "998877665544" }, owner)).status, 400, "nothing billed yet");
  const pg = require("pg"); const c = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/kezia" }); await c.connect();
  await c.query("UPDATE orders SET delivered_at = delivered_at - interval '8 days' WHERE restaurant_id = 'KF-TEST' AND status = 'delivered' AND settlement_id IS NULL"); await c.end();
  e = await call("GET", "/v1/restaurant/KF-TEST/earnings", null, owner);
  assert.ok(e.bill.amount > 0 && e.bill.due_by, "last week's bill");
  const s = (await call("POST", "/v1/restaurant/KF-TEST/settle", { utr: "998877665544" }, owner)).settlement;
  assert.equal(s.amount, e.bill.amount);
  e = await call("GET", "/v1/restaurant/KF-TEST/earnings", null, owner); assert.equal(e.bill.amount, 0);
  const ok = await call("POST", `/v1/admin/settlements/${s.id}/paid`, null, null, { "x-admin-token": ADMIN });
  assert.equal(ok.settlement.status, "paid");
});

test("cancellation rules and refunds", async () => {
  const item = menu.find(i => i.price >= 150);
  let o = await order([{ id: item.id, qty: 1 }]);
  o = (await as(cust, o.id, "cancel")).order; assert.equal(o.status, "cancelled"); assert.equal(o.refund, null, "free before paying");
  o = await order([{ id: item.id, qty: 1 }]);
  await as(owner, o.id, "accept"); await as(cust, o.id, "paid", { utr: "1111" }); await as(owner, o.id, "payment", { received: true });
  o = (await as(cust, o.id, "cancel", { reason: "Ordered by mistake" })).order;
  assert.equal(o.status, "cancelled"); assert.equal(o.refund, "due", "paid + cancelled in window = refund due");
  o = (await as(owner, o.id, "refund-sent")).order; assert.equal(o.refund, "sent");
  o = (await as(cust, o.id, "refund-received")).order; assert.equal(o.refund, "received");
  o = await order([{ id: item.id, qty: 1 }]);
  o = (await as(owner, o.id, "reject", { reason: "Out of chicken" })).order; assert.equal(o.status, "rejected");
});

test("cash order, no-show protection, and expiry", async () => {
  const item = menu.find(i => i.price >= 150);
  let o = await order([{ id: item.id, qty: 1 }], "cod");
  o = (await as(owner, o.id, "accept")).order; assert.equal(o.status, "confirmed", "cash goes straight to confirmed");
  await as(owner, o.id, "dispatch");
  o = (await as(owner, o.id, "no-show")).order; assert.equal(o.status, "cancelled");
  o = await order([{ id: item.id, qty: 1 }]);
  const pg = require("pg"); const c = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/kezia" }); await c.connect();
  await c.query("UPDATE orders SET accept_by = now() - interval '1 second' WHERE id = $1", [o.id]);
  await c.query("UPDATE users SET no_shows = 0 WHERE phone = $1", ["+91" + CUSTOMER]); await c.end();
  for (let i = 0; i < 20 && o.status === "placed"; i++) { await new Promise(r => setTimeout(r, 1000)); o = (await call("GET", `/v1/orders/${o.id}`, null, cust)).order; }
  assert.equal(o.status, "expired", "unanswered orders expire on their own");
});
