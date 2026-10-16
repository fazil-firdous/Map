/* Data layer: offline city data (IndexedDB), sync with the server, sign-in, API calls, visit counters. */
(function () {
  const API = (window.SB_CONFIG && SB_CONFIG.api) || "https://api.srinagarbazaar.in";
  const cap = window.Capacitor;
  const plugin = name => (cap && cap.registerPlugin ? cap.registerPlugin(name) : null);

  // ---- tiny IndexedDB key/value store (localStorage is too small for the city) ----
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open("srinagar-bazaar", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const tx = db.transaction("kv", mode); const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    }));
    return { get: k => run("readonly", s => s.get(k)).catch(() => null), set: (k, v) => run("readwrite", s => s.put(v, k)).catch(() => null) };
  })();
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const S = {
    data: null, online: navigator.onLine, user: ls.get("sb_user", null), listeners: [],
    on(fn) { this.listeners.push(fn); }, emit(what) { this.listeners.forEach(f => { try { f(what); } catch (e) { console.error(e); } }); },

    async load() {
      const [cached, packaged] = await Promise.all([idb.get("bundle"), fetch("data/bundle.json").then(r => r.json())]);
      this.data = cached && cached.version >= packaged.version ? cached : packaged;
      this.index();
      this.sync();
      return this.data;
    },
    index() {
      const d = this.data;
      this.byId = new Map(d.shops.map(s => [s[0], s]));
      this.catList = d.categories.filter(Boolean);
    },
    lastSync: ls.get("sb_last_sync", null),
    async sync() {
      if (!this.online) return;
      try {
        let more = true, changed = 0;
        while (more) {
          const r = await this.api("GET", `/v1/sync?since=${this.data.version}`);
          const d = this.data;
          d.groups = r.groups; d.categories = r.categories;
          const pos = new Map(d.shops.map((s, i) => [s[0], i]));
          for (const row of r.shops) { const i = pos.get(row[0]); if (i === undefined) d.shops.push(row); else d.shops[i] = row; }
          if (r.removed.length) { const gone = new Set(r.removed); d.shops = d.shops.filter(s => !gone.has(s[0])); }
          changed += r.shops.length + r.removed.length;
          d.version = r.version; more = r.more;
        }
        this.lastSync = new Date().toISOString(); ls.set("sb_last_sync", this.lastSync);
        if (changed) { this.index(); await idb.set("bundle", this.data); this.emit("data"); }
      } catch (e) { /* stay on offline data */ }
    },

    // ---- server calls ----
    async api(method, path, body, opts = {}) {
      const headers = {};
      const token = ls.get("sb_token", null);
      if (token) headers.authorization = "Bearer " + token;
      let payload;
      if (body instanceof FormData) payload = body;
      else if (body !== undefined && body !== null) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
      let r;
      try { r = await fetch(API + path, { method, headers, body: payload }); }
      catch { throw new Error("No internet connection. Try again when you're online."); }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && !opts.retried) { ls.set("sb_token", null); await this.signIn(); return this.api(method, path, body, { retried: true }); }
      if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status });
      return j;
    },
    deviceId() {
      let id = ls.get("sb_device", null);
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)) + "-sb"; ls.set("sb_device", id); }
      return id;
    },
    async signIn() {
      if (ls.get("sb_token", null)) return;
      const r = await this.api("POST", "/v1/auth/device", { device_id: this.deviceId(), name: this.user?.name || null }, { retried: true });
      ls.set("sb_token", r.token); this.setUser(r.user);
    },
    setUser(u) { this.user = u; ls.set("sb_user", u); this.emit("user"); },
    async me() { await this.signIn(); const r = await this.api("GET", "/v1/me"); this.setUser(r.user); this.myShops = r.shops; return r; },
    async otpStart(phone) { await this.signIn(); return this.api("POST", "/v1/auth/otp/start", { phone }); },
    async otpVerify(phone, code) { const r = await this.api("POST", "/v1/auth/otp/verify", { phone, code }); ls.set("sb_token", r.token); this.setUser(r.user); return r; },
    async authed(method, path, body) { await this.signIn(); return this.api(method, path, body); },

    // ---- visit counters for the owner's dashboard (batched, anonymous) ----
    queue: [],
    track(shopId, kind) { this.queue.push({ shop_id: shopId, kind }); if (this.queue.length >= 20) this.flush(); },
    async flush() {
      if (!this.queue.length || !this.online) return;
      const events = this.queue.splice(0, 50);
      try { await this.api("POST", "/v1/events", { events }); } catch { this.queue.unshift(...events); }
    },

    // ---- small per-device settings ----
    saved: ls.get("sb_saved", []), recent: ls.get("sb_recent", []), prefs: ls.get("sb_prefs", { loc: { type: "area", idx: 0 }, tourist: false }),
    savePrefs() { ls.set("sb_prefs", this.prefs); },
    toggleSave(id) { const on = this.saved.includes(id); this.saved = on ? this.saved.filter(x => x !== id) : [id, ...this.saved]; ls.set("sb_saved", this.saved); return !on; },
    remember(q) { this.recent = [q, ...this.recent.filter(x => x !== q)].slice(0, 6); ls.set("sb_recent", this.recent); },

    // ---- device features (work in the browser too, with fallbacks) ----
    async openExternal(url) {
      const L = plugin("AppLauncher");
      if (L) { try { await L.openUrl({ url }); return; } catch {} }
      window.open(url, "_blank", "noopener");
    },
    async position() {
      const G = plugin("Geolocation");
      if (G) {
        try { await G.requestPermissions(); } catch {}
        const p = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
        return { lat: p.coords.latitude, lon: p.coords.longitude };
      }
      return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => rej(new Error("Turn on location to use this")), { enableHighAccuracy: true, timeout: 12000 })
        : rej(new Error("Location isn't available on this device")));
    },
    async shareImage(blob, title, text) {
      const Fs = plugin("Filesystem"), Sh = plugin("Share");
      if (Fs && Sh) {
        const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
        const f = await Fs.writeFile({ path: `share-${Date.now()}.png`, data: b64, directory: "CACHE" });
        await Sh.share({ title, text, files: [f.uri], dialogTitle: "Share shop" });
        return true;
      }
      const file = new File([blob], "shop.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text }); return true; }
      return false;
    },
  };

  window.addEventListener("online", () => { S.online = true; S.emit("online"); S.sync(); S.flush(); });
  window.addEventListener("offline", () => { S.online = false; S.emit("online"); });
  const N = plugin("Network");
  if (N) { N.addListener("networkStatusChange", st => { S.online = st.connected; S.emit("online"); if (st.connected) { S.sync(); S.flush(); } }); }
  setInterval(() => S.flush(), 15000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) S.flush(); else S.sync(); });
  window.SB = S;
  window.SBPlugin = plugin;
})();
