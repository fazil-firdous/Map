// Prices with the commission built in. A restaurant says what it wants to receive for a dish (net); the customer
// price is the smallest price that leaves exactly that after Kezia's percentage. Example at 2%: net ₹200 → ₹204
// (2% of 204 is ₹4, leaving ₹200). When a restaurant's rate changes, its customer prices are worked out again.
const db = require("./db");

function customerPrice(net, pct) {
  net = Math.round(Number(net));
  if (!(pct > 0)) return net;
  let p = Math.ceil(net / (1 - pct / 100));
  while (p - Math.round(p * pct / 100) < net) p++;
  while (p - 1 - Math.round((p - 1) * pct / 100) >= net) p--;
  return p;
}

async function ratePct(restaurantId, c = db) {
  const one = async (sql, v) => (c.one ? c.one(sql, v) : (await c.query(sql, v)).rows[0]);
  const r = await one("SELECT commission_pct FROM restaurants WHERE id = $1", [restaurantId]);
  if (r && r.commission_pct !== null) return Number(r.commission_pct);
  const s = await one("SELECT value FROM settings WHERE key = 'commission_pct'");
  return Number(s && s.value) || 0;
}

/** Customer price (and sizes) for a dish from its net price(s) at this rate. */
function priced(item, pct) {
  const variants = Array.isArray(item.variants) && item.variants.length
    ? item.variants.map(v => ({ n: String(v.n), net: Math.round(Number(v.net)), p: customerPrice(v.net, pct) })) : null;
  if (variants) return { variants, net_price: Math.min(...variants.map(v => v.net)), price: Math.min(...variants.map(v => v.p)) };
  return { variants: null, net_price: item.net_price, price: customerPrice(item.net_price, pct) };
}

/** Work out customer prices again for every dish priced by net (after a rate change). */
async function reprice(restaurantId) {
  const pct = await ratePct(restaurantId);
  const items = await db.many("SELECT id, net_price, variants FROM menu_items WHERE restaurant_id = $1 AND net_price IS NOT NULL", [restaurantId]);
  for (const it of items) {
    const p = priced(it, pct);
    await db.q("UPDATE menu_items SET price = $2, variants = $3 WHERE id = $1", [it.id, p.price, p.variants ? JSON.stringify(p.variants) : null]);
  }
  return items.length;
}
async function repriceAll() {
  for (const r of await db.many("SELECT id FROM restaurants WHERE commission_pct IS NULL")) await reprice(r.id);
}

module.exports = { customerPrice, ratePct, priced, reprice, repriceAll };
