// Kezia's Food: the customer side. Home, search, restaurant menu, cart, addresses, login, the order journey
// (waiting → pay by UPI → verifying → live tracking → delivered), order history and profile.
(() => {
  const { $, $$, esc, h, I, rs, bg, S, get, post, api, push, pop, popAll, sheet, confirm, ask, toast, fail, busy, bind, haptic, emit, on,
    skelCards, skelLines, empty, topbar, lift, map, pin, openExternal, call, position, when, time, plural, now, notify, askNotify } = KF;

  const CATS = [["Pizza", "pizza-1", /pizza/i], ["Wazwan", "wazwan", /wazwan|rista|rogan|gushtaba/i], ["Burgers", "burger", /burger/i], ["Rolls", "rolls", /roll|shawarma|wrap/i],
    ["Chinese", "noodles", /chinese|noodle|chow/i], ["Momos", "momos", /momo/i], ["Biryani", "biryani", /biryani/i], ["Kebabs", "kebab", /kebab|tandoor|tikka/i],
    ["Fries", "fries", /fries|sides/i], ["Coffee", "coffee", /coffee|shake|drink/i], ["Desserts", "cake", /cake|dessert|sweet/i]];
  const STATUS = { placed: "Waiting for the restaurant", accepted: "Pay now", pay_claimed: "Checking payment", confirmed: "Confirmed", preparing: "Cooking",
    out: "On the way", delivered: "Delivered", rejected: "Declined", expired: "Expired", cancelled: "Cancelled" };
  const OPEN = ["placed", "accepted", "pay_claimed", "confirmed", "preparing", "out"];
  const vegMark = v => `<span class="veg ${v ? "" : "nv"}" title="${v ? "Veg" : "Non-veg"}"></span>`;
  const greet = () => { const hr = new Date().getHours(); return hr < 5 ? "Late night cravings" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"; };

  // ---------- login ----------
  let loginOpen = null;
  function login(reason = "Log in with your mobile number to order.") {
    if (S.token) return Promise.resolve(true);
    if (loginOpen) return loginOpen;
    return (loginOpen = new Promise(res => {
      let ok = false;
      const s = sheet(`<div data-step></div>`, { onClose: () => { loginOpen = null; res(ok); } });
      const box = $("[data-step]", s);
      const step1 = () => {
        box.innerHTML = `<div class="brand" style="font-size:24px;text-align:left">Kezia's Food</div><h2 style="margin-top:6px">Log in</h2><p class="sub">${esc(reason)}</p>
          <div class="form"><label class="field">Mobile number<div class="row"><span class="input" style="width:auto;flex:none">+91</span>
            <input class="input" data-phone type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit number" autocomplete="tel-national"></div></label>
          <label class="field">Your name<input class="input" data-name placeholder="So the restaurant knows who's ordering" autocomplete="name"></label>
          <button class="btn shine" data-send>Send code ${I("arrow-right", "sm")}</button>
          <p class="note">We send a 6-digit code by SMS. By continuing you agree to the <a class="link" data-a="terms">terms</a> and <a class="link" data-a="privacy">privacy policy</a>.</p></div>`;
        const p = $("[data-phone]", box); setTimeout(() => p.focus(), 250);
        p.oninput = () => { p.value = p.value.replace(/\D/g, "").slice(0, 10); };
        $("[data-send]", box).onclick = e => busy(e.currentTarget, async () => {
          if (p.value.length !== 10) throw new Error("Enter your 10-digit mobile number");
          await post("/v1/auth/otp/start", { phone: p.value });
          step2(p.value, $("[data-name]", box).value.trim());
        });
      };
      const step2 = (phone, name) => {
        box.innerHTML = `<h2>Enter the code</h2><p class="sub">Sent by SMS to +91 ${esc(phone)} · <a class="link" data-change>Change</a></p>
          <div class="otp">${Array.from({ length: 6 }, (_, i) => `<input class="input" inputmode="numeric" ${i === 0 ? 'autocomplete="one-time-code"' : ""}>`).join("")}</div>
          <button class="btn" data-verify style="margin-top:18px">Verify and continue</button>
          <p class="note" style="text-align:center;margin-top:12px" data-resend>Didn't get it? Ask again in <span class="timer">45</span>s</p>`;
        const boxes = $$(".otp input", box);
        setTimeout(() => boxes[0].focus(), 200);
        const code = () => boxes.map(b => b.value).join("");
        const verify = () => busy($("[data-verify]", box), async () => {
          if (code().length !== 6) throw new Error("Enter all 6 digits");
          const j = await post("/v1/auth/otp/verify", { phone, code: code(), name: name || undefined });
          S.setAuth(j); await loadAddresses(); ok = true; haptic("success");
          toast(`Welcome${j.user.name ? ", " + j.user.name.split(" ")[0] : ""}!`); emit("auth"); s.close();
        });
        boxes.forEach((b, i) => {
          b.oninput = () => {
            const d = b.value.replace(/\D/g, "");
            if (d.length > 1) { d.slice(0, 6).split("").forEach((c, j) => { if (boxes[j]) boxes[j].value = c; }); boxes[Math.min(5, d.length - 1)].focus(); }
            else { b.value = d; if (d && boxes[i + 1]) boxes[i + 1].focus(); }
            if (code().length === 6) verify();
          };
          b.onkeydown = e => { if (e.key === "Backspace" && !b.value && boxes[i - 1]) boxes[i - 1].focus(); };
        });
        $("[data-verify]", box).onclick = verify;
        $("[data-change]", box).onclick = step1;
        let left = 45; const t = setInterval(() => {
          if (!box.isConnected) return clearInterval(t);
          left--; const el = $("[data-resend] .timer", box); if (el) el.textContent = left;
          if (left <= 0) { clearInterval(t); $("[data-resend]", box).innerHTML = `<a class="link">Send the code again</a>`;
            $("[data-resend] a", box).onclick = () => busy(null, async () => { await post("/v1/auth/otp/start", { phone }); toast("New code sent"); step2(phone, name); }); }
        }, 1000);
      };
      bind(s, { terms: () => KF.openExternal(KF.API + "/terms.html"), privacy: () => KF.openExternal(KF.API + "/privacy.html") });
      step1();
    }));
  }

  // ---------- addresses ----------
  async function loadAddresses() {
    if (!S.token) { S.addresses = []; return; }
    try { S.addresses = (await get("/v1/addresses")).addresses; } catch { return; }
    if (!S.addresses.some(a => a.id === S.addrId)) setAddr(S.addresses[0] ? S.addresses[0].id : null);
  }
  function setAddr(id) { S.addrId = id; KF.ls.set("kf_addr", id); emit("addr"); }
  const addrLine = a => `${esc(a.label)} · ${esc(a.landmark)}`;

  /** Choose where to deliver: saved addresses, or add a new one on the map. */
  function chooseAddress() {
    return new Promise(res => {
      let picked = false;
      const s = sheet(`<h2>Deliver to</h2><p class="sub">Riders find you by the pin and your landmark.</p><div data-list></div>
        <button class="btn soft" data-a="new" style="margin-top:12px">${I("plus", "sm")} Add a new address</button>
        ${S.token ? "" : `<p class="note" style="margin-top:12px">Showing restaurants near ${S.here ? "you" : "Kulgam town"}. <a class="link" data-a="gps">Use my location</a></p>`}`,
        { onClose: () => !picked && res(null) });
      $("[data-list]", s).innerHTML = S.addresses.map(a => `<button class="opt" data-a="pick" data-id="${a.id}" aria-checked="${a.id === S.addrId}">
          <span class="tile">${I(a.label === "Work" ? "store" : a.label === "Home" ? "house" : "map-pin", "sm")}</span><span><b>${esc(a.label)}</b><span>${esc(a.landmark)}</span></span><i class="radio"></i></button>`).join("");
      bind(s, {
        pick: b => { picked = true; setAddr(Number(b.dataset.id)); haptic(); s.close(); res(S.addr); },
        new: async () => { if (!(await login("Log in to save delivery addresses."))) return; s.close(); const a = await pickPlace(); picked = true; res(a); },
        gps: b => busy(b, async () => { S.here = await position(); KF.ls.set("kf_here", S.here); emit("addr"); s.close(); }),
      });
    });
  }

  /** Full-screen map with a fixed pin. Saves an address (or with save:false just returns the point). */
  function pickPlace(opts = {}) {
    const save = opts.save !== false;
    return new Promise(res => {
      let result = null;
      push(async (el, scr) => {
        scr.onClose(() => res(result));
        el.innerHTML = `${topbar(opts.title || "Set delivery location")}
          <div class="mapbox"><div class="mapel"></div><div class="crosshair">${I("map-pin")}</div>
            <button class="iconbtn glass mapfab" data-a="gps" aria-label="My location">${I("locate-fixed")}</button>
            <div class="maphint">${I("hand", "xs")} Move the map to put the pin on your door</div></div>
          <div class="foot" style="background:var(--bg);box-shadow:0 -10px 30px -12px rgb(0 0 0 / .2);border-radius:24px 24px 0 0;margin-top:-20px">
            ${save ? `<div class="seg" data-labels style="margin-bottom:12px">${["Home", "Work", "Other"].map((l, i) => `<button data-l="${l}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
            <label class="field" style="margin-bottom:12px">Landmark (needed)<input class="input" data-landmark maxlength="160" placeholder="e.g. Green gate behind Jamia Masjid, 2nd house"></label>` :
            `<p class="note" style="margin:4px 0 12px">${esc(opts.hint || "Put the pin exactly where you are.")}</p>`}
            <button class="btn" data-a="save">${save ? "Save address" : "Use this spot"}</button></div>`;
        bind(el, {
          back: () => pop(scr),
          gps: b => busy(b, async () => { const p = await position(); m.flyTo([p.lat, p.lon], 17, { duration: .6 }); }),
          save: b => busy(b, async () => {
            const c = m.getCenter();
            if (!(c.lat > 33.52 && c.lat < 33.75 && c.lng > 74.8 && c.lng < 75.15)) throw new Error("We deliver in Kulgam district only");
            if (!save) { result = { lat: c.lat, lon: c.lng }; pop(scr); return; }
            const landmark = $("[data-landmark]", el).value.trim();
            if (landmark.length < 4) { $("[data-landmark]", el).focus(); throw new Error("Add a landmark so the rider can find you"); }
            const label = $("[data-labels] [aria-pressed=true]", el).dataset.l;
            const j = await post("/v1/addresses", { label, landmark, lat: c.lat, lon: c.lng });
            S.addresses.unshift(j.address); setAddr(j.address.id); result = j.address; haptic("success"); toast("Address saved"); pop(scr);
          }),
        });
        const labels = $("[data-labels]", el);
        if (labels) labels.onclick = e => { const b = e.target.closest("button"); if (!b) return; $$("button", labels).forEach(x => x.setAttribute("aria-pressed", x === b)); };
        const start = S.addr || S.here || { lat: 33.6450, lon: 75.0190 };
        const m = await map($(".mapel", el), { center: [start.lat, start.lon], zoom: 17 });
        const box = $(".mapbox", el);
        m.on("movestart", () => box.classList.add("moving")); m.on("moveend", () => box.classList.remove("moving"));
        if (!S.addr && !S.here) position().then(p => { S.here = p; KF.ls.set("kf_here", p); if (scr.alive) m.setView([p.lat, p.lon], 17); }).catch(() => {});
      });
    });
  }

  // ---------- cart ----------
  const cartCount = () => S.cart ? Object.values(S.cart.items).reduce((s, x) => s + x.qty, 0) : 0;
  const cartTotal = () => S.cart ? Object.values(S.cart.items).reduce((s, x) => s + x.qty * x.price, 0) : 0;
  const qtyOf = id => (S.cart ? Object.values(S.cart.items).filter(l => l.id === id).reduce((s, l) => s + l.qty, 0) : 0);
  const sizeQty = (id, v) => (S.cart && S.cart.items[`${id}:${v}`] ? S.cart.items[`${id}:${v}`].qty : 0);
  /** A cart line for a dish, or for one size of it. */
  const lineOf = (it, v = null) => v === null || !it.variants ? { key: String(it.id), id: it.id, v: null, name: it.name, price: it.price, veg: it.veg }
    : { key: `${it.id}:${v}`, id: it.id, v, size: it.variants[v].n, name: `${it.name} (${it.variants[v].n})`, price: it.variants[v].p, veg: it.veg };
  const keyOf = l => l.key || String(l.id);
  const cartItems = () => Object.values(S.cart.items).map(l => ({ id: l.id, qty: l.qty, ...(l.v !== null && l.v !== undefined ? { v: l.v } : {}) }));
  async function setQty(r, it, q) {
    if (q > 0 && S.cart && S.cart.rid !== r.id && cartCount()) {
      if (!(await confirm("Start a new cart?", `Your cart has items from ${S.cart.rname}. Clear it and add from ${r.name}?`, "Start new"))) return false;
      S.cart = null;
    }
    if (!S.cart || S.cart.rid !== r.id) S.cart = { rid: r.id, rname: r.name, items: {} };
    const line = it.key ? it : lineOf(it);
    if (q <= 0) delete S.cart.items[keyOf(line)];
    else S.cart.items[keyOf(line)] = { ...line, key: keyOf(line), qty: Math.min(50, q) };
    if (!cartCount()) S.cart = null;
    S.saveCart(); haptic(); emit("cart"); return true;
  }
  const addHTML = it => it.in_stock && it.variants && it.variants.length ? (qtyOf(it.id)
      ? `<div class="add on"><button data-a="sizes" data-id="${it.id}" aria-label="Less">−</button><span>${qtyOf(it.id)}</span><button data-a="sizes" data-id="${it.id}" aria-label="More">+</button></div>`
      : `<button class="add" data-a="sizes" data-id="${it.id}">ADD <sup style="margin-left:2px">+</sup><small class="addsub">${it.variants.length} sizes</small></button>`)
    : !it.in_stock ? `<div class="add" style="color:var(--ink-3)">Sold out</div>`
    : qtyOf(it.id) ? `<div class="add on"><button data-a="dec" data-id="${it.id}" aria-label="Less">−</button><span>${qtyOf(it.id)}</span><button data-a="inc" data-id="${it.id}" aria-label="More">+</button></div>`
    : `<button class="add" data-a="inc" data-id="${it.id}">ADD <sup style="margin-left:2px">+</sup></button>`;
  const cartbar = () => cartCount() ? `<button class="cartbar" data-a="cart"><span><b>${plural(cartCount(), "item")} · ${rs(cartTotal())}</b><small>${esc(S.cart.rname)} · plus delivery</small></span>
    <span class="row" style="gap:6px;font-weight:800">View cart ${I("chevron-right", "sm")}</span></button>` : "";

  // ---------- home ----------
  const home = { el: null, data: null, cat: null, slide: null };
  function rcard(r, i = 0) {
    const tags = [r.status === "test" ? `<span class="pill gold">TEST</span>` : "", r.rules.free_above ? `<span class="pill solid">Free delivery over ${rs(r.rules.free_above)}</span>` : ""].join("");
    const fee = r.fee === null ? `${I("route", "xs")} Too far: delivers within ${r.rules.max_km} km` : r.fee === 0 ? `${I("bike", "xs")} Free delivery` :
      `${I("bike", "xs")} ${rs(r.rules.base_fee)} delivery up to ${r.rules.base_km} km · ${rs(r.min_order)} minimum`;
    return `<button class="rcard" data-a="rest" data-id="${esc(r.id)}" style="--i:${i}">
      <div class="im" ${bg(r.photo)}><div class="tags">${tags}</div><span class="eta">${I("clock", "xs")} ${r.eta} min</span>${r.is_open ? "" : `<div class="closed">Closed now</div>`}</div>
      <div class="bd"><div class="row between"><span class="nm ell">${esc(r.name)}</span>${r.rating ? `<span class="rating">${r.rating} ${I("star", "xs")}</span>` : `<span class="rating new">NEW</span>`}</div>
        <div class="meta ell">${esc(r.cuisines || "")}</div><div class="meta">${esc(r.area || "")}${r.km !== null ? ` · ${r.km} km` : ""}</div>
        <div class="fee">${fee}</div></div></button>`;
  }
  function renderHome() {
    const el = home.el, d = home.data, u = S.user, a = S.addr;
    const where = a ? `<b>${esc(a.label)} ${I("chevron-down", "xs")}</b><span class="ell">${esc(a.landmark)}</span>` : `<b>${S.here ? "Near you" : "Kulgam town"} ${I("chevron-down", "xs")}</b><span>Tap to set your delivery address</span>`;
    const list = d ? d.restaurants.filter(r => !home.cat || home.cat[2].test(r.cuisines + " " + r.sections.join(" "))).sort((x, y) => (y.is_open - x.is_open) || ((x.km ?? 99) - (y.km ?? 99))) : null;
    el.innerHTML = `<div class="scroll page-grad">
      <div class="home-head"><div class="row between"><button class="loc grow" data-a="where"><span class="pin">${I("map-pin")}</span><span class="grow">${where}</span></button>
        <button class="avatar" data-a="me" aria-label="Profile">${u && u.name ? esc(u.name[0].toUpperCase()) : I("user", "sm")}</button></div>
        <div class="hello">${greet()}${u && u.name ? ", " + esc(u.name.split(" ")[0]) : ""}<b>What are you craving?</b></div>
        <button class="searchbox" data-a="search">${I("search")}<span>Search pizza, wazwan, momos…</span></button></div>
      ${d ? (d.banners.length ? `<div class="bans">${d.banners.map(b => `<button class="ban" data-a="ban" data-id="${esc(b.restaurant_id || "")}" style="background-image:linear-gradient(90deg, rgb(8 40 22 / .85), rgb(8 40 22 / .1) 75%), url('${esc(KF.img(b.photo))}')">
          ${b.kicker ? `<small>${esc(b.kicker)}</small>` : ""}<b>${esc(b.title)}</b>${b.subtitle ? `<span>${esc(b.subtitle)}</span>` : ""}${b.restaurant_id ? `<em>Order now ${I("chevron-right", "xs")}</em>` : ""}</button>`).join("")}</div>
          <div class="dots">${d.banners.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : "")
        : `<div class="bans"><div class="ban skel"></div></div>`}
      <div class="sec"><h2>What's on your mind?</h2>${home.cat ? `<button data-a="allcats">Clear</button>` : ""}</div>
      <div class="cats">${CATS.map((c, i) => `<button class="cat" data-a="cat" data-i="${i}" aria-pressed="${home.cat === c}"><i style="background-image:url('img/food/${c[1]}.jpg')"></i>${c[0]}</button>`).join("")}</div>
      <div class="sec"><h2>${home.cat ? esc(home.cat[0]) + " in Kulgam" : "Restaurants in Kulgam"}</h2>${list ? `<span class="muted small">${plural(list.length, "place")}</span>` : ""}</div>
      <div class="stagger">${!list ? skelCards(2) : list.length ? list.map(rcard).join("") : empty("utensils", home.cat ? `No ${home.cat[0].toLowerCase()} yet` : "No restaurants yet",
        home.cat ? "Try another dish. More Kulgam kitchens are joining soon." : "Kulgam's kitchens are joining soon. Pull back in a little while.")}</div>
      <div class="madein">${I("heart", "xs")} Made for Kulgam · delivered by each restaurant's own riders</div>
      <div style="height:20px"></div></div>`;
    $$(".stagger > *", el).forEach((c, i) => c.style.setProperty("--i", i));
    const bans = $(".bans", el), dots = $$(".dots i", el);
    if (bans && dots.length) {
      bans.addEventListener("scroll", () => { const i = Math.round(bans.scrollLeft / (bans.firstElementChild.offsetWidth + 12)); dots.forEach((x, j) => x.classList.toggle("on", i === j)); }, { passive: true });
      clearInterval(home.slide);
      let touching = false; bans.addEventListener("touchstart", () => { touching = true; }, { passive: true }); bans.addEventListener("touchend", () => { setTimeout(() => { touching = false; }, 3000); });
      home.slide = setInterval(() => {
        if (!bans.isConnected) return clearInterval(home.slide);
        if (touching || el.hidden) return;
        const w = bans.firstElementChild.offsetWidth + 12, i = Math.round(bans.scrollLeft / w), n = (i + 1) % dots.length;
        bans.scrollTo({ left: n * w, behavior: "smooth" });
      }, 4200);
    }
  }
  async function loadHome() {
    const p = S.point;
    try {
      home.data = await get(`/v1/home?lat=${p.lat}&lon=${p.lon}`); KF.ls.set("kf_home", home.data);
    } catch (e) { if (!home.data) { home.el.innerHTML = `<div class="scroll page-grad safe">${empty("refresh-cw", "Can't reach Kezia's Food", e.message, `<button class="btn" data-a="retry">Try again</button>`)}</div>`; return; } fail(e); }
    renderHome();
  }
  function initHome(el) {
    home.el = el;
    bind(el, {
      where: () => chooseAddress(),
      me: () => KF.tab("profile"),
      search: () => KF.tab("search"),
      rest: b => openRestaurant(b.dataset.id),
      ban: b => b.dataset.id && openRestaurant(b.dataset.id),
      cat: b => { const c = CATS[b.dataset.i]; home.cat = home.cat === c ? null : c; haptic(); renderHome(); $(".sec + .cats", el).scrollIntoView({ block: "start", behavior: "smooth" }); },
      allcats: () => { home.cat = null; renderHome(); },
      retry: () => { renderHome(); loadHome(); },
    });
    on("addr", () => { if (home.data) renderHome(); loadHome(); });
    on("auth", () => home.data && renderHome());
    home.data = KF.ls.get("kf_home", null);
    renderHome();
  }

  // ---------- search ----------
  const srch = { el: null, q: "", t: null };
  function initSearch(el) {
    srch.el = el;
    const popular = ["Pizza", "Wazwan", "Momos", "Biryani", "Burger", "Rista", "Shawarma", "Cold coffee"];
    el.innerHTML = `<div class="topbar" style="padding-left:var(--gut);padding-right:var(--gut)"><label class="searchbox" style="margin:0">${I("search")}
      <input data-q placeholder="Dishes or restaurants" style="border:0;outline:0;background:none;font:inherit;flex:1;color:var(--ink);min-width:0" enterkeyhint="search"></label></div>
      <div class="scroll" data-res></div>`;
    const input = $("[data-q]", el), res = $("[data-res]", el);
    const idle = () => {
      const recent = KF.ls.get("kf_recent", []);
      res.innerHTML = `${recent.length ? `<div class="sec"><h2>Recent</h2><button data-a="clear">Clear</button></div><div class="chips pad">${recent.map(q => `<button class="chip" data-a="q" data-q="${esc(q)}">${I("clock", "xs")} ${esc(q)}</button>`).join("")}</div>` : ""}
        <div class="sec"><h2>Popular in Kulgam</h2></div><div class="chips pad wrap">${popular.map(q => `<button class="chip" data-a="q" data-q="${esc(q)}">${I("flame", "xs")} ${esc(q)}</button>`).join("")}</div>
        <div class="sec"><h2>Explore</h2></div><div class="cats">${CATS.map((c, i) => `<button class="cat" data-a="q" data-q="${c[0].replace(/s$/, "")}"><i style="background-image:url('img/food/${c[1]}.jpg')"></i>${c[0]}</button>`).join("")}</div>`;
    };
    const run = async q => {
      srch.q = q;
      if (q.length < 2) return idle();
      res.innerHTML = skelLines(5);
      try {
        const j = await get("/v1/search?q=" + encodeURIComponent(q));
        if (srch.q !== q) return;
        const rec = [q, ...KF.ls.get("kf_recent", []).filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6); KF.ls.set("kf_recent", rec);
        res.innerHTML = !j.restaurants.length && !j.items.length ? empty("search", `Nothing for "${q}"`, "Try another dish, like pizza or rista.") :
          `${j.restaurants.length ? `<div class="sec"><h2>Restaurants</h2></div><div class="menu-list">${j.restaurants.map(r => `<button data-a="rest" data-id="${esc(r.id)}">
            <span class="tile" ${KF.bgc(r.photo)}>${r.photo ? "" : I("store", "sm")}</span>
            <span>${esc(r.name)}<small>${esc(r.cuisines || "")} · ${esc(r.area || "")}${r.is_open ? "" : " · Closed"}</small></span>${I("chevron-right", "sm muted")}</button>`).join("")}</div>` : ""}
          ${j.items.length ? `<div class="sec"><h2>Dishes</h2></div><div class="card stagger" style="padding:4px 14px">${j.items.map((it, i) => `<button class="mitem" style="width:100%;text-align:left;--i:${i}" data-a="dish" data-id="${esc(it.restaurant_id)}" data-item="${it.id}">
            <span class="ph" ${bg(it.photo)}>${it.photo ? "" : I("utensils", "sm")}</span><span>${vegMark(it.veg)} <b>${esc(it.name)}</b><small>${esc(it.restaurant)}${it.in_stock ? "" : " · Sold out"}</small></span>
            <b>${rs(it.price)}</b></button>`).join("")}</div>` : ""}`;
      } catch (e) { res.innerHTML = empty("circle-alert", "Search didn't work", e.message); }
    };
    input.oninput = () => { clearTimeout(srch.t); srch.t = setTimeout(() => run(input.value.trim()), 300); };
    input.onkeydown = e => { if (e.key === "Enter") { clearTimeout(srch.t); run(input.value.trim()); input.blur(); } };
    bind(el, {
      q: b => { input.value = b.dataset.q; run(b.dataset.q); },
      clear: () => { KF.ls.del("kf_recent"); idle(); },
      rest: b => openRestaurant(b.dataset.id),
      dish: b => openRestaurant(b.dataset.id, { item: Number(b.dataset.item) }),
    });
    idle();
    srch.focus = () => setTimeout(() => !srch.q && input.focus(), 350);
  }

  // ---------- restaurant ----------
  function openRestaurant(id, opts = {}) {
    push(async (el, scr) => {
      el.innerHTML = `<div class="scroll"><div class="rhead skel" style="border-radius:0"></div><div class="rinfo"><div class="skel" style="height:24px;width:60%"></div>
        <div class="skel" style="height:12px;width:40%;margin-top:10px"></div><div class="facts"><div class="skel" style="height:50px"></div><div class="skel" style="height:50px"></div><div class="skel" style="height:50px"></div></div></div>${skelLines(4)}</div>
        <div class="rhead-bar"><button class="iconbtn glass" data-a="back" aria-label="Back">${I("arrow-left")}</button></div>`;
      bind(el, { back: () => pop(scr) });
      const p = S.point;
      let j;
      try { j = await get(`/v1/restaurants/${encodeURIComponent(id)}?lat=${p.lat}&lon=${p.lon}`); }
      catch (e) { el.innerHTML = `${topbar("Restaurant")}${empty("store", "Couldn't open this restaurant", e.message)}`; return; }
      if (!scr.alive) return;
      const r = j.restaurant; let veg = false;
      const items = new Map(j.items.map(i => [i.id, i]));
      const secs = j.sections.filter(s => j.items.some(i => i.section_id === s.id));
      const loose = j.items.filter(i => !j.sections.some(s => s.id === i.section_id));
      if (loose.length) secs.push({ id: 0, name: "More" });
      const fee = r.fee === null ? `<b class="red">Too far</b><span>within ${r.rules.max_km} km</span>` : `<b>${r.fee ? rs(r.fee) : "Free"}</b><span>delivery${r.km !== null ? " · " + r.km + " km" : ""}</span>`;
      const itemHTML = it => `<div class="item ${it.in_stock ? "" : "off"}" data-item="${it.id}"><div>${vegMark(it.veg)}${it.bestseller ? `<span class="best">${I("star", "xs")} Bestseller</span>` : ""}
          <b>${esc(it.name)}</b><div class="p">${it.variants && it.variants.length ? `${rs(it.price)} <span class="muted small" style="font-weight:600">onwards · ${it.variants.map(v => esc(v.n)).join(" / ")}</span>` : rs(it.price)}</div>${it.description ? `<div class="d">${esc(it.description)}</div>` : ""}</div>
          <div class="pic" ${bg(it.photo)}>${it.photo ? "" : I("utensils", "lg")}<span data-addbox="${it.id}">${addHTML(it)}</span></div></div>`;
      const menuHTML = () => secs.map(s => {
        const list = (s.id ? j.items.filter(i => i.section_id === s.id) : loose).filter(i => !veg || i.veg);
        return list.length ? `<div class="msec" data-sec="${s.id}"><h3>${esc(s.name)} <span class="muted small">${list.length}</span></h3>${list.map(itemHTML).join("")}</div>` : "";
      }).join("") || empty("leaf", "No veg dishes here", "Turn off veg only to see the full menu.");
      el.innerHTML = `<div class="topbar rtop"><button class="iconbtn plain" data-a="back" aria-label="Back">${I("arrow-left")}</button><h1>${esc(r.name)}</h1></div>
        <div class="scroll" data-scroll>
          <div class="rhead" ${bg(r.photo)}><div class="bar"><button class="iconbtn glass" data-a="back" aria-label="Back">${I("arrow-left")}</button>
            <button class="iconbtn glass" data-a="callr" aria-label="Call restaurant">${I("phone")}</button></div></div>
          <div class="rinfo fadein"><div class="row between" style="align-items:flex-start"><div class="grow"><h1>${esc(r.name)}</h1><div class="meta">${esc(r.cuisines || "")}</div>
            <div class="meta">${I("map-pin", "xs")} ${esc(r.address || r.area || "")}</div></div>
            ${r.rating ? `<span class="rating" style="flex-direction:column;padding:6px 9px;font-size:14px">${r.rating} ${I("star", "xs")}<small style="font-size:9.5px;opacity:.9">${plural(r.ratings, "rating")}</small></span>` : `<span class="rating new">NEW</span>`}</div>
            <div class="facts"><div><b>${I("clock", "xs")} ${r.eta}</b><span>minutes</span></div><div>${fee}</div><div><b>${rs(r.min_order)}</b><span>minimum order</span></div></div>
            <div class="own">${I("bike", "sm")} Delivered by ${esc(r.name)}'s own rider · ${r.rules.per_km ? `then ${rs(r.rules.per_km)}/km after ${r.rules.base_km} km` : "flat fee"}</div>
            ${r.status === "test" ? `<div class="warn" style="margin-top:12px">${I("info", "sm")} This is a test restaurant for trying the app. Orders are not real.</div>` : ""}
            ${r.is_open ? "" : `<div class="warn red" style="margin-top:12px">${I("moon", "sm")} Closed right now${r.hours ? ` · Opens ${esc(r.hours)}` : ""}. You can still look at the menu.</div>`}</div>
          <div class="menutabs" style="top:calc(var(--sat) + 58px)"><div class="chips"><button class="chip" data-a="veg" aria-pressed="false">${vegMark(true)} Veg only</button>
            ${secs.map(s => `<button class="chip" data-a="jump" data-sec="${s.id}">${esc(s.name)}</button>`).join("")}</div></div>
          <div data-menu>${menuHTML()}</div><div style="height:110px"></div>
          <p class="note pad" style="text-align:center;margin-top:-80px">Prices are set by the restaurant. Pay ${esc(r.name)} directly by UPI${r.cod ? " or cash" : ""}.</p><div style="height:90px"></div>
        </div><div data-cartbar>${cartbar()}</div>`;
      const sc = $("[data-scroll]", el), rtop = $(".rtop", el), chips = $(".menutabs .chips", el);
      let spyT = 0;
      sc.addEventListener("scroll", () => {
        rtop.classList.toggle("show", sc.scrollTop > 190);
        if (Date.now() - spyT < 120) return; spyT = Date.now();
        const y = sc.scrollTop + 130; let cur = null;
        $$(".msec", el).forEach(s => { if (s.offsetTop <= y) cur = s.dataset.sec; });
        $$("[data-a=jump]", chips).forEach(c => { const onNow = c.dataset.sec === cur; if (onNow && c.getAttribute("aria-pressed") !== "true") chips.scrollTo({ left: c.offsetLeft - 60, behavior: "smooth" }); c.setAttribute("aria-pressed", onNow); });
      }, { passive: true });
      const refreshItem = id => { const box = $(`[data-addbox="${id}"]`, el); if (box) { box.innerHTML = addHTML(items.get(id)); const a = box.firstElementChild; a.classList.add("pop"); } };
      const refreshBar = () => { $("[data-cartbar]", el).innerHTML = cartbar(); };
      const off = () => { if (!scr.alive) return; items.forEach((_, id) => { const box = $(`[data-addbox="${id}"]`, el); if (box) box.innerHTML = addHTML(items.get(id)); }); refreshBar(); };
      on("cart", off);
      bind(el, {
        back: () => pop(scr),
        callr: () => r.phone ? call(r.phone) : toast("No phone number listed", "info"),
        inc: async b => { const it = items.get(Number(b.dataset.id)); if (await setQty(r, it, qtyOf(it.id) + 1)) { refreshItem(it.id); refreshBar(); } },
        sizes: b => {
          const it = items.get(Number(b.dataset.id));
          const s = sheet(`<h2>${esc(it.name)}</h2><p class="sub">${esc(it.description || "Choose a size")}</p><div data-sz></div><button class="btn" data-done style="margin-top:14px">Done</button>`,
            { onClose: () => { refreshItem(it.id); refreshBar(); } });
          const fill = () => { $("[data-sz]", s).innerHTML = it.variants.map((v, i) => `<div class="opt" style="grid-template-columns:1fr auto auto;cursor:default">
              <span><b>${esc(v.n)}</b></span><b style="margin-right:6px">${rs(v.p)}</b>
              ${sizeQty(it.id, i) ? `<div class="qty"><button data-a="szdec" data-v="${i}">−</button><span>${sizeQty(it.id, i)}</span><button data-a="szinc" data-v="${i}">+</button></div>`
                : `<button class="btn soft sm" data-a="szinc" data-v="${i}">Add</button>`}</div>`).join(""); };
          fill();
          $("[data-done]", s).onclick = () => s.close();
          bind(s, {
            szinc: async x => { const v = Number(x.dataset.v); if (await setQty(r, lineOf(it, v), sizeQty(it.id, v) + 1)) fill(); },
            szdec: async x => { const v = Number(x.dataset.v); await setQty(r, lineOf(it, v), sizeQty(it.id, v) - 1); fill(); },
          });
        },
        dec: async b => { const it = items.get(Number(b.dataset.id)); await setQty(r, it, qtyOf(it.id) - 1); refreshItem(it.id); refreshBar(); },
        veg: b => { veg = !veg; b.setAttribute("aria-pressed", veg); $("[data-menu]", el).innerHTML = menuHTML(); haptic(); },
        jump: b => { const s = $(`.msec[data-sec="${b.dataset.sec}"]`, el); if (s) sc.scrollTo({ top: s.offsetTop - 110, behavior: "smooth" }); },
        cart: () => openCart(),
      });
      if (opts.item) setTimeout(() => { const it = $(`[data-item="${opts.item}"]`, el); if (it) { sc.scrollTo({ top: it.offsetTop - 140, behavior: "smooth" }); it.classList.add("flash"); } }, 350);
    });
  }

  // ---------- cart & checkout ----------
  function openCart() {
    push(async (el, scr) => {
      let pay = KF.ls.get("kf_pay", "upi"), q = null, r = null, note = "", seq = 0;
      const render = () => {
        if (!S.cart) { el.innerHTML = `${topbar("Your cart")}<div class="scroll">${empty("shopping-bag", "Your cart is empty", "Add something tasty from a Kulgam kitchen.", `<button class="btn" data-a="back">Browse food</button>`)}</div>`; return; }
        const a = S.addr, lines = Object.values(S.cart.items);
        const cod = r ? r.cod : true;
        if (!cod && pay === "cod") pay = "upi";
        el.innerHTML = `${topbar("Your cart")}<div class="scroll" data-scroll>
          <div class="card fadein"><div class="row between"><h3 style="margin:0">${esc(S.cart.rname)}</h3><button class="link small" data-a="more">Add more</button></div>
            ${lines.map(l => `<div class="ci"><span>${vegMark(l.veg)} <b style="font-size:14.5px">${esc(l.name)}</b><br><span class="muted small">${rs(l.price)} each</span></span>
              <div class="qty"><button data-a="dec" data-id="${esc(keyOf(l))}">−</button><span>${l.qty}</span><button data-a="inc" data-id="${esc(keyOf(l))}">+</button></div><b>${rs(l.price * l.qty)}</b></div>`).join("")}
            <textarea class="input" data-note placeholder="Note for the kitchen (less spicy, no onion…)" maxlength="200" style="margin-top:10px;min-height:60px">${esc(note)}</textarea></div>
          <div class="card"><h3>Deliver to</h3>${a ? `<div class="addr"><span class="tile">${I(a.label === "Work" ? "store" : "house", "sm")}</span><span><b>${esc(a.label)}</b><br><span class="muted small">${esc(a.landmark)}</span></span>
              <button class="link small" data-a="addr">Change</button></div>` : `<button class="opt" data-a="addr"><span class="tile">${I("map-pin", "sm")}</span><span><b>Add delivery address</b><span>Pin your door on the map</span></span>${I("chevron-right", "sm")}</button>`}</div>
          <div class="card"><h3>Pay with</h3>
            <button class="opt" data-a="pay" data-p="upi" aria-checked="${pay === "upi"}"><span class="tile">${I("qr-code", "sm")}</span><span><b>UPI to the restaurant</b><span>Scan or tap to pay once they accept. No extra charge</span></span><i class="radio"></i></button>
            <button class="opt" data-a="pay" data-p="cod" aria-checked="${pay === "cod"}" aria-disabled="${!cod}"><span class="tile gold">${I("banknote", "sm")}</span><span><b>Cash on delivery</b><span>${cod ? "Pay the rider when the food arrives" : "This restaurant takes UPI only"}</span></span><i class="radio"></i></button></div>
          <div class="card" data-bill>${q ? billHTML(q) : skelLines(3).replace('class="card"', 'style="margin:-16px"')}</div>
          <div class="pad"><p class="note">${I("info", "xs")} Cancel free until you pay. After payment you have ${r ? r.rules.cancel_min : 2} minutes to cancel with a full refund, then the kitchen starts cooking.</p></div>
          <div style="height:20px"></div></div>
          <div class="foot"><button class="btn shine" data-a="place" ${q && !q.problems.length ? "" : "disabled"}>${q ? `Place order · ${rs(q.total)}` : "Checking prices…"}</button></div>`;
        lift($("[data-scroll]", el), $(".topbar", el));
        $("[data-note]", el).oninput = e => { note = e.target.value; };
      };
      const billHTML = q => `<h3>Bill</h3><div class="line"><span>Items</span><b>${rs(q.item_total)}</b></div>
        <div class="line"><span>Delivery<small>${q.km} km by road${r && r.rules.free_above ? ` · free over ${rs(r.rules.free_above)}` : ""}</small></span>${q.promo ? `<b><s class="muted" style="font-weight:600">${rs(q.delivery_fee)}</s> <span class="green">FREE</span></b>` : `<b>${q.delivery_fee ? rs(q.delivery_fee) : "Free"}</b>`}</div>
        ${q.promo ? `<div class="warn green" style="margin:4px 0 6px">${I("party-popper", "sm")} <span>${esc(q.promo.label)}. Welcome to Kezia's Food!</span></div>` : ""}
        ${q.packing ? `<div class="line"><span>Packing</span><b>${rs(q.packing)}</b></div>` : ""}
        <div class="line total"><span>To pay</span><span>${rs(q.total)}</span></div>
        <div class="muted small" style="margin-top:6px">${I("clock", "xs")} Arrives in about ${q.eta} min</div>
        ${q.problems.map(p => `<div class="warn red" style="margin-top:10px">${I("circle-alert", "sm")} ${esc(p)}</div>`).join("")}`;
      const requote = async () => {
        if (!S.cart) return render();
        const my = ++seq, p = S.point;
        try {
          if (!r) r = (await get(`/v1/restaurants/${encodeURIComponent(S.cart.rid)}?lat=${p.lat}&lon=${p.lon}`)).restaurant;
          const j = await post("/v1/quote", { restaurant_id: S.cart.rid, items: cartItems(), lat: p.lat, lon: p.lon });
          if (my !== seq || !scr.alive) return;
          q = j;
          if (!S.addr) q.problems = ["Add your delivery address to see the exact delivery fee", ...q.problems];
        } catch (e) { q = null; fail(e); }
        render();
      };
      on("addr", () => scr.alive && requote());
      on("auth", () => scr.alive && requote());
      bind(el, {
        back: () => pop(scr),
        more: () => pop(scr),
        inc: b => { const l = S.cart.items[b.dataset.id]; setQty({ id: S.cart.rid, name: S.cart.rname }, l, l.qty + 1); q = null; render(); requote(); },
        dec: b => { const l = S.cart.items[b.dataset.id]; setQty({ id: S.cart.rid, name: S.cart.rname }, l, l.qty - 1); q = null; render(); requote(); },
        addr: async () => { if (!(await login("Log in to add where we deliver."))) return; if (S.addresses.length) chooseAddress(); else pickPlace(); },
        pay: b => { if (b.getAttribute("aria-disabled") === "true") return toast("This restaurant takes UPI only", "info"); pay = b.dataset.p; KF.ls.set("kf_pay", pay); haptic(); render(); },
        place: b => busy(b, async () => {
          if (!(await login("Log in to place your order."))) return;
          if (!S.addr) { await (S.addresses.length ? chooseAddress() : pickPlace()); return; }
          const j = await post("/v1/orders", { restaurant_id: S.cart.rid, items: cartItems(), address_id: S.addrId, pay_method: pay, note });
          S.cart = null; S.saveCart(); emit("cart"); haptic("success"); askNotify();
          popAll(); KF.tab("orders"); openOrder(j.order.id, j.order); emit("orders");
        }),
      });
      render(); requote();
    });
  }

  // ---------- one order: the whole journey ----------
  const upiLink = (scheme, o) => `${scheme}?pa=${encodeURIComponent(o.pay.upi_id)}&pn=${encodeURIComponent(o.pay.upi_name)}&am=${o.total}.00&cu=INR&tn=${encodeURIComponent("Kezia's Food " + o.id)}`;
  const phase = o => o.status === "placed" ? "wait" : o.status === "accepted" ? "pay" : o.status === "pay_claimed" ? "verify" : ["confirmed", "preparing", "out"].includes(o.status) ? "track" : o.status === "delivered" ? "done" : "closed";
  function detailsHTML(o) {
    return `<div class="card"><div class="row between"><h3 style="margin:0">Order ${esc(o.id)}</h3><span class="muted small">${when(o.times.created)}</span></div>
      ${o.items.map(l => `<div class="line"><span>${vegMark(l.veg)} ${l.qty} × ${esc(l.name)}</span><b>${rs(l.price * l.qty)}</b></div>`).join("")}
      <div class="line" style="border-top:1px dashed var(--line-2);margin-top:6px;padding-top:10px"><span>Delivery (${o.km} km)</span><b>${o.delivery_fee ? rs(o.delivery_fee) : "Free"}</b></div>
      ${o.promo_amount ? `<div class="line green"><span>${esc(o.promo || "Offer")}</span><b class="green">−${rs(o.promo_amount)}</b></div>` : ""}
      ${o.packing ? `<div class="line"><span>Packing</span><b>${rs(o.packing)}</b></div>` : ""}
      <div class="line total"><span>Total</span><span>${rs(o.total)}</span></div>
      <div class="line"><span>Payment</span><b>${o.pay_method === "cod" ? "Cash on delivery" : "UPI to restaurant"}${o.utr ? ` · ref ${esc(o.utr)}` : ""}</b></div>
      <div class="line"><span>Deliver to</span><b style="text-align:right">${esc(o.address.label)} · ${esc(o.address.landmark)}</b></div>
      ${o.note ? `<div class="line"><span>Note</span><b style="text-align:right">${esc(o.note)}</b></div>` : ""}</div>`;
  }
  const callRow = o => `<div class="two" style="margin:0 var(--gut) 14px">${o.restaurant.phone ? `<button class="btn ghost sm" style="width:100%" data-a="callr">${I("phone", "sm")} Restaurant</button>` : ""}
    ${o.rider && o.rider.phone ? `<button class="btn soft sm" style="width:100%" data-a="callrider">${I("bike", "sm")} Rider</button>` : `<button class="btn ghost sm" style="width:100%" data-a="help">${I("circle-help", "sm")} Help</button>`}</div>`;

  function openOrder(id, first) {
    push(async (el, scr) => {
      let o = first || null, key = "", m = null, marks = {}, line = null, timer = null, routeKey = "";
      el.innerHTML = `${topbar("Order " + id)}<div class="scroll">${skelLines(5)}</div>`;
      bind(el, { back: () => pop(scr) });
      const build = () => {
        const ph = phase(o), r = o.restaurant;
        if (m) { m.remove(); m = null; marks = {}; line = null; routeKey = ""; }
        const head = ph === "track" ? "" : topbar(ph === "pay" ? "Pay " + r.name : "Order " + o.id, ph === "pay" ? `<span class="countdown">${I("timer", "xs")} <span data-until="${o.times.pay_by}">--:--</span></span>` : "");
        let body = "";
        if (ph === "wait") body = `<div class="center" style="min-height:62%"><div><div class="radar"><i></i><i></i><i></i><div class="core">${I("chef-hat")}</div></div>
            <h1>Waiting for ${esc(r.name)}</h1><p>They have <b class="timer" data-until="${o.times.accept_by}">--:--</b> to accept your order.<br>${o.pay_method === "upi" ? "You'll pay them by UPI as soon as they accept." : "You'll pay cash when the food arrives."}</p>
            <div class="tbar" data-until="${o.times.accept_by}" data-bar="${Math.max(1, (Date.parse(o.times.accept_by) - Date.parse(o.times.created)) / 60000)}"><i style="width:100%"></i></div></div></div>
          ${detailsHTML(o)}<div class="pad"><button class="btn ghost" data-a="cancel">Cancel order</button><p class="note" style="text-align:center">Free to cancel, nothing has been paid.</p></div>`;
        else if (ph === "pay") body = `<div class="amount fadein"><small>Pay ${esc(o.pay.upi_name)}</small><b>${rs(o.total)}</b></div>
          ${o.pay_issue ? `<div class="warn red" style="margin:0 var(--gut) 12px">${I("circle-alert", "sm")} <span>${esc(r.name)} hasn't received your payment yet. Check your UPI app: if the money left your account, enter the reference number and tap "I've paid" again, or call them.</span></div>` : ""}
          <div class="qrwrap" data-qr></div><div class="qrsub">${I("shield-check", "xs")} Money goes straight to the restaurant</div>
          <div style="text-align:center"><button class="upiid" data-a="copy">${esc(o.pay.upi_id)} ${I("copy", "xs")}</button></div>
          <div class="card" style="margin-top:18px"><h3>Pay with</h3><div class="apps">
            <button data-a="upi" data-s="tez://upi/pay"><i style="background:#1a73e8">G</i>GPay</button><button data-a="upi" data-s="phonepe://pay"><i style="background:#5f259f">Pe</i>PhonePe</button>
            <button data-a="upi" data-s="paytmmp://pay"><i style="background:#00b9f1">P</i>Paytm</button><button data-a="upi" data-s="upi://pay"><i style="background:var(--g)">${I("smartphone", "xs")}</i>Any UPI</button></div>
            <p class="note" style="margin:10px 0 0">Or scan the QR from any UPI app. Pay exactly <b>${rs(o.total)}</b>.</p></div>
          <div class="card"><h3>After paying</h3><div class="steps3"><div><i>1</i><span>Copy the 12-digit <b>UPI reference / UTR</b> from your UPI app (it helps the restaurant find your payment).</span></div>
            <div><i>2</i><span>Paste it here and tap <b>I've paid</b>. ${esc(r.name)} checks and confirms.</span></div></div>
            <input class="input utr" data-utr inputmode="numeric" maxlength="12" placeholder="UPI reference (optional)" style="margin-top:12px"></div>
          <div class="pad"><button class="btn shine" data-a="paid">${I("check", "sm")} I've paid ${rs(o.total)}</button>
            <button class="btn ghost" style="margin-top:10px" data-a="cancel">Cancel order</button><p class="note" style="text-align:center">Don't pay after the timer ends: the order expires.</p></div>
          ${detailsHTML(o)}`;
        else if (ph === "verify") body = `<div class="center" style="min-height:58%"><div><div class="radar"><i></i><i></i><i></i><div class="core" style="background:linear-gradient(120deg,#e8a317,#f2bd45)">${I("shield-check")}</div></div>
            <h1>Checking your payment</h1><p>${esc(r.name)} is confirming ${rs(o.total)}${o.utr ? ` (ref ${esc(o.utr)})` : ""} in their UPI app. This usually takes a minute.</p></div></div>
          ${callRow(o)}${detailsHTML(o)}<div class="pad"><button class="btn ghost" data-a="cancel">Cancel and get a refund</button></div>`;
        else if (ph === "track") body = `<div class="trackmap"><div class="mapel"></div><div class="rhead-bar"><button class="iconbtn glass" data-a="back" aria-label="Back">${I("arrow-left")}</button></div></div><div data-info></div>`;
        else if (ph === "done") {
          const conf = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * Math.PI * 2, d = 70 + (i % 3) * 18;
            return `<i style="--c:${["#0f8a4f", "#e8a317", "#22b46a", "#f2bd45", "#d23a3a"][i % 5]};--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;animation-delay:${i % 4 * 40}ms"></i>`; }).join("");
          body = `<div class="center" style="padding-top:24px;padding-bottom:10px"><div><div class="burst">${conf}<div class="ok">${I("check")}</div></div><h1>Delivered. Enjoy your meal!</h1>
            <p>${esc(r.name)} delivered at ${time(o.times.delivered)}.</p></div></div>
            <div class="card" style="text-align:center" data-rate>${o.rating ? `<h3>Your rating</h3><div class="stars">${[1, 2, 3, 4, 5].map(n => `<span class="${n <= o.rating ? "on" : ""}" style="color:${n <= o.rating ? "var(--gold)" : "var(--line-2)"}">${I("star", "lg")}</span>`).join("")}</div>${o.review ? `<p class="note">"${esc(o.review)}"</p>` : ""}`
              : `<h3>How was the food?</h3><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-a="star" data-n="${n}" aria-label="${n} stars">${I("star", "lg")}</button>`).join("")}</div>
                <textarea class="input" data-review placeholder="Tell others what you liked (optional)" style="margin-top:14px;min-height:64px" hidden></textarea><button class="btn" data-a="rate" style="margin-top:12px" hidden>Send rating</button>`}</div>
            ${detailsHTML(o)}<div class="pad"><button class="btn soft" data-a="again">${I("refresh-cw", "sm")} Order again</button></div>`;
        } else {
          const why = o.status === "rejected" ? (o.reject_reason || "The restaurant couldn't take this order") : o.status === "expired" ? o.cancel_reason : o.cancel_by === "customer" ? "You cancelled this order" : o.cancel_reason;
          const refund = !o.refund ? "" : o.refund === "due" ? `<div class="warn">${I("hand-coins", "sm")} <span>${esc(r.name)} will send <b>${rs(o.total)}</b> back to your UPI. Call them if it doesn't arrive in a few hours.</span></div>`
            : o.refund === "sent" ? `<div class="warn green">${I("hand-coins", "sm")} <span>${esc(r.name)} says they've sent your <b>${rs(o.total)}</b> refund. Check your bank app.</span></div><button class="btn soft" data-a="gotrefund" style="margin-top:10px">I received the refund</button>`
            : `<div class="warn green">${I("circle-check", "sm")} Refund of ${rs(o.total)} received.</div>`;
          body = `<div class="center" style="padding-top:30px;padding-bottom:16px"><div><div class="empty" style="padding:0"><div class="art" style="background:var(--red-soft);color:var(--red)">${I("circle-x")}</div></div>
            <h1>${STATUS[o.status]}</h1><p>${esc(why || "")}</p></div></div>${refund ? `<div class="card">${refund}</div>` : ""}${callRow(o)}${detailsHTML(o)}
            <div class="pad"><button class="btn soft" data-a="again">${I("refresh-cw", "sm")} Order again</button></div>`;
        }
        el.innerHTML = `${head}<div class="scroll" data-scroll>${body}<div style="height:24px"></div></div>`;
        if (head) lift($("[data-scroll]", el), $(".topbar", el));
        if (ph === "pay") {
          const qr = qrcode(0, "M"); qr.addData(upiLink("upi://pay", o)); qr.make();
          $("[data-qr]", el).innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + `<i class="scan"></i>`;
          const u = $("[data-utr]", el); u.value = KF.ls.get("kf_utr_" + o.id, ""); u.oninput = () => { u.value = u.value.replace(/\D/g, "").slice(0, 12); KF.ls.set("kf_utr_" + o.id, u.value); };
        }
        if (ph === "track") { fillTrack(); initMap(); }
      };
      const fillTrack = () => {
        const r = o.restaurant, st = o.status, info = $("[data-info]", el);
        const eta = new Date(Date.parse(o.times.confirmed || o.times.created) + (r.prep_min + o.km * 4 + 5) * 60000);
        const big = st === "confirmed" ? "Order confirmed" : st === "preparing" ? "Cooking your food" : `${o.rider && o.rider.name ? esc(o.rider.name.split(" ")[0]) : "Your rider"} is on the way`;
        const sub = st === "out" ? `Arriving around ${time(Math.max(eta, now() + 3 * 60000))}` : `Estimated arrival ${time(eta)}`;
        const n = { confirmed: 1, preparing: 2, out: 3 }[st];
        const canCancel = st === "confirmed" && o.times.cancel_until && Date.parse(o.times.cancel_until) > now();
        const steps = [["Order placed", o.times.created], ["Accepted", o.times.accepted], ...(o.pay_method === "upi" ? [["Payment confirmed", o.times.confirmed]] : []),
          ["Cooking", o.times.preparing], ["Out for delivery", o.times.out], ["Delivered", null]];
        const curIdx = steps.findIndex(s => !s[1]);
        info.innerHTML = `<div class="status"><div class="row between"><div class="grow"><div class="big">${big}</div><div class="sub">${sub}</div></div>
            <span class="tile" style="width:52px;height:52px;border-radius:16px">${I(st === "out" ? "bike" : st === "preparing" ? "chef-hat" : "circle-check", "lg")}</span></div>
          <div class="prog">${[0, 1, 2, 3, 4].map(i => `<i class="${i < n + 1 ? "done" : i === n + 1 ? "now" : ""}"></i>`).join("")}</div>
          ${canCancel ? `<div class="row between" style="margin-top:14px"><span class="small muted">Changed your mind? Cancel with a full refund for <b class="timer red" data-until="${o.times.cancel_until}">--:--</b></span>
            <button class="btn danger sm" data-a="cancel">Cancel</button></div>` : ""}</div>
          ${o.rider && st === "out" ? `<div class="card row"><span class="avatar">${esc((o.rider.name || "R")[0].toUpperCase())}</span><span class="grow"><b>${esc(o.rider.name || "Rider")}</b><br><span class="muted small">${esc(r.name)}'s rider${o.rider.at ? " · seen " + time(o.rider.at) : ""}</span></span>
            <button class="iconbtn" data-a="callrider" aria-label="Call rider" style="background:var(--g);color:#fff;box-shadow:var(--glow)">${I("phone", "sm")}</button></div>` : ""}
          <div class="card tl">${steps.map((s, i) => `<div class="${s[1] ? "done" : i === curIdx ? "now" : ""}"><b>${s[1] ? I("check", "xs") : i + 1}</b><span>${s[0]}</span><span class="small muted">${s[1] ? time(s[1]) : ""}</span></div>`).join("")}</div>
          ${o.pay_method === "cod" ? `<div class="warn" style="margin:0 var(--gut) 14px">${I("banknote", "sm")} Keep ${rs(o.total)} cash ready for the rider.</div>` : ""}
          ${callRow(o)}${detailsHTML(o)}`;
        updateMap();
      };
      const initMap = async () => {
        const r = o.restaurant, a = o.address;
        m = await map($(".trackmap .mapel", el), { center: [(r.lat + a.lat) / 2, (r.lon + a.lon) / 2], zoom: 14 });
        if (!scr.alive) return;
        marks.rest = L.marker([r.lat, r.lon], { icon: pin("rest", "chef-hat"), interactive: false }).addTo(m);
        marks.home = L.marker([a.lat, a.lon], { icon: pin("home", "house"), interactive: false }).addTo(m);
        m.fitBounds(L.latLngBounds([[r.lat, r.lon], [a.lat, a.lon]]), { padding: [60, 60], maxZoom: 16 });
        updateMap();
      };
      const updateMap = () => {
        if (!m) return;
        const r = o.restaurant, a = o.address, rd = o.rider && o.rider.lat ? [o.rider.lat, o.rider.lon] : null;
        const from = o.status === "out" && rd ? rd : [r.lat, r.lon];
        if (!line) line = L.polyline([from, [a.lat, a.lon]], { color: "#0f8a4f", weight: 5, lineCap: "round", className: "route-glow", interactive: false }).addTo(m);
        // follow the real roads; ask again only when the start point has moved
        const key = from.map(x => x.toFixed(3)).join(",");
        if (key !== routeKey) { routeKey = key;
          get(`/v1/route?from=${from.join(",")}&to=${a.lat},${a.lon}`).then(r => { if (scr.alive && line) line.setLatLngs(r.line); }).catch(() => {}); }
        if (o.status === "out" && rd) {
          if (!marks.rider) { marks.rider = L.marker(rd, { icon: pin("rider", "bike"), interactive: false, zIndexOffset: 500 }).addTo(m); m.fitBounds(L.latLngBounds([rd, [a.lat, a.lon]]), { padding: [60, 60], maxZoom: 16 }); }
          else glide(marks.rider, rd);
        }
      };
      const glide = (mk, to) => { // move the rider smoothly between GPS updates
        const from = mk.getLatLng(), t0 = performance.now();
        const stepf = t => { const k = Math.min(1, (t - t0) / 1200); mk.setLatLng([from.lat + (to[0] - from.lat) * k, from.lng + (to[1] - from.lng) * k]); if (k < 1 && scr.alive) requestAnimationFrame(stepf); };
        requestAnimationFrame(stepf);
      };
      let shown = null;
      const show = (n) => {
        const was = o && o.status; o = n;
        const k = [o.status, o.pay_issue, o.refund, o.rating].join("|");
        if (k !== key) {
          if (shown === "track" && phase(o) === "track") fillTrack(); else build(); // keep the map when only the step changes
          shown = phase(o);
          if (key && was !== o.status) haptic("success");
          key = k;
        } else if (phase(o) === "track") updateMap();
      };
      const refresh = async () => {
        try { const j = await get("/v1/orders/" + encodeURIComponent(id)); if (scr.alive) show(j.order); }
        catch (e) { if (!o) el.innerHTML = `${topbar("Order")}${empty("circle-alert", "Couldn't load this order", e.message)}`; }
      };
      if (o) show(o);
      await refresh();
      const loop = () => { timer = setTimeout(async () => { if (!scr.alive) return; if (!document.hidden) await refresh(); loop(); }, o && phase(o) === "track" && o.status === "out" ? 4000 : 5000); };
      loop();
      const onTime = () => scr.alive && setTimeout(refresh, 1200);
      on("timeup", onTime);
      scr.onClose(() => { clearTimeout(timer); if (m) m.remove(); emit("orders"); });
      bind(el, {
        back: () => pop(scr),
        callr: () => call(o.restaurant.phone),
        callrider: () => call(o.rider.phone),
        help: () => helpSheet(),
        copy: () => { navigator.clipboard && navigator.clipboard.writeText(o.pay.upi_id).then(() => toast("UPI ID copied"), () => {}); },
        upi: async b => { haptic(); const ok = await openExternal(upiLink(b.dataset.s, o)); if (!ok) toast("That app isn't installed. Try another or scan the QR", "info"); },
        paid: b => busy(b, async () => {
          const utr = $("[data-utr]", el).value;
          if (utr && utr.length < 6) throw new Error("The UPI reference looks too short. Leave it empty or enter all 12 digits");
          const j = await post(`/v1/orders/${o.id}/paid`, { utr }); haptic("success"); show(j.order);
        }),
        cancel: async b => {
          const paid = ["pay_claimed", "confirmed"].includes(o.status) && o.pay_method === "upi";
          if (!(await confirm("Cancel this order?", paid ? `${o.restaurant.name} will refund ${rs(o.total)} to your UPI.` : "Nothing has been paid, so there's nothing to refund.", "Cancel order", true))) return;
          busy(b, async () => { const j = await post(`/v1/orders/${o.id}/cancel`, { reason: "Cancelled in the app" }); show(j.order); toast("Order cancelled"); });
        },
        star: b => { const n = Number(b.dataset.n); $$("[data-a=star]", el).forEach(s => s.classList.toggle("on", Number(s.dataset.n) <= n)); el.dataset.stars = n; haptic();
          $("[data-review]", el).hidden = false; $("[data-a=rate]", el).hidden = false; },
        rate: b => busy(b, async () => { const j = await post(`/v1/orders/${o.id}/rate`, { rating: Number(el.dataset.stars), review: $("[data-review]", el).value }); toast("Thanks for rating!", "heart"); show(j.order); }),
        gotrefund: b => busy(b, async () => { const j = await post(`/v1/orders/${o.id}/refund-received`); show(j.order); }),
        again: () => { pop(scr); openRestaurant(o.restaurant.id); },
      });
    });
  }

  // ---------- orders tab ----------
  const ords = { el: null, list: null, last: KF.ls.get("kf_seen", {}) };
  function renderOrders() {
    const el = ords.el;
    if (!S.token) { el.innerHTML = `<div class="scroll page-grad safe"><div class="sec"><h2 style="font-size:24px">Orders</h2></div>${empty("receipt", "Your orders live here", "Log in to order and follow your food live on the map.", `<button class="btn" data-a="login">Log in</button>`)}</div>`; return; }
    const list = ords.list;
    const live = list ? list.filter(o => OPEN.includes(o.status)) : [], past = list ? list.filter(o => !OPEN.includes(o.status)) : [];
    const row = (o, i) => `<button class="card" data-a="open" data-id="${esc(o.id)}" style="display:block;width:calc(100% - 2*var(--gut));text-align:left;animation:fadeup .4s var(--ease) both;animation-delay:${i * 50}ms">
      <div class="row"><span class="mitem" style="padding:0;grid-template-columns:52px 1fr;flex:1"><span class="ph" ${bg(o.restaurant.photo)}>${o.restaurant.photo ? "" : I("store", "sm")}</span>
        <span><b>${esc(o.restaurant.name)}</b><small>${esc(o.id)} · ${when(o.created)}</small></span></span>
        <span class="pill ${OPEN.includes(o.status) ? (o.status === "accepted" ? "gold" : "solid") : o.status === "delivered" ? "green" : "red"}">${STATUS[o.status]}</span></div>
      <div class="muted small ell" style="margin-top:10px">${o.items.map(l => `${l.qty} × ${esc(l.name)}`).join(", ")}</div>
      <div class="row between" style="margin-top:8px"><b>${rs(o.total)}</b>${OPEN.includes(o.status) ? `<span class="link small">${o.status === "accepted" ? "Pay now" : "Track"} ${I("chevron-right", "xs")}</span>`
        : o.refund === "due" || o.refund === "sent" ? `<span class="pill gold">Refund ${o.refund === "due" ? "pending" : "sent"}</span>` : o.status === "delivered" && !o.rating ? `<span class="link small">Rate ${I("star", "xs")}</span>` : ""}</div></button>`;
    el.innerHTML = `<div class="scroll page-grad safe"><div class="sec" style="margin-top:6px"><h2 style="font-size:24px">Orders</h2></div>
      ${!list ? skelLines(3) + skelLines(3) : !list.length ? empty("receipt", "No orders yet", "Your first Kulgam feast is a few taps away.", `<button class="btn" data-a="home">Find food</button>`)
        : `${live.length ? `<div class="sec" style="margin-top:4px"><h2>In progress</h2></div>${live.map(row).join("")}` : ""}${past.length ? `<div class="sec"><h2>Past orders</h2></div>${past.map((o, i) => row(o, i + live.length)).join("")}` : ""}`}
      <div style="height:16px"></div></div>`;
  }
  async function loadOrders() {
    if (!S.token) { ords.list = null; KF.badge("orders", 0); return; }
    try {
      const j = await get("/v1/orders"); ords.list = j.orders;
      const open = j.orders.filter(o => OPEN.includes(o.status));
      KF.badge("orders", open.length);
      // Tell the customer when an order moves on while they're somewhere else in the app (or the app is in the background)
      const topIsOrder = KF.top() && KF.top().el.querySelector("[data-info], .radar, .qrwrap");
      j.orders.forEach(o => {
        const seen = ords.last[o.id];
        if (seen && seen !== o.status && (document.hidden || !topIsOrder)) {
          const msg = { accepted: [`${o.restaurant.name} accepted your order`, `Pay ${rs(o.total)} by UPI now to confirm it`], confirmed: ["Order confirmed", `${o.restaurant.name} has your order`],
            preparing: ["Cooking now", `${o.restaurant.name} started your food`], out: ["On the way!", "Your rider is coming. Follow them on the map"], delivered: ["Delivered", "Enjoy your meal!"],
            rejected: ["Order declined", `${o.restaurant.name} couldn't take your order`], expired: ["Order expired", "It wasn't completed in time"] }[o.status];
          if (msg) { notify(msg[0], msg[1]); if (!document.hidden) toast(msg[0], "bell-ring"); }
        }
        ords.last[o.id] = o.status;
      });
      KF.ls.set("kf_seen", Object.fromEntries(j.orders.slice(0, 20).map(o => [o.id, o.status])));
    } catch { return; }
    if (!ords.el.hidden) renderOrders();
  }
  function initOrders(el) {
    ords.el = el;
    bind(el, { login: () => login(), open: b => openOrder(b.dataset.id), home: () => KF.tab("home") });
    on("auth", () => { ords.list = null; renderOrders(); loadOrders(); });
    on("orders", loadOrders);
    setInterval(() => { if (S.token && !document.hidden && (ords.list || []).some(o => OPEN.includes(o.status))) loadOrders(); }, 12000);
    renderOrders();
  }

  // ---------- profile ----------
  const SUPPORT_EMAIL = "fazil.mastu@gmail.com";
  const whatsapp = (phone, text) => openExternal(`https://wa.me/${String(phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(text)}`);
  const mail = () => openExternal("mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("Kezia's Food help"));
  /** Suggestions box: anyone logged in can send ideas or problems to the Kezia team. */
  async function suggest() {
    if (!(await login("Log in to send a suggestion."))) return;
    const v = await ask("Send a suggestion", "Tell us what to add or improve. The Kezia team reads every message.", [{ k: "text", label: "Your suggestion", type: "textarea", placeholder: "e.g. Please add more bakeries, or a problem you had" }], "Send");
    if (!v || !v.text) return;
    busy(null, async () => { await post("/v1/suggestions", { text: v.text }); haptic("success"); toast("Thank you! We got your suggestion", "heart"); });
  }
  /** Help for customers: email and suggestions (the team's number is only for restaurants and riders). */
  function helpSheet() {
    const s = sheet(`<h2>Need help?</h2><p class="sub">For an order, call the restaurant first: they can fix most things fastest. For anything else, write to us.</p>
      <div class="menu-list" style="margin:0"><button data-a="m"><span class="tile">${I("mail", "sm")}</span><span>Email us<small>${SUPPORT_EMAIL}</small></span>${I("chevron-right", "sm")}</button>
      <button data-a="s"><span class="tile gold">${I("message-square", "sm")}</span><span>Send a suggestion<small>Ideas, problems, requests</small></span>${I("chevron-right", "sm")}</button></div>`);
    bind(s, { m: () => { s.close(); mail(); }, s: () => { s.close(); suggest(); } });
  }
  function renderProfile(el) {
    const u = S.user, md = KF.mode ? KF.mode() : "customer", cust = md === "customer";
    const badge = { admin: ["sparkles", "Owner of Kezia's Food", "You see every restaurant, order and user"], kitchen: ["chef-hat", "Restaurant account", S.kitchens().map(p => esc(p.name)).join(", ")],
      rider: ["bike", "Rider account", S.rides().map(p => esc(p.name)).join(", ")] }[md];
    el.innerHTML = `<div class="scroll page-grad safe fadein">
      <div class="pad row" style="margin:6px 0 18px">${u ? `<span class="avatar" style="width:58px;height:58px;font-size:22px">${esc((u.name || "K")[0].toUpperCase())}</span>
        <span class="grow"><b style="font-size:20px">${esc(u.name || "Add your name")}</b><br><span class="muted">${esc(u.phone)}</span></span><button class="iconbtn" data-a="name" aria-label="Edit name">${I("pencil", "sm")}</button>`
        : `<span class="grow"><div class="brand" style="text-align:left">Kezia's Food</div><span class="muted">Kulgam's own food app</span></span>`}</div>
      ${badge ? `<div class="modecard"><span class="tile">${I(badge[0], "sm")}</span><span><b>${badge[1]}</b><br><span class="small">${badge[2]}</span></span></div>` : ""}
      ${u ? "" : `<div class="card"><h3>Log in</h3><p class="note" style="margin:0 0 12px">Customers, restaurants and riders all log in here with their phone number.</p><button class="btn" data-a="login">Log in with phone</button></div>`}
      ${u && cust ? `<div class="menu-list"><button data-a="addrs"><span class="tile">${I("map-pin", "sm")}</span><span>Saved addresses<small>${S.addresses.length === 1 ? "1 address" : S.addresses.length + " addresses"}</small></span>${I("chevron-right", "sm")}</button>
        <button data-a="orders"><span class="tile">${I("receipt", "sm")}</span><span>Your orders<small>Track, rate and refunds</small></span>${I("chevron-right", "sm")}</button></div>` : ""}
      ${cust ? `<div class="menu-list"><button data-a="partner"><span class="tile gold">${I("store", "sm")}</span><span>Own a restaurant in Kulgam?<small>List it free. Your riders, your prices, your UPI</small></span>${I("chevron-right", "sm")}</button>
        <button data-a="how"><span class="tile">${I("circle-help", "sm")}</span><span>How Kezia's Food works<small>Payments, cancellations, refunds</small></span>${I("chevron-right", "sm")}</button></div>` : ""}
      <div class="menu-list">${!cust && S.support ? `<button data-a="wa"><span class="tile" style="background:#e7f8ee;color:#1fa855">${I("message-circle", "sm")}</span><span>WhatsApp support<small>Kezia team · ${esc(S.support.replace(/^\+91/, "+91 "))}</small></span>${I("chevron-right", "sm")}</button>` : ""}
        <button data-a="suggest"><span class="tile gold">${I("message-square", "sm")}</span><span>Send a suggestion<small>Ideas and problems go straight to the Kezia team</small></span>${I("chevron-right", "sm")}</button>
        <button data-a="mail"><span class="tile">${I("mail", "sm")}</span><span>Email us<small>${SUPPORT_EMAIL}</small></span>${I("chevron-right", "sm")}</button></div>
      <div class="menu-list"><button data-a="terms"><span class="tile blue">${I("file-text", "sm")}</span><span>Terms, cancellations and refunds</span>${I("chevron-right", "sm")}</button>
        <button data-a="privacy"><span class="tile blue">${I("lock", "sm")}</span><span>Privacy policy</span>${I("chevron-right", "sm")}</button>
        <button data-a="credits"><span class="tile blue">${I("image", "sm")}</span><span>Photo credits</span>${I("chevron-right", "sm")}</button></div>
      ${u ? `<div class="menu-list"><button data-a="logout"><span class="tile red">${I("log-out", "sm")}</span><span>Log out</span><span></span></button>
        <button data-a="delete"><span class="tile red">${I("trash-2", "sm")}</span><span class="red">Delete my account</span><span></span></button></div>` : ""}
      <p class="note" style="text-align:center;margin:18px 0 28px">Kezia's Food v${esc(KF_CONFIG.version)} · Made in Kulgam</p></div>`;
  }
  function initProfile(el) {
    const draw = () => renderProfile(el);
    bind(el, {
      login: () => login(),
      name: async () => { const v = await ask("Your name", "Restaurants see this on your orders.", [{ k: "name", label: "Name", value: S.user.name || "" }]);
        if (!v || !v.name) return; busy(null, async () => { const j = await api("PATCH", "/v1/me", { name: v.name }); S.setAuth({ user: j.user, places: S.places }); draw(); toast("Saved"); }); },
      addrs: () => {
        const s = sheet(`<h2>Saved addresses</h2><div data-l></div><button class="btn soft" data-a="add" style="margin-top:12px">${I("plus", "sm")} Add address</button>`);
        const fill = () => { $("[data-l]", s).innerHTML = S.addresses.length ? `<div class="list">${S.addresses.map(a => `<div class="li"><span class="tile">${I("map-pin", "sm")}</span><span><b>${esc(a.label)}</b><br><span class="muted small">${esc(a.landmark)}</span></span>
          <button class="iconbtn plain" data-a="del" data-id="${a.id}" aria-label="Delete">${I("trash-2", "sm")}</button></div>`).join("")}</div>` : `<p class="note">No addresses yet.</p>`; };
        fill();
        bind(s, {
          add: () => { s.close(); pickPlace().then(draw); },
          del: b => busy(b, async () => { await api("DELETE", "/v1/addresses/" + b.dataset.id); S.addresses = S.addresses.filter(a => a.id !== Number(b.dataset.id));
            if (S.addrId === Number(b.dataset.id)) setAddr(S.addresses[0] ? S.addresses[0].id : null); fill(); draw(); }),
        });
      },
      orders: () => KF.tab("orders"),
      partner: () => apply(),
      how: () => sheet(`<h2>How Kezia's Food works</h2><div class="steps3" style="margin-top:10px">
          <div><i>1</i><span><b>Order</b> from a Kulgam restaurant. It has ${"a few"} minutes to accept.</span></div>
          <div><i>2</i><span><b>Pay the restaurant directly</b> by UPI (QR or your UPI app) once it accepts, or choose cash on delivery where offered. Kezia's Food never holds your money.</span></div>
          <div><i>3</i><span>The restaurant <b>confirms your payment</b> and starts cooking. You can cancel with a full refund for the first couple of minutes after paying.</span></div>
          <div><i>4</i><span>The restaurant's <b>own rider</b> brings your food. Watch them live on the map.</span></div>
          <div><i>5</i><span><b>Refunds</b> for cancelled paid orders come from the restaurant to your UPI. Tell us in the app when it arrives.</span></div></div>
          <p class="note" style="margin-top:14px">Delivery fee: a fixed amount for the first few km, then a small charge per km, by road distance. Each restaurant sets its own minimum order and range.</p>`),
      wa: () => whatsapp(S.support, `Hi Kezia team, this is ${S.user && S.user.name || ""} (${S.user && S.user.phone || ""}). `),
      suggest: () => suggest(),
      mail: () => mail(),
      terms: () => openExternal(KF.API + "/terms.html"),
      privacy: () => openExternal(KF.API + "/privacy.html"),
      credits: async () => {
        const c = await fetch("img/food/credits.json").then(r => r.json()).catch(() => ({}));
        sheet(`<h2>Photo credits</h2><p class="sub">Food photos are openly licensed. Thank you to the photographers.</p><div class="list">${Object.entries(c).map(([k, v]) => `<div class="li" style="grid-template-columns:40px 1fr">
          <span class="tile" style="background:url('img/food/${esc(k)}.jpg') center/cover"></span><span class="small"><b>${esc(v.title)}</b><br>by ${esc(v.by)} · ${esc(v.license)}<br><span class="muted selectable" style="word-break:break-all">${esc(v.source)}</span></span></div>`).join("")}</div>`);
      },
      logout: async () => { if (!(await confirm("Log out?", "Your cart stays on this phone.", "Log out"))) return; try { await KF.post("/v1/auth/logout"); } catch {} S.clearAuth(); emit("auth"); emit("places"); draw(); toast("Logged out"); },
      delete: async () => {
        if (!(await confirm("Delete your account?", "This removes your name, phone number and addresses. Past orders stay with restaurants without your details. This can't be undone.", "Delete forever", true))) return;
        busy(null, async () => { await api("DELETE", "/v1/me"); S.clearAuth(); emit("auth"); emit("places"); draw(); toast("Account deleted"); });
      },
    });
    on("auth", draw); on("places", draw);
    return draw;
  }
  async function apply() {
    if (!(await login("Log in to list your restaurant."))) return;
    const v = await ask("List your restaurant", "Kezia's Food is for Kulgam district restaurants that deliver with their own riders. We'll check and switch it on, usually the same day.",
      [{ k: "name", label: "Restaurant name", placeholder: "e.g. Chinar Bites" }, { k: "area", label: "Area", placeholder: "e.g. Kulgam town, Devsar, Yaripora" }, { k: "cuisines", label: "What you serve", placeholder: "Pizza · Wazwan · Chinese" }],
      "Next: pin on the map");
    if (!v) return;
    if (!v.name || !v.area) return fail(new Error("Add the restaurant's name and area"));
    const p = await pickPlace({ save: false, title: "Where is your restaurant?", hint: "Put the pin on your restaurant's door. Delivery distance is measured from here." });
    if (!p) return;
    busy(null, async () => {
      const j = await post("/v1/restaurants/apply", { ...v, lat: p.lat, lon: p.lon });
      S.setAuth({ user: S.user, places: j.places }); emit("places"); haptic("success");
      toast("Restaurant added. Set up your menu while we check it");
      KF.tab(KF.firstTab());
    });
  }

  // icons: arrow-right hand shopping-bag
  KF.customer = { suggest, initHome, loadHome, initSearch, search: srch, initOrders, renderOrders, loadOrders, initProfile, openRestaurant, openOrder, login, loadAddresses, chooseAddress, pickPlace, STATUS, OPEN, vegMark };
})();
