// Sends one-time codes. India requires DLT-registered templates for SMS; set up the template with
// your provider first. "console" just logs the code (for testing on the VPS before SMS is live).
const config = require("./config");

async function sendOtp(phone, code, log) {
  const p = config.sms;
  const digits = phone.replace(/\D/g, "");
  if (p.provider === "console") {
    log.info({ phone }, `OTP for ${phone}: ${code}`);
    return;
  }
  if (p.provider === "msg91") {
    const r = await fetch("https://control.msg91.com/api/v5/otp?" + new URLSearchParams({
      template_id: p.msg91Template, mobile: digits, otp: code,
    }), { method: "POST", headers: { authkey: p.msg91Key, "content-type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error(`MSG91 error ${r.status}`);
    return;
  }
  if (p.provider === "2factor") {
    const r = await fetch(`https://2factor.in/API/V1/${encodeURIComponent(p.twoFactorKey)}/SMS/${digits}/${code}/OTP1`);
    if (!r.ok) throw new Error(`2Factor error ${r.status}`);
    return;
  }
  throw new Error(`Unknown SMS_PROVIDER ${p.provider}`);
}

module.exports = { sendOtp };
