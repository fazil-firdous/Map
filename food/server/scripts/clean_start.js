// One-time clean start before going live (install.sh --kezia-clean-start, after a backup):
// removes every order and weekly bill, the test restaurant, and the test logins. Real restaurants, their menus,
// photos and specials, real users and their saved addresses all stay.
const db = require("../src/db");

const TEST_PHONES = ["+919000000101", "+919000000102"];

(async () => {
  const n = await db.tx(async c => {
    const one = async (sql, v) => (await c.query(sql, v)).rowCount;
    const counts = {
      bills: await one("DELETE FROM settlements"),
      orders: await one("DELETE FROM orders"),
      test_restaurant: await one("DELETE FROM restaurants WHERE id = 'KF-TEST' OR status = 'test'"),
      test_logins: await one("DELETE FROM users WHERE phone = ANY($1)", [TEST_PHONES]),
      login_codes: await one("DELETE FROM otps"),
    };
    await c.query("DELETE FROM staff WHERE phone = ANY($1)", [TEST_PHONES]);
    return counts;
  });
  console.log("Clean start done:", Object.entries(n).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", "));
  await db.pool.end();
})().catch(e => { console.error(e); process.exit(1); });
