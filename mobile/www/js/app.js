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
  const PH = await fetch("img/photos/credits.json").then(r => r.json()).catch(() => ({ photos: {}, sights: {}, shops: {} }));
  $("#boot").remove();
  SB.signIn().catch(() => {});

  // Row: 0 id,1 name,2 g,3 c,4 locality,5 area,6 phone,7 wa,8 web,9 ig,10 fb,11 addr,12 lat,13 lon,14 precise,15 hours,
  //      16 src bits,17 score,18 chainPhone,19 pin,20 verified,21 live,22 dealEnds,23 claimed,24 photo
  const D = () => SB.data;
  const G = i => D().groups[i] || "Other";
  const C = i => D().categories[i] || "Shop";
  const nSrc = m => [1, 2, 4, 8, 16, 32].filter(b => m & b).length;
  const hasDeal = s => s[22] && s[22] * 1000 > Date.now();
  const gIdx = name => D().groups.indexOf(name);

  // ---------- photos ----------
  // Photos only where they are true: sights, and a shop's own photo (added in the app, or an openly licensed photo of
  // that very business). Other shops get their category's icon tile, or a map of where they are, never a stock picture.
  const sightPhoto = g => (PH.sights[g[0]] || [])[0] || null;
  const realPhoto = s => (PH.byShop?.[s[0]] || [])[0] || null;
  const pimg = k => k && PH.photos[k] ? "img/photos/" + PH.photos[k].file : null;
  const bgOf = (k, fallback, shade = ".3") => k ? `linear-gradient(rgb(0 0 0 / 0), rgb(0 0 0 / ${shade})), url('${pimg(k)}') center/cover, ${fallback}` : fallback;
  const upl = f => (window.SB_CONFIG?.api || "") + "/uploads/" + f;
  const shopImg = s => s[24] ? upl(s[24]) : pimg(realPhoto(s));
  const credit = k => { const p = PH.photos[k]; return p ? `Photo: ${p.by}, ${p.license}` : ""; };

  // ---------- location ----------
  const farFromCity = p => KM(p.lat, p.lon, D().areas[0][2], D().areas[0][3]) > 20;
  function here() {
    const L = SB.prefs.loc;
    // A GPS fix far outside the city (travelling, or a stale fix) would sort everything 40 km away: use the city centre instead.
    if (L.type === "gps" && farFromCity(L)) return { name: D().areas[0][0], lat: D().areas[0][2], lon: D().areas[0][3] };
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
    // "Mughal gardens", "Dal Lake", "nishat bagh": clearly places, even without the word "visit".
    const sights = SBIntent.rankSights(p, D().sights, at()).filter(x => x.m >= 4);
    if (!p.cats.length && sights.length && sights[0].m >= 6) return { type: "sights", p, list: SBIntent.rankSights(p, D().sights, at()).slice(0, 20) };
    const hits = SBIntent.rankShops(p, D().shops, D().categories, at());
    const main = p.cats[0];
    const nMain = hits.filter(h => h.rel >= 3).length;
    const related = (SBIntent.RELATED[main] || p.cats.slice(1, 3)).filter(c => c !== main && SB.catList.includes(c)).slice(0, 3)
      .map(c => ({ c, n: D().shops.filter(s => C(s[3]) === c && dist(s) < 2).length })).filter(x => x.n);
    return { type: "shops", p, main, list: hits, total: main && nMain ? nMain : hits.length, related, sights: sights.slice(0, 6) };
  }

  // ---------- icons & category looks ----------
  const ALIAS = { pin: "map-pin", down: "chevron-down", back: "chevron-left", close: "x", chev: "chevron-right", chat: "message-circle", route: "navigation",
    save: "bookmark", share: "share-2", home: "house", ask: "messages-square", insta: "instagram", shield: "shield-check", bag: "shopping-bag", bowl: "utensils",
    bed: "bed-double", spark: "sparkles", sos: "siren", lang: "languages", sync: "refresh-cw", box: "package" };
  const I = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${SBIcons[ALIAS[n] || n] || SBIcons.store}</svg>`;
  const GROUP_LOOK = { "Food & Drink": ["orange", "utensils"], "Fashion": ["pink", "shirt"], "Kashmiri Crafts": ["red", "palette"], "Groceries": ["green", "shopping-basket"],
    "Health": ["teal", "stethoscope"], "Stay & Travel": ["blue", "bed-double"], "Services": ["slate", "briefcase"], "Home & Hardware": ["brown", "hammer"],
    "Automotive": ["indigo", "car"], "Shopping": ["purple", "shopping-bag"], "Money": ["green", "landmark"], "Electronics": ["cyan", "smartphone"],
    "Beauty & Fitness": ["pink", "scissors"], "Other": ["slate", "store"] };
  const CAT_ICON = { "Bakery & Sweets": "croissant", "Bank": "landmark", "Books & Stationery": "book-open", "Cafe & Tea": "coffee", "Car & Bike Dealer": "car",
    "Carpets & Rugs": "grid-3x3", "Clothing": "shirt", "Coaching & Training": "graduation-cap", "Computers & IT": "laptop", "Cosmetics & Perfume": "spray-can",
    "Dentist": "smile", "Diagnostic Lab": "flask-conical", "Doctor & Clinic": "stethoscope", "Dry Fruits & Saffron": "nut", "Electronics & Appliances": "tv",
    "Events & Photography": "camera", "Fast Food": "sandwich", "Finance & Insurance": "indian-rupee", "Fruit, Veg & Meat": "carrot", "Fuel Station": "fuel",
    "Furniture & Furnishings": "sofa", "Grocery & General Store": "shopping-basket", "Gym & Fitness": "dumbbell", "Handicrafts": "palette", "Hardware & Building": "hammer",
    "Home Services & Repair": "wrench", "Hospital & Nursing Home": "hospital", "Hotel & Guesthouse": "bed-double", "Houseboat": "ship", "Jewellery & Watches": "gem",
    "Mechanic & Parts": "cog", "Mobile Phones": "smartphone", "Optician": "glasses", "Other Business": "briefcase", "Other Shop": "store", "Pharmacy & Medical Store": "pill",
    "Printing & Advertising": "printer", "Professional Services": "briefcase-business", "Real Estate": "building-2", "Restaurant": "utensils-crossed", "Salon & Barber": "scissors",
    "Shawls & Pashmina": "scroll", "Shikara & Boat Ride": "sailboat", "Shoes & Bags": "footprints", "Shopping Centre & Market": "building", "Supermarket": "shopping-cart",
    "Tailor & Boutique": "ruler", "Taxi & Car Rental": "car-taxi-front", "Toys, Sports & Hobbies": "puzzle", "Travel Agent & Tours": "plane", "Uncategorised": "store",
    "Wazwan & Caterers": "chef-hat" };
  const SHORT_CAT = { "Grocery & General Store": "Grocery", "Pharmacy & Medical Store": "Pharmacy", "Hotel & Guesthouse": "Hotels", "Electronics & Appliances": "Electronics",
    "Hospital & Nursing Home": "Hospitals", "Shopping Centre & Market": "Markets", "Professional Services": "Professionals", "Travel Agent & Tours": "Travel agents",
    "Doctor & Clinic": "Doctors", "Restaurant": "Restaurants", "Bakery & Sweets": "Bakeries", "Cafe & Tea": "Cafes", "Salon & Barber": "Salons", "Fast Food": "Fast food",
    "Fruit, Veg & Meat": "Fruit & veg", "Mobile Phones": "Mobiles", "Other Business": "Businesses", "Other Shop": "Other shops", "Home Services & Repair": "Repairs" };
  const look = s => { const g = GROUP_LOOK[G(s[2])] || GROUP_LOOK.Other; return { tint: "t-" + g[0], icon: CAT_ICON[C(s[3])] || g[1] }; };
  let catGroupFor = null, catGroupMap = {};
  const catGroup = ci => { if (catGroupFor !== D()) { catGroupFor = D(); catGroupMap = {}; D().shops.forEach(s => { if (!(s[3] in catGroupMap)) catGroupMap[s[3]] = s[2]; }); } return catGroupMap[ci]; };
  const lookCat = ci => look([0, 0, catGroup(ci), ci]);
  const tile = (s, cls = "") => { const img = shopImg(s); if (img) return `<span class="tile photo ${cls}" style="background-image:url('${esc(img)}')"></span>`;
    const L = look(s); return `<span class="tile ${L.tint} ${cls}">${I(L.icon)}</span>`; };
  const SIGHT_LOOK = { park: ["green", "trees"], garden: ["green", "flower-2"], historic: ["brown", "castle"], attraction: ["teal", "camera"], shrine: ["teal", "moon-star"],
    gallery: ["purple", "image"], museum: ["indigo", "landmark"], lake: ["blue", "waves"], water: ["blue", "waves"], peak: ["slate", "mountain"], market: ["purple", "store"], viewpoint: ["blue", "binoculars"] };
  const sightLook = g => { const L = SIGHT_LOOK[g[1]] || SIGHT_LOOK.attraction; return { tint: "t-" + L[0], icon: L[1] }; };
  const sightTile = (g, cls = "") => { const ph = sightPhoto(g); if (ph) return `<span class="tile photo ${cls}" style="background-image:url('${pimg(ph)}')"></span>`;
    const L = sightLook(g); return `<span class="tile ${L.tint} ${cls}">${I(L.icon)}</span>`; };
  const kindLabel = g => g[1][0].toUpperCase() + g[1].slice(1);

  // Haptic tick on the main actions (no-op in the browser)
  const Hap = SBPlugin("Haptics");
  const buzz = (style = "LIGHT") => { try { Hap?.impact({ style })?.catch?.(() => {}); } catch {} };

  // ---------- small renderers ----------
  const initials = name => { const w = String(name).replace(/^(the|hotel|m\/s)\s+/i, "").split(/\s+/).filter(x => /[a-z0-9]/i.test(x));
    return ((w[0] || "?").match(/[a-z0-9]/i)[0] + ((w[1] || "").match(/[a-z]/i) || [""])[0]).toUpperCase(); };
  const mcol = s => look(s).tint;
  const liveLabel = { open: t("openNow"), closed_today: t("closedToday"), opens_late: t("opensLate"), busy: t("busy") };
  const contact = s => { const tel = s[6] && !s[18] ? s[6] : null; const wa = s[7] || (tel && /^\+91[6-9]/.test(tel) ? tel : null);
    return { tel, wa, dir: `https://www.google.com/maps/dir/?api=1&destination=${s[12]},${s[13]}`, ig: s[9] }; };
  const pretty = p => p ? (/^\+91194\d{7}$/.test(p) ? p.replace(/^\+91(194)(\d{7})$/, "0$1 $2") : p.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2")) : "";
  function tags(s, max = 3) {
    const out = [];
    if (s[21]) out.push(`<span class="badge ${s[21] === "open" ? "ok" : s[21] === "closed_today" ? "bad" : "warn"}"><i class="pulse"></i>${esc(liveLabel[s[21]])}</span>`);
    if (hasDeal(s)) out.push(`<span class="badge deal">${I("tag")}${t("offers")}</span>`);
    if (s[20]) out.push(`<span class="badge brand">${I("badge-check")}Verified</span>`); else if (nSrc(s[16]) >= 2) out.push(`<span class="badge ok">${I("circle-check")}${t("confirmed")}</span>`);
    if (s[7] || (s[6] && /^\+91[6-9]/.test(s[6]) && !s[18])) out.push(`<span class="badge wa">${I("chat")}WhatsApp</span>`);
    if (!s[14]) out.push(`<span class="badge">${I("pin")}Approx. location</span>`);
    return out.slice(0, max).join("");
  }
  const row = s => { const k = contact(s), tg = tags(s);
    return `<div class="item"><button data-shop="${esc(s[0])}">${tile(s)}
      <span style="min-width:0"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))} · ${esc(s[4] || "Srinagar")}</div>${tg ? `<div class="tags">${tg}</div>` : ""}</span></button>
      <span class="rt"><span class="d">${fmtD(dist(s))}</span><button class="call" ${k.tel ? `data-call="${esc(s[0])}"` : 'aria-disabled="true"'} aria-label="${t("call")} ${esc(s[1])}">${I("phone")}</button></span></div>`; };
  const artPhoto = url => `style="background-image:linear-gradient(rgb(0 0 0 / 0) 55%, rgb(0 0 0 / .35)),url('${esc(url)}')"`;
  const hcard = s => { const L = look(s), img = shopImg(s);
    return `<button class="hcard" data-shop="${esc(s[0])}"><div class="art ${img ? "" : L.tint}" ${img ? artPhoto(img) : ""}>${img ? "" : I(L.icon)}<em>${fmtD(dist(s))}</em>${hasDeal(s) ? `<span class="flag">${t("offers")}</span>` : ""}</div>
    <div class="bd"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))}</div></div></button>`; };
  const scard = g => { const ph = sightPhoto(g), L = sightLook(g);
    return `<button class="hcard" data-sight="${D().sights.indexOf(g)}"><div class="art ${ph ? "" : L.tint}" ${ph ? artPhoto(pimg(ph)) : ""}>${ph ? "" : I(L.icon)}<em>${fmtD(KM(here().lat, here().lon, g[2], g[3]))}</em></div>
      <div class="bd"><div class="t">${esc(g[0])}</div><div class="s">${esc(kindLabel(g))}</div></div></button>`; };
  const best = (filter, n, radius = 2.5) => D().shops.filter(filter).map(s => [s, dist(s)]).filter(x => x[1] < radius)
    .sort((a, b) => (b[0][17] + (hasDeal(b[0]) ? 15 : 0) + (b[0][20] ? 10 : 0)) - (a[0][17] + (hasDeal(a[0]) ? 15 : 0) + (a[0][20] ? 10 : 0)) - (a[1] - b[1]) * 12).slice(0, n).map(x => x[0]);
  const hl = (text, q) => { const w = q.trim(); if (w.length < 2) return esc(text); const i = text.toLowerCase().indexOf(w.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + w.length)) + "</mark>" + esc(text.slice(i + w.length)); };
  const offlineBar = () => SB.online ? "" : `<div class="offline">${I("info", "xs")}${t("offline")}</div>`;
  const busy = (btn, on) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.innerHTML; btn.textContent = "Please wait…"; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label; };

  // ---------- shell & navigation ----------
  screen.insertAdjacentHTML("beforeend", `<nav class="nav" aria-label="Main">${[["home", "home", t("home")], ["map", "map", t("map")], ["ask", "ask", t("ask")], ["saved", "save", t("saved")], ["me", "user", t("me")]]
    .map(([k, ic, l]) => `<button data-tab="${k}" aria-current="${k === "home" ? "page" : "false"}"><i>${I(ic)}</i><span>${l}</span></button>`).join("")}</nav>`);
  const tabs = {}; let curTab = "home"; const stack = [];
  function tabRoot(name) { if (!tabs[name]) { const el = document.createElement("div"); el.className = "layer"; el.hidden = true; screen.insertBefore(el, $(".nav", screen)); tabs[name] = el; } return tabs[name]; }
  const topEl = () => stack.length ? stack[stack.length - 1].el : tabs[curTab];
  const Bars = SBPlugin("SystemBars");
  const darkMode = matchMedia("(prefers-color-scheme: dark)");
  function syncBars() {
    if (!Bars) return;
    const top = stack[stack.length - 1];
    const darkHeader = darkMode.matches || $(".onb", screen) || (top ? [shopScreen, sightScreen].includes(top.render) : curTab === "home");
    Bars.setStyle({ style: darkHeader ? "DARK" : "LIGHT" }).catch(() => {});
  }
  function showTab(name) {
    if (name !== curTab) buzz();
    while (stack.length) stack.pop().el.remove();
    curTab = name; Object.entries(tabs).forEach(([k, el]) => { el.hidden = k !== name; el.classList.remove("behind", "unbehind"); });
    const el = tabRoot(name); el.hidden = false; RENDER[name](el);
    el.classList.remove("fadein"); void el.offsetWidth; el.classList.add("fadein");
    document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
    syncBars();
  }
  // Pushed screens slide in from the side while the screen under them eases back, like native navigation.
  function push(render, ...args) {
    const prev = topEl(); if (prev) { prev.classList.remove("unbehind"); prev.classList.add("behind"); }
    const el = document.createElement("div"); el.className = "layer pushed enter"; screen.insertBefore(el, $(".nav", screen));
    el.style.zIndex = 20 + stack.length; stack.push({ el, render, args }); render(el, ...args);
    el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
    syncBars();
    return el;
  }
  function pop() { const top = stack.pop(); if (!top) return false; top.el.classList.add("leave");
    const prev = topEl(); if (prev) { prev.classList.remove("behind"); prev.classList.add("unbehind"); }
    syncBars();
    const done = () => top.el.remove(); if (matchMedia("(prefers-reduced-motion: reduce)").matches) done(); else { top.el.addEventListener("animationend", done, { once: true }); setTimeout(done, 400); } return true; }
  const redrawTop = () => { const top = stack[stack.length - 1]; if (top) { const sc = $(".scroll", top.el)?.scrollTop; top.render(top.el, ...top.args); if ($(".scroll", top.el)) $(".scroll", top.el).scrollTop = sc || 0; } else RENDER[curTab](tabs[curTab]); };
  const rerenderAll = () => { RENDER[curTab](tabs[curTab]); stack.forEach(f => { f.el._detail = null; f.render(f.el, ...f.args); }); };
  let toastT; function toast(msg, icon) { let el = $(".toast", screen); if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); screen.appendChild(el); }
    el.innerHTML = (icon ? I(icon) : "") + `<span>${esc(msg)}</span>`; el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }
  function closeSheet(el) { if (!el.isConnected || el.classList.contains("leave")) return; el.classList.add("leave"); setTimeout(() => el.remove(), 220); }
  function sheet(html, onMount) { const el = document.createElement("div"); el.className = "sheet enter";
    el.innerHTML = `<div class="dim" data-close></div><div class="panel" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div>`;
    screen.appendChild(el); el.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(el); });
    // Drag the handle down to dismiss.
    const panel = $(".panel", el), grab = $(".grab", el); let y0 = null;
    grab.addEventListener("pointerdown", e => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); panel.style.transition = "none"; });
    grab.addEventListener("pointermove", e => { if (y0 !== null) panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    const end = e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; panel.style.transition = "transform .2s"; if (dy > 80) closeSheet(el); else panel.style.transform = ""; };
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
    onMount && onMount(el); return el; }
  // Top bars get a hairline once content scrolls under them.
  screen.addEventListener("scroll", e => { const sc = e.target; if (!sc.classList?.contains("scroll")) return;
    const bar = sc.parentElement && [...sc.parentElement.children].find(c => c.classList.contains("bar") || c.classList.contains("searchbar")); if (bar) bar.classList.toggle("lifted", sc.scrollTop > 4); }, true);
  SB.on(w => { if (w === "data" || w === "online") rerenderAll(); });

  function pickArea() {
    sheet(`<h3>${t("yourArea")}</h3><p class="sub">Shops are sorted by distance from here.</p>
      <div class="menu" style="margin-bottom:12px"><button id="gps"><span class="tile sm t-blue">${I("locate-fixed")}</span><span>${t("useGps")}<small id="gpsnote">Uses your phone's location</small></span>${I("chev", "sm flip")}</button></div>
      <div class="pad" style="padding-bottom:6px"><div class="field">${I("search", "sm")}<input id="areaq" placeholder="${t("searchArea")}" autocomplete="off"></div></div>
      <div class="scroll arealist" id="arealist"></div>`, el => {
      const draw = q => $("#arealist", el).innerHTML = D().areas.map((a, i) => [a, i]).filter(([a]) => a[0].toLowerCase().replace(/\s+/g, "").includes(q.toLowerCase().replace(/\s+/g, "")))
        .map(([a, i]) => `<button data-area="${i}" aria-current="${SB.prefs.loc.type === "area" && i === SB.prefs.loc.idx}"><span>${esc(a[0])}</span><small>${a[1].toLocaleString("en-IN")} shops</small></button>`).join("");
      draw(""); $("#areaq", el).addEventListener("input", e => draw(e.target.value));
      $("#gps", el).onclick = async () => { $("#gpsnote", el).textContent = "Finding you…";
        try { const p = await SB.position(); SB.prefs.loc = { type: "gps", lat: p.lat, lon: p.lon }; SB.savePrefs(); closeSheet(el); buzz();
          toast(farFromCity(p) ? `You seem to be outside Srinagar, so we're showing places from ${here().name}` : "Showing places near you", "locate-fixed"); rerenderAll(); }
        catch (e) { $("#gpsnote", el).textContent = "Uses your phone's location"; toast(e.message || "Couldn't get your location"); } };
      el.addEventListener("click", e => { const b = e.target.closest("[data-area]"); if (!b) return; SB.prefs.loc = { type: "area", idx: +b.dataset.area }; SB.savePrefs(); closeSheet(el); buzz(); toast(`Showing places near ${here().name}`, "pin"); rerenderAll(); });
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
  RENDER.home = el => {
    const SHOPPY = ["Food & Drink", "Fashion", "Kashmiri Crafts", "Groceries", "Shopping", "Beauty & Fitness", "Electronics"].map(gIdx);
    const near = best(s => SHOPPY.includes(s[2]) && s[14] && (nSrc(s[16]) >= 2 || (s[6] && !s[18]) || s[20]), 10);
    const deals = best(s => hasDeal(s), 10, 5);
    const famous = D().sights.filter(g => g[4] >= 2).map(g => [g, KM(here().lat, here().lon, g[2], g[3]) + (sightPhoto(g) ? 0 : 6)]).sort((a, b) => a[1] - b[1]).slice(0, 8).map(x => x[0]);
    const counts = {}; D().shops.forEach(s => { if (dist(s) < 3) counts[s[3]] = (counts[s[3]] || 0) + 1; });
    const topCats = Object.entries(counts).filter(([c]) => !/^(Uncategorised|Other)/.test(C(c))).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const h = new Date().getHours(); const hi = h < 12 ? t("morning") : h < 17 ? t("afternoon") : t("evening");
    const HEROS = ["dal-lake-4", "nishat-bagh-0", "houseboat-2", "shalimar-bagh-3", "nigeen-lake-1", "zero-bridge-1", "shikara-boat-ride-3", "parimahal-3"];
    const day = Math.floor((Date.now() + 19800000) / 864e5), heroK = HEROS[day % HEROS.length];
    const np = SBToday.nextPrayer();
    const more = label => `<button data-q="${label}">${t("seeAll")}${I("chev", "xs flip")}</button>`;
    el.innerHTML = `<div class="scroll">${offlineBar()}<div class="band safe-top" style="background:linear-gradient(180deg, rgb(4 30 34 / .6) 0%, rgb(4 30 34 / .28) 40%, rgb(4 30 34 / .82) 100%), url('${pimg(heroK)}') center 45% / cover, var(--brand-2)">
      <div class="toprow"><button class="loc" data-area-pick>${I("pin", "xs")}<span>${esc(here().name)}</span>${I("down", "xs")}</button>
        <button class="today" data-today aria-label="Today in Srinagar"><span id="wx"></span><i></i><span>${I("moon-star", "xs")}${np.name} ${SBToday.fmt(np.at)}</span></button></div>
      <div class="hello"><small>${hi}</small>${t("lookingFor")}</div>
      <button class="searchbox" data-search>${I("search", "sm")}${t("searchPh")}</button>
      <div class="intents">
        <button class="intent" data-searchq="I want to buy ">${I("bag")}<span>${t("buy")}</span></button>
        <button class="intent" data-q="where to eat">${I("utensils")}<span>${t("eat")}</span></button>
        <button class="intent" data-q="places to visit">${I("camera")}<span>${t("visit")}</span></button>
        <button class="intent" data-q="hotel">${I("bed")}<span>${t("stay")}</span></button>
      </div></div>
      <div class="home-body pad">
      <div class="sec"><h2>Explore Srinagar</h2></div>
      <div class="hrow"><button class="coll" data-go="tourist" style="background:${bgOf("shikara-boat-ride-3", "var(--brand)", ".75")}"><b>First time here?</b><span>A day plan, fair prices, safety</span></button>
        ${COLLECTIONS.map(([title, sub, q, ph]) => `<button class="coll" data-q="${esc(q)}" style="background:${bgOf(ph, "var(--brand)", ".75")}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>`).join("")}</div>
      ${deals.length ? `<div class="sec"><h2>${t("offersNear")}</h2></div><div class="hrow">${deals.map(hcard).join("")}</div>` : ""}
      <div class="sec"><h2>${t("popular")}</h2>${more("shops near me")}</div>
      <div class="hrow">${near.map(hcard).join("")}</div>
      <div class="sec"><h2>${t("catsNear")}</h2></div>
      <div class="cats">${topCats.map(([c]) => { const L = lookCat(+c); return `<button class="cat" data-q="${esc(C(c))}"><span class="tile ${L.tint}">${I(L.icon)}</span><span>${esc(SHORT_CAT[C(c)] || C(c))}</span></button>`; }).join("")}
        <button class="cat" data-cats><span class="tile t-slate">${I("grid-3x3")}</span><span>All categories</span></button></div>
      <div class="sec"><h2>${t("placesToVisit")}</h2>${more("places to visit")}</div>
      <div class="hrow">${famous.map(scard).join("")}</div>
      <div class="invite"><h3>${t("missingTitle")}</h3><p>${t("missingSub")}</p><button class="btn sm" data-add>${I("plus", "sm")}${t("addShop")}</button></div>
      <div class="foot"><b>${D().shops.length.toLocaleString("en-IN")}</b> businesses · <b>${D().areas.length}</b> areas · works offline<br>Photo: ${esc(PH.photos[heroK]?.by || "")}</div>
      <div style="height:12px"></div></div></div>`;
    SBToday.weather().then(w => { const x = $("#wx", el); if (w && x) x.innerHTML = `${I(w.icon, "xs")}${w.temp}°`; });
  };
  const COLLECTIONS = [
    ["Wazwan", "Rista, rogan josh, goshtaba", "wazwan", "wazwan-caterers-3"], ["Bakeries", "Girda, kulcha, bakarkhani", "bakery", "bakery-sweets-0"],
    ["Houseboats", "Stay on Dal and Nigeen", "houseboat", "houseboat-2"], ["Pashmina", "Shawls straight from makers", "pashmina shawl", "shawls-pashmina-0"],
    ["Mughal gardens", "Nishat, Shalimar, Cheshma", "mughal gardens", "nishat-bagh-0"], ["Cafes", "Kahwa, coffee and cake", "cafe", "cafe-tea-3"],
    ["Saffron & dry fruits", "Pampore saffron, walnuts", "saffron", "dry-fruits-saffron-0"],
    ["Kebabs & street food", "Khayam, Lal Chowk, Nowhatta", "kebab", "fast-food-0"], ["Crafts", "Papier-mâché, walnut wood, carpets", "handicrafts", "handicrafts-4"],
  ];
  const PRAYER_ICON = { Fajr: "moon-star", Sunrise: "sunrise", Dhuhr: "sun", Asr: "cloud-sun", Maghrib: "sunset", Isha: "moon" };
  function todaySheet() {
    const now = new Date(), np = SBToday.nextPrayer(now);
    sheet(`<h3>Today in Srinagar</h3><p class="sub">${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      <div id="wxbig" class="wxbig"></div>
      <div class="label" style="padding-top:12px">Namaz times</div>
      <div class="list-card prayers">${SBToday.prayers(now).map(p => `<div class="lrow${p.name === np.name && p.at.getDate() === np.at.getDate() ? " next" : ""}"><span>${I(PRAYER_ICON[p.name])}${p.name}</span><b>${SBToday.fmt(p.at)}</b></div>`).join("")}</div>
      <p class="note pad" style="margin:12px 0 4px">Calculated for Srinagar (18°, Hanafi Asr). Your masjid's times can differ by a few minutes.</p><div class="form" style="padding-top:12px"><button class="btn tonal" data-close>Done</button></div>`, async el => {
      const w = await SBToday.weather(); const b = $("#wxbig", el);
      if (b) b.innerHTML = w ? `${I(w.icon)}<span class="big">${w.temp}°</span><span><b>${esc(w.text)}</b><br><small>High ${w.hi}° · Low ${w.lo}°</small></span>` : `<span class="muted">Weather needs internet</span>`;
    });
  }
  function catsSheet() {
    const byG = {}; SB.catList.forEach(c => { const ci = D().categories.indexOf(c); const g = G(catGroup(ci)); (byG[g] ||= []).push(ci); });
    sheet(`<h3>All categories</h3><div class="scroll" style="padding-bottom:12px">${Object.entries(byG).sort((a, b) => a[0].localeCompare(b[0])).map(([g, cs]) => `<div class="grouplabel">${esc(g)}</div>
      <div class="menu">${cs.sort((a, b) => C(a).localeCompare(C(b))).map(ci => { const L = lookCat(ci); return `<button data-q="${esc(C(ci))}" data-close><span class="tile sm ${L.tint}">${I(L.icon)}</span><span>${esc(C(ci))}</span>${I("chev", "sm flip")}</button>`; }).join("")}</div>`).join("")}</div>`);
  }

  function searchScreen(el, initial = "") {
    el.innerHTML = `<div class="searchbar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button>
      <form class="field" id="sf">${I("search", "sm")}<input name="q" value="${esc(initial)}" placeholder="Try: I want to buy bread" aria-label="Search" autocomplete="off" enterkeyhint="search"></form></div>
      <div class="scroll" id="sbody"></div>`;
    const inp = $("input", el), body = $("#sbody", el);
    const li = (attr, lead, title, sub, end = "") => `<li><button ${attr}>${lead}<span style="min-width:0"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}</span><span class="n">${end}</span></button></li>`;
    const draw = () => {
      const q = inp.value.trim();
      if (!q) {
        body.innerHTML = `${SB.recent.length ? `<div class="label">Recent</div><ul class="sugg">${SB.recent.map(r => li(`data-q="${esc(r)}"`, `<span class="g">${I("clock", "sm")}</span>`, esc(r))).join("")}</ul>` : ""}
          <div class="label">Try asking</div><ul class="sugg">${EXAMPLES.map(r => li(`data-q="${esc(r)}"`, `<span class="g b">${I("spark", "sm")}</span>`, esc(r))).join("")}</ul><div style="height:24px"></div>`;
        return;
      }
      const r = ask(q); const out = [];
      if (r.type === "shops" && r.main) out.push(li(`data-q="${esc(q)}"`, `<span class="g b">${I("spark", "sm")}</span>`, esc(r.main), `Nearest to ${esc(here().name)} first`, r.total));
      if (r.type === "shops" && r.sights?.length) out.push(li(`data-sight="${D().sights.indexOf(r.sights[0].g)}"`, sightTile(r.sights[0].g, "sm"), esc(r.sights[0].g[0]), "Place to visit", fmtD(r.sights[0].d)));
      if (r.type === "sights" && r.list.length) out.push(li(`data-q="${esc(q)}"`, `<span class="g b">${I("camera", "sm")}</span>`, "Places to visit", esc(r.list.slice(0, 3).map(x => x.g[0]).join(", ")), r.list.length));
      const ql = q.toLowerCase();
      SB.catList.filter(c => c.toLowerCase().includes(ql) && c !== r.main).slice(0, 3).forEach(c => { const L = lookCat(D().categories.indexOf(c)); out.push(li(`data-q="${esc(c)}"`, `<span class="tile sm ${L.tint}">${I(L.icon)}</span>`, hl(c, q), "Category")); });
      D().shops.filter(s => s[1].toLowerCase().includes(ql)).map(s => [s, dist(s)]).sort((a, b) => a[1] - b[1]).slice(0, 6)
        .forEach(([s, d]) => out.push(li(`data-shop="${esc(s[0])}"`, tile(s, "sm"), hl(s[1], q), `${esc(C(s[3]))} · ${esc(s[4] || "Srinagar")}`, fmtD(d))));
      D().sights.filter(g => g[0].toLowerCase().includes(ql)).slice(0, 2).forEach(g => out.push(li(`data-sight="${D().sights.indexOf(g)}"`, sightTile(g, "sm"), hl(g[0], q), esc(kindLabel(g)))));
      body.innerHTML = out.length ? `<div style="height:8px"></div><ul class="sugg">${out.join("")}</ul><div style="height:24px"></div>`
        : `<div class="empty"><div class="art">${I("search")}</div><h3>No match yet</h3><p>Press search to look through shops' stock lists too, or add the shop you know.</p></div>`;
    };
    let tm; inp.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(draw, 90); });
    $("#sf", el).addEventListener("submit", e => { e.preventDefault(); const q = inp.value.trim(); if (q) { SB.remember(q); pop(); setTimeout(() => push(resultsScreen, q), 10); } });
    draw(); setTimeout(() => inp.focus({ preventScroll: true }), 300);
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
    const chip = (k, label, icon) => `<button class="chip" data-f="${k}" aria-pressed="${f[k]}">${I(f[k] ? "check" : icon)}${label}</button>`;
    el.innerHTML = `<div class="searchbar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button>
      <button class="pillq" data-search="${esc(q)}">${I("search", "sm")}<span>${esc(q)}</span></button></div>
      <div class="filters"><div class="chips">${chip("near", t("within1"), "route")}${chip("deal", t("offers"), "tag")}${chip("phone", t("hasPhone"), "phone")}${chip("sure", t("confirmed"), "badge-check")}${chip("exact", t("exact"), "pin")}</div></div>
      <div class="scroll">${offlineBar()}
      <div class="count"><span><b>${list.length.toLocaleString("en-IN")}</b> ${r.main ? esc(SBIntent.plural(r.main)) : "results"} near ${esc(here().name)}</span>
        <select data-sort aria-label="Sort"><option value="near"${f.sort === "near" ? " selected" : ""}>${t("nearest")}</option><option value="best"${f.sort === "best" ? " selected" : ""}>${t("complete")}</option></select></div>
      ${r.sights?.length && !opts.limit ? `<div class="pad"><div class="sec" style="margin-top:4px"><h2>${t("placesToVisit")}</h2></div><div class="hrow">${r.sights.map(x => scard(x.g)).join("")}</div></div>` : ""}
      <div id="stock"></div>
      ${list.length ? `<div class="rows">${list.slice(0, limit).map(row).join("")}</div>
        ${list.length > limit ? `<div class="more"><button class="btn ghost" data-more>Show more</button></div>` : ""}
        ${r.related?.length ? `<div class="label">People also look for</div><div class="pad"><div class="chips">${r.related.map(x => { const L = lookCat(D().categories.indexOf(x.c)); return `<button class="chip" data-q="${esc(x.c)}">${I(L.icon)}${esc(x.c)}</button>`; }).join("")}</div></div>` : ""}
        <div style="height:96px"></div>`
      : `<div class="empty"><div class="art">${I("search")}</div><h3>Nothing listed yet</h3><p>We couldn't find "${esc(q)}" near ${esc(here().name)}. Ask nearby shops, or add a shop you know.</p>
         <div style="display:grid;gap:10px;margin-top:20px;width:100%;max-width:300px"><button class="btn" data-askq="${esc(q)}">${I("ask", "sm")}Ask nearby shops</button><button class="btn ghost" data-add>${t("addShop")}</button></div></div>`}
      </div>${list.length ? `<button class="fab" data-mapof="${esc(q)}">${I("map", "sm")}${t("map")}</button>` : ""}`;
    el.onclick = e => { const b = e.target.closest("[data-f],[data-more]"); if (!b) return; e.stopPropagation(); buzz();
      if (b.dataset.f) f[b.dataset.f] = !f[b.dataset.f]; const lim = b.hasAttribute("data-more") ? limit + 30 : 30;
      const sc = $(".scroll", el).scrollTop; resultsScreen(el, q, { f, limit: lim }); if (b.hasAttribute("data-more")) $(".scroll", el).scrollTop = sc; };
    el.onchange = e => { if (e.target.matches("[data-sort]")) { f.sort = e.target.value; resultsScreen(el, q, { f }); } };
    // Products in shops' stock lists (needs internet)
    if (SB.online && q.length >= 3 && !opts.limit) SB.api("GET", "/v1/products?q=" + encodeURIComponent(r.p.item || q)).then(res => {
      const items = res.items.filter(i => SB.byId.has(i.shop_id)).slice(0, 6);
      if (!items.length || !el.isConnected) return;
      $("#stock", el).innerHTML = `<div class="label" style="padding-top:6px">In shops' stock lists</div><div class="rows" style="margin-bottom:18px">${items.map(i => { const s = SB.byId.get(i.shop_id);
        return `<div class="item"><button data-shop="${esc(i.shop_id)}">${tile(s)}<span style="min-width:0"><div class="t">${esc(i.name)}</div><div class="s">${esc(i.shop_name)} · ${fmtD(KM(here().lat, here().lon, i.lat, i.lon))}</div>
          <div class="tags">${i.in_stock ? `<span class="badge ok">${I("check")}In stock</span>` : `<span class="badge">Out of stock</span>`}</div></span></button><span class="rt"><span class="d">${esc(i.price || "")}</span></span></div>`; }).join("")}</div>`;
    }).catch(() => {});
  }

  function sightsList(el, q, r) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("placesToVisit")}</h1></div>
      <div class="scroll"><div class="count"><span><b>${r.list.length}</b> ${r.p.item ? "matching “" + esc(r.p.item) + "”" : "best-known sights"} near ${esc(here().name)}</span></div>
      <div class="rows">${r.list.map(x => `<div class="item"><button data-sight="${D().sights.indexOf(x.g)}">${sightTile(x.g)}
        <span style="min-width:0"><div class="t">${esc(x.g[0])}</div><div class="s">${esc(kindLabel(x.g))}</div></span></button>
        <span class="rt"><span class="d">${fmtD(x.d)}</span></span></div>`).join("")}</div><div style="height:30px"></div></div>`;
  }

  // Small static map (offline basemap) used as the hero for shops without a photo, and under photos for location.
  function baseLayers(rr, win) {
    if (!basemap._bb) basemap._bb = { w: basemap.water.map(([, c]) => bboxOf(c)), r: basemap.roads.map(([, c]) => bboxOf(c)) };
    const hit = bb => !win || !(bb[0] > win[2] || bb[2] < win[0] || bb[1] > win[3] || bb[3] < win[1]);
    const ls = [], wc = tok("--water");
    basemap.water.forEach(([area, c], i) => { if (!hit(basemap._bb.w[i])) return; const ll = c.map(([x, y]) => [y, x]);
      ls.push(area ? L.polygon(ll, { renderer: rr, interactive: false, stroke: false, fillColor: wc, fillOpacity: 1 }) : L.polyline(ll, { renderer: rr, interactive: false, color: wc, weight: 4 })); });
    const roads = basemap.roads.map((r, i) => [r, i]).filter(([, i]) => hit(basemap._bb.r[i])).map(([r]) => r).sort((x, y) => y[0] - x[0]);
    roads.forEach(([k, c]) => ls.push(L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: tok("--road-edge"), weight: [7, 5.5, 4, 2.6][k] })));
    roads.forEach(([k, c]) => ls.push(L.polyline(c.map(([x, y]) => [y, x]), { renderer: rr, interactive: false, color: k < 2 ? tok("--road-major") : tok("--road"), weight: [5, 3.8, 2.6, 1.6][k] })));
    return ls;
  }
  const bboxOf = c => c.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
  async function staticMap(node, lat, lon, lk, shift = -12) {
    if (!node) return;
    if (!basemap) basemap = await fetch("data/basemap.json").then(r => r.json());
    if (!node.isConnected || node._map) return;
    const m = L.map(node, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, preferCanvas: true })
      .setView([lat, lon], 16);
    node._map = m;
    L.layerGroup(baseLayers(L.canvas({ padding: .3 }), [lon - .02, lat - .015, lon + .02, lat + .015])).addTo(m);
    L.marker([lat, lon], { interactive: false, icon: L.divIcon({ className: "", html: `<div class="pin ${lk.tint}">${I(lk.icon)}</div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(m);
    if (shift) m.panBy([0, shift], { animate: false });
  }

  function shopScreen(el, id) {
    const s = SB.byId.get(id); if (!s) { el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button></div><div class="empty"><div class="art">${I("store")}</div><h3>Shop not found</h3><p>It may have closed or been removed.</p></div>`; return; }
    const k = contact(s), saved = SB.saved.includes(id), Lk = look(s);
    const similar = D().shops.filter(o => o !== s && o[3] === s[3]).map(o => [o, KM(s[12], s[13], o[12], o[13])]).filter(x => x[1] < 1.2).sort((a, b) => a[1] - b[1]).slice(0, 6).map(x => x[0]);
    const isMine = (SB.myShops || []).some(m => m.id === id);
    const det = el._detail, own = det?.photos?.length;
    const img = own ? (window.SB_CONFIG?.api || "") + det.photos[0].url : shopImg(s), cap = !own && !s[24] && realPhoto(s) ? credit(realPhoto(s)) : "";
    const act = (attr, icon, label, on, cls = "") => `<button class="act ${cls}" ${on ? attr : 'aria-disabled="true"'}>${I(icon, "sm")}${label}</button>`;
    const r = (icon, v, sub, end = "") => `<div class="r"><span class="tile sm t-slate">${I(icon)}</span><span class="v">${v}${sub ? `<small>${sub}</small>` : ""}</span>${end}</div>`;
    const mi = (attr, tint, icon, label, sub) => `<button ${attr}><span class="tile sm ${tint}">${I(icon)}</span><span>${label}${sub ? `<small>${sub}</small>` : ""}</span>${I("chev", "sm flip")}</button>`;
    const n = nSrc(s[16]);
    el.innerHTML = `<div class="scroll">
      <div class="hero ${img ? "" : Lk.tint}" ${img ? `style="background-image:linear-gradient(rgb(0 0 0 / .1), rgb(0 0 0 / .25)),url('${esc(img)}')"` : ""}>${img ? "" : `<div class="mapel" id="heromap"></div>`}
        <div class="hb"><button class="glass" data-back aria-label="Back">${I("back", "flip")}</button>
          <div><button class="glass" data-share="${esc(id)}" aria-label="${t("share")}">${I("share", "sm")}</button><button class="glass" data-save="${esc(id)}" aria-label="${saved ? "Remove from saved" : t("save")}" aria-pressed="${saved}">${I("save", "sm")}</button></div></div>
        <button class="addphoto" data-addphoto="${esc(id)}">${I("camera", "xs")}${img ? "Add photo" : "Add the first photo"}</button>
        ${cap ? `<span class="cap">${esc(cap)}</span>` : ""}</div>
      <div class="dcard"><h1>${esc(s[1])}</h1>
        <div class="dmeta"><span class="tile xs ${Lk.tint}">${I(Lk.icon)}</span><span>${esc(C(s[3]))}</span><span class="dotsep"></span><span>${esc(s[4] || "Srinagar")}</span><span class="dotsep"></span><span>${fmtD(dist(s))}</span></div>
        ${tags(s, 5) ? `<div class="tags">${tags(s, 5)}</div>` : ""}
        ${s[21] && det?.live_note ? `<p class="note" style="margin-top:8px">“${esc(det.live_note)}”</p>` : ""}
        <div class="actionbar">${act(`data-call="${esc(id)}"`, "phone", t("call"), !!k.tel, "primary")}${act(`data-wa="${esc(id)}"`, "chat", "WhatsApp", !!k.wa, "wa")}${act(`data-dir="${esc(id)}"`, "route", "Directions", true)}</div></div>
      ${offlineBar()}
      ${det?.deals?.length ? det.deals.map(d => `<div class="offer">${I("tag")}<div><b>${esc(d.title)}</b><span>${esc(d.details || "")}${d.details ? " · " : ""}until ${new Date(d.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div></div>`).join("")
        : hasDeal(s) ? `<div class="offer">${I("tag")}<div><b>Offer running</b><span>Connect to the internet to see the details</span></div></div>` : ""}
      <div class="label">Details</div>
      <div class="info">
        ${k.tel ? r("phone", `<span class="selectable">${esc(pretty(k.tel))}</span>`, /^\+91[6-9]/.test(k.tel) ? "Mobile" : "Landline", `<button class="call" data-copy="${esc(k.tel)}" aria-label="Copy number">${I("copy")}</button>`) : ""}
        ${s[6] && s[18] ? r("phone", esc(pretty(s[6])), "Head office number, not this branch") : ""}
        ${r("pin", `<span class="selectable">${esc(s[11] || (s[4] ? s[4] + ", Srinagar" : "Srinagar"))}${s[19] ? " " + esc(s[19]) : ""}</span>`, s[14] ? "Exact location" : "Approximate: only the area is known", `<button class="call" data-dir="${esc(id)}" aria-label="Directions">${I("route")}</button>`)}
        ${s[15] ? r("clock", esc(s[15]), "Opening hours") : ""}
        ${s[9] ? r("insta", `<button class="link" data-ext="${esc(s[9])}">${esc(s[9].replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, ""))}</button>`, "Instagram") : ""}
        ${s[8] ? r("globe", `<button class="link" data-ext="${esc(s[8])}">${esc(s[8].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 36))}</button>`, "Website") : ""}
      </div>
      ${img ? `<div class="label">Location</div><div class="minimap"><div class="mapel" id="locmap"></div><div class="go"><button class="btn sm" data-dir="${esc(id)}">${I("route", "sm")}Directions</button></div></div>` : ""}
      ${det?.photos?.length > 1 ? `<div class="label">Photos</div><div class="photos">${det.photos.slice(1).map(p => `<img src="${esc((window.SB_CONFIG?.api || "") + p.url)}" alt="" loading="lazy">`).join("")}</div>` : ""}
      ${det?.prices?.length ? `<div class="label">Bazaar rates from the owner</div><div class="list-card">${det.prices.map(p => `<div class="lrow"><span>${esc(p.item)}</span><b>${esc(p.price)}</b></div>`).join("")}</div>` : ""}
      ${det?.products?.length ? `<div class="label">In stock (${det.products.length})</div><div class="list-card">${det.products.slice(0, 12).map(p => `<div class="lrow"><span>${esc(p.name)}${p.in_stock ? "" : ' <span class="muted">· out of stock</span>'}</span><b>${esc(p.price || "")}</b></div>`).join("")}</div>` : ""}
      ${similar.length ? `<div class="pad"><div class="sec"><h2>Similar nearby</h2></div><div class="hrow">${similar.map(hcard).join("")}</div></div>` : ""}
      ${isMine ? `<div class="callout brand"><span class="tile sm">${I("store")}</span><div><b>This is your shop</b><p>Update today's status, offers, prices and stock, and see your visits.</p><button class="btn sm" data-dash="${esc(id)}">Open dashboard</button></div></div>`
        : s[23] ? "" : `<div class="callout brand"><span class="tile sm">${I("store")}</span><div><b>Own this business?</b><p>Claim it free with a code sent to the shop's phone. Add photos, hours and offers, and see how many people called.</p><button class="btn sm" data-claim="${esc(id)}">Claim this business</button></div></div>`}
      <div class="label">Help keep this right</div>
      <div class="menu">${mi(`data-addphoto="${esc(id)}"`, "t-purple", "image-plus", "Add a photo", "+3 Champion points")}${mi(`data-confirm="${esc(id)}"`, "t-green", "circle-check", "It's still here", "Confirm while you're there, +1 point")}
        ${mi(`data-edit="${esc(id)}"`, "t-blue", "pencil", "Suggest an edit", "Wrong number, name or hours")}${mi(`data-closed="${esc(id)}"`, "t-red", "flag", "Report closed")}</div>
      <div class="trust">${I("shield", "xs")}${s[20] ? "Verified" + (s[23] ? " by the owner" : " by visitors") : n >= 2 ? `Listed by ${n} independent sources` : "From one source. Help confirm it."}</div>
      <div style="height:28px"></div></div>`;
    if (!img) staticMap($("#heromap", el), s[12], s[13], Lk); else staticMap($("#locmap", el), s[12], s[13], Lk, 0);
    if (!el._detail && SB.online) SB.api("GET", "/v1/shops/" + encodeURIComponent(id)).then(d => {
      el._detail = d; const i = D().shops.findIndex(x => x[0] === id); if (i >= 0) { D().shops[i] = d.row; SB.byId.set(id, d.row); }
      if (el.isConnected) { const sc = $(".scroll", el).scrollTop; shopScreen(el, id); $(".scroll", el).scrollTop = sc; }
    }).catch(() => { el._detail = {}; });
  }

  function sightScreen(el, idx) {
    const g = D().sights[idx], Lk = sightLook(g);
    const near = D().shops.map(s => ({ s, d: KM(g[2], g[3], s[12], s[13]) })).filter(x => x.d < 0.8 && [gIdx("Food & Drink"), gIdx("Kashmiri Crafts")].includes(x.s[2])).sort((a, b) => a.d - b.d);
    const others = D().sights.filter(o => o !== g && o[4] >= 1).map(o => [o, KM(g[2], g[3], o[2], o[3])]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(x => x[0]);
    const ph = sightPhoto(g);
    el.innerHTML = `<div class="scroll"><div class="hero ${ph ? "" : Lk.tint}" ${ph ? `style="background-image:linear-gradient(rgb(0 0 0 / .1), rgb(0 0 0 / .25)),url('${pimg(ph)}')"` : ""}>${ph ? "" : `<div class="mapel" id="heromap"></div>`}
      <div class="hb"><button class="glass" data-back aria-label="Back">${I("back", "flip")}</button><span></span></div>${ph ? `<span class="cap" style="inset-inline-start:14px;inset-inline-end:auto;max-width:80%">${esc(credit(ph))}</span>` : ""}</div>
      <div class="dcard"><h1>${esc(g[0])}</h1>
        <div class="dmeta"><span class="tile xs ${Lk.tint}">${I(Lk.icon)}</span><span>${esc(kindLabel(g))}</span><span class="dotsep"></span><span>${fmtD(KM(here().lat, here().lon, g[2], g[3]))} from ${esc(here().name)}</span></div>
        <div class="actionbar" style="grid-template-columns:1fr"><button class="act primary" data-ext="https://www.google.com/maps/dir/?api=1&destination=${g[2]},${g[3]}">${I("route", "sm")}Get directions</button></div></div>
      <div class="label">Eat and shop within 800 m</div>
      ${near.length ? `<div class="rows">${near.slice(0, 10).map(x => row(x.s)).join("")}</div>` : `<p class="pad note">Nothing listed nearby yet.</p>`}
      <div class="pad"><div class="sec"><h2>Also worth seeing</h2></div><div class="hrow">${others.map(scard).join("")}</div></div><div style="height:30px"></div></div>`;
    if (!ph) staticMap($("#heromap", el), g[2], g[3], Lk);
  }

  // ---------- map ----------
  const mapState = { q: null, list: [], markers: [] };
  let MAP = null, baseLayer = null, pinLayer = null, basemap = null;
  RENDER.map = el => {
    if (!el.dataset.init) {
      el.dataset.init = 1;
      el.innerHTML = `<div class="mapwrap"><div class="mapel" id="map" role="application" aria-label="Map of shops"></div>
        <div class="mapTop"><button class="searchbox" data-search>${I("search", "sm")}Search this area</button>
        <div class="chips">${[["Offers", "__deals", "tag"], ["Bakeries", "bread", "croissant"], ["Chemists", "dawai", "pill"], ["Restaurants", "restaurant", "utensils-crossed"], ["Cafes", "cafe", "coffee"],
          ["Pashmina", "pashmina", "scroll"], ["Hotels", "hotel", "bed-double"], ["Mobiles", "mobile", "smartphone"]]
          .map(([c, q, ic]) => `<button class="chip" data-mq="${q}" aria-pressed="false">${I(ic)}${c}</button>`).join("")}</div></div>
        <button class="mapfab" data-locate aria-label="Back to ${esc(here().name)}">${I("locate-fixed")}</button>
        <div class="carousel" id="carousel"></div></div>`;
      el.addEventListener("click", e => { const b = e.target.closest("[data-mq]"); if (!b) return; e.stopPropagation(); buzz(); const on = b.getAttribute("aria-pressed") !== "true";
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
      const c = $("#carousel"), w = (c.firstElementChild?.offsetWidth || 290) + 10, i = Math.round(Math.abs(c.scrollLeft) / w); highlight(i, true); }, 120); });
  }
  function paintBase() {
    if (!MAP || !basemap) return; if (baseLayer) baseLayer.remove();
    baseLayer = L.layerGroup(baseLayers(L.canvas({ padding: .4 }))).addTo(MAP);
  }
  function mapShow(q) {
    if (!MAP) return;
    mapState.q = q;
    const list = q === "__deals" ? best(hasDeal, 25, 8) : q ? ask(q).list?.map(x => x.s).slice(0, 25) || [] :
      best(s => ["Food & Drink", "Fashion", "Kashmiri Crafts", "Groceries", "Shopping"].map(gIdx).includes(s[2]) && s[14], 25);
    mapState.list = list;
    if (pinLayer) pinLayer.remove();
    const me = L.marker([here().lat, here().lon], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18] }), interactive: false });
    mapState.markers = list.map((s, i) => { const lk = look(s); return L.marker([s[12], s[13]], { icon: L.divIcon({ className: "", html: `<div class="pin ${lk.tint}">${I(lk.icon)}</div>`, iconSize: [34, 34], iconAnchor: [17, 34] }) })
      .on("click", () => { buzz(); highlight(i); const c = $("#carousel"); c.children[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }); });
    pinLayer = L.layerGroup([me, ...mapState.markers]).addTo(MAP);
    $("#carousel").innerHTML = list.map(s => `<button class="mcard" data-shop="${esc(s[0])}">${tile(s)}<span style="min-width:0"><div class="t">${esc(s[1])}</div><div class="s">${esc(C(s[3]))} · ${fmtD(dist(s))}</div><div class="tags">${tags(s, 2)}</div></span></button>`).join("");
    $("#carousel").scrollLeft = 0;
    if (list.length) MAP.fitBounds(L.latLngBounds(list.map(s => [s[12], s[13]]).concat([[here().lat, here().lon]])).pad(.2), { paddingTopLeft: [0, 120], paddingBottomRight: [0, 120], maxZoom: 16 });
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
    el.innerHTML = `<div class="scroll">${offlineBar()}<div class="pagehead"><div><h1>${t("askTitle")}</h1><p>${t("askSub")}</p></div></div>
      <form id="askf"><div class="askcard"><textarea id="askq" class="input" aria-label="${t("askWhat")}" placeholder="What do you need? e.g. 32-inch LED TV in stock today, under 15,000">${esc(prefill)}</textarea>
        <button type="button" class="near" data-area-pick><span>${I("pin", "sm")}Near <b>${esc(here().name)}</b></span>${I("down", "sm")}</button></div>
        <div class="reach">${I("users", "sm")}<span id="askn"></span></div>
        <div class="pad" style="margin-top:16px"><button class="btn" type="submit">${I("send", "sm")}${t("send")}</button></div></form>
      <div id="askres"></div><div id="mine"></div>
      <div class="label">How it works</div>
      <div class="how"><div><i>1</i><span>Say what you need, in your own words.</span></div><div><i>2</i><span>Shops near you that sell it see your request in the app.</span></div>
        <div><i>3</i><span>They reply here. You can also message them on WhatsApp in one tap, from your own WhatsApp.</span></div></div><div style="height:30px"></div></div>`;
    const count = () => { const q = $("#askq", el).value.trim(); if (!q) { $("#askn", el).textContent = "Type what you need to see how many shops will get it."; return; }
      const r = ask(q); const n = r.type === "shops" && r.main ? r.list.filter(x => x.rel >= 2 && x.d < 2.5).length : 0;
      $("#askn", el).innerHTML = n ? `About <b>${Math.min(n, 25)}</b> ${esc(SBIntent.plural(r.main))} within 2.5 km will see this` : "Try naming the thing, like “bread”, “medicine”, “phone cover”."; };
    $("#askq", el).addEventListener("input", count); count();
    $("#askf", el).addEventListener("submit", async e => { e.preventDefault(); const text = $("#askq", el).value.trim(); if (!text) return $("#askq", el).focus();
      const b = $("#askf button[type=submit]", el); busy(b, true);
      try {
        const r = await SB.authed("POST", "/v1/asks", { text, lat: here().lat, lon: here().lon }); buzz("MEDIUM");
        const msg = `Hi, I found you on Srinagar Bazaar. ${text}`;
        $("#askres", el).innerHTML = `<div class="okcard"><b>${r.in_app ? `Sent to ${r.in_app} shop${r.in_app > 1 ? "s" : ""} in the app` : "Request saved"}</b><p>${r.in_app ? "Replies appear below." : "No shop for this is on the app near you yet."} ${r.whatsapp.length ? "You can also message these shops on WhatsApp in one tap. It goes from your own WhatsApp, so it's free." : ""}</p></div>
          ${r.whatsapp.length ? `<div class="rows">${r.whatsapp.map(w => { const s = SB.byId.get(w.id); return `<div class="item"><button data-shop="${esc(w.id)}">${s ? tile(s) : `<span class="tile">${I("store")}</span>`}<span style="min-width:0"><div class="t">${esc(w.name)}</div><div class="s">${fmtD(w.meters / 1000)} away</div></span></button>
            <span class="rt"><button class="btn sm tonal" data-wato="${esc(w.number)}" data-msg="${esc(msg)}">${I("chat", "sm")}Message</button></span></div>`; }).join("")}</div>` : ""}`;
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
      box.innerHTML = `<div class="label">${t("myRequests")}</div>` + r.asks.map(a => `<div class="reply"><small>${new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · sent to ${a.sent_to} in the app</small><b>${esc(a.text)}</b>
        ${a.replies.length ? a.replies.map(x => `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><small>${esc(x.shop)}</small>${esc(x.text)}
          <div style="display:flex;gap:8px;margin-top:10px">${x.phone ? `<button class="btn sm" data-ext="tel:${esc(x.phone)}">${I("phone", "sm")}Call</button>` : ""}<button class="btn sm ghost" data-shop="${esc(x.shop_id)}">View shop</button></div></div>`).join("")
          : `<p class="note" style="margin-top:6px">No replies yet.</p>`}</div>`).join("");
    } catch {}
  }

  // ---------- Saved ----------
  RENDER.saved = el => {
    const list = SB.saved.map(id => SB.byId.get(id)).filter(Boolean);
    el.innerHTML = `<div class="scroll"><div class="pagehead"><div><h1>${t("saved")}</h1>${list.length ? `<p>${list.length} shop${list.length > 1 ? "s" : ""} · available offline</p>` : ""}</div></div>
      ${list.length ? `<div class="rows" style="margin-top:10px">${list.map(row).join("")}</div>`
        : `<div class="empty"><div class="art">${I("save")}</div><h3>Nothing saved yet</h3><p>Tap the bookmark on any shop to keep it here: your chemist, tailor or favourite bakery. Saved shops work offline.</p><button class="btn tonal" data-tabgo="home">${I("search", "sm")}Find shops</button></div>`}
      <div style="height:30px"></div></div>`;
  };

  // ---------- Me ----------
  const mi = (attr, tint, icon, label, sub) => `<button ${attr}><span class="tile sm ${tint}">${I(icon)}</span><span>${label}${sub ? `<small>${sub}</small>` : ""}</span>${I("chev", "sm flip")}</button>`;
  RENDER.me = el => {
    const u = SB.user || {};
    el.innerHTML = `<div class="scroll">${offlineBar()}<div class="pagehead"><h1>${t("me")}</h1></div>
      <div class="profile"><span class="avatar">${esc(initials(u.name || "You"))}</span><div style="flex:1;min-width:0"><b>${esc(u.name || "Add your name")}</b>
        <div class="note">${u.phone ? "Verified · " + esc(pretty(u.phone)) : "Phone not verified"}</div><span class="points">${I("trophy", "xs")}${u.points || 0} points</span></div>
        <button class="iconbtn" data-editname aria-label="Edit name">${I("pencil", "sm")}</button></div>
      ${(SB.myShops || []).length ? `<div class="grouplabel">Your shops</div><div class="menu">${SB.myShops.map(m => mi(`data-dash="${esc(m.id)}"`, "t-teal", "store", esc(m.name), "Visits, status, offers, requests")).join("")}</div>` : ""}
      <div class="menu">
        ${mi('data-go="champions"', "t-amber", "trophy", t("champions"), "Add shops and photos, win monthly prizes")}
        ${mi("data-add", "t-green", "plus", t("addShop"), "+10 points when it's live")}
        ${mi('data-go="tourist"', "t-blue", "compass", t("tourist"), "A day plan, fair prices, safety")}
        ${mi('data-go="sos"', "t-red", "sos", t("emergency"), "Police, ambulance, nearest hospitals")}
      </div>
      <div class="menu">
        ${u.phone ? "" : mi("data-verify", "t-teal", "shield", t("verifyPhone"), "Needed to claim a shop or win prizes")}
        ${mi("data-lang", "t-purple", "lang", t("language"), I18N.lang === "ur" ? "اردو (beta)" : "English")}
        ${mi("data-sync", "t-cyan", "sync", "City data", `${D().shops.length.toLocaleString("en-IN")} shops · ${SB.lastSync ? "updated " + new Date(SB.lastSync).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "from the app download"}`)}
        ${mi('data-go="about"', "t-slate", "info", t("about"))}
      </div><div style="height:24px"></div></div>`;
    if (SB.online && !el._loaded) { el._loaded = true; SB.me().then(() => { if (curTab === "me" && !stack.length) RENDER.me(el); }).catch(() => {}); }
  };

  // ---------- Bazaar Champions ----------
  function championsScreen(el) {
    const u = SB.user || {};
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("champions")}</h1></div>
      <div class="scroll"><div class="pointsbig"><div><span>Your points this month</span><b>${u.points || 0}</b></div>${I("trophy")}</div>
      <div class="label">How to earn</div>
      <div class="earn"><div><b>+10</b><span>Add a missing shop, after we check it</span></div><div><b>+3</b><span>Add a real shop photo</span></div>
        <div><b>+2</b><span>Fix wrong details</span></div><div><b>+1</b><span>Confirm a shop while you're there</span></div></div>
      <p class="pad note" style="margin-top:12px">Top champions each month win prizes from partner shops. Fake or copied entries are removed and lose points.</p>
      <div class="label">Leaderboard</div><div class="rows lb" id="lb"><div class="empty" style="padding:24px">Loading…</div></div>
      <div class="pad" style="margin:20px 0 30px"><button class="btn" data-add>${I("plus", "sm")}Add a shop</button></div></div>`;
    SB.authed("GET", "/v1/champions").then(r => { const box = $("#lb", el); if (!box) return;
      box.innerHTML = r.top.length ? r.top.map(x => `<div class="item"><span class="rank r${x.rank}">${x.rank}</span><span><div class="t">${esc(x.name)}${x.me ? " (you)" : ""}</div></span><span class="d">${x.points} pts</span></div>`).join("")
        : `<div class="empty" style="padding:28px"><div class="art">${I("trophy")}</div><h3>Be the first champion</h3><p>Nobody has points this month yet.</p></div>`; })
      .catch(() => { const box = $("#lb", el); if (box) box.innerHTML = `<div class="empty" style="padding:24px"><p>Connect to the internet to see the leaderboard.</p></div>`; });
  }

  // ---------- Tourist mode ----------
  const SOS = [["112", "All emergencies"], ["100", "Police"], ["108", "Ambulance"], ["101", "Fire"], ["1363", "Tourist helpline (India)"], ["1091", "Women's helpline"]];
  function touristScreen(el) {
    const S_ = name => D().sights.findIndex(g => g[0].toLowerCase().includes(name));
    const chips = names => names.map(n => [n, S_(n.toLowerCase())]).filter(x => x[1] >= 0).map(([n, i]) => `<button class="chip" data-sight="${i}">${I(sightLook(D().sights[i]).icon)}${esc(n)}</button>`).join("");
    const hb = D().shops.filter(s => C(s[3]) === "Houseboat" && (s[20] || nSrc(s[16]) >= 2)).sort((a, b) => b[17] - a[17]).slice(0, 8);
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("tourist")}</h1></div>
      <div class="scroll"><div class="banner" style="background:${bgOf("dal-lake-4", "var(--brand)", ".7")}"><small>${esc(credit("dal-lake-4"))}</small><b>Welcome to Srinagar</b><span>One easy day, well fed and fairly charged</span></div>
      <div class="timeline">
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Morning</div><h4>Mughal gardens</h4><p>Start with the terraced gardens on the Dal's east shore while it's quiet.</p><div class="chips">${chips(["Nishat Bagh", "Shalimar Bagh", "Cheshme Shahi", "Parimahal"])}</div></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Midday</div><h4>Shikara on Dal Lake</h4><p>Boats leave from the Boulevard ghats. Rates are displayed at the ghats; agree on the price and time before you board.</p><button class="btn sm tonal" data-q="shikara">${I("sailboat", "sm")}Shikaras and houseboats</button></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Afternoon</div><h4>Old city walk</h4><p>Jamia Masjid, then Khanqah Shah-e-Hamadan on the Jhelum, with copper, papier-mâché and shawl workshops in the lanes around.</p><div class="chips">${chips(["Jamia Masjid", "Khanqah Shah-e-Hamadan", "Makhdoom Sahib Shrine"])}</div></div></div>
        <div class="step"><div class="rail"><i></i><s></s></div><div class="body"><div class="when">Evening</div><h4>Wazwan dinner</h4><p>End with a Kashmiri wazwan meal: rista, rogan josh, gushtaba.</p><button class="btn sm tonal" data-q="where to eat wazwan">${I("chef-hat", "sm")}Wazwan near me</button></div></div>
      </div>
      ${hb.length ? `<div class="label">Houseboats confirmed by several sources</div><div class="rows">${hb.map(row).join("")}</div>` : ""}
      <div class="label">${t("emergency")}</div><div class="sos">${SOS.map(([n, l]) => `<button data-ext="tel:${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("")}</div>
      <div class="label">Good to know</div><div class="list-card tips" style="margin-bottom:30px">
        <div class="lrow">${I("wallet", "sm")}<span>Many small shops prefer cash or UPI. Keep some cash for old-city lanes.</span></div>
        <div class="lrow">${I("badge-check", "sm")}<span>For pashmina, ask about the GI mark and certificate before paying for "pure pashmina".</span></div>
        <div class="lrow">${I("moon-star", "sm")}<span>On Friday afternoons some shops close for prayers. Check the shop's status before you go.</span></div></div></div>`;
  }
  function sosScreen(el) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("emergency")}</h1></div>
      <div class="scroll"><p class="pad note" style="font-size:14px;margin:4px 0 14px">Tap a number to call. These work from any phone in India.</p>
      <div class="sos">${SOS.map(([n, l]) => `<button data-ext="tel:${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("")}</div>
      <div class="label">Nearest hospitals</div><div class="rows">${D().shops.filter(s => C(s[3]) === "Hospital & Nursing Home").sort((a, b) => dist(a) - dist(b)).slice(0, 6).map(row).join("")}</div><div style="height:30px"></div></div>`;
  }
  function aboutScreen(el) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>${t("about")}</h1></div>
      <div class="scroll"><div style="text-align:center;padding:8px 16px 24px"><img src="img/icon-192.png" alt="" width="80" height="80" style="border-radius:22px;box-shadow:var(--e2)">
        <h2 style="margin:14px 0 2px;font-size:22px;font-weight:800;letter-spacing:-.02em">Srinagar Bazaar</h2><div class="note">Version 1.2.0 · Made in Srinagar</div></div>
      <div class="card" style="line-height:1.6;color:var(--ink-2);font-size:14px">
        <p style="margin-top:0">Find any shop in Srinagar, nearest first, even without internet.</p>
        <p><b style="color:var(--ink)">What we store.</b> A random ID for this phone. Your phone number only if you verify it. Requests you send with Ask the bazaar. Anonymous counts of shop views and calls, which only the shop's owner sees. Saved shops stay on this phone.</p>
        <p style="margin-bottom:0"><b style="color:var(--ink)">Location</b> is used on this phone to sort shops by distance, and sent only when you add a shop, confirm one, or send a request.</p></div>
      <div class="label">More</div>
      <div class="menu">${mi('data-ext="https://api.45-92-1-150.sslip.io/privacy.html"', "t-teal", "shield", "Privacy policy")}${mi('data-go="credits"', "t-purple", "image", "Photo credits")}
        ${mi('data-ext="mailto:fazil.mastu@gmail.com"', "t-blue", "send", "Contact us", "fazil.mastu@gmail.com")}
        <button data-delme class="danger"><span class="tile sm t-red">${I("trash-2")}</span><span>Delete my data</span>${I("chev", "sm flip")}</button></div>
      <p class="pad note" style="margin-bottom:30px">Map data © OpenStreetMap contributors (ODbL). Places from Overture Maps Foundation and AllThePlaces, plus shops added by people of Srinagar. Weather by Open-Meteo.com (CC BY 4.0). Icons by Lucide (ISC).</p></div>`;
  }

  function creditsScreen(el) {
    el.innerHTML = `<div class="bar safe-top"><button class="iconbtn" data-back aria-label="Back">${I("back", "flip")}</button><h1>Photo credits</h1></div>
      <div class="scroll"><p class="pad note" style="margin:4px 0 14px;font-size:13.5px">Thank you to these photographers. Tap a photo to see the original and its licence.</p>
      <div class="rows">${Object.entries(PH.photos).map(([k, p]) => `<div class="item"><button data-ext="${esc(p.source)}"><span class="tile photo" style="background-image:url('${pimg(k)}')"></span>
        <span style="min-width:0"><div class="t">${esc(p.title)}</div><div class="s">${esc(p.by)} · ${esc(p.license)}</div></span></button><span></span></div>`).join("")}</div>
      <p class="pad note" style="margin:14px 0 30px">Photos are resized and cropped. Licences: <button class="link" data-ext="https://creativecommons.org/licenses/">creativecommons.org/licenses</button></p></div>`;
  }

  // ---------- First launch ----------
  function onboarding() {
    try { if (localStorage.getItem("sb_onboarded")) return; } catch { return; }
    const slides = [["dal-lake-4", "store", "Every shop in Srinagar", "10,000+ shops, clinics, hotels and houseboats, nearest first. Works even when mobile data doesn't."],
      ["bakery-sweets-0", "spark", "Search the way you talk", "Type “need dawai”, “fresh kulcha” or “pashmina shawl”. We understand what you mean."],
      ["houseboat-2", "pin", "Nearest to you, first", "Use your location to sort by distance, or pick your area. Your location stays on your phone."]];
    const el = document.createElement("div"); el.className = "onb";
    el.innerHTML = `<div class="brandrow"><img src="img/icon-192.png" alt="">Srinagar Bazaar</div><button class="skip" data-onb="skip">Skip</button>
      <div class="slides">${slides.map(([ph, ic, h, p]) => `<div class="slide" style="background-image:url('${pimg(ph)}')"><span class="tile lg">${I(ic)}</span><h2>${h}</h2><p>${p}</p></div>`).join("")}</div>
      <div class="foot2"><div class="dots">${slides.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div><div id="onbbtns"></div></div>`;
    screen.appendChild(el); syncBars();
    const sl = $(".slides", el), page = () => Math.round(sl.scrollLeft / sl.clientWidth);
    const paint = () => { const i = page(); el.querySelectorAll(".dots i").forEach((d, j) => d.classList.toggle("on", j === i));
      $("#onbbtns", el).innerHTML = i < slides.length - 1 ? `<button class="btn" data-onb="next">Next</button>`
        : `<div style="display:grid;gap:10px"><button class="btn" data-onb="gps">${I("locate-fixed", "sm")}Use my location</button><button class="btn ghost" data-onb="area">Choose my area</button></div>`; };
    sl.addEventListener("scroll", () => { clearTimeout(sl._t); sl._t = setTimeout(paint, 60); }); paint();
    const done = () => { try { localStorage.setItem("sb_onboarded", "1"); } catch {} el.style.transition = "opacity .25s"; el.style.opacity = 0; setTimeout(() => { el.remove(); syncBars(); }, 260); };
    el.addEventListener("click", async e => { const b = e.target.closest("[data-onb]"); if (!b) return; e.stopPropagation(); buzz(); const a = b.dataset.onb;
      if (a === "next") sl.scrollTo({ left: (page() + 1) * sl.clientWidth, behavior: "smooth" });
      if (a === "skip") done();
      if (a === "area") { done(); setTimeout(pickArea, 280); }
      if (a === "gps") { b.disabled = true;
        try { const p = await SB.position(); SB.prefs.loc = { type: "gps", lat: p.lat, lon: p.lon }; SB.savePrefs(); done(); rerenderAll();
          toast(farFromCity(p) ? `You seem to be outside Srinagar, so we're showing places from ${here().name}` : "Showing places near you", "locate-fixed"); }
        catch (err) { b.disabled = false; toast(err.message || "Couldn't get your location"); } } });
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
  // Anyone can add a photo of a shop they're at: it's checked, then goes live with +3 Champion points.
  function addPhoto(id) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; toast("Uploading…");
      try { const blob = await shrink(f); const fd = new FormData(); fd.append("photo", blob, "photo.jpg");
        const r = await SB.authed("POST", `/v1/shops/${id}/photos`, fd);
        toast(r.status === "approved" ? "Photo added" : "Thanks! We'll check it and add +3 points"); }
      catch (err) { toast(err.message); } };
    inp.click();
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
    if (d.today !== undefined) return todaySheet();
    if (d.cats !== undefined) return catsSheet();
    if (d.locate !== undefined) { buzz(); if (MAP) MAP.setView([here().lat, here().lon], 16, { animate: true }); return; }
    if (d.search !== undefined) return push(searchScreen, d.search || "");
    if (d.searchq !== undefined) return push(searchScreen, d.searchq);
    if (d.q !== undefined) { SB.remember(d.q); return push(resultsScreen, d.q); }
    if (d.askq !== undefined) { showTab("ask"); RENDER.ask(tabs.ask, d.askq); return; }
    if (d.mapof !== undefined) { showTab("map"); setTimeout(() => { document.querySelectorAll("[data-mq]").forEach(x => x.setAttribute("aria-pressed", "false")); mapShow(d.mapof); }, 80); return; }
    if (d.shop) { SB.track(d.shop, "view"); return push(shopScreen, d.shop); }
    if (d.sight) return push(sightScreen, +d.sight);
    if (d.add !== undefined) return push(addScreen);
    if (d.go) return push({ tourist: touristScreen, champions: championsScreen, sos: sosScreen, about: aboutScreen, credits: creditsScreen }[d.go]);
    if (d.dash) return push(dashScreen, d.dash);
    if (d.call) { const s = SB.byId.get(d.call); SB.track(d.call, "call"); buzz(); return SB.openExternal("tel:" + contact(s).tel); }
    if (d.wa) { const s = SB.byId.get(d.wa); SB.track(d.wa, "whatsapp"); return SB.openExternal(`https://wa.me/${contact(s).wa.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I found your shop on Srinagar Bazaar.")}`); }
    if (d.dir) { const s = SB.byId.get(d.dir); SB.track(d.dir, "directions"); return SB.openExternal(contact(s).dir); }
    if (d.wato) return SB.openExternal(`https://wa.me/${d.wato.replace(/\D/g, "")}?text=${encodeURIComponent(d.msg || "")}`);
    if (d.ext) { e.preventDefault(); return SB.openExternal(d.ext); }
    if (d.save) { const on = SB.toggleSave(d.save); buzz(on ? "MEDIUM" : "LIGHT"); toast(on ? "Saved. Works offline too." : "Removed from saved", "save"); redrawTop(); return; }
    if (d.share) return share(d.share);
    if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast("Number copied", "copy"); } catch { toast(pretty(d.copy)); } return; }
    if (d.claim) return claim(d.claim);
    if (d.edit) return editSheet(d.edit);
    if (d.addphoto) return addPhoto(d.addphoto);
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
    if ($(".onb", screen)) return;
    const sh = [...screen.querySelectorAll(".sheet:not(.leave)")].pop();
    if (sh) return closeSheet(sh);
    if (pop()) return;
    if (curTab !== "home") return showTab("home");
    App.exitApp();
  });

  showTab("home");
  onboarding();
  if (location.hash === "#tourist") push(touristScreen);
})();
