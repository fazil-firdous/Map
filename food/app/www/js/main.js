// Kezia's Food: app start. Boot animation, welcome, bottom tabs, Android back button, resume refresh.
(() => {
  const { $, $$, h, I, esc, S, emit, on, sleep, plugin, pop, top, topSheet, haptic, bell } = KF;
  const C = KF.customer, P = KF.partner;
  const app = $("#app");
  const layers = {};
  let current = "home";

  function tabs() {
    const t = [["home", "house", "Home"], ["search", "search", "Search"], ["orders", "receipt", "Orders"]];
    if (S.kitchens().length) t.push(["kitchen", "chef-hat", "Kitchen"]);
    else if (S.rides().length) t.push(["kitchen", "bike", "Deliver"]);
    t.push(["profile", "user", "You"]);
    return t;
  }
  const badges = {};
  function nav() {
    let n = $(".nav", app);
    if (!n) { n = h(`<nav class="nav"></nav>`); app.append(n); n.onclick = e => { const b = e.target.closest("button"); if (b) tab(b.dataset.tab); }; }
    if (!tabs().some(t => t[0] === current)) current = "home";
    n.innerHTML = tabs().map(([k, icon, label]) => `<button data-tab="${k}" aria-current="${k === current}">${I(icon)}<span>${label}</span>${badges[k] ? `<span class="badge">${badges[k]}</span>` : ""}</button>`).join("");
  }
  KF.badge = (k, v) => { if ((badges[k] || 0) === v) return; badges[k] = v; nav(); };

  function tab(k) {
    if (!layers[k]) return;
    while (top()) pop();
    const again = k === current && !layers[k].hidden;
    current = k;
    Object.entries(layers).forEach(([name, el]) => { el.hidden = name !== k; });
    layers[k].classList.remove("fadein"); void layers[k].offsetWidth; layers[k].classList.add("fadein");
    nav(); haptic();
    if (k === "home") { if (again) { const sc = $(".scroll", layers.home); if (sc) sc.scrollTo({ top: 0, behavior: "smooth" }); } C.loadHome(); }
    if (k === "search") C.search.focus();
    if (k === "orders") { C.renderOrders(); C.loadOrders(); }
    if (k === "kitchen") P.show();
    if (k === "profile") drawProfile();
  }
  KF.tab = tab;

  let drawProfile;
  function build() {
    ["home", "search", "orders", "kitchen", "profile"].forEach(k => { const el = h(`<div class="layer" id="t-${k}" ${k === "home" ? "" : "hidden"}></div>`); app.append(el); layers[k] = el; });
    C.initHome(layers.home); C.initSearch(layers.search); C.initOrders(layers.orders); P.init(layers.kitchen); drawProfile = C.initProfile(layers.profile);
    nav();
    on("places", nav);
    on("auth", nav);
  }

  function welcome() {
    return new Promise(res => {
      const el = h(`<div class="welcome">
        <div class="wart"><i style="background-image:url('img/food/wazwan.jpg')"></i><i style="background-image:url('img/food/pizza-2.jpg')"></i><i style="background-image:url('img/food/momos.jpg')"></i>
          <span class="wbadge">${I("bike", "sm")} Own riders</span><span class="wbadge b2">${I("qr-code", "sm")} Pay by UPI</span></div>
        <div class="wtext"><div class="brand" style="text-align:left;font-size:40px">Kezia's Food</div><p>Kulgam's own food app. Hot food from the kitchens you love, brought by their own riders.</p>
          <ul><li><span class="tile">${I("chef-hat", "sm")}</span>Order from the best of Kulgam</li><li><span class="tile gold">${I("qr-code", "sm")}</span>Pay the restaurant directly: UPI or cash</li>
            <li><span class="tile">${I("map-pin", "sm")}</span>Watch your rider live on the map</li></ul></div>
        <button class="btn shine" data-go>Let's eat ${I("arrow-right", "sm")}</button></div>`);
      app.append(el);
      $("[data-go]", el).onclick = () => {
        KF.ls.set("kf_welcomed", 1); haptic("success"); bell.unlock();
        el.classList.add("out"); setTimeout(() => el.remove(), 400); res();
        KF.position().then(p => { if (p.lat > 33.52 && p.lat < 33.75 && p.lon > 74.8 && p.lon < 75.15) { S.here = p; KF.ls.set("kf_here", p); emit("addr"); } }).catch(() => {});
      };
    });
  }

  function back() {
    const s = topSheet(); if (s) { s.close(); return; }
    if (pop()) return;
    if (current !== "home") { tab("home"); return; }
    const A = plugin("App"); if (A) A.exitApp();
  }

  async function start() {
    build();
    const boot = $(".boot");
    const SS = plugin("SplashScreen"); if (SS) SS.hide({ fadeOutDuration: 200 }).catch(() => {});
    const A = plugin("App");
    if (A) {
      A.addListener("backButton", back);
      A.addListener("resume", () => { if (current === "home") C.loadHome(); C.loadOrders(); P.pollKitchen(); P.pollRides(); });
    }
    document.addEventListener("pointerdown", () => bell.unlock(), { once: true });
    const t0 = Date.now();
    if (S.token) {
      KF.get("/v1/me").then(j => { S.setAuth({ user: j.user, places: j.places }); emit("places"); }).catch(() => {});
      C.loadAddresses().then(() => emit("addr"));
    }
    await Promise.race([C.loadHome(), sleep(5000)]);
    await sleep(Math.max(0, 1100 - (Date.now() - t0)));
    if (!KF.ls.get("kf_welcomed", 0)) { boot.classList.add("out"); await welcome(); }
    boot.classList.add("out"); setTimeout(() => boot.remove(), 450);
    C.loadOrders();
    if (S.kitchens().length) P.pollKitchen();
  }
  start();
})();
