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
  if (p.provider === "renflair") {
    const r = await fetch("https://sms.renflair.in/V1.php?" + new URLSearchParams({ API: p.renflairKey, PHONE: digits.slice(-10), OTP: code }));
    const body = await r.text();
    let j = null; try { j = JSON.parse(body); } catch {}
    // renflair answers {"status":"SUCCESS","message":"SMS sent successfully."} or {"status":"FAILED","message":"..."}
    const failed = !r.ok || !j || String(j.status).toUpperCase() !== "SUCCESS";
    if (failed) { log.error({ phone, status: r.status, body: body.slice(0, 300) }, "renflair SMS failed"); throw new Error("SMS couldn't be sent. Try again in a minute"); }
    log.info({ phone, body: body.slice(0, 200) }, "renflair SMS sent");
    return;
  }
  throw new Error(`Unknown SMS_PROVIDER ${p.provider}`);
}

module.exports = { sendOtp };
