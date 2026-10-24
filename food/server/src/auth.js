// Login is by phone number and a one-time SMS code (needed to place orders; browsing is open).
// The test numbers (local tests) and the Play Store demo number get a fixed code and no SMS.
const db = require("./db");
const config = require("./config");
const { sha256, hmac, token, otpCode, normPhone, isMobile, bad, forbidden, HttpError, str } = require("./util");
const { sendOtp } = require("./sms");

const SESSION_DAYS = 365;
const testCode = phone => config.test.code && [config.test.ownerPhone, config.test.customerPhone].filter(Boolean).map(normPhone).includes(phone) ? config.test.code : null;
const isOwner = phone => !!(config.owner.phone && phone === normPhone(config.owner.phone));
const isReview = phone => !!(config.review.phone && config.review.code && phone === normPhone(config.review.phone));
/** Accounts that log in with a fixed code instead of an SMS. */
const fixedCode = phone => (isOwner(phone) && config.owner.code) || (isReview(phone) && config.review.code) || testCode(phone);
// Login limits count per phone number, not per network: mobile networks put many phones behind one IP.
// (They run as preHandler hooks so the phone number in the body has been parsed.)
const phoneKey = req => "otp:" + (normPhone(req.body?.phone) || req.ip);
const fixedAllowed = req => !!fixedCode(normPhone(req.body?.phone));

async function sessionFor(userId) {
  const t = token();
  await db.q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)", [sha256(t), userId, `${SESSION_DAYS} days`]);
  return t;
}
async function loadUser(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return;
  const hash = sha256(h.slice(7));
  const u = await db.one(`SELECT u.*, s.expires_at session_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.banned`, [hash]);
  if (!u) return;
  req.user = u;
  // Logins renew themselves while the app is used, so people never have to log in (and pay for an SMS) again
  if (new Date(u.session_expires) < new Date(Date.now() + (SESSION_DAYS - 30) * 86400000))
    db.q("UPDATE sessions SET expires_at = now() + $2::interval WHERE token_hash = $1", [hash, `${SESSION_DAYS} days`]).catch(() => {});
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
const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, heard: u.heard || null });
const HEARD = ["Instagram", "Friend or family", "Poster or restaurant", "WhatsApp", "Other"];

