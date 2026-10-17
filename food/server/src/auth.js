// Login is by phone number and a one-time SMS code (needed to place orders; browsing is open).
// The test owner and test customer numbers get a fixed code and no SMS.
const db = require("./db");
const config = require("./config");
const { sha256, hmac, token, otpCode, normPhone, isMobile, bad, forbidden, HttpError, str } = require("./util");
const { sendOtp } = require("./sms");

const SESSION_DAYS = 365;
const testCode = phone => config.test.code && [config.test.ownerPhone, config.test.customerPhone].filter(Boolean).map(normPhone).includes(phone) ? config.test.code : null;

async function sessionFor(userId) {
  const t = token();
  await db.q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)", [sha256(t), userId, `${SESSION_DAYS} days`]);
  return t;
}
async function loadUser(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return;
  const u = await db.one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.banned`, [sha256(h.slice(7))]);
  if (u) req.user = u;
}
const needUser = async (req) => { if (!req.user) throw new HttpError(401, "Please log in first"); };
const needAdmin = async (req) => {
  if (config.adminToken && req.headers["x-admin-token"] === config.adminToken) return;
  if (req.user?.role === "admin") return;
  throw forbidden();
};

/** The user's role at a restaurant: owner, manager, rider, or null. */
async function roleAt(user, restaurantId) {
  if (!user) return null;
  const r = await db.one("SELECT owner_id FROM restaurants WHERE id = $1", [restaurantId]);
  if (!r) return null;
  if (r.owner_id === user.id) return "owner";
  const s = await db.one("SELECT role FROM staff WHERE restaurant_id = $1 AND phone = $2", [restaurantId, user.phone]);
  return s ? s.role : null;
}
/** preHandler factory: allow only these roles at the restaurant in params.rid (admins always). */
const needRole = (...roles) => async (req) => {
  await needUser(req);
  const role = await roleAt(req.user, req.params.rid);
  if (!(req.user.role === "admin" || roles.includes(role))) throw forbidden("Only the restaurant's team can do this");
  req.role = role || "admin";
};

async function myPlaces(user) {
  return db.many(`SELECT r.id, r.name, r.status, r.is_open, CASE WHEN r.owner_id = $1 THEN 'owner' ELSE s.role END AS role
    FROM restaurants r LEFT JOIN staff s ON s.restaurant_id = r.id AND s.phone = $2
    WHERE r.owner_id = $1 OR s.phone IS NOT NULL ORDER BY r.name`, [user.id, user.phone]);
}
const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role });

function routes(app) {
  app.post("/v1/auth/otp/start", { config: { rateLimit: { max: 6, timeWindow: "1 hour" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    if (!isMobile(phone)) throw bad("Enter a 10-digit mobile number");
    const prev = await db.one("SELECT sent_at FROM otps WHERE phone = $1", [phone]);
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 45_000) throw new HttpError(429, "Wait a few seconds before asking for another code");
    const fixed = testCode(phone);
    const code = fixed || otpCode();
    await db.q(`INSERT INTO otps (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
      ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, sent_at = now(), expires_at = EXCLUDED.expires_at`, [phone, hmac(phone + ":" + code)]);
    if (!fixed) await sendOtp(phone, code, req.log);
    return { sent: true, phone, ...(config.sms.devReturnCode ? { dev_code: code } : {}) };
  });

  app.post("/v1/auth/otp/verify", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const o = phone && await db.one("SELECT * FROM otps WHERE phone = $1", [phone]);
    if (!o || new Date(o.expires_at) < new Date()) throw bad("Code expired. Ask for a new one");
    if (o.attempts >= 5) throw bad("Too many tries. Ask for a new code");
    if (o.code_hash !== hmac(phone + ":" + code)) { await db.q("UPDATE otps SET attempts = attempts + 1 WHERE phone = $1", [phone]); throw bad("Wrong code"); }
    await db.q("DELETE FROM otps WHERE phone = $1", [phone]);
    const name = str(req.body?.name, 40);
    const user = await db.one(`INSERT INTO users (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name) RETURNING *`, [phone, name]);
    if (user.banned) throw forbidden("This number is blocked. Contact support");
    // The test owner manages the test restaurant.
    if (config.test.ownerPhone && phone === normPhone(config.test.ownerPhone)) await db.q("UPDATE restaurants SET owner_id = $1 WHERE id = 'KF-TEST' AND owner_id IS NULL", [user.id]);
    return { token: await sessionFor(user.id), user: publicUser(user), places: await myPlaces(user) };
  });

  app.get("/v1/me", { preHandler: needUser }, async (req) => ({ user: publicUser(req.user), places: await myPlaces(req.user) }));
  app.patch("/v1/me", { preHandler: needUser }, async (req) => {
    const u = await db.one("UPDATE users SET name = COALESCE($2, name) WHERE id = $1 RETURNING *", [req.user.id, str(req.body?.name, 40)]);
    return { user: publicUser(u) };
  });
  app.post("/v1/auth/logout", { preHandler: needUser }, async (req) => {
    await db.q("DELETE FROM sessions WHERE token_hash = $1", [sha256(req.headers.authorization.slice(7))]); return { ok: true };
  });
  // Delete my data (Play Store requirement). Past orders stay for the restaurant's records, without the person attached.
  app.delete("/v1/me", { preHandler: needUser }, async (req) => {
    await db.tx(async c => {
      await c.query("UPDATE orders SET customer_phone = NULL, customer_name = NULL WHERE user_id = $1", [req.user.id]);
      await c.query("UPDATE restaurants SET owner_id = NULL WHERE owner_id = $1", [req.user.id]);
      await c.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    });
    return { deleted: true };
  });

  // Saved addresses: a pin on the map and a landmark
  app.get("/v1/addresses", { preHandler: needUser }, async (req) => ({ addresses: await db.many("SELECT * FROM addresses WHERE user_id = $1 ORDER BY id DESC", [req.user.id]) }));
  app.post("/v1/addresses", { preHandler: needUser }, async (req) => {
    const b = req.body || {}, lat = Number(b.lat), lon = Number(b.lon), landmark = str(b.landmark, 160);
    if (!landmark) throw bad("Add a landmark so the rider can find you");
    const bb = config.bbox; if (!(lat > bb.minLat && lat < bb.maxLat && lon > bb.minLon && lon < bb.maxLon)) throw bad("We deliver in Kulgam district only");
    return { address: await db.one("INSERT INTO addresses (user_id, label, landmark, lat, lon) VALUES ($1, $2, $3, $4, $5) RETURNING *", [req.user.id, str(b.label, 20) || "Home", landmark, lat, lon]) };
  });
  app.delete("/v1/addresses/:id", { preHandler: needUser }, async (req) => {
    await db.q("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [Number(req.params.id) || 0, req.user.id]); return { ok: true };
  });
}

module.exports = { routes, loadUser, needUser, needAdmin, needRole, roleAt, myPlaces, publicUser };
