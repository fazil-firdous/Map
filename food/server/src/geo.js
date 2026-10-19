// Road distances on our own Kulgam map (OpenStreetMap roads), so delivery fees follow real roads
// without a paid maps API. The same graph and rules are used in the app for previews; the server's word is final.
const fs = require("fs");
const path = require("path");

const KM = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

let G = null;
function graph() {
  if (G) return G;
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "kulgam_basemap.json"), "utf8"));
  const id = new Map(), lat = [], lon = [], adj = [];
  const node = ([x, y]) => { const k = x + "," + y; let i = id.get(k); if (i === undefined) { i = lat.length; id.set(k, i); lat.push(y); lon.push(x); adj.push([]); } return i; };
  for (const [, c] of base.roads) {
    let prev = node(c[0]);
    for (let j = 1; j < c.length; j++) { const cur = node(c[j]), d = KM(lat[prev], lon[prev], lat[cur], lon[cur]); adj[prev].push(cur, d); adj[cur].push(prev, d); prev = cur; }
  }
  return G = { lat, lon, adj };
}
function nearest(la, lo) {
  const { lat, lon, adj } = graph(); let best = -1, bd = Infinity;
  for (let i = 0; i < lat.length; i++) { if (!adj[i].length) continue; const d = (lat[i] - la) ** 2 + ((lon[i] - lo) * 0.83) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
/** Dijkstra on the road graph from node s to node t: the distance in km and, if asked, the nodes on the way. */
function shortest(s, t, withPath) {
  const { adj } = graph();
  const dist = new Map([[s, 0]]), prev = withPath ? new Map() : null, heap = [[0, s]];
  const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (u === t) {
      if (!withPath) return { d };
      const nodes = [t]; let x = t; while (prev.has(x)) { x = prev.get(x); nodes.push(x); }
      return { d, nodes: nodes.reverse() };
    }
    if (d > (dist.get(u) ?? Infinity) || d > 40) continue;
    const a = adj[u];
    for (let k = 0; k < a.length; k += 2) { const v = a[k], nd = d + a[k + 1]; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); if (prev) prev.set(v, u); push([nd, v]); } }
  }
  return null;
}
/** Shortest road distance in km between two points (plus the short walk to the nearest road at each end). */
function roadKm(aLat, aLon, bLat, bLon) {
  const { lat, lon } = graph();
  const s = nearest(aLat, aLon), t = nearest(bLat, bLon);
  const ends = KM(aLat, aLon, lat[s], lon[s]) + KM(bLat, bLon, lat[t], lon[t]);
  if (s === t) return Math.max(0.2, KM(aLat, aLon, bLat, bLon));
  const r = shortest(s, t, false);
  return r ? r.d + ends : KM(aLat, aLon, bLat, bLon) * 1.35; // not connected on our map: estimate
}
/** The road route itself, for drawing on the rider's and customer's maps: { km, line: [[lat, lon], …] }. */
function roadRoute(aLat, aLon, bLat, bLon) {
  const { lat, lon } = graph();
  const s = nearest(aLat, aLon), t = nearest(bLat, bLon);
  const r = s === t ? null : shortest(s, t, true);
  if (!r) return { km: Math.round(KM(aLat, aLon, bLat, bLon) * 10) / 10, line: [[aLat, aLon], [bLat, bLon]] };
  const line = [[aLat, aLon], ...r.nodes.map(i => [lat[i], lon[i]]), [bLat, bLon]];
  const km = r.d + KM(aLat, aLon, lat[s], lon[s]) + KM(bLat, bLon, lat[t], lon[t]);
  return { km: Math.round(km * 10) / 10, line };
}

/** Delivery fee by the restaurant's own rules, or null if too far. */
function deliveryFee(r, km, itemTotal) {
  if (km > Number(r.max_km)) return null;
  if (r.free_above && itemTotal >= r.free_above) return 0;
  return r.base_fee + Math.max(0, Math.ceil(km - Number(r.base_km))) * r.per_km;
}
const etaMin = (r, km) => Math.round(r.prep_min + km * 4 + 5);

module.exports = { KM, roadKm, roadRoute, deliveryFee, etaMin, graph };