function routes(app) {
  app.post("/v1/auth/otp/start", { config: { rateLimit: { max: 8, timeWindow: "1 hour", keyGenerator: phoneKey, allowList: fixedAllowed, hook: "preHandler" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    if (!isMobile(phone)) throw bad("Enter a 10-digit mobile number");
    const fixed = fixedCode(phone);
    const prev = !fixed && await db.one("SELECT sent_at FROM otps WHERE phone = $1", [phone]);
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 60_000) throw new HttpError(429, "Wait a minute before asking for another code");
    if (!fixed) {
      const n = await db.one("SELECT count(*)::int today, count(*) FILTER (WHERE ip = $1 AND sent_at > now() - interval '1 hour')::int this_ip FROM sms_log WHERE sent_at > now() - interval '1 day'", [req.ip]);
      if (n.today >= config.smsDailyMax) { req.log.error({ today: n.today }, "daily login SMS limit reached"); throw new HttpError(503, "Too many logins today. Please try again in a few hours"); }
      if (n.this_ip >= config.smsPerIpHour) throw new HttpError(429, "Too many codes from this network. Try again in an hour");
    }
    const code = fixed || otpCode();
    await db.q(`INSERT INTO otps (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
      ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, sent_at = now(), expires_at = EXCLUDED.expires_at`, [phone, hmac(phone + ":" + code)]);
    if (!fixed) {
      await db.q("INSERT INTO sms_log (phone, ip) VALUES ($1, $2)", [phone, req.ip]);
      try { await sendOtp(phone, code, req.log); }
      catch (e) { await db.q("DELETE FROM otps WHERE phone = $1", [phone]); req.log.error(e); throw new HttpError(502, "We couldn't send the SMS. Please try again in a minute"); }
    }
    return { sent: true, phone, ...(config.sms.devReturnCode && !fixed ? { dev_code: code } : {}) };
  });

  app.post("/v1/auth/otp/verify", { config: { rateLimit: { max: 30, timeWindow: "1 hour", keyGenerator: phoneKey, hook: "preHandler" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const o = phone && await db.one("SELECT * FROM otps WHERE phone = $1", [phone]);
    if (!o || new Date(o.expires_at) < new Date()) throw bad("Code expired. Ask for a new one");
    if (o.attempts >= 5) throw bad("Too many tries. Ask for a new code");
    if (o.code_hash !== hmac(phone + ":" + code)) { await db.q("UPDATE otps SET attempts = attempts + 1 WHERE phone = $1", [phone]); throw bad("Wrong code"); }
    await db.q("DELETE FROM otps WHERE phone = $1", [phone]);
    const name = str(req.body?.name, 40);
    let user = await db.one(`INSERT INTO users (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name) RETURNING *, (xmax = 0) AS created`, [phone, name]);
    // a new customer who came through an install link (web app): count the signup for that link
    if (user.created && req.body?.ref) await require("./growth").signup(user.id, req.body.ref);
    if (user.banned && !isOwner(phone)) throw forbidden("This number is blocked. Contact support");
    // A restaurant the owner handed to this number becomes theirs now
    await db.q("UPDATE restaurants SET owner_id = $1, pending_owner_phone = NULL WHERE pending_owner_phone = $2", [user.id, phone]);
    // The platform owner is the admin: sees every restaurant, order and user, and runs no restaurant itself.
    if (isOwner(phone)) user = await db.one("UPDATE users SET role = 'admin', banned = false WHERE id = $1 RETURNING *", [user.id]);
    // The test owner manages the test restaurant (local tests).
    if (config.test.ownerPhone && phone === normPhone(config.test.ownerPhone)) await db.q("UPDATE restaurants SET owner_id = $1 WHERE id = 'KF-TEST' AND owner_id IS NULL", [user.id]);
    const places = await myPlaces(user);
    return { token: await sessionFor(user.id), user: publicUser(user), places, support: await supportFor(user, places), push: require("./push").enabled() };
  });

  // The support WhatsApp number goes only to restaurant teams, riders and the owner, never to customers
  const supportFor = async (user, places) => {
    if (user.role !== "admin" && !places.length) return null;
    const s = await db.one("SELECT value FROM settings WHERE key = 'support_phone'");
    return (s && s.value) || null;
  };
  app.get("/v1/me", { preHandler: needUser }, async (req) => {
    const places = await myPlaces(req.user);
    return { user: publicUser(req.user), places, support: await supportFor(req.user, places), push: require("./push").enabled() };
  });
  // Suggestions box (anyone logged in)
  app.post("/v1/suggestions", { preHandler: needUser, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req) => {
    const text = str(req.body?.text, 1000);
    if (!text || text.length < 3) throw bad("Write your suggestion first");
    const places = await myPlaces(req.user);
    const kind = places.some(p => p.role === "owner" || p.role === "manager") ? "restaurant" : places.length ? "rider" : "customer";
    await db.q("INSERT INTO suggestions (user_id, name, phone, kind, text) VALUES ($1, $2, $3, $4, $5)", [req.user.id, req.user.name, req.user.phone, kind, text]);
    return { ok: true };
  });
  app.patch("/v1/me", { preHandler: needUser }, async (req) => {
    const heard = HEARD.includes(req.body?.heard) ? req.body.heard : null;
    const u = await db.one("UPDATE users SET name = COALESCE($2, name), heard = COALESCE($3, heard) WHERE id = $1 RETURNING *", [req.user.id, str(req.body?.name, 40), heard]);
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

module.exports = { routes, isReview, loadUser, needUser, needAdmin, needRole, roleAt, myPlaces, publicUser };
