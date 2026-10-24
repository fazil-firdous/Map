// Kezia's Food: app start. Logo boot screen, welcome, the bottom bar for each kind of account, Android back button.
// One app, four modes: customers order; restaurants (owner/manager) run their kitchen; riders deliver; the owner
// of Kezia's Food sees everything. Restaurant, rider and owner accounts don't see the ordering screens.
(() => {
  const { $, h, I, S, emit, on, sleep, plugin, pop, top, topSheet, haptic, bell } = KF;
  const C = KF.customer, P = KF.partner, AD = KF.admin;
  const app = $("#app");
  const layers = {};
  let current = null;

  const mode = () => (S.user && S.user.role === "admin" ? "admin" : S.kitchens().length ? "kitchen" : S.rides().length ? "rider" : "customer");
  KF.mode = mode;
  function tabs() {
    return {
      customer: [["home", "house", "Home"], ["search", "search", "Search"], ["orders", "receipt", "Orders"], ["profile", "user", "You"]],
      kitchen: [["k:orders", "bell-ring", "Orders"], ["k:menu", "utensils", "Menu"], ["k:money", "wallet", "Earnings"], ["k:settings", "settings", "Settings"], ["profile", "user", "You"]],
      rider: [["k:rides", "bike", "Deliveries"], ["profile", "user", "You"]],
      admin: [["a:home", "chart-column", "Dashboard"], ["a:rest", "store", "Restaurants"], ["a:orders", "receipt", "Orders"], ["a:users", "users", "Users"], ["profile", "user", "You"]],
    }[mode()];
  }
  KF.firstTab = () => tabs()[0][0];
  const layerOf = k => (k.startsWith("k:") ? "kitchen" : k.startsWith("a:") ? "admin" : k);

  const badges = {};
  function nav() {
    let n = $(".nav", app);
    if (!n) { n = h(`<nav class="nav"></nav>`); app.append(n); n.onclick = e => { const b = e.target.closest("button"); if (b) tab(b.dataset.tab); }; }
    n.innerHTML = tabs().map(([k, icon, label]) => `<button data-tab="${k}" aria-current="${k === current}">${I(icon)}<span>${label}</span>${badges[k] ? `<span class="badge">${badges[k]}</span>` : ""}</button>`).join("");
  }
  KF.badge = (k, v) => { if ((badges[k] || 0) === v) return; badges[k] = v; nav(); };

  function tab(k) {
    const managing = k.startsWith("k:") && mode() === "admin" && P.overriding();
    if (!managing && !tabs().some(t => t[0] === k)) k = KF.firstTab();
    if (!managing && P.overriding()) P.setOverride(null);
    while (top()) pop();
    const again = k === current;
    current = k;
    const L = layerOf(k);
    Object.entries(layers).forEach(([name, el]) => { el.hidden = name !== L; });
    layers[L].classList.remove("fadein"); void layers[L].offsetWidth; layers[L].classList.add("fadein");
    nav(); haptic();
    const view = k.split(":")[1];
    if (k === "home") { if (again) { const sc = $(".scroll", layers.home); if (sc) sc.scrollTo({ top: 0, behavior: "smooth" }); } C.loadHome(); }
    if (k === "search") C.search.focus();
    if (k === "orders") { C.renderOrders(); C.loadOrders(); }
    if (L === "kitchen") P.show(view);
    if (L === "admin") AD.show(view);
    if (k === "profile") drawProfile();
  }
  KF.tab = tab;
  /** The owner opens a restaurant's kitchen (menu, settings, orders) as if they ran it. */
  KF.manage = r => { P.setOverride(r); tab("k:menu"); };
  // Logging in or out can change the kind of account: rebuild the bar and open that mode's first screen
  let lastMode = null;
  const remode = () => { const m = mode(); if (m !== lastMode) { lastMode = m; tab(KF.firstTab()); } else nav(); };

  let drawProfile;
  function build() {
    ["home", "search", "orders", "kitchen", "admin", "profile"].forEach(k => { const el = h(`<div class="layer" id="t-${k}" hidden></div>`); app.append(el); layers[k] = el; });
    C.initHome(layers.home); C.initSearch(layers.search); C.initOrders(layers.orders); P.init(layers.kitchen); AD.init(layers.admin); drawProfile = C.initProfile(layers.profile);
    on("places", remode);
    on("auth", remode);
    on("auth", () => { if (S.token) { KF.pushSetup(); if (mode() === "customer") setTimeout(() => C.askHeard(), 1200); } });
    // tapping a notification opens the right screen; one arriving while the app is open refreshes it
    on("pushopen", d => { KF.popAll(); if (d.kitchen) tab("k:orders"); else if (d.rider) tab("k:rides"); else if (d.order) { tab("orders"); C.openOrder(d.order); } });
    on("pushin", () => { P.pollKitchen(); P.pollRides(); C.loadOrders(); });
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
    if (P.overriding()) { P.setOverride(null); tab("a:rest"); return; } // owner managing a restaurant: back to the dashboard
    if (current !== KF.firstTab()) { tab(KF.firstTab()); return; }
    const A = plugin("App"); if (A) A.exitApp();
  }

  async function start() {
    build();
    const boot = $(".boot");
    const SS = plugin("SplashScreen"); if (SS) SS.hide({ fadeOutDuration: 250 }).catch(() => {});
    const A = plugin("App");
    if (A) {
      A.addListener("backButton", back);
      A.addListener("resume", () => { if (current === "home") C.loadHome(); C.loadOrders(); P.pollKitchen(); P.pollRides(); });
    }
    document.addEventListener("pointerdown", () => bell.unlock(), { once: true });
    const t0 = Date.now();
    if (S.token) {
      try { const j = await Promise.race([KF.get("/v1/me"), sleep(4000).then(() => null)]); if (j) S.setAuth({ user: j.user, places: j.places, support: j.support, push: j.push }); } catch {}
      KF.pushSetup();
      C.loadAddresses().then(() => emit("addr"));
    }
    lastMode = mode();
    if (lastMode === "customer") await Promise.race([C.loadHome(), sleep(5000)]);
    await sleep(Math.max(0, 2300 - (Date.now() - t0))); // let the logo breathe
    boot.classList.add("out");
    if (!KF.ls.get("kf_welcomed", 0)) await welcome();
    tab(KF.firstTab());
    setTimeout(() => boot.remove(), 600);
    if (S.token && mode() === "customer") setTimeout(() => C.askHeard(), 6000);
    C.loadOrders();
    if (S.kitchens().length) P.pollKitchen();
    // Shared links: kezia://r/<id> in the app, or …/app/#r=<id> on the web, open that restaurant
    const openLink = url => { const m = /(?:\/\/r\/|#r=)([\w-]+)/.exec(url || ""); if (m && mode() === "customer") C.openRestaurant(m[1]); };
    openLink(location.hash);
    if (A) {
      A.addListener("appUrlOpen", e => openLink(e.url));
      A.getLaunchUrl().then(r => r && openLink(r.url)).catch(() => {});
    }
  }
  start();
  // icons: house search receipt user bell-ring utensils wallet settings bike chart-column store users
})();
