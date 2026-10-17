/* Srinagar Bazaar app: screens and navigation. Vanilla JS, no build step. */
(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const t = k => I18N.t(k);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtD = km => km < 1 ? Math.round(km * 100) * 10 + " m" : km.toFixed(1) + " km";
  const { KM } = SBIntent;
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const screen = $("#screen");

  try { await SB.load(); } catch (e) { $("#boot p").textContent = "Couldn't load city data. Please reinstall the app."; return; }
  $("#boot").remove();
  SB.signIn().catch(() => {});

  // Row: 0 id,1 name,2 g,3 c,4 locality,5 area,6 phone,7 wa,8 web,9 ig,10 fb,11 addr,12 lat,13 lon,14 precise,15 hours,
  //      16 src bits,17 score,18 chainPhone,19 pin,20 verified,21 live,22 dealEnds,23 claimed
  const D = () => SB.data;
  const G = i => D().groups[i] || "Other";
  const C = i => D().categories[i] || "Shop";
  const nSrc = m => [1, 2, 4, 8, 16, 32].filter(b => m & b).length;
  const hasDeal = s => s[22] && s[22] * 1000 > Date.now();
  const gIdx = name => D().groups.indexOf(name);

  // ---------- location ----------
  function here() {
    const L = SB.prefs.loc;
    if (L.type === "gps") return { name: "Near you", lat: L.lat, lon: L.lon };
    const a = D().areas[L.idx] || D().areas[0];
    return { name: a[0], lat: a[2], lon: a[3] };
  }
  const at = () => { const h = here(); return [h.lat, h.lon]; };
  const dist = s => KM(here().lat, here().lon, s[12], s[13]);

  // ---------- search (shared request reader) ----------
  const EXAMPLES = ["I want to buy bread", "need dawai", "pashmina shawl", "where to eat wazwan", "phone charger", "I want to visit Mughal gardens", "kong", "places to visit"];
  function ask(q) {
    const p = SBIntent.parse(q, SB.catList);
    if (p.intent === "visit") {
      const list = SBIntent.rankSights(p, D().sights, at()).slice(0, 20);
      if (list.length || !p.item) return { type: "sights", p, list };
    }
    const hits = SBIntent.rankShops(p, D().shops, D().categories, at());
    const main = p.cats[0];
    const nMain = hits.filter(h => h.rel >= 3).length;
    const related = (SBIntent.RELATED[main] || p.cats.slice(1, 3)).filter(c => c !== main && SB.catList.includes(c)).slice(0, 3)
      .map(c => ({ c, n: D().shops.filter(s => C(s[3]) === c && dist(s) < 2).length })).filter(x => x.n);
    return { type: "shops", p, main, list: hits, total: main && nMain ? nMain : hits.length, related };
  }

  // ---------- icons ----------
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    down: '<path d="M6 9l6 6 6-6"/>', back: '<path d="M15 18l-6-6 6-6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"/><path d="M9 10h6M9 13.5h4"/>', route: '<path d="M12 3l8 18-8-4-8 4z"/>',
    save: '<path d="M6 4h12v17l-6-4-6 4z"/>', share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>', map: '<path d="M9 4l6 2 5-2v15l-5 2-6-2-5 2V6z"/><path d="M9 4v15M15 6v15"/>',
    ask: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
    insta: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.6 7.4h.01"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>', bowl: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', bed: '<path d="M3 18V7M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10" r="1.6"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>', tag: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="15.5" cy="8.5" r="1.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6"/>', sos: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    lang: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3.5-2.5 7-6.5 9"/><path d="M13 21l4-9 4 9M14.5 18h5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    leaf: '<path d="M12 21v-6M12 15c-5 0-8-3.5-8-8 3 0 5 1 6 2.5C10.5 6 11 4 12 3c1 1 1.5 3 2 6.5 1-1.5 3-2.5 6-2.5 0 4.5-3 8-8 8z"/>',
    sync: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"/>', box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  };
  const I = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

  // ---------- small renderers ----------
  const initials = name => { const w = String(name).replace(/^(the|hotel|m\/s)\s+/i, "").split(/\s+/).filter(x => /[a-z0-9]/i.test(x));
    return ((w[0] || "?").match(/[a-z0-9]/i)[0] + ((w[1] || "").match(/[a-z]/i) || [""])[0]).toUpperCase(); };
  const mcol = s => `var(--m${((s[3] || 0) * 5 + (s[2] || 0)) % 8})`;
  const liveLabel = { open: t("openNow"), closed_today: t("closedToday"), opens_late: t("opensLate"), busy: t("busy") };
  const contact = s => { const tel = s[6] && !s[18] ? s[6] : null; const wa = s[7] || (tel && /^\+91[6-9]/.test(tel) ? tel : null);
    return { tel, wa, dir: `https://www.google.com/maps/dir/?api=1&destination=${s[12]},${s[13]}`, ig: s[9] }; };
  const pretty = p => p ? (/^\+91194\d{7}$/.test(p) ? p.replace(/^\+91(194)(\d{7})$/, "0$1 $2") : p.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2")) : "";
  function tags(s) {
    const out = [];
    if (s[21]) out.push(`<span class="tag ${s[21] === "open" ? "ok" : s[21] === "closed_today" ? "bad" : "warn"}">${esc(liveLabel[s[21]])}</span>`);
    if (hasDeal(s)) out.push(`<span class="tag deal">${t("offers")}</span>`);
    if (s[20]) out.push('<span class="tag brand">Verified</span>'); else if (nSrc(s[16]) >= 2) out.push(`<span class="tag ok">${t("confirmed")}</span>`);
    if (s[7] || (s[6] && /^\+91[6-9]/.test(s[6]) && !s[18])) out.push('<span class="tag">WhatsApp</span>');
    if (!s[14]) out.push('<span class="tag warn">Approx. location</span>');
    return out.slice(0, 3).join("");
  }
  const row = s => { const k = contact(s);
    return `<div class="item"><button data-shop="${esc(s[0])}"><span class="mono" style="background:${mcol(s)}">${esc(initials(s[1]))}</span>
      <span style="min-width:0"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))} · ${esc(s[4] || "Srinagar")}</div><div class="tags">${tags(s)}</div></span></button>
      <span class="rt"><span class="d">${fmtD(dist(s))}</span><button class="call" ${k.tel ? `data-call="${esc(s[0])}"` : 'aria-disabled="true"'} aria-label="${t("call")} ${esc(s[1])}">${I("phone", "sm")}</button></span></div>`; };
  const hcard = s => `<button class="hcard" data-shop="${esc(s[0])}"><div class="art" style="background:${mcol(s)}">${esc(initials(s[1]))}<em>${fmtD(dist(s))}</em>${hasDeal(s) ? `<span class="badge">${t("offers")}</span>` : ""}</div>
    <div class="bd"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))}</div></div></button>`;
  const sightInitials = g => g[0].split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const scard = g => { const food = D().shops.filter(s => s[2] === gIdx("Food & Drink") && KM(g[2], g[3], s[12], s[13]) < 0.8).length;
    return `<button class="hcard" data-sight="${D().sights.indexOf(g)}"><div class="art" style="background:var(--m5)">${esc(sightInitials(g))}<em>${fmtD(KM(here().lat, here().lon, g[2], g[3]))}</em></div>
      <div class="bd"><div class="t">${esc(g[0])}</div><div class="s">${food} places to eat nearby</div></div></button>`; };
  const best = (filter, n, radius = 2.5) => D().shops.filter(filter).map(s => [s, dist(s)]).filter(x => x[1] < radius)
    .sort((a, b) => (b[0][17] + (hasDeal(b[0]) ? 15 : 0) + (b[0][20] ? 10 : 0)) - (a[0][17] + (hasDeal(a[0]) ? 15 : 0) + (a[0][20] ? 10 : 0)) - (a[1] - b[1]) * 12).slice(0, n).map(x => x[0]);
  const hl = (text, q) => { const w = q.trim(); if (w.length < 2) return esc(text); const i = text.toLowerCase().indexOf(w.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + w.length)) + "</mark>" + esc(text.slice(i + w.length)); };
  const offlineBar = () => SB.online ? "" : `<div class="offline">${I("info", "xs")}${t("offline")}</div>`;
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.innerHTML; btn.textContent = "Please wait…"; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label; };

  // ---------- shell & navigation ----------
  screen.insertAdjacentHTML("beforeend", `<nav class="nav" aria-label="Main">
    <button data-tab="home" aria-current="page">${I("home")}<span>${t("home")}</span></button><button data-tab="map">${I("map")}<span>${t("map")}</span></button>
    <button data-tab="ask">${I("ask")}<span>${t("ask")}</span></button><button data-tab="saved">${I("save")}<span>${t("saved")}</span></button>
    <button data-tab="me">${I("user")}<span>${t("me")}</span></button></nav>`);
  const tabs = {}; let curTab = "home"; const stack = [];
  function tabRoot(name) { if (!tabs[name]) { const el = document.createElement("div"); el.className = "layer"; el.hidden = true; screen.insertBefore(el, $(".nav", screen)); tabs[name] = el; } return tabs[name]; }
  function showTab(name) {
    while (stack.length) stack.pop().el.remove();
    curTab = name; Object.entries(tabs).forEach(([k, el]) => el.hidden = k !== name);
    const el = tabRoot(name); el.hidden = false; RENDER[name](el);
    document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  }
  function push(render, ...args) {
    const el = document.createElement("div"); el.className = "layer pushed enter"; screen.insertBefore(el, $(".nav", screen));
    el.style.zIndex = 20 + stack.length; stack.push({ el, render, args }); render(el, ...args);
    el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
    return el;
  }
  function pop() { const top = stack.pop(); if (!top) return false; top.el.classList.add("leave");
    const done = () => top.el.remove(); if (matchMedia("(prefers-reduced-motion: reduce)").matches) done(); else { top.el.addEventListener("animationend", done, { once: true }); setTimeout(done, 400); } return true; }
  const redrawTop = () => { const top = stack[stack.length - 1]; if (top) { const sc = $(".scroll", top.el)?.scrollTop; top.render(top.el, ...top.args); if ($(".scroll", top.el)) $(".scroll", top.el).scrollTop = sc || 0; } else RENDER[curTab](tabs[curTab]); };
  const rerenderAll = () => { RENDER[curTab](tabs[curTab]); stack.forEach(f => { f.el._detail = null; f.render(f.el, ...f.args); }); };
  let toastT; function toast(msg) { let el = $(".toast", screen); if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); screen.appendChild(el); }
    el.textContent = msg; el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }
  function sheet(html, onMount) { const el = document.createElement("div"); el.className = "sheet enter";
    el.innerHTML = `<div class="dim" data-close></div><div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    screen.appendChild(el); el.addEventListener("click", e => { if (e.target.closest("[data-close]")) el.remove(); }); onMount && onMount(el); return el; }
  SB.on(w => { if (w === "data" || w === "online") rerenderAll(); });

  function pickArea() {
    sheet(`<h3>${t("yourArea")}</h3><div class="pad" style="padding-bottom:10px"><button class="btn ghost" id="gps">${I("pin", "sm")}${t("useGps")}</button></div>
      <div class="pad" style="padding-bottom:10px"><div class="field" style="border-width:1px;border-color:var(--line)">${I("search", "sm")}<input id="areaq" placeholder="${t("searchArea")}" autocomplete="off"></div></div>
      <div class="scroll arealist" id="arealist"></div>`, el => {
      const draw = q => $("#arealist", el).innerHTML = D().areas.map((a, i) => [a, i]).filter(([a]) => a[0].toLowerCase().includes(q.toLowerCase()))
        .map(([a, i]) => `<button data-area="${i}" aria-current="${SB.prefs.loc.type === "area" && i === SB.prefs.loc.idx}"><span>${esc(a[0])}</span><small>${a[1].toLocaleString("en-IN")} shops</small></button>`).join("");
      draw(""); $("#areaq", el).addEventListener("input", e => draw(e.target.value));
      $("#gps", el).onclick = async () => { const b = $("#gps", el); busy(b, true);
        try { const p = await SB.position(); SB.prefs.loc = { type: "gps", lat: p.lat, lon: p.lon }; SB.savePrefs(); el.remove(); toast("Showing places near you"); rerenderAll(); }
        catch (e) { busy(b, false); toast(e.message || "Couldn't get your location"); } };
      el.addEventListener("click", e => { const b = e.target.closest("[data-area]"); if (!b) return; SB.prefs.loc = { type: "area", idx: +b.dataset.area }; SB.savePrefs(); el.remove(); toast(`Showing places near ${here().name}`); rerenderAll(); });
    });
  }

  // Phone verification sheet; resolves when the number is verified.
  function verifyPhone(reason) {
    return new Promise((resolve) => {
      sheet(`<h3>${t("verifyPhone")}</h3><p class="sub">${esc(reason || "We'll text you a 6-digit code.")}</p>
        <form class="form" id="otp1"><label>Mobile number<input id="ph" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required></label>
        <button class="btn" type="submit">Send code</button><p class="note">Standard SMS. We never show your number to anyone without asking.</p></form>
        <form class="form" id="otp2" hidden><label>6-digit code<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button class="btn" type="submit">Verify</button><p class="note" id="otpnote"></p></form>`, el => {
        let phone;
        $("#otp1", el).onsubmit = async e => { e.preventDefault(); const b = $("#otp1 button", el); busy(b, true);
          try { const r = await SB.otpStart($("#ph", el).value); phone = r.phone; $("#otp1", el).hidden = true; $("#otp2", el).hidden = false;
            $("#otpnote", el).textContent = `Sent to ${pretty(phone)}.` + (r.dev_code ? ` Test code: ${r.dev_code}` : ""); $("#code", el).focus(); }
          catch (err) { busy(b, false); toast(err.message); } };
        $("#otp2", el).onsubmit = async e => { e.preventDefault(); const b = $("#otp2 button", el); busy(b, true);
          try { await SB.otpVerify(phone, $("#code", el).value); el.remove(); toast("Phone verified"); resolve(true); }
          catch (err) { busy(b, false); toast(err.message); } };
        setTimeout(() => $("#ph", el)?.focus(), 250);
      });
    });
  }

  // ---------- screens ----------
  const RENDER = {};
  const leafSvg = `<svg class="leaf" viewBox="0 0 24 24" fill="#fff"><path d="M12 21v-6M12 15c-5 0-8-3.5-8-8 3 0 5 1 6 2.5C10.5 6 11 4 12 3c1 1 1.5 3 2 6.5 1-1.5 3-2.5 6-2.5 0 4.5-3 8-8 8z"/></svg>`;
  RENDER.home = el => {
    const SHOPPY = ["Food & Drink", "Fashion", "Kashmiri Crafts", "Groceries", "Shopping", "Beauty & Fitness", "Electronics"].map(gIdx);
    const near = best(s => SHOPPY.includes(s[2]) && s[14] && (nSrc(s[16]) >= 2 || (s[6] && !s[18]) || s[20]), 10);
    const deals = best(s => hasDeal(s), 10, 5);
    const famous = D().sights.filter(g => g[4] >= 2).map(g => [g, KM(here().lat, here().lon, g[2], g[3])]).sort((a, b) => a[1] - b[1]).slice(0, 8).map(x => x[0]);
    const counts = {}; D().shops.forEach(s => { if (dist(s) < 3) counts[s[3]] = (counts[s[3]] || 0) + 1; });
    const topCats = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const h = new Date().getHours(); const hi = h < 12 ? t("morning") : h < 17 ? t("afternoon") : t("evening");
    el.innerHTML = `<div class="scroll">${offlineBar()}<div class="band safe-top">${leafSvg}
      <div class="toprow"><button class="loc" data-area-pick>${I("pin", "xs")}<span>${esc(here().name)}</span>${I("down", "xs")}</button>
        <button class="visit-chip" data-go="tourist">${t("visiting")}</button></div>
      <div class="hello"><small>${hi}</small>${t("lookingFor")}</div>
      <button class="searchbox" data-search>${I("search", "sm")}${t("searchPh")}</button>
      <div class="intents">
        <button class="intent" data-searchq="I want to buy ">${I("bag")}<span>${t("buy")}</span></button>
        <button class="intent" data-q="where to eat">${I("bowl")}<span>${t("eat")}</span></button>
        <button class="intent" data-q="places to visit">${I("camera")}<span>${t("visit")}</span></button>
        <button class="intent" data-q="hotel">${I("bed")}<span>${t("stay")}</span></button>
      </div></div>
      <div class="pad">
      ${deals.length ? `<div class="sec"><h2>${t("offersNear")}</h2></div><div class="hrow">${deals.map(hcard).join("")}</div>` : ""}
      <div class="sec"><h2>${t("popular")}</h2><button data-q="shops near me">${t("seeAll")}</button></div>
      <div class="hrow">${near.map(hcard).join("")}</div>
      <div class="panel-card craft"><h3>${t("crafts")}</h3><p>${t("craftsSub")}</p>
        <div class="chips">${["pashmina shawl", "carpet", "papier mache", "kong", "walnut wood"].map(q => `<button class="chip" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join("")}</div></div>
      <div class="sec"><h2>${t("placesToVisit")}</h2><button data-q="places to visit">${t("seeAll")}</button></div>
      <div class="hrow">${famous.map(scard).join("")}</div>
      <div class="sec"><h2>${t("catsNear")}</h2></div>
      <div class="cats">${topCats.map(([c, n]) => `<button class="cat" data-q="${esc(C(c))}"><span>${esc(C(c))}</span><small>${n}</small></button>`).join("")}</div>
      <div class="panel-card promo"><h3>${t("missingTitle")}</h3><p>${t("missingSub")}</p><button class="btn sm" data-add>${t("addShop")}</button></div>
      <div class="stats"><span><b>${D().shops.length.toLocaleString("en-IN")}</b>businesses</span><span><b>${D().areas.length}</b>areas</span><span><b>${D().sights.length}</b>sights</span></div>
      <div style="height:20px"></div></div></div>`;
  };

  function searchScreen(el, initial = "") {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button>
      <form class="field" id="sf">${I("search", "sm")}<input name="q" value="${esc(initial)}" placeholder="Try: I want to buy bread" aria-label="Search" autocomplete="off" enterkeyhint="search"></form></div>
      <div class="scroll" id="sbody"></div>`;
    const inp = $("input", el), body = $("#sbody", el);
    const draw = () => {
      const q = inp.value.trim();
      if (!q) {
        body.innerHTML = `${SB.recent.length ? `<div class="label">Recent</div><ul class="sugg">${SB.recent.map(r => `<li><button data-q="${esc(r)}"><span class="g">${I("clock", "sm")}</span><span><div class="t">${esc(r)}</div></span><span></span></button></li>`).join("")}</ul>` : ""}
          <div class="label">Try asking</div><ul class="sugg">${EXAMPLES.map(r => `<li><button data-q="${esc(r)}"><span class="g b">${I("spark", "sm")}</span><span><div class="t">${esc(r)}</div></span><span></span></button></li>`).join("")}</ul>`;
        return;
      }
      const r = ask(q); const out = [];
      if (r.type === "shops" && r.main) out.push(`<li><button data-q="${esc(q)}"><span class="g b">${I("spark", "sm")}</span><span><div class="t">${esc(r.main)}</div><div class="s">Nearest to ${esc(here().name)} first</div></span><span class="n">${r.total}</span></button></li>`);
      if (r.type === "sights" && r.list.length) out.push(`<li><button data-q="${esc(q)}"><span class="g b">${I("camera", "sm")}</span><span><div class="t">Places to visit</div><div class="s">${esc(r.list.slice(0, 3).map(x => x.g[0]).join(", "))}</div></span><span class="n">${r.list.length}</span></button></li>`);
      const ql = q.toLowerCase();
      SB.catList.filter(c => c.toLowerCase().includes(ql) && c !== r.main).slice(0, 3).forEach(c => out.push(`<li><button data-q="${esc(c)}"><span class="g">${I("list", "sm")}</span><span><div class="t">${hl(c, q)}</div><div class="s">Category</div></span><span></span></button></li>`));
      D().shops.filter(s => s[1].toLowerCase().includes(ql)).map(s => [s, dist(s)]).sort((a, b) => a[1] - b[1]).slice(0, 5)
        .forEach(([s, d]) => out.push(`<li><button data-shop="${esc(s[0])}"><span class="g">${I("store", "sm")}</span><span><div class="t">${hl(s[1], q)}</div><div class="s">${esc(C(s[3]))} · ${esc(s[4] || "")}</div></span><span class="n">${fmtD(d)}</span></button></li>`));
      D().sights.filter(g => g[0].toLowerCase().includes(ql)).slice(0, 2).forEach(g => out.push(`<li><button data-sight="${D().sights.indexOf(g)}"><span class="g">${I("camera", "sm")}</span><span><div class="t">${hl(g[0], q)}</div><div class="s">${esc(g[1])}</div></span><span></span></button></li>`));
      body.innerHTML = out.length ? `<ul class="sugg">${out.join("")}</ul>` : `<div class="empty"><h3>No match yet</h3><p>Press search to look through shops' stock lists too, or add the shop you know.</p></div>`;
    };
    let tm; inp.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(draw, 90); });
    $("#sf", el).addEventListener("submit", e => { e.preventDefault(); const q = inp.value.trim(); if (q) { SB.remember(q); pop(); setTimeout(() => push(resultsScreen, q), 10); } });
    draw(); setTimeout(() => inp.focus({ preventScroll: true }), 280);
  }

  function resultsScreen(el, q, opts = {}) {
    const f = Object.assign({ near: false, phone: false, sure: false, exact: false, deal: false, sort: "near" }, opts.f || {});
    const r = ask(q);
    if (r.type === "sights") return sightsList(el, q, r);
    let list = r.list.map(x => x.s);
    if (/^(shops? )?near me$|^shops near me$/.test(q.trim().toLowerCase())) list = D().shops.slice().sort((a, b) => dist(a) - dist(b));
    if (f.near) list = list.filter(s => dist(s) <= 1);
    if (f.phone) list = list.filter(s => s[6] && !s[18]);
    if (f.sure) list = list.filter(s => s[20] || nSrc(s[16]) >= 2);
    if (f.exact) list = list.filter(s => s[14]);
    if (f.deal) list = list.filter(hasDeal);
    if (f.sort === "best") list = list.slice().sort((a, b) => b[17] - a[17]);
    const limit = opts.limit || 30;
    const chip = (k, label) => `<button class="chip" data-f="${k}" aria-pressed="${f[k]}">${label}</button>`;
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button>
      <button class="searchbox" data-search="${esc(q)}" style="flex:1;padding:10px 12px;box-shadow:none">${I("search", "sm")}<span style="color:var(--ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q)}</span></button></div>
      <div class="filters"><div class="chips">${chip("near", t("within1"))}${chip("deal", t("offers"))}${chip("phone", t("hasPhone"))}${chip("sure", t("confirmed"))}${chip("exact", t("exact"))}</div></div>
      <div class="scroll">${offlineBar()}
      <div class="count"><span><b>${list.length.toLocaleString("en-IN")}</b> ${r.main ? esc(SBIntent.plural(r.main)) : "results"} · ${esc(here().name)}</span>
        <select data-sort aria-label="Sort"><option value="near"${f.sort === "near" ? " selected" : ""}>${t("nearest")}</option><option value="best"${f.sort === "best" ? " selected" : ""}>${t("complete")}</option></select></div>
      <div id="stock"></div>
      ${list.length ? `<div class="rows">${list.slice(0, limit).map(row).join("")}</div>
        ${list.length > limit ? `<div class="more"><button class="btn ghost" data-more>Show more</button></div>` : ""}
        ${r.related?.length ? `<div class="label">People also look for</div><div class="pad"><div class="chips">${r.related.map(x => `<button class="chip" data-q="${esc(x.c)}">${esc(x.c)} · ${x.n}</button>`).join("")}</div></div>` : ""}
        <div style="height:90px"></div>`
      : `<div class="empty"><h3>Nothing listed yet</h3><p>We couldn't find "${esc(q)}" near ${esc(here().name)}. Try Ask the bazaar, or add a shop you know.</p>
         <div style="display:grid;gap:8px;margin-top:14px"><button class="btn" data-askq="${esc(q)}">Ask nearby shops</button><button class="btn ghost" data-add>${t("addShop")}</button></div></div>`}
      </div>${list.length ? `<button class="fab" data-mapof="${esc(q)}">${I("map", "sm")}${t("map")}</button>` : ""}`;
    el.onclick = e => { const b = e.target.closest("[data-f],[data-more]"); if (!b) return; e.stopPropagation();
      if (b.dataset.f) f[b.dataset.f] = !f[b.dataset.f]; const lim = b.hasAttribute("data-more") ? limit + 30 : 30;
      const sc = $(".scroll", el).scrollTop; resultsScreen(el, q, { f, limit: lim }); if (b.hasAttribute("data-more")) $(".scroll", el).scrollTop = sc; };
    el.onchange = e => { if (e.target.matches("[data-sort]")) { f.sort = e.target.value; resultsScreen(el, q, { f }); } };
    // Products in shops' stock lists (needs internet)
    if (SB.online && q.length >= 3 && !opts.limit) SB.api("GET", "/v1/products?q=" + encodeURIComponent(r.p.item || q)).then(res => {
      const items = res.items.filter(i => SB.byId.has(i.shop_id)).slice(0, 6);
      if (!items.length || !el.isConnected) return;
      $("#stock", el).innerHTML = `<div class="label">In shops' stock lists</div><div class="list-card" style="margin-bottom:10px">${items.map(i => `<button class="lrow" style="width:100%;font:inherit;background:none;border:0;border-top:1px solid var(--line);text-align:start;cursor:pointer;color:var(--ink)" data-shop="${esc(i.shop_id)}">
        <span><b>${esc(i.name)}</b><br><span class="muted">${esc(i.shop_name)} · ${fmtD(KM(here().lat, here().lon, i.lat, i.lon))}${i.in_stock ? "" : " · out of stock"}</span></span><b>${esc(i.price || "")}</b></button>`).join("")}</div>`;
    }).catch(() => {});
  }

  function sightsList(el, q, r) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("placesToVisit")}</h1></div>
      <div class="scroll"><div class="count"><span><b>${r.list.length}</b> ${r.p.item ? "matching “" + esc(r.p.item) + "”" : "best-known sights"} · ${esc(here().name)}</span></div>
      <div class="rows">${r.list.map(x => { const food = D().shops.filter(s => s[2] === gIdx("Food & Drink") && KM(x.g[2], x.g[3], s[12], s[13]) < 0.8).length;
        return `<div class="item"><button data-sight="${D().sights.indexOf(x.g)}"><span class="mono" style="background:var(--m5)">${esc(sightInitials(x.g))}</span>
        <span style="min-width:0"><div class="t">${esc(x.g[0])}</div><div class="s">${esc(x.g[1][0].toUpperCase() + x.g[1].slice(1))} · ${food} places to eat nearby</div></span></button>
        <span class="rt"><span class="d">${fmtD(x.d)}</span></span></div>`; }).join("")}</div><div style="height:30px"></div></div>`;
  }

  function shopScreen(el, id) {
    const s = SB.byId.get(id); if (!s) { el.innerHTML = `<div class="empty safe-top"><h3>Shop not found</h3><button class="btn" data-back>Back</button></div>`; return; }
    const k = contact(s), saved = SB.saved.includes(id), c = Math.min(4, (s[20] ? 2 : nSrc(s[16]) >= 2 ? 2 : 1) + (s[14] ? 1 : 0) + (k.tel ? 1 : 0));
    const similar = D().shops.filter(o => o !== s && o[3] === s[3]).map(o => [o, KM(s[12], s[13], o[12], o[13])]).filter(x => x[1] < 1.2).sort((a, b) => a[1] - b[1]).slice(0, 4).map(x => x[0]);
    const isMine = (SB.myShops || []).some(m => m.id === id);
    const act = (attr, icon, label, on, primary) => `<button class="act${primary ? " primary" : ""}" ${on ? attr : 'aria-disabled="true"'}><span class="c">${I(icon)}</span>${label}</button>`;
    const det = el._detail;
    el.innerHTML = `<div class="scroll">
      <div class="hero" style="background:${det?.photos?.length ? `linear-gradient(rgb(0 0 0 / .15), rgb(0 0 0 / .35)), url('${esc((window.SB_CONFIG?.api || "") + det.photos[0].url)}') center/cover` : mcol(s)}">${det?.photos?.length ? "" : esc(initials(s[1]))}
        <div class="hb"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button>
        <button class="iconbtn" data-save="${esc(id)}" aria-label="${saved ? "Remove from saved" : t("save")}" aria-pressed="${saved}">${I("save")}</button></div>
        ${det?.photos?.length ? "" : `<small>${s[23] ? "" : "Owner can add photos"}</small>`}</div>
      ${offlineBar()}
      <div class="dhead"><h1>${esc(s[1])}</h1><div class="s">${esc(C(s[3]))} · ${esc(s[4] || "Srinagar")} · ${fmtD(dist(s))}</div>
        ${s[21] ? `<div class="live ${s[21]}"><i></i>${esc(liveLabel[s[21]])}${det?.live_note ? " · " + esc(det.live_note) : ""}</div>` : ""}
        <div class="trust"><span class="meter">${[1, 2, 3, 4].map(i => `<i class="${i <= c ? "on" : ""}"></i>`).join("")}</span>
          ${s[20] ? "Verified" + (s[23] ? " by owner" : " by visitors") : c >= 3 ? "Strong listing" : c === 2 ? "Basic listing" : "Needs checking"} · ${nSrc(s[16])} source${nSrc(s[16]) > 1 ? "s" : ""}</div></div>
      ${det?.deals?.length ? det.deals.map(d => `<div class="offer"><b>${esc(d.title)}</b><span>${esc(d.details || "")}${d.details ? " · " : ""}until ${new Date(d.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>`).join("")
        : hasDeal(s) ? `<div class="offer"><b>Offer running</b><span>Open the shop online to see details</span></div>` : ""}
      <div class="acts">${act(`data-call="${esc(id)}"`, "phone", t("call"), !!k.tel, true)}${act(`data-wa="${esc(id)}"`, "chat", t("whatsapp"), !!k.wa)}
        ${act(`data-dir="${esc(id)}"`, "route", t("directions"), true)}${act(`data-save="${esc(id)}"`, "save", saved ? t("savedT") : t("save"), true)}${act(`data-share="${esc(id)}"`, "share", t("share"), true)}</div>
      ${det?.photos?.length > 1 ? `<div class="photos">${det.photos.slice(1).map(p => `<img src="${esc((window.SB_CONFIG?.api || "") + p.url)}" alt="" loading="lazy">`).join("")}</div>` : ""}
      <div class="info">
        ${k.tel ? `<div class="r">${I("phone", "sm")}<span class="v selectable">${esc(pretty(k.tel))}<small>${/^\+91[6-9]/.test(k.tel) ? "Mobile" : "Landline"}</small></span><button class="link" data-copy="${esc(k.tel)}">Copy</button></div>` : ""}
        ${s[6] && s[18] ? `<div class="r">${I("phone", "sm")}<span class="v selectable">${esc(pretty(s[6]))}<small>Head office number, not this branch</small></span><span></span></div>` : ""}
        <div class="r">${I("pin", "sm")}<span class="v selectable">${esc(s[11] || (s[4] ? s[4] + ", Srinagar" : "Srinagar"))}${s[19] ? " " + esc(s[19]) : ""}<small>${s[14] ? "Exact location" : "Approximate: only the area is known"}</small></span><span></span></div>
        ${s[15] ? `<div class="r">${I("clock", "sm")}<span class="v">${esc(s[15])}</span><span></span></div>` : ""}
        ${s[9] ? `<div class="r">${I("insta", "sm")}<span class="v"><button class="link" data-ext="${esc(s[9])}">${esc(s[9].replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, ""))}</button></span><span></span></div>` : ""}
        ${s[8] ? `<div class="r">${I("globe", "sm")}<span class="v"><button class="link" data-ext="${esc(s[8])}">${esc(s[8].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40))}</button></span><span></span></div>` : ""}
      </div>
      ${det?.prices?.length ? `<div class="label">Bazaar rates from the owner</div><div class="list-card">${det.prices.map(p => `<div class="lrow"><span>${esc(p.item)}</span><b>${esc(p.price)}</b></div>`).join("")}</div>` : ""}
      ${det?.products?.length ? `<div class="label">In stock (${det.products.length})</div><div class="list-card">${det.products.slice(0, 12).map(p => `<div class="lrow"><span>${esc(p.name)}${p.in_stock ? "" : ' <span class="muted">· out of stock</span>'}</span><b>${esc(p.price || "")}</b></div>`).join("")}</div>` : ""}
      ${similar.length ? `<div class="pad"><div class="sec"><h2>Similar nearby</h2></div><div class="hrow">${similar.map(hcard).join("")}</div></div>` : ""}
      ${isMine ? `<div class="owner-cta"><b>This is your shop</b><p>Update today's status, offers, prices and stock, and see your visits.</p><button class="btn sm" data-dash="${esc(id)}">Open shop dashboard</button></div>`
        : s[23] ? "" : `<div class="owner-cta"><b>Own this business?</b><p>Claim it free with a code sent to the shop's phone. Then add photos, hours, offers and your Instagram, and see how many people called.</p><button class="btn sm" data-claim="${esc(id)}">Claim this business</button></div>`}
      <div class="links"><button data-confirm="${esc(id)}">Still here? Confirm</button><button data-edit="${esc(id)}">Suggest an edit</button><button data-closed="${esc(id)}">Report closed</button></div></div>`;
    if (!el._detail && SB.online) SB.api("GET", "/v1/shops/" + encodeURIComponent(id)).then(d => {
      el._detail = d; const i = D().shops.findIndex(x => x[0] === id); if (i >= 0) { D().shops[i] = d.row; SB.byId.set(id, d.row); }
      if (el.isConnected) { const sc = $(".scroll", el).scrollTop; shopScreen(el, id); $(".scroll", el).scrollTop = sc; }
    }).catch(() => { el._detail = {}; });
  }

  function sightScreen(el, idx) {
    const g = D().sights[idx];
    const near = D().shops.map(s => ({ s, d: KM(g[2], g[3], s[12], s[13]) })).filter(x => x.d < 0.8 && [gIdx("Food & Drink"), gIdx("Kashmiri Crafts")].includes(x.s[2])).sort((a, b) => a.d - b.d);
    const others = D().sights.filter(o => o !== g && o[4] >= 1).map(o => [o, KM(g[2], g[3], o[2], o[3])]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(x => x[0]);
    el.innerHTML = `<div class="scroll"><div class="hero" style="background:var(--m5)">${esc(sightInitials(g))}
      <div class="hb"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><span></span></div></div>
      <div class="dhead"><h1>${esc(g[0])}</h1><div class="s">${esc(g[1][0].toUpperCase() + g[1].slice(1))} · ${fmtD(KM(here().lat, here().lon, g[2], g[3]))} from ${esc(here().name)}</div></div>
      <div class="pad" style="margin-top:16px"><button class="btn" data-ext="https://www.google.com/maps/dir/?api=1&destination=${g[2]},${g[3]}">${I("route", "sm")}Get directions</button></div>
      <div class="label" style="margin-top:8px">Eat and shop within 800 m</div>
      ${near.length ? `<div class="rows">${near.slice(0, 10).map(x => row(x.s)).join("")}</div>` : `<p class="pad note">Nothing listed nearby yet.</p>`}
      <div class="pad"><div class="sec"><h2>Also worth seeing</h2></div><div class="hrow">${others.map(scard).join("")}</div></div><div style="height:30px"></div></div>`;
  }

  // ---------- map ----------
  const mapState = { q: null, list: [], markers: [] };
  let MAP = null, baseLayer = null, pinLayer = null, basemap = null;
  RENDER.map = el => {
    if (!el.dataset.init) {
      el.dataset.init = 1;
      el.innerHTML = `<div class="mapwrap"><div class="mapel" id="map" role="application" aria-label="Map of shops"></div>
        <div class="mapTop"><button class="searchbox" data-search>${I("search", "sm")}Search this area</button>
        <div class="chips">${[["Offers", "__deals"], ["Bakeries", "bread"], ["Chemists", "dawai"], ["Restaurants", "restaurant"], ["Cafes", "cafe"], ["Pashmina", "pashmina"], ["Hotels", "hotel"], ["Mobile", "mobile"]]
          .map(([c, q]) => `<button class="chip" data-mq="${q}" aria-pressed="false">${c}</button>`).join("")}</div></div>
        <div class="carousel" id="carousel"></div></div>`;
      el.addEventListener("click", e => { const b = e.target.closest("[data-mq]"); if (!b) return; e.stopPropagation(); const on = b.getAttribute("aria-pressed") !== "true";
        el.querySelectorAll("[data-mq]").forEach(x => x.setAttribute("aria-pressed", x === b && on)); mapShow(on ? b.dataset.mq : null); });
    }
    setTimeout(async () => { await initMap(); mapShow(mapState.q); }, 30);
  };
  async function initMap() {
    if (MAP) { MAP.invalidateSize(); return; }
    if (!basemap) basemap = await fetch("data/basemap.json").then(r => r.json());
    MAP = L.map("map", { zoomControl: false, minZoom: 11, maxZoom: 18, maxBounds: [[33.95, 74.66], [34.24, 74.96]], preferCanvas: true });
    MAP.attributionControl.setPrefix(false).addAttribution("&copy; OpenStreetMap contributors");
    MAP.setView([here().lat, here().lon], 15); paintBase();
    $("#carousel").addEventListener("scroll", () => { clearTimeout(mapState.t); mapState.t = setTimeout(() => {
      const c = $("#carousel"), w = (c.firstElementChild?.offsetWidth || 284) + 10, i = Math.round(Math.abs(c.scrollLeft) / w); highlight(i, true); }, 120); });
  }
  function paintBase() {
    if (!MAP || !basemap) return; if (baseLayer) baseLayer.remove();
    const rr = L.canvas({ padding: .4 }), ls = [], wc = tok("--water");
    basemap.water.forEach(([area, c]) => { const ll = c.map(([x, y]) => [y, x]); ls.push(area ? L.polygon(ll, { renderer: rr, interactive: false, stroke: false, fillColor: wc, fillOpacity: 1 }) : L.polyline(ll, { renderer: rr, interactive: false, color: wc, weight: 4 })); });
    const sorted = [...basemap.roads].sort((x, y) => y[0] - x[0]);
    sorted.forEach(([k, c]) => ls.push(L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: tok("--road-edge"), weight: [7, 5.5, 4, 2.6][k] })));
    sorted.forEach(([k, c]) => ls.push(L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: k < 2 ? tok("--road-major") : tok("--road"), weight: [5, 3.8, 2.6, 1.6][k] })));
    baseLayer = L.layerGroup(ls).addTo(MAP);
  }
  function mapShow(q) {
    if (!MAP) return;
    mapState.q = q;
    const list = q === "__deals" ? best(hasDeal, 25, 8) : q ? ask(q).list?.map(x => x.s).slice(0, 25) || [] :
      best(s => ["Food & Drink", "Fashion", "Kashmiri Crafts", "Groceries", "Shopping"].map(gIdx).includes(s[2]) && s[14], 25);
    mapState.list = list;
    if (pinLayer) pinLayer.remove();
    const me = L.marker([here().lat, here().lon], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16] }), interactive: false });
    mapState.markers = list.map((s, i) => L.marker([s[12], s[13]], { icon: L.divIcon({ className: "", html: `<div class="pin" style="background:${mcol(s)}"><b>${i + 1}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 30] }) })
      .on("click", () => { highlight(i); const c = $("#carousel"); c.children[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }));
    pinLayer = L.layerGroup([me, ...mapState.markers]).addTo(MAP);
    $("#carousel").innerHTML = list.map((s, i) => `<button class="mcard" data-shop="${esc(s[0])}"><span class="mono" style="background:${mcol(s)}">${i + 1}</span><span style="min-width:0"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))} · ${fmtD(dist(s))}</div><div class="tags">${tags(s)}</div></span></button>`).join("");
    $("#carousel").scrollLeft = 0;
    if (list.length) MAP.fitBounds(L.latLngBounds(list.map(s => [s[12], s[13]]).concat([[here().lat, here().lon]])).pad(.2), { paddingTopLeft: [0, 110], paddingBottomRight: [0, 110], maxZoom: 16 });
    else MAP.setView([here().lat, here().lon], 15);
    highlight(0);
  }
  function highlight(i, pan) {
    mapState.markers.forEach((m, j) => { const e = m.getElement()?.firstElementChild; if (e) e.classList.toggle("on", j === i); m.setZIndexOffset(j === i ? 1000 : 0); });
    document.querySelectorAll("#carousel .mcard").forEach((c, j) => c.classList.toggle("on", j === i));
    if (pan && mapState.list[i]) MAP.panTo([mapState.list[i][12], mapState.list[i][13]], { animate: true });
  }

  // ---------- Ask the bazaar ----------
  RENDER.ask = (el, prefill = "") => {
    el.innerHTML = `<div class="scroll safe-top">${offlineBar()}<div class="pad"><div class="hello" style="color:var(--ink);margin-top:8px">${t("askTitle")}</div>
      <p class="note" style="font-size:14px;margin:-6px 0 14px">${t("askSub")}</p></div>
      <form class="form" id="askf"><label>${t("askWhat")}<textarea id="askq" placeholder="e.g. 32-inch LED TV in stock today, under 15,000">${esc(prefill)}</textarea></label>
      <label>Near<button type="button" class="btn ghost" data-area-pick style="justify-content:space-between">${esc(here().name)}${I("down", "sm")}</button></label>
      <p class="note" id="askn">Type what you need to see how many shops will get it.</p>
      <button class="btn" type="submit">${t("send")}</button></form><div id="askres"></div><div id="mine"></div></div>`;
    const count = () => { const q = $("#askq", el).value.trim(); if (!q) { $("#askn", el).textContent = "Type what you need to see how many shops will get it."; return; }
      const r = ask(q); const n = r.type === "shops" && r.main ? r.list.filter(x => x.rel >= 2 && x.d < 2.5).length : 0;
      $("#askn", el).innerHTML = n ? `About <b>${Math.min(n, 25)}</b> ${esc(SBIntent.plural(r.main))} within 2.5 km will see this.` : "Try naming the thing, like 'bread', 'medicine', 'phone cover'."; };
    $("#askq", el).addEventListener("input", count); count();
    $("#askf", el).addEventListener("submit", async e => { e.preventDefault(); const text = $("#askq", el).value.trim(); if (!text) return $("#askq", el).focus();
      const b = $("#askf button[type=submit]", el); busy(b, true);
      try {
        const r = await SB.authed("POST", "/v1/asks", { text, lat: here().lat, lon: here().lon });
        const msg = `Hi, I found you on Srinagar Bazaar. ${text}`;
        $("#askres", el).innerHTML = `<div class="okcard"><b>${r.in_app ? `Sent to ${r.in_app} shop${r.in_app > 1 ? "s" : ""} in the app` : "Request saved"}</b><p>${r.in_app ? "Replies appear below and as a notification." : "No shop for this is on the app yet near you."} ${r.whatsapp.length ? "You can also message these shops on WhatsApp in one tap. It goes from your own WhatsApp, so it's free." : ""}</p></div>
          ${r.whatsapp.length ? `<div class="rows" style="margin-top:8px">${r.whatsapp.map(w => `<div class="item"><button data-shop="${esc(w.id)}"><span class="mono" style="background:var(--m0)">${esc(initials(w.name))}</span><span style="min-width:0"><div class="t">${esc(w.name)}</div><div class="s">${fmtD(w.meters / 1000)}</div></span></button>
            <span class="rt"><button class="btn sm" data-wato="${esc(w.number)}" data-msg="${esc(msg)}">${I("chat", "sm")}Message</button></span></div>`).join("")}</div>` : ""}`;
        $("#askq", el).value = ""; count(); loadMine(el);
      } catch (err) { toast(err.message); }
      busy(b, false); });
    loadMine(el);
  };
  async function loadMine(el) {
    if (!SB.online) return;
    try {
      const r = await SB.authed("GET", "/v1/asks/mine");
      const box = $("#mine", el); if (!box || !r.asks.length) return;
      box.innerHTML = `<div class="label">${t("myRequests")}</div>` + r.asks.map(a => `<div class="reply" style="border-radius:14px"><small>${new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · sent to ${a.sent_to} in app</small><b>${esc(a.text)}</b>
        ${a.replies.length ? a.replies.map(x => `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><small>${esc(x.shop)}</small>${esc(x.text)}
          <div style="display:flex;gap:8px;margin-top:8px">${x.phone ? `<button class="btn sm ghost" data-ext="tel:${esc(x.phone)}">${I("phone", "sm")}Call</button>` : ""}<button class="btn sm ghost" data-shop="${esc(x.shop_id)}">View shop</button></div></div>`).join("")
          : `<p class="note" style="margin-top:6px">No replies yet.</p>`}</div>`).join("") + `<div style="height:24px"></div>`;
    } catch {}
  }

  // ---------- Saved ----------
  RENDER.saved = el => {
    const list = SB.saved.map(id => SB.byId.get(id)).filter(Boolean);
    el.innerHTML = `<div class="scroll safe-top"><div class="pad"><div class="hello" style="color:var(--ink);margin-top:8px">${t("saved")}</div></div>
      ${list.length ? `<div class="rows">${list.map(row).join("")}</div>` : `<div class="empty"><h3>Nothing saved yet</h3><p>Tap Save on any shop to keep it here, like your chemist, tailor or favourite bakery. Saved shops work offline.</p><button class="btn ghost" data-tabgo="home" style="margin-top:14px">Find shops</button></div>`}
      <div style="height:30px"></div></div>`;
  };

  // ---------- Me ----------
  RENDER.me = el => {
    const u = SB.user || {};
    el.innerHTML = `<div class="scroll safe-top">${offlineBar()}<div class="pad"><div class="hello" style="color:var(--ink);margin-top:8px">${t("me")}</div></div>
      <div class="me-card"><span class="mono">${esc(initials(u.name || "You"))}</span><div style="flex:1;min-width:0"><b style="font-size:16px">${esc(u.name || "Add your name")}</b>
        <div class="note">${u.phone ? "Phone verified " + esc(u.phone) : "Phone not verified"} · ${u.points || 0} points</div></div><button class="link" data-editname>Edit</button></div>
      <div class="menu">
        ${(SB.myShops || []).map(m => `<button data-dash="${esc(m.id)}">${I("store")}<span>${esc(m.name)}<br><small>Shop dashboard: visits, status, offers</small></span>${I("chev", "sm flip")}</button>`).join("")}
        <button data-go="champions">${I("trophy")}<span>${t("champions")}<br><small>Add shops and photos, win monthly prizes</small></span>${I("chev", "sm flip")}</button>
        <button data-add>${I("plus")}<span>${t("addShop")}</span>${I("chev", "sm flip")}</button>
        <button data-go="tourist">${I("camera")}<span>${t("tourist")}<br><small>One-day plan, houseboats, safety</small></span>${I("chev", "sm flip")}</button>
        <button data-go="sos">${I("sos")}<span>${t("emergency")}</span>${I("chev", "sm flip")}</button>
      </div>
      <div class="menu">
        ${u.phone ? "" : `<button data-verify>${I("shield")}<span>${t("verifyPhone")}<br><small>Needed to claim a shop or win prizes</small></span>${I("chev", "sm flip")}</button>`}
        <button data-lang>${I("lang")}<span>${t("language")}<br><small>${I18N.lang === "ur" ? "اردو (beta)" : "English"}</small></span>${I("chev", "sm flip")}</button>
        <button data-sync>${I("sync")}<span>City data<br><small>${D().shops.length.toLocaleString("en-IN")} shops · ${SB.lastSync ? "updated " + new Date(SB.lastSync).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "from the app download"}</small></span>${I("chev", "sm flip")}</button>
        <button data-go="about">${I("info")}<span>${t("about")}</span>${I("chev", "sm flip")}</button>
      </div><div style="height:30px"></div></div>`;
    if (SB.online && !el._loaded) { el._loaded = true; SB.me().then(() => { if (curTab === "me" && !stack.length) RENDER.me(el); }).catch(() => {}); }
  };

  // ---------- Bazaar Champions ----------
  function championsScreen(el) {
    const u = SB.user || {};
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("champions")}</h1></div>
      <div class="scroll"><div class="pointsbig"><div><span>Your points</span><b>${u.points || 0}</b></div>${I("trophy")}</div>
      <div class="label">How to earn</div>
      <div class="earn"><div><b>+10</b><span>Add a missing shop (after we check it)</span></div><div><b>+3</b><span>Add a shop photo</span></div>
        <div><b>+2</b><span>Fix wrong info</span></div><div><b>+1</b><span>Confirm a shop while you're there</span></div></div>
      <p class="pad note" style="margin-top:12px">Top champions each month win prizes from partner shops. Fake or copied entries are removed and lose points.</p>
      <div class="label">This month</div><div class="rows lb" id="lb"><div class="empty">Loading…</div></div>
      <div class="pad" style="margin:18px 0 30px"><button class="btn" data-add>${I("plus", "sm")}Add a shop</button></div></div>`;
    SB.authed("GET", "/v1/champions").then(r => { const box = $("#lb", el); if (!box) return;
      box.innerHTML = r.top.length ? r.top.map(x => `<div class="item"><span class="rank r${x.rank}">${x.rank}</span><span><div class="t">${esc(x.name)}${x.me ? " (you)" : ""}</div></span><span class="d">${x.points} pts</span></div>`).join("")
        : `<div class="empty"><h3>Be the first champion</h3><p>Nobody has points this month yet.</p></div>`; })
      .catch(() => { const box = $("#lb", el); if (box) box.innerHTML = `<div class="empty">Connect to the internet to see the leaderboard.</div>`; });
  }

  // ---------- Tourist mode ----------
  const SOS = [["112", "All emergencies"], ["100", "Police"], ["108", "Ambulance"], ["101", "Fire"], ["1363", "Tourist helpline (India)"], ["1091", "Women's helpline"]];
  function touristScreen(el) {
    const S_ = name => D().sights.findIndex(g => g[0].toLowerCase().includes(name));
    const chips = names => names.map(n => [n, S_(n.toLowerCase())]).filter(x => x[1] >= 0).map(([n, i]) => `<button class="chip" data-sight="${i}">${esc(n)}</button>`).join("");
    const hb = D().shops.filter(s => C(s[3]) === "Houseboat" && (s[20] || nSrc(s[16]) >= 2)).sort((a, b) => b[17] - a[17]).slice(0, 8);
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("tourist")}</h1></div>
      <div class="scroll"><p class="pad note" style="font-size:14px;margin-bottom:16px">A simple day in Srinagar. Every stop opens directions and what's nearby. The app works offline if mobile data is slow.</p>
      <div class="timeline">
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Morning</div><h4>Mughal gardens</h4><p>Start with the terraced gardens on the Dal's east shore while it's quiet.</p><div class="chips">${chips(["Nishat Bagh", "Shalimar Bagh", "Cheshme Shahi", "Parimahal"])}</div></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Midday</div><h4>Shikara on Dal Lake</h4><p>Boats leave from the Boulevard ghats. Rates are displayed at the ghats; agree on the price and time before you board.</p><button class="btn sm ghost" data-q="shikara">Find shikara and houseboats</button></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Afternoon</div><h4>Old city walk</h4><p>Jamia Masjid, then Khanqah Shah-e-Hamadan on the Jhelum, with copper, papier-mâché and shawl workshops in the lanes around.</p><div class="chips">${chips(["Jamia Masjid", "Khanqah Shah-e-Hamadan", "Makhdoom Sahib Shrine"])}</div></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Evening</div><h4>Wazwan dinner</h4><p>End with a Kashmiri wazwan meal: rista, rogan josh, gushtaba.</p><button class="btn sm ghost" data-q="where to eat wazwan">Wazwan near me</button></div></div>
      </div>
      ${hb.length ? `<div class="label">Houseboats confirmed by several sources</div><div class="rows">${hb.map(row).join("")}</div>` : ""}
      <div class="label">${t("emergency")}</div><div class="sos">${SOS.map(([n, l]) => `<button data-ext="tel:${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("")}</div>
      <div class="label">Good to know</div><div class="list-card" style="margin-bottom:30px">
        <div class="lrow"><span>Many small shops prefer cash or UPI. Keep some cash for old-city lanes.</span></div>
        <div class="lrow"><span>For pashmina, ask about the GI mark and certificate before paying for "pure pashmina".</span></div>
        <div class="lrow"><span>Friday afternoons, some shops close for prayers. Check the shop's status before you go.</span></div></div></div>`;
  }
  function sosScreen(el) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("emergency")}</h1></div>
      <div class="scroll"><p class="pad note" style="font-size:14px;margin-bottom:14px">Tap a number to call. These work from any phone in India.</p>
      <div class="sos">${SOS.map(([n, l]) => `<button data-ext="tel:${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("")}</div>
      <div class="label">Nearest hospitals</div><div class="rows">${D().shops.filter(s => C(s[3]) === "Hospital & Nursing Home").sort((a, b) => dist(a) - dist(b)).slice(0, 6).map(row).join("")}</div><div style="height:30px"></div></div>`;
  }
  function aboutScreen(el) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("about")}</h1></div>
      <div class="scroll pad" style="line-height:1.6;color:var(--ink-2)">
      <img src="img/logo-horizontal.png" alt="Srinagar Bazaar" style="height:64px;margin:6px 0 12px">
      <p>Srinagar Bazaar helps you find any shop in Srinagar, nearest first, even without internet.</p>
      <p><b style="color:var(--ink)">What we store.</b> A random ID for this phone. Your phone number only if you verify it (to claim a shop or win prizes). Requests you send with Ask the bazaar. Anonymous counts of shop views and calls, which only the shop's owner sees. Your saved shops stay on this phone.</p>
      <p><b style="color:var(--ink)">Location.</b> Used only on this phone to sort shops by distance, and sent only when you add a shop, confirm one, or send a request.</p>
      <p><b style="color:var(--ink)">Your choices.</b> Ask us to delete your data any time from the privacy page. Full policy: <button class="link" data-ext="https://api.45-92-1-150.sslip.io/privacy.html">api.45-92-1-150.sslip.io/privacy.html</button></p>
      <p><b style="color:var(--ink)">Contact.</b> <span class="selectable">fazil.mastu@gmail.com</span></p>
      <p><b style="color:var(--ink)">Data sources.</b> Map data © OpenStreetMap contributors (ODbL). Places from Overture Maps Foundation and AllThePlaces, plus shops added by people of Srinagar.</p>
      <button class="btn ghost" data-delme style="color:var(--bad);margin-top:6px">Delete my data</button>
      <p class="note" style="margin-top:12px">Version 1.0.0</p><div style="height:30px"></div></div>`;
  }

  // ---------- Add a shop ----------
  function addScreen(el, step = 1, draft = {}) {
    const steps = `<div class="steps">${[1, 2, 3].map(i => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>`;
    const head = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Close">${I("close")}</button><h1>${t("addShop")}</h1></div>${steps}`;
    if (step === 4) { el.innerHTML = `${head}<div class="scroll"><div class="okcard"><b>Thanks! ${esc(draft.name)} is sent for checking</b><p>We usually check new shops within a day. When it's live you get +10 Champion points, and it appears for everyone.</p></div>
      <div class="pad" style="margin-top:14px;display:grid;gap:8px"><button class="btn" data-again>Add another shop</button><button class="btn ghost" data-back>Done</button></div></div>`;
      $("[data-again]", el).onclick = () => addScreen(el, 1, {}); return; }
    const body = step === 1 ? `<label>Shop name<input id="an" required value="${esc(draft.name || "")}" placeholder="e.g. Mir Bakers"></label>
        <label>What do they sell?<select id="ac">${SB.catList.slice().sort().map(c => `<option${(draft.cat || "Grocery & General Store") === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`
      : step === 2 ? `<p class="note">Move the map so the pin sits on the shop.</p><div class="picker"><div class="mapel" id="pickmap"></div><span class="crosshair">${I("pin")}</span></div>
        <button type="button" class="btn ghost" id="pickgps">${I("pin", "sm")}I'm at the shop</button>
        <label>Landmark or street (optional)<input id="al" value="${esc(draft.address || "")}" placeholder="e.g. near Jamia Masjid, Nowhatta"></label>`
      : `<label>Phone or WhatsApp<input id="ap" inputmode="tel" value="${esc(draft.phone || "")}" placeholder="98765 43210"></label><label>Instagram (optional)<input id="ai" value="${esc(draft.instagram || "")}" placeholder="@shopname"></label>
        <p class="note">We may call to confirm. The number is shown on the shop's page.</p>`;
    el.innerHTML = `${head}<div class="scroll"><form class="form" id="addf">${body}<button class="btn" type="submit">${step === 3 ? "Add shop" : "Continue"}</button></form></div>`;
    let pick = null;
    if (step === 2) setTimeout(async () => {
      if (!basemap) basemap = await fetch("data/basemap.json").then(r => r.json());
      const c = draft.lat ? [draft.lat, draft.lon] : [here().lat, here().lon];
      pick = L.map($("#pickmap", el), { zoomControl: false, attributionControl: false, preferCanvas: true }).setView(c, 17);
      const rr = L.canvas(); basemap.roads.forEach(([k, cc]) => { if (k < 4) L.polyline(cc.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: tok("--road-edge"), weight: [6, 5, 4, 3][k] }).addTo(pick); });
      basemap.water.forEach(([a, cc]) => a && L.polygon(cc.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, stroke: false, fillColor: tok("--water"), fillOpacity: 1 }).addTo(pick));
      D().shops.filter(s => Math.abs(s[12] - c[0]) < .01 && Math.abs(s[13] - c[1]) < .012).forEach(s => L.circleMarker([s[12], s[13]], { renderer: rr, radius: 3, color: tok("--ink-3"), weight: 1, fillOpacity: .6 }).addTo(pick));
      $("#pickgps", el).onclick = async () => { try { const p = await SB.position(); pick.setView([p.lat, p.lon], 18); } catch (e) { toast(e.message); } };
    }, 50);
    $("#addf", el).addEventListener("submit", async e => { e.preventDefault();
      if (step === 1) { draft.name = $("#an", el).value.trim(); draft.cat = $("#ac", el).value; if (draft.name.length < 3) return toast("Shop name is too short"); }
      if (step === 2) { const ctr = pick.getCenter(); draft.lat = ctr.lat; draft.lon = ctr.lng; draft.address = $("#al", el).value.trim(); }
      if (step === 3) { draft.phone = $("#ap", el).value.trim(); draft.instagram = $("#ai", el).value.trim();
        const b = $("#addf button[type=submit]", el); busy(b, true);
        try { await SB.authed("POST", "/v1/shops", { name: draft.name, category: draft.cat, lat: draft.lat, lon: draft.lon, address: draft.address, phone: draft.phone, instagram: draft.instagram }); }
        catch (err) { busy(b, false); return toast(err.message); } }
      addScreen(el, step + 1, draft); });
  }

  // ---------- Owner dashboard ----------
  async function dashScreen(el, id) {
    const s = SB.byId.get(id) || [id, "Your shop"];
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${esc(s[1])}</h1></div><div class="scroll" id="db"><div class="empty">Loading your shop…</div></div>`;
    let stats, detail, inbox;
    try { [stats, detail, inbox] = await Promise.all([SB.authed("GET", `/v1/owner/shops/${id}/stats?days=30`), SB.api("GET", `/v1/shops/${id}`), SB.authed("GET", "/v1/owner/inbox")]); }
    catch (err) { $("#db", el).innerHTML = `<div class="errcard">${esc(err.message)}</div>`; return; }
    const tot7 = {}; const days = {}; const cut = Date.now() - 7 * 864e5;
    stats.daily.forEach(r => { const d = new Date(r.day).getTime(); if (d >= cut) tot7[r.kind] = (tot7[r.kind] || 0) + r.n; if (r.kind === "view") days[r.day.slice(0, 10)] = r.n; });
    const series = [...Array(30)].map((_, i) => days[new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10)] || 0); const mx = Math.max(1, ...series);
    const live = detail.row[21];
    const myAsks = inbox.asks.filter(a => a.shop_id === id);
    $("#db", el).innerHTML = `
      <div class="privacy">${I("shield", "xs")}Only you can see these numbers.</div>
      <div class="label">Last 7 days</div>
      <div class="kpis"><div class="kpi"><b>${tot7.view || 0}</b><span>Shop visits</span></div><div class="kpi"><b>${tot7.call || 0}</b><span>Calls</span></div>
        <div class="kpi"><b>${tot7.whatsapp || 0}</b><span>WhatsApp taps</span></div><div class="kpi"><b>${tot7.directions || 0}</b><span>Direction requests</span></div></div>
      <div class="spark" aria-label="Visits per day, last 30 days">${series.map(v => `<i style="height:${Math.round(v / mx * 100)}%"></i>`).join("")}</div>
      <p class="pad note" style="margin-top:4px">Visits per day, last 30 days · ${stats.totals.view || 0} total</p>
      <div class="label">Today's status</div>
      <div class="pad"><div class="seg">${[["open", t("openNow")], ["closed_today", t("closedToday")], ["opens_late", t("opensLate")], ["busy", t("busy")]].map(([k, l]) => `<button data-live="${k}" aria-pressed="${live === k}">${l}</button>`).join("")}</div>
        <form class="form" id="livef" style="padding:12px 0 0"><input id="livenote" placeholder="Note, e.g. Fresh kulcha at 4 pm" value="${esc(detail.live_note || "")}"><button class="btn ghost" type="submit">Save note</button></form></div>
      <div class="label">Offers</div>
      ${detail.deals.map(d => `<div class="offer" style="grid-template-columns:1fr auto;align-items:center"><span><b>${esc(d.title)}</b><br><span>until ${new Date(d.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span><button class="btn sm ghost" data-deldeal="${d.id}">End</button></div>`).join("")}
      <form class="form" id="dealf" style="padding-top:10px"><input id="dealt" placeholder="e.g. 20% off all pherans" maxlength="80"><div class="row2"><select id="deald"><option value="1">Today only</option><option value="3">3 days</option><option value="7">1 week</option></select><button class="btn" type="submit">Post offer</button></div>
        <p class="note">Offers show on your shop, on the map's Offers filter and on the home screen nearby. Free for now.</p></form>
      <div class="label">Bazaar rates</div>
      <form class="form" id="pricef">${[...detail.prices, {}, {}].map(p => `<div class="row2"><input class="pi" placeholder="Item, e.g. Shikara 1 hour" value="${esc(p.item || "")}"><input class="pp" placeholder="Price, e.g. Rs 800" value="${esc(p.price || "")}"></div>`).join("")}
        <button class="btn ghost" type="submit">Save rates</button></form>
      <div class="label">Stock list (${detail.products.length})</div>
      ${detail.products.length ? `<div class="list-card">${detail.products.slice(0, 30).map(p => `<div class="lrow"><span>${esc(p.name)} <span class="muted">${esc(p.price || "")}</span></span><span><button class="link" data-stock="${p.id}" data-on="${p.in_stock}">${p.in_stock ? "In stock" : "Out"}</button> · <button class="link" style="color:var(--bad)" data-delprod="${p.id}">Remove</button></span></div>`).join("")}</div>` : ""}
      <form class="form" id="prodf" style="padding-top:10px"><textarea id="prodl" placeholder="One per line: name | price&#10;iPhone 15 cover | Rs 300&#10;Nike shoes size 9 | Rs 4,500"></textarea><button class="btn ghost" type="submit">Add to stock list</button>
        <p class="note">Shoppers searching "iPhone 15 cover" will see your shop.</p></form>
      <div class="label">Photos</div>
      <div class="pad"><label class="btn ghost" style="cursor:pointer">${I("camera", "sm")}Add a photo<input type="file" accept="image/*" id="photo" hidden></label></div>
      <div class="label">Requests from customers (${myAsks.length})</div>
      ${myAsks.length ? myAsks.map(a => `<div class="reply"><small>${fmtD(a.meters / 1000)} away · ${new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small><b>${esc(a.text)}</b>
        ${a.replied ? `<p class="note" style="margin-top:6px">You replied.</p>` : `<form class="form askreply" data-ask="${a.id}" style="padding:10px 0 0"><input placeholder="e.g. Yes, in stock. Come before 7 pm"><button class="btn sm" type="submit">Reply</button></form>`}</div>`).join("")
        : `<p class="pad note">No requests in the last 2 days. Requests for things you sell near your shop appear here.</p>`}
      <div class="label">Shop details</div>
      <form class="form" id="detf"><label>Opening hours<input id="dh" value="${esc(detail.row[15] || "")}" placeholder="Mo-Sa 10:00-20:00"></label>
        <label>WhatsApp<input id="dw" inputmode="tel" value="${esc(detail.row[7] || "")}"></label><label>Instagram<input id="di" value="${esc(detail.row[9] || "")}" placeholder="@shopname"></label>
        <button class="btn ghost" type="submit">Save details</button></form><div style="height:30px"></div>`;
    const reload = () => { const sc = $("#db", el).scrollTop; dashScreen(el, id).then(() => { const d = $("#db", el); if (d) d.scrollTop = sc; }); };
    const run = async (fn, okMsg) => { try { await fn(); toast(okMsg); SB.sync(); reload(); } catch (err) { toast(err.message); } };
    el.onclick = async e => { const b = e.target.closest("[data-live],[data-deldeal],[data-stock],[data-delprod]"); if (!b) return; e.stopPropagation();
      if (b.dataset.live) run(() => SB.authed("PATCH", `/v1/owner/shops/${id}`, { live_status: b.getAttribute("aria-pressed") === "true" ? null : b.dataset.live, live_note: $("#livenote", el).value, live_hours: 14 }), "Status updated");
      if (b.dataset.deldeal) run(() => SB.authed("DELETE", `/v1/owner/deals/${b.dataset.deldeal}`), "Offer ended");
      if (b.dataset.stock) run(() => SB.authed("PATCH", `/v1/owner/products/${b.dataset.stock}`, { in_stock: b.dataset.on !== "true" }), "Stock updated");
      if (b.dataset.delprod) run(() => SB.authed("DELETE", `/v1/owner/products/${b.dataset.delprod}`), "Removed"); };
    $("#livef", el).onsubmit = e => { e.preventDefault(); run(() => SB.authed("PATCH", `/v1/owner/shops/${id}`, { live_status: live || "open", live_note: $("#livenote", el).value, live_hours: 14 }), "Note saved"); };
    $("#dealf", el).onsubmit = e => { e.preventDefault(); const tt = $("#dealt", el).value.trim(); if (!tt) return toast("Write the offer first");
      run(() => SB.authed("POST", `/v1/owner/shops/${id}/deals`, { title: tt, days: +$("#deald", el).value }), "Offer posted"); };
    $("#pricef", el).onsubmit = e => { e.preventDefault(); const pi = [...el.querySelectorAll(".pi")], pp = [...el.querySelectorAll(".pp")];
      run(() => SB.authed("PUT", `/v1/owner/shops/${id}/prices`, { prices: pi.map((x, i) => ({ item: x.value, price: pp[i].value })).filter(p => p.item && p.price) }), "Rates saved"); };
    $("#prodf", el).onsubmit = e => { e.preventDefault(); const l = $("#prodl", el).value.trim(); if (!l) return; run(() => SB.authed("POST", `/v1/owner/shops/${id}/products`, { lines: l }), "Added to stock list"); };
    $("#detf", el).onsubmit = e => { e.preventDefault(); run(() => SB.authed("PATCH", `/v1/owner/shops/${id}`, { opening_hours: $("#dh", el).value, whatsapp: $("#dw", el).value, instagram: $("#di", el).value }), "Details saved"); };
    el.querySelectorAll(".askreply").forEach(f => f.onsubmit = e => { e.preventDefault(); const tx = $("input", f).value.trim(); if (!tx) return;
      run(() => SB.authed("POST", `/v1/owner/asks/${f.dataset.ask}/reply`, { shop_id: id, text: tx }), "Reply sent"); });
    $("#photo", el).onchange = async e => { const f = e.target.files[0]; if (!f) return; toast("Uploading…");
      try { const blob = await shrink(f); const fd = new FormData(); fd.append("photo", blob, "photo.jpg"); await SB.authed("POST", `/v1/shops/${id}/photos`, fd); toast("Photo added"); }
      catch (err) { toast(err.message); } };
  }
  async function shrink(file, max = 1600) {
    const img = await createImageBitmap(file); const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise(r => cv.toBlob(r, "image/jpeg", 0.82));
  }

  // ---------- actions ----------
  async function share(id) {
    const s = SB.byId.get(id), k = contact(s);
    SB.track(id, "share");
    const text = `${s[1]}, ${C(s[3])} in ${s[4] || "Srinagar"}.${k.tel ? " Call " + pretty(k.tel) + "." : ""} Directions: https://maps.google.com/?q=${s[12]},${s[13]}\nFound on Srinagar Bazaar`;
    try {
      const det = stack[stack.length - 1]?.el._detail;
      const blob = await makeShareCard({ name: s[1], category: C(s[3]), area: s[4], phone: k.tel ? pretty(k.tel) : null, address: s[11], lat: s[12], lon: s[13], offer: det?.deals?.[0]?.title });
      if (await SB.shareImage(blob, s[1], text)) return;
      const url = URL.createObjectURL(blob);
      sheet(`<h3>Share card</h3><p class="sub">Long-press the image to save or share it.</p><div class="pad"><img src="${url}" alt="Shop card" style="width:100%;border-radius:14px"></div><div class="form"><button class="btn ghost" data-copytext>Copy text instead</button></div>`,
        el => { $("[data-copytext]", el).onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast(text); } }; });
    } catch (e) { try { await navigator.clipboard.writeText(text); toast("Shop details copied"); } catch { toast(text); } }
  }
  async function claim(id) {
    try {
      await SB.signIn();
      if (!SB.user?.phone) { const ok = await verifyPhone("Use the phone number listed for this shop. If it matches, you get access straight away."); if (!ok) return; }
      const r = await SB.authed("POST", `/v1/shops/${id}/claim`, {});
      if (r.status === "approved") { toast("You now manage this shop"); await SB.me(); SB.sync(); push(dashScreen, id); }
      else sheet(`<h3>We'll call you to check</h3><p class="sub">${esc(r.message)}</p><div class="form"><button class="btn" data-close>OK</button></div>`);
    } catch (e) { toast(e.message); }
  }
  function editSheet(id) {
    sheet(`<h3>Suggest an edit</h3><form class="form" id="ef"><label>What's wrong?<select id="ff"><option value="phone">Phone number</option><option value="name">Name</option><option value="address">Address</option>
      <option value="opening_hours">Opening hours</option><option value="category">Category</option><option value="instagram">Instagram</option></select></label>
      <label>Correct details<input id="fv" required placeholder="Type the right information"></label><button class="btn" type="submit">Send</button><p class="note">+2 Champion points when we approve it.</p></form>`, el => {
      $("#ef", el).onsubmit = async e => { e.preventDefault(); try { await SB.authed("POST", `/v1/shops/${id}/edits`, { field: $("#ff", el).value, value: $("#fv", el).value }); el.remove(); toast("Thanks. We'll check it."); } catch (err) { toast(err.message); } };
    });
  }

  screen.addEventListener("click", async e => {
    const tg = e.target.closest("button, a, label.btn"); if (!tg || tg.getAttribute("aria-disabled") === "true") return;
    const d = tg.dataset;
    if (d.tab) return showTab(d.tab);
    if (d.tabgo) return showTab(d.tabgo);
    if (d.back !== undefined) return pop();
    if (d.areaPick !== undefined) return pickArea();
    if (d.search !== undefined) return push(searchScreen, d.search || "");
    if (d.searchq !== undefined) return push(searchScreen, d.searchq);
    if (d.q !== undefined) { SB.remember(d.q); return push(resultsScreen, d.q); }
    if (d.askq !== undefined) { showTab("ask"); RENDER.ask(tabs.ask, d.askq); return; }
    if (d.mapof !== undefined) { showTab("map"); setTimeout(() => { document.querySelectorAll("[data-mq]").forEach(x => x.setAttribute("aria-pressed", "false")); mapShow(d.mapof); }, 80); return; }
    if (d.shop) { SB.track(d.shop, "view"); return push(shopScreen, d.shop); }
    if (d.sight) return push(sightScreen, +d.sight);
    if (d.add !== undefined) return push(addScreen);
    if (d.go) return push({ tourist: touristScreen, champions: championsScreen, sos: sosScreen, about: aboutScreen }[d.go]);
    if (d.dash) return push(dashScreen, d.dash);
    if (d.call) { const s = SB.byId.get(d.call); SB.track(d.call, "call"); return SB.openExternal("tel:" + contact(s).tel); }
    if (d.wa) { const s = SB.byId.get(d.wa); SB.track(d.wa, "whatsapp"); return SB.openExternal(`https://wa.me/${contact(s).wa.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I found your shop on Srinagar Bazaar.")}`); }
    if (d.dir) { const s = SB.byId.get(d.dir); SB.track(d.dir, "directions"); return SB.openExternal(contact(s).dir); }
    if (d.wato) return SB.openExternal(`https://wa.me/${d.wato.replace(/\D/g, "")}?text=${encodeURIComponent(d.msg || "")}`);
    if (d.ext) { e.preventDefault(); return SB.openExternal(d.ext); }
    if (d.save) { const on = SB.toggleSave(d.save); toast(on ? "Saved. Works offline too." : "Removed from saved"); redrawTop(); return; }
    if (d.share) return share(d.share);
    if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast("Number copied"); } catch { toast(pretty(d.copy)); } return; }
    if (d.claim) return claim(d.claim);
    if (d.edit) return editSheet(d.edit);
    if (d.closed) { try { await SB.authed("POST", `/v1/shops/${d.closed}/closed`, {}); toast("Thanks. We'll check and hide it if it has closed."); } catch (err) { toast(err.message); } return; }
    if (d.confirm) { try { toast("Checking your location…"); const p = await SB.position(); const r = await SB.authed("POST", `/v1/shops/${d.confirm}/confirm`, p);
        toast(r.already ? "You already confirmed this shop" : r.verified ? "Confirmed. Shop is now verified, +1 point" : "Confirmed, +1 point"); } catch (err) { toast(err.message); } return; }
    if (d.verify !== undefined) { await verifyPhone(); return RENDER.me(tabs.me); }
    if (d.editname !== undefined) return sheet(`<h3>Your name</h3><p class="sub">Shown on the Champions leaderboard.</p><form class="form" id="nf"><input id="nm" maxlength="40" value="${esc(SB.user?.name || "")}" placeholder="e.g. Aamir from Rajbagh"><button class="btn" type="submit">Save</button></form>`, el => {
      $("#nf", el).onsubmit = async ev => { ev.preventDefault(); try { const r = await SB.authed("PATCH", "/v1/me", { name: $("#nm", el).value }); SB.setUser(r.user); el.remove(); RENDER.me(tabs.me); } catch (err) { toast(err.message); } }; });
    if (d.lang !== undefined) return sheet(`<h3>${t("language")}</h3><div class="form"><button class="btn ghost" data-setlang="en">English</button><button class="btn ghost" data-setlang="ur">اردو (beta)</button></div>`, el => {
      el.addEventListener("click", ev => { const b = ev.target.closest("[data-setlang]"); if (!b) return; I18N.set(b.dataset.setlang); location.reload(); }); });
    if (d.delme !== undefined) return sheet(`<h3>Delete my data?</h3><p class="sub">This removes your account, verified number, requests and points. Saved shops on this phone are cleared too. Shops you added stay, without your name.</p>
      <div class="form"><button class="btn" style="background:var(--bad);color:#fff" data-delyes>Delete</button><button class="btn ghost" data-close>Cancel</button></div>`, el => {
      $("[data-delyes]", el).onclick = async () => { try { await SB.authed("DELETE", "/v1/me"); localStorage.clear(); el.remove(); toast("Your data was deleted"); setTimeout(() => location.reload(), 900); } catch (err) { toast(err.message); } }; });
    if (d.sync !== undefined) { toast("Checking for updates…"); await SB.sync(); toast(SB.online ? "City data is up to date" : "You're offline"); return RENDER.me(tabs.me); }
  });

  // Android back button
  const App = SBPlugin("App");
  if (App) App.addListener("backButton", () => {
    const sh = [...screen.querySelectorAll(".sheet")].pop();
    if (sh) return sh.remove();
    if (pop()) return;
    if (curTab !== "home") return showTab("home");
    App.exitApp();
  });

  showTab("home");
  if (location.hash === "#tourist") push(touristScreen);
})();
