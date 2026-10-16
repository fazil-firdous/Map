// Accounts: every phone gets a free anonymous account on first launch (device id).
// A phone number is added only when needed (claiming a shop, Ask replies, champion prizes),
// so SMS is paid for only by people who need it.
const db = require("./db");
const config = require("./config");
const { sha256, hmac, token, otpCode, normPhone, isMobile, bad, forbidden, HttpError, str } = require("./util");
const { sendOtp } = require("./sms");

const SESSION_DAYS = 180;

async function sessionFor(userId) {
  const t = token();
  await db.q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)",
    [sha256(t), userId, `${SESSION_DAYS} days`]);
  return t;
}

/** Fastify preHandler: sets req.user if a valid bearer token is sent. */
async function loadUser(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return;
  const u = await db.one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.banned`, [sha256(h.slice(7))]);
  if (u) req.user = u;
}
const needUser = async (req) => { if (!req.user) throw new HttpError(401, "Sign in first"); };
const needPhone = async (req) => { await needUser(req); if (!req.user.phone) throw forbidden("Verify your phone number first"); };
const needAdmin = async (req) => {
  if (config.adminToken && req.headers["x-admin-token"] === config.adminToken) return;
  if (req.user?.role === "admin") return;
  throw forbidden();
};

function routes(app) {
  app.post("/v1/auth/device", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const deviceId = str(req.body?.device_id, 100);
    if (!deviceId || deviceId.length < 16) throw bad("device_id required");
    const name = str(req.body?.name, 40);
    const u = await db.one(`INSERT INTO users (device_id, name) VALUES ($1, $2)
      ON CONFLICT (device_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name) RETURNING *`, [deviceId, name]);
    return { token: await sessionFor(u.id), user: publicUser(u) };
  });

  app.post("/v1/auth/otp/start", { preHandler: needUser, config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    if (!isMobile(phone)) throw bad("Enter a 10-digit mobile number");
    const prev = await db.one("SELECT sent_at FROM otps WHERE phone = $1", [phone]);
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 60_000) throw new HttpError(429, "Wait a minute before asking for another code");
    // Play Store reviewers get a fixed number and code (REVIEW_PHONE / REVIEW_CODE); no SMS is sent.
    const review = config.review.phone && phone === normPhone(config.review.phone);
    const code = review ? config.review.code : otpCode();
    await db.q(`INSERT INTO otps (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
      ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, sent_at = now(), expires_at = EXCLUDED.expires_at`,
      [phone, hmac(phone + ":" + code)]);
    if (!review) await sendOtp(phone, code, req.log);
    return { sent: true, phone, ...(config.sms.devReturnCode ? { dev_code: code } : {}) };
  });

  app.post("/v1/auth/otp/verify", { preHandler: needUser, config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const o = phone && await db.one("SELECT * FROM otps WHERE phone = $1", [phone]);
    if (!o || new Date(o.expires_at) < new Date()) throw bad("Code expired. Ask for a new one");
    if (o.attempts >= 5) throw bad("Too many tries. Ask for a new code");
    if (o.code_hash !== hmac(phone + ":" + code)) {
      await db.q("UPDATE otps SET attempts = attempts + 1 WHERE phone = $1", [phone]);
      throw bad("Wrong code");
    }
    await db.q("DELETE FROM otps WHERE phone = $1", [phone]);
    // If this number already has an account (e.g. a new phone), move this device to it.
    const existing = await db.one("SELECT * FROM users WHERE phone = $1", [phone]);
    let user;
    if (existing && existing.id !== req.user.id) {
      await db.q("UPDATE users SET device_id = NULL WHERE id = $1", [req.user.id]);
      user = await db.one("UPDATE users SET device_id = $2 WHERE id = $1 RETURNING *", [existing.id, req.user.device_id]);
    } else {
      user = await db.one("UPDATE users SET phone = $2 WHERE id = $1 RETURNING *", [req.user.id, phone]);
    }
    // The Play reviewer's number manages a hidden demo shop, never a real business.
    if (config.review.phone && phone === normPhone(config.review.phone)) {
      await db.q("UPDATE shops SET owner_id = $1 WHERE id = $2", [user.id, config.review.shopId]);
      user = await db.one("UPDATE users SET role = 'owner' WHERE id = $1 AND role = 'user' RETURNING *", [user.id]) || user;
    }
    return { token: await sessionFor(user.id), user: publicUser(user) };
  });

  app.get("/v1/me", { preHandler: needUser }, async (req) => {
    const shops = await db.many("SELECT id, name FROM shops WHERE owner_id = $1", [req.user.id]);
    return { user: publicUser(req.user), shops };
  });
  // Delete my data (Play Store requirement). Shops a person added stay, without their name attached.
  app.delete("/v1/me", { preHandler: needUser }, async (req) => {
    await db.tx(async c => {
      await c.query("UPDATE shops SET owner_id = NULL WHERE owner_id = $1", [req.user.id]);
      await c.query("UPDATE shops SET created_by = NULL WHERE created_by = $1", [req.user.id]);
      await c.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    });
    return { deleted: true };
  });
  app.patch("/v1/me", { preHandler: needUser }, async (req) => {
    const u = await db.one("UPDATE users SET name = COALESCE($2, name) WHERE id = $1 RETURNING *", [req.user.id, str(req.body?.name, 40)]);
    return { user: publicUser(u) };
  });
}

const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone ? u.phone.replace(/^(\+91\d{2})\d{5}(\d{3})$/, "$1•••••$2") : null,
  role: u.role, points: u.points });

module.exports = { routes, loadUser, needUser, needPhone, needAdmin, publicUser };
