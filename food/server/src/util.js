const crypto = require("crypto");
const config = require("./config");

/** Normalise an Indian phone number to +91XXXXXXXXXX (mobiles and landlines). Returns null if not a phone. */
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (/^1[89]00\d{6,8}$|^1860\d{7}$/.test(d)) return d;
  return d.length === 10 ? "+91" + d : null;
}
const isMobile = p => /^\+91[6-9]\d{9}$/.test(p || "");
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const hmac = s => crypto.createHmac("sha256", config.secret).update(s).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");
const otpCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, "0");

class HttpError extends Error {
  constructor(status, message) { super(message); this.statusCode = status; }
}
const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = "Not allowed") => new HttpError(403, msg);
const notFound = (msg = "Not found") => new HttpError(404, msg);

/** Trim a string field and cap its length; empty becomes null. */
const str = (v, max = 200) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};
const url = (v) => {
  const s = str(v, 300);
  if (!s) return null;
  const u = /^https?:\/\//i.test(s) ? s : "https://" + s.replace(/^\/+/, "");
  try { const x = new URL(u); return x.protocol.startsWith("http") ? x.toString() : null; } catch { return null; }
};
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

module.exports = { normPhone, isMobile, sha256, hmac, token, otpCode, HttpError, bad, forbidden, notFound, str, url, num };
