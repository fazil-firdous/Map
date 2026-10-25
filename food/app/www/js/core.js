// Kezia's Food: shared pieces. API client, app state, screens (tabs, pushed screens, sheets), toasts, maps, device features.
/* global L, KFIcons, KF_CONFIG */
(() => {
  const API = KF_CONFIG.api.replace(/\/$/, "");
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  // Native features (back button, notifications, GPS, UPI apps) go through Capacitor's plugins; vendor/capacitor.js adds registerPlugin
  const plugins = {};
  const plugin = name => (native && cap.registerPlugin ? (plugins[name] = plugins[name] || cap.registerPlugin(name)) : null);

  // ---- tiny helpers ----
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const I = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${KFIcons[n] || ""}</svg>`;
  const rs = n => "₹" + Number(n || 0).toLocaleString("en-IN");
  const img = p => !p ? "" : p.startsWith("asset:") ? "img/food/" + p.slice(6) : p.startsWith("/") ? API + p : p;
  const bg = p => p ? `style="background-image:url('${esc(img(p))}')"` : "";
  /** One style attribute with a cover photo plus extra rules (two style attributes on one element drop the second). */
  const bgc = (p, extra = "") => `style="${p ? `background:url('${esc(img(p))}') center/cover no-repeat;` : ""}${extra}"`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const phone10 = p => String(p || "").replace(/\D/g, "").slice(-10);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const time = d => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const when = d => { const t = new Date(d), today = new Date().toDateString() === t.toDateString();
    return today ? "Today, " + time(t) : t.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + time(t); };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // ---- state kept on this phone ----
  const S = {
    token: ls.get("kf_token", null), user: ls.get("kf_user", null), places: ls.get("kf_places", []),
    cart: ls.get("kf_cart", null), addrId: ls.get("kf_addr", null), addresses: [], here: ls.get("kf_here", null), support: ls.get("kf_support", null), push: ls.get("kf_push", false),
    skew: 0,
    saveCart() { ls.set("kf_cart", this.cart); },
    setAuth(j) {
      this.token = j.token || this.token; this.user = j.user; this.places = j.places || [];
      ls.set("kf_token", this.token); ls.set("kf_user", this.user); ls.set("kf_places", this.places);
      if ("support" in j) { this.support = j.support || null; ls.set("kf_support", this.support); } // only restaurant teams, riders and the owner get it
      if ("push" in j) { this.push = !!j.push; ls.set("kf_push", this.push); }
    },
    clearAuth() { this.token = null; this.user = null; this.places = []; this.addresses = []; this.addrId = null; this.support = null; ["kf_token", "kf_user", "kf_places", "kf_addr", "kf_support", "kf_shop"].forEach(ls.del); },
    get addr() { return this.addresses.find(a => a.id === this.addrId) || null; },
    /** Where to price delivery from: the chosen address, else this phone's position, else Kulgam town. */
    get point() { const a = this.addr; return a ? { lat: a.lat, lon: a.lon } : this.here || { lat: 33.6450, lon: 75.0190 }; },
    kitchens() { return this.places.filter(p => p.role === "owner" || p.role === "manager"); },
    rides() { return this.places.filter(p => p.role === "rider"); },
  };
  const now = () => Date.now() + S.skew;

  // ---- API ----
  async function api(method, path, body) {
    const headers = {};
    if (S.token) headers.authorization = "Bearer " + S.token;
    let data;
    if (body instanceof FormData) data = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; data = JSON.stringify(body); }
    let r;
    try { r = await fetch(API + path, { method, headers, body: data }); }
    catch { throw new Error("No internet. Check your connection and try again"); }
    const j = await r.json().catch(() => ({}));
    if (j.now) S.skew = Date.parse(j.now) - Date.now();
    if (r.status === 401 && S.token && !path.startsWith("/v1/auth")) { S.clearAuth(); KF.emit("auth"); }
    if (!r.ok) { const e = new Error(j.error || "Something went wrong. Please try again"); e.status = r.status; throw e; }
    return j;
  }
  const get = p => api("GET", p), post = (p, b = {}) => api("POST", p, b);

  // ---- events ----
  const subs = {};
  const on = (ev, fn) => (subs[ev] = subs[ev] || []).push(fn);
  const emit = (ev, x) => (subs[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } });

  // ---- device ----
  const haptic = (kind = "light") => {
    const H = plugin("Haptics");
    if (H) { (kind === "success" || kind === "warning" ? H.notification({ type: kind.toUpperCase() }) : H.impact({ style: kind === "heavy" ? "HEAVY" : "LIGHT" })).catch(() => {}); }
    else if (navigator.vibrate) navigator.vibrate(kind === "heavy" ? 30 : 10);
  };
  async function openExternal(url) {
    const A = plugin("AppLauncher");
    if (A) { try { const r = await A.openUrl({ url }); if (r && r.completed === false) throw new Error(); return true; } catch { return false; } }
    window.open(url, "_blank", "noopener"); return true;
  }
  const call = p => openExternal("tel:" + String(p).replace(/[^\d+]/g, ""));
  async function position() {
    const G = plugin("Geolocation");
    if (G) {
      try { await G.requestPermissions(); } catch {}
      try {
        const p = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
        return { lat: p.coords.latitude, lon: p.coords.longitude };
      } catch { throw new Error("Turn on location (and allow it for Kezia's Food) to use this"); }
    }
    return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), () => rej(new Error("Turn on location to use this")), { enableHighAccuracy: true, timeout: 12000 })
      : rej(new Error("Location isn't available on this phone")));
  }
  /** Follow this phone's position; returns a stop function. */
  function watch(fn) {
    const G = plugin("Geolocation");
    if (G) {
      let id = null, stopped = false;
      G.requestPermissions().catch(() => {}).finally(() => G.watchPosition({ enableHighAccuracy: true, timeout: 20000 }, (p) => p && fn({ lat: p.coords.latitude, lon: p.coords.longitude }))
        .then(x => { id = x; if (stopped) G.clearWatch({ id }); }));
      return () => { stopped = true; if (id) G.clearWatch({ id }); };
    }
    if (!navigator.geolocation) return () => {};
    const id = navigator.geolocation.watchPosition(p => fn({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
  }
  let notifyAsked = false;
  async function notify(title, body, id = Date.now() % 2147483647) {
    const N = plugin("LocalNotifications");
    if (N) {
      try {
        if (!notifyAsked) { notifyAsked = true; await N.requestPermissions(); }
        await N.schedule({ notifications: [{ id, title, body, smallIcon: "ic_stat_kezia", iconColor: "#0F8A4F" }] });
      } catch {}
    } else if (window.Notification && Notification.permission === "granted" && document.hidden) new Notification(title, { body });
  }
  async function askNotify() { const N = plugin("LocalNotifications"); if (N) { try { notifyAsked = true; await N.requestPermissions(); } catch {} } }

  // Push notifications: new orders and order updates even when the app is closed. Only in the Android app built with
  // the Firebase file (KF_CONFIG.push), and only when the server has its Firebase key (S.push from /v1/me).
  let pushOn = false;
  async function pushSetup() {
    const P = plugin("PushNotifications");
    if (!P || !KF_CONFIG.push || !S.push || !S.token) return;
    if (pushOn) { const t = ls.get("kf_ptoken", null); if (t) post("/v1/push/token", { token: t, platform: "android" }).catch(() => {}); return; } // another login on this phone
    pushOn = true;
    try {
      await P.createChannel({ id: "orders", name: "New orders and deliveries", description: "Rings loudly for new orders", importance: 5, sound: "order_bell", vibration: true, visibility: 1 });
      await P.createChannel({ id: "updates", name: "Order updates", description: "How your order is going", importance: 4, visibility: 1 });
      let p = await P.checkPermissions();
      if (p.receive !== "granted") p = await P.requestPermissions();
      if (p.receive !== "granted") return;
      await P.addListener("registration", t => { ls.set("kf_ptoken", t.value); post("/v1/push/token", { token: t.value, platform: "android" }).catch(() => {}); });
      await P.addListener("pushNotificationActionPerformed", a => emit("pushopen", (a.notification && a.notification.data) || {}));
      await P.addListener("pushNotificationReceived", n => emit("pushin", n.data || {}));
      await P.register();
    } catch (e) { console.warn("push", e); }
  }
  /** On logout: this phone stops getting that account's notifications. */
  async function pushForget() { const t = ls.get("kf_ptoken", null); if (t && S.token) { try { await post("/v1/push/forget", { token: t }); } catch {} } }

  /** Shrink a photo on the phone before uploading (max 1280 px, JPEG). */
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't read that photo")); i.src = url; });
      const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, "image/jpeg", .84));
    } finally { URL.revokeObjectURL(url); }
  }
  const ago = d => { if (!d) return ""; const m = (Date.now() - Date.parse(d)) / 60000;
    return m < 60 ? "just now" : m < 1440 ? `${Math.floor(m / 60)} h ago` : m < 2880 ? "yesterday" : m < 43200 ? `${Math.floor(m / 1440)} days ago` : new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };

  // Install links: the web app opened from kezia…/app/?ref=<code> remembers the link (sent with the sign-up)
  const ref = (() => { try { const r = new URLSearchParams(location.search).get("ref"); if (r && /^[a-z0-9-]{1,40}$/.test(r)) { if (ls.get("kf_ref", null) !== r) { ls.set("kf_ref", r); setTimeout(() => post("/v1/ref", { code: r }).catch(() => {}), 1500); } } } catch {} return ls.get("kf_ref", null); })();

  // Restaurant bell: a loud two-tone chime that repeats until the order is answered
  const bell = (() => {
    let ctx = null, timer = null, lock = null;
    const chime = () => {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        [[880, 0], [1175, .18], [880, .36], [1175, .54]].forEach(([f, t]) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + t;
          o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.5, at + .02); g.gain.exponentialRampToValueAtTime(.001, at + .17);
          o.start(at); o.stop(at + .18);
        });
      } catch {}
      haptic("heavy");
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    };
    return {
      start() { if (timer) return; chime(); timer = setInterval(chime, 2200); },
      stop() { clearInterval(timer); timer = null; },
      get on() { return !!timer; },
      async awake(on) { // keep the screen on while a kitchen or rider is working
        try {
          if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
          if (!on && lock) { await lock.release(); lock = null; }
        } catch {}
      },
      unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch {} },
    };
  })();

  // ---- screens ----
  const app = () => $("#app");
  const stack = [];
  // In a browser, each pushed screen or sheet adds a history entry, so the phone's back button closes it instead of
  // leaving the app. (In the Android app the back button comes through the App plugin, see main.js.)
  const hist = { depth: 0, skip: 0, fromBack: false };
  const histOpen = () => { if (native) return; history.pushState({ kf: Date.now() }, ""); hist.depth++; };
  const histClose = () => { if (native || !hist.depth) return; hist.depth--; if (!hist.fromBack) { hist.skip++; history.back(); } };
  if (!native) addEventListener("popstate", () => {
    if (hist.skip) { hist.skip--; return; }
    if (!hist.depth) return;
    hist.fromBack = true; // the close below counts itself off without going back again
    try { const s = topSheet(); if (s) s.close(); else pop(); } finally { hist.fromBack = false; }
  });
  /** Push a full screen. build(el, scr) renders into it; scr.onClose(fn) registers cleanup. */
  function push(build) {
    const el = h(`<div class="layer full pushed enter"></div>`);
    // the screen underneath slides back a little (iOS/Swiggy-style depth)
    const under = stack.length ? stack[stack.length - 1].el : $$(".layer:not(.full)").find(l => !l.hidden);
    if (under) under.classList.add("behind");
    app().append(el);
    const scr = { el, under, alive: true, closers: [], onClose(fn) { this.closers.push(fn); }, close: () => pop(scr) };
    stack.push(scr); histOpen();
    haptic();
    Promise.resolve(build(el, scr)).catch(e => { console.error(e); toast(e.message, "circle-alert"); });
    return scr;
  }
  function pop(which) {
    const scr = which || stack[stack.length - 1];
    if (!scr || !scr.alive) return false;
    stack.splice(stack.indexOf(scr), 1);
    scr.alive = false; scr.closers.forEach(fn => { try { fn(); } catch {} }); histClose();
    scr.el.classList.remove("enter"); scr.el.classList.add("leave");
    if (scr.under) scr.under.classList.remove("behind");
    setTimeout(() => scr.el.remove(), 240);
    return true;
  }
  const popAll = () => { while (stack.length) pop(); };
  const top = () => stack[stack.length - 1] || null;

  /** Bottom sheet. Returns the element; el.close() closes it. */
  function sheet(html, opts = {}) {
    const el = h(`<div class="sheet"><div class="dim"></div><div class="panel"><div class="grab"></div>${html}</div></div>`);
    app().append(el); histOpen();
    let done = false;
    el.close = () => { if (done) return; done = true; histClose(); el.classList.add("closing"); setTimeout(() => el.remove(), 200); opts.onClose && opts.onClose(); };
    $(".dim", el).onclick = () => !opts.sticky && el.close();
    return el;
  }
  const topSheet = () => $$(".sheet:not(.closing)").pop() || null;
  function confirm(title, text, yes = "Yes", danger = false) {
    return new Promise(res => {
      let answered = false;
      const s = sheet(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><div class="two"><button class="btn ghost" data-no>Not now</button><button class="btn ${danger ? "danger" : ""}" data-yes>${esc(yes)}</button></div>`,
        { onClose: () => !answered && res(false) });
      $("[data-no]", s).onclick = () => s.close();
      $("[data-yes]", s).onclick = () => { answered = true; res(true); s.close(); };
    });
  }
  function ask(title, sub, fields, okText = "Save") {
    // fields: [{k, label, value, type, placeholder, inputmode}] -> resolves {k: value} or null
    return new Promise(res => {
      let answered = false;
      const s = sheet(`<h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}<div class="form">${fields.map(f => `<label class="field">${esc(f.label)}
        ${f.type === "textarea" ? `<textarea class="input" data-k="${f.k}" placeholder="${esc(f.placeholder || "")}">${esc(f.value || "")}</textarea>`
          : `<input class="input" data-k="${f.k}" type="${f.type || "text"}" inputmode="${f.inputmode || "text"}" value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder || "")}">`}</label>`).join("")}
        <button class="btn" data-ok>${esc(okText)}</button></div>`, { onClose: () => !answered && res(null) });
      const first = $("[data-k]", s); setTimeout(() => first && first.focus(), 250);
      $("[data-ok]", s).onclick = () => { answered = true; const out = {}; $$("[data-k]", s).forEach(i => { out[i.dataset.k] = i.value.trim(); }); res(out); s.close(); };
    });
  }

  let toastTimer;
  function toast(msg, icon = "circle-check") {
    $$(".toast").forEach(t => t.remove());
    const el = h(`<div class="toast" role="status">${I(icon, "sm")}<span>${esc(msg)}</span></div>`);
    app().append(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2800);
  }
  const fail = e => { haptic("warning"); toast(e && e.message ? e.message : String(e), "circle-alert"); };
  /** Run an action with a spinner on its button; errors become toasts. */
  async function busy(btn, fn) {
    if (btn && btn.classList.contains("loading")) return;
    btn && btn.classList.add("loading");
    try { return await fn(); } catch (e) { fail(e); } finally { btn && btn.classList.remove("loading"); }
  }
  /** Click delegation: elements with data-a="name" call acts[name](el, event). */
  function bind(root, acts) {
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-a]");
      if (!b || !root.contains(b)) return;
      const fn = acts[b.dataset.a];
      if (fn) { e.preventDefault(); fn(b, e); }
    });
  }
  const skelCards = n => Array.from({ length: n }, () => `<div class="skel-card"><div class="skel a"></div><div class="skel b"></div><div class="skel c"></div></div>`).join("");
  const skelLines = n => `<div class="card">${Array.from({ length: n }, (_, i) => `<div class="skel" style="height:14px;margin:10px 0;width:${90 - (i * 17) % 45}%"></div>`).join("")}</div>`;
  const empty = (icon, title, text, btn) => `<div class="empty fadein"><div class="art">${I(icon)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ""}</div>`;
  const topbar = (title, right = "") => `<div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">${I("arrow-left")}</button><h1>${esc(title)}</h1>${right}</div>`;
  /** Shadow under the top bar once the page scrolls. */
  function lift(scroll, bar) { scroll.addEventListener("scroll", () => bar.classList.toggle("lift", scroll.scrollTop > 6), { passive: true }); }

  // Countdowns: any element with data-until="ISO time" shows m:ss left; data-bar on a .tbar fills by time left.
  const tick = () => {
    $$("[data-until]").forEach(el => {
      const left = Math.max(0, Date.parse(el.dataset.until) - now());
      const s = Math.ceil(left / 1000), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (el.dataset.bar) { const total = Number(el.dataset.bar) * 60000; el.firstElementChild.style.width = Math.min(100, left / total * 100) + "%"; }
      else if (el.textContent !== txt) el.textContent = txt;
      if (left <= 0 && !el.dataset.fired) { el.dataset.fired = 1; emit("timeup", el); }
    });
  };
  setInterval(tick, 1000);
  // Fill new countdowns at once instead of showing --:-- until the next second
  let tickQueued = false;
  new MutationObserver(() => { if (tickQueued) return; tickQueued = true; requestAnimationFrame(() => { tickQueued = false; tick(); }); })
    .observe(document.getElementById("app"), { childList: true, subtree: true });

  // ---- maps (our own Kulgam roads, drawn on the phone: no map server needed) ----
  let basemap = null;
  const loadBase = async () => basemap || (basemap = await fetch("data/kulgam_basemap.json").then(r => r.json()));
  async function map(el, opts = {}) {
    const bm = await loadBase();
    const [w, s, e, n] = bm.bbox;
    const m = L.map(el, { zoomControl: false, attributionControl: true, minZoom: 11, maxZoom: 18, maxBounds: [[s - .05, w - .05], [n + .05, e + .05]],
      maxBoundsViscosity: .8, dragging: opts.interactive !== false, touchZoom: opts.interactive !== false, scrollWheelZoom: opts.interactive !== false, doubleClickZoom: opts.interactive !== false });
    m.attributionControl.setPrefix(false); m.attributionControl.addAttribution("© OpenStreetMap");
    const rr = L.canvas({ padding: .5 });
    bm.water.forEach(([area, c]) => { const ll = c.map(([x, y]) => [y, x]);
      (area ? L.polygon(ll, { renderer: rr, interactive: false, stroke: false, fillColor: "#bfe1f2", fillOpacity: 1 }) : L.polyline(ll, { renderer: rr, interactive: false, color: "#bfe1f2", weight: 4 })).addTo(m); });
    const roads = bm.roads.slice().sort((x, y) => y[0] - x[0]);
    roads.forEach(([k, c]) => L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: k < 2 ? "#ead9a4" : "#d9e3dc", weight: [8, 6.5, 4.5, 3][k] }).addTo(m));
    roads.forEach(([k, c]) => L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: k < 2 ? "#fbefc6" : "#ffffff", weight: [6, 4.6, 3, 1.8][k] }).addTo(m));
    m.setView(opts.center || [33.645, 75.019], opts.zoom || 15);
    return m;
  }
  const pin = (kind, icon) => L.divIcon({ className: "", html: `<div class="mk ${kind}">${I(icon, "sm")}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });

  window.KF = { API, native, plugin, pushSetup, pushForget, ref, shrink, ago, $, $$, esc, h, I, rs, img, bg, bgc, sleep, ls, time, when, plural, phone10, S, now, api, get, post, on, emit,
    haptic, openExternal, call, position, watch, notify, askNotify, bell, push, pop, popAll, top, stack, sheet, topSheet, confirm, ask, toast, fail, busy, bind,
    skelCards, skelLines, empty, topbar, lift, map, pin };
})();
