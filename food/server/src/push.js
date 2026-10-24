// Push notifications through Firebase Cloud Messaging (FCM HTTP v1), so phones get new orders and order updates even
// when the app is closed. Off until the VPS has the Firebase key (FIREBASE_KEY_B64: the service account JSON, base64).
// Sending never holds up or breaks an order: failures are only logged.
const crypto = require("crypto");
const db = require("./db");
const config = require("./config");

let key = null;
try { if (config.firebaseKey) key = JSON.parse(Buffer.from(config.firebaseKey, "base64").toString("utf8")); } catch { key = null; }
const enabled = () => !!(key && key.private_key && key.client_email && key.project_id);

const b64url = s => Buffer.from(s).toString("base64url");
let cached = { token: null, until: 0 };
async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: key.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: key.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const jwt = `${unsigned}.${crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url")}`;
  const r = await fetch(claims.aud, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Firebase login failed (${r.status})`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in - 300) * 1000 };
  return cached.token;
}

/** Send to every phone of these users. loud = the ringing "orders" channel (new orders for kitchens and riders). */
async function sendTo(userIds, { title, body, data = {}, loud = false }, log) {
  if (!enabled()) return 0;
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  const tokens = await db.many("SELECT token FROM push_tokens WHERE user_id = ANY($1)", [ids]);
  if (!tokens.length) return 0;
  const auth = await accessToken();
  const url = (config.fcmUrl || "https://fcm.googleapis.com") + `/v1/projects/${key.project_id}/messages:send`;
  let sent = 0;
  for (const { token } of tokens) {
    const message = { token, notification: { title, body }, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: "high", notification: { channel_id: loud ? "orders" : "updates", ...(loud ? { sound: "order_bell" } : {}) } } };
    const r = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + auth, "content-type": "application/json" }, body: JSON.stringify({ message }) });
    if (r.ok) { sent++; continue; }
    const t = await r.text();
    // the app was uninstalled or the token changed: forget it
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) await db.q("DELETE FROM push_tokens WHERE token = $1", [token]);
    else log && log.warn({ status: r.status, body: t.slice(0, 200) }, "push failed");
  }
  return sent;
}

/** The restaurant's owner and managers (who take orders). */
async function teamOf(restaurantId) {
  const rows = await db.many(`SELECT owner_id id FROM restaurants WHERE id = $1 AND owner_id IS NOT NULL
    UNION SELECT u.id FROM staff s JOIN users u ON u.phone = s.phone WHERE s.restaurant_id = $1 AND s.role = 'manager'`, [restaurantId]);
  return rows.map(r => r.id);
}
const rs = n => "₹" + Number(n).toLocaleString("en-IN");

/** Tell the right people about an order's new state. Fire and forget. */
function orderChanged(o, r, log) {
  if (!enabled()) return;
  (async () => {
    const data = { order: o.id, restaurant: r.id, status: o.status };
    const customer = msg => sendTo([o.user_id], { ...msg, data }, log);
    const team = async msg => sendTo(await teamOf(r.id), { ...msg, data: { ...data, kitchen: 1 } }, log);
    switch (o.status) {
      case "placed": return team({ title: `New order ${o.id} · ${rs(o.total)}`, body: `${o.items.map(i => `${i.qty}× ${i.name}`).join(", ")}`.slice(0, 180), loud: true });
      case "accepted": return o.pay_issue ? customer({ title: "Payment not found", body: `${r.name} couldn't find your payment. Check and try again.` })
        : customer({ title: `${r.name} accepted your order`, body: `Pay ${rs(o.total)} now to confirm it.` });
      case "pay_claimed": return team({ title: `Check payment · ${o.id}`, body: `Customer says they paid ${rs(o.total)} by UPI.`, loud: true });
      case "confirmed": return customer({ title: "Order confirmed", body: `${r.name} is on it.` });
      case "preparing": return customer({ title: "Cooking now", body: `${r.name} has started your food.` });
      case "out": {
        const rider = o.rider_phone ? await db.one("SELECT id FROM users WHERE phone = $1", [o.rider_phone]) : null;
        if (rider) await sendTo([rider.id], { title: `Delivery ${o.id}`, body: `Pick up from ${r.name}${o.address && o.address.landmark ? ` · to ${o.address.landmark}` : ""}`, data: { ...data, rider: 1 }, loud: true }, log);
        return customer({ title: "On the way", body: `${o.rider_name || "Your rider"} is bringing your food. Tap to watch live.` });
      }
      case "delivered": return customer({ title: "Delivered. Enjoy!", body: `How was ${r.name}? Tap to rate your food.` });
      case "rejected": return customer({ title: "Order not accepted", body: o.reject_reason || `${r.name} can't take this order right now.` });
      case "cancelled": return o.cancel_by === "customer" ? team({ title: `Order ${o.id} cancelled`, body: "The customer cancelled this order." })
        : customer({ title: "Order cancelled", body: o.cancel_reason || `${r.name} cancelled your order.` });
      case "expired": return customer({ title: "Order closed", body: o.cancel_reason || "This order expired." });
    }
  })().catch(e => log && log.warn({ err: e.message }, "push error"));
}

function routes(app, { needUser }) {
  app.post("/v1/push/token", { preHandler: needUser }, async (req) => {
    const token = String(req.body?.token || "").slice(0, 400);
    if (token.length < 20) return { ok: false };
    await db.q(`INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()`, [token, req.user.id, String(req.body?.platform || "android").slice(0, 20)]);
    return { ok: true };
  });
  app.post("/v1/push/forget", { preHandler: needUser }, async (req) => {
    await db.q("DELETE FROM push_tokens WHERE token = $1 AND user_id = $2", [String(req.body?.token || ""), req.user.id]); return { ok: true };
  });
}

module.exports = { enabled, sendTo, orderChanged, routes };
