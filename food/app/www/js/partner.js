// Kezia's Food: restaurant mode (owners and managers) and rider mode, in the same app.
// Kitchen: live orders with a ringing bell, payment checks, cooking, dispatch; the menu with "you keep" after the
// platform fee; earnings and paying the fee by UPI; delivery rules and team. Riders: their deliveries and live GPS.
(() => {
  const { $, $$, esc, h, I, rs, bg, S, get, post, api, sheet, confirm, ask, toast, fail, busy, bind, haptic, emit, on, skelLines, empty, when, time, plural, now,
    notify, bell, openExternal, call, watch, phone10 } = KF;
  const { vegMark, STATUS } = KF.customer;
  const K = { el: null, rid: KF.ls.get("kf_rid", null), view: "orders", live: [], hist: [], data: null, earn: null, seen: new Set(KF.ls.get("kf_rang", [])), scope: "live" };
  const pct = () => (K.data ? Number(K.data.restaurant.commission_pct) : 0);
  const keep = price => price - Math.round(price * pct() / 100);
  const place = () => S.kitchens().find(p => p.id === K.rid) || S.kitchens()[0] || null;
  const isOwner = () => (place() || {}).role === "owner";
  const mapsLink = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;

  // ---------- live GPS while this phone is delivering ----------
  const gps = (() => {
    let stop = null, ids = [], last = 0, pos = null;
    const send = () => { if (!pos) return; last = Date.now(); ids.forEach(id => post(`/v1/orders/${id}/location`, pos).catch(() => {})); };
    return {
      sync(list) {
        ids = list;
        if (ids.length && !stop) { stop = watch(p => { pos = p; if (Date.now() - last > 5000) send(); }); bell.awake(true); }
        if (!ids.length && stop) { stop(); stop = null; pos = null; if (!S.kitchens().length) bell.awake(false); }
        $$("[data-gps]").forEach(el => { el.hidden = !ids.length; });
      },
      get on() { return !!stop; },
    };
  })();
  const mine = o => o.status === "out" && o.rider && phone10(o.rider.phone) === phone10(S.user && S.user.phone);

  // ---------- polling: new orders ring even when you're on another tab ----------
  let rideList = [];
  async function pollKitchen() {
    const p = place(); if (!p || !S.token) return;
    try {
      const j = await get(`/v1/restaurant/${encodeURIComponent(p.id)}/orders`);
      const flipped = K.open !== undefined && K.open !== j.is_open;
      K.live = j.orders; K.open = j.is_open;
      const waiting = j.orders.filter(o => o.status === "placed");
      waiting.forEach(o => { if (!K.seen.has(o.id)) { K.seen.add(o.id); notify(`New order ${o.id} · ${rs(o.total)}`, `${plural(o.items.reduce((s, l) => s + l.qty, 0), "item")} · ${o.pay_method === "cod" ? "Cash" : "UPI"} · open Kezia's Food to accept`); } });
      j.orders.filter(o => o.status === "pay_claimed").forEach(o => { const k = o.id + ":paid"; if (!K.seen.has(k)) { K.seen.add(k); notify(`Check payment ${rs(o.total)}`, `Customer says they paid for ${o.id}${o.utr ? " · ref " + o.utr : ""}`); haptic("warning"); } });
      KF.ls.set("kf_rang", [...K.seen].slice(-60));
      if (waiting.length) bell.start(); else bell.stop();
      KF.badge("kitchen", waiting.length + j.orders.filter(o => o.status === "pay_claimed").length);
      gps.sync([...new Set([...j.orders.filter(mine).map(o => o.id), ...rideList.filter(mine).map(o => o.id)])]);
      if (!K.el.hidden && flipped) frame();
      else if (!K.el.hidden && K.view === "orders" && K.scope === "live" && !KF.topSheet()) drawOrders();
    } catch (e) { if (e.status === 403) { refreshPlaces(); } }
  }
  async function pollRides() {
    if (!S.rides().length || !S.token) { rideList = []; return; }
    try {
      const j = await get("/v1/rider/orders"); rideList = j.orders;
      if (!S.kitchens().length) { KF.badge("kitchen", rideList.filter(o => o.status !== "out").length); gps.sync(rideList.filter(mine).map(o => o.id)); }
      if (!K.el.hidden && K.view === "rides" && !KF.topSheet()) drawRides();
    } catch {}
  }
  async function refreshPlaces() { try { const j = await get("/v1/me"); S.setAuth({ user: j.user, places: j.places }); emit("places"); } catch {} }
  setInterval(() => { if (!S.token) return; pollKitchen(); pollRides(); }, 5000);

  // ---------- the tab ----------
  function views() {
    const v = [];
    if (S.kitchens().length) v.push(["orders", "Orders"], ["menu", "Menu"], ["money", "Earnings"], ["settings", "Settings"]);
    if (S.rides().length || S.kitchens().length) v.push(["rides", S.kitchens().length ? "Deliver" : "Deliveries"]);
    return v;
  }
  function frame() {
    const p = place(), vs = views();
    if (!vs.some(v => v[0] === K.view)) K.view = vs[0][0];
    const head = p ? `<div class="row between"><button class="row grow" data-a="switch" style="text-align:left;min-width:0"><span class="tile">${I("chef-hat", "sm")}</span>
        <span class="grow" style="min-width:0"><b class="ell" style="display:block;font-size:17px">${esc(p.name)}</b><span class="muted small">${p.role === "owner" ? "Owner" : "Manager"}${S.kitchens().length > 1 ? " · switch" : ""}${p.status === "test" ? " · test" : p.status === "pending" ? " · waiting for approval" : ""}</span></span></button>
        <button class="row" data-a="open" style="gap:8px;font-weight:800;font-size:13px;color:${K.open ? "var(--g)" : "var(--ink-3)"}">${K.open ? "Open" : "Closed"}<span class="switch" role="switch" aria-checked="${!!K.open}"></span></button></div>`
      : `<div class="row"><span class="tile">${I("bike", "sm")}</span><span><b style="font-size:17px">Deliveries</b><br><span class="muted small">${S.rides().map(r => esc(r.name)).join(", ")}</span></span></div>`;
    K.el.innerHTML = `<div class="layer-in page-grad" style="display:flex;flex-direction:column;height:100%"><div class="rm-head">${head}
      ${vs.length > 1 ? `<div class="seg" style="margin-top:12px">${vs.map(([k, l]) => `<button data-a="view" data-v="${k}" aria-pressed="${K.view === k}">${l}</button>`).join("")}</div>` : ""}</div>
      <div class="gpsbar" data-gps ${gps.on ? "" : "hidden"}>${I("navigation", "xs")} Sharing your live location with the customer. Keep the app open.</div>
      <div class="scroll" data-body></div></div>`;
    draw();
  }
  function draw() { ({ orders: drawOrders, menu: drawMenu, money: drawMoney, settings: drawSettings, rides: drawRides })[K.view](); }
  const body = () => $("[data-body]", K.el);

  // ---------- orders ----------
  const itemsHTML = o => o.items.map(l => `<div class="line" style="padding:3px 0"><span>${vegMark(l.veg)} <b>${l.qty} ×</b> ${esc(l.name)}</span><span>${rs(l.price * l.qty)}</span></div>`).join("");
  function ocard(o, i = 0) {
    const s = o.status, cust = o.customer || {}, fee = o.commission || 0;
    const pay = o.pay_method === "cod" ? `<span class="pill gold">${I("banknote", "xs")} Cash</span>` : `<span class="pill green">${I("qr-code", "xs")} UPI</span>`;
    let top = "", act = "";
    if (s === "placed") { top = `<span class="bell">${I("bell-ring", "sm")} New order · accept in <span class="timer" data-until="${o.times.accept_by}">--:--</span></span>`;
      act = `<div class="two"><button class="btn ghost" data-a="reject" data-id="${o.id}">Decline</button><button class="btn shine" data-a="accept" data-id="${o.id}">${I("check", "sm")} Accept</button></div>`; }
    else if (s === "accepted") { top = `<span class="muted small">${I("timer", "xs")} Waiting for the customer to pay ${rs(o.total)} · <span class="timer" data-until="${o.times.pay_by}">--:--</span></span>`;
      act = `<button class="btn soft sm" style="width:100%;margin-top:12px" data-a="gotpay" data-id="${o.id}">I already got ${rs(o.total)}</button>`; }
    else if (s === "pay_claimed") { top = `<span class="bell" style="color:var(--gold-ink)">${I("indian-rupee", "sm")} Customer says they paid</span>`;
      act = `<div class="warn" style="margin-top:12px">${I("smartphone", "sm")} <span>Open your UPI or bank app and look for <b>${rs(o.total)}</b>${o.utr ? ` with reference <b class="selectable">${esc(o.utr)}</b>` : ""}.</span></div>
        <div class="two"><button class="btn danger" data-a="nopay" data-id="${o.id}">Not received</button><button class="btn" data-a="gotpay" data-id="${o.id}">${I("check", "sm")} Received</button></div>`; }
    else if (s === "confirmed") { top = o.times.cancel_until && Date.parse(o.times.cancel_until) > now() ? `<span class="muted small">${I("timer", "xs")} Customer can still cancel for <span class="timer" data-until="${o.times.cancel_until}">--:--</span></span>` : `<span class="pill green">Paid · ready to cook</span>`;
      act = `<div class="two"><button class="btn soft" data-a="send" data-id="${o.id}">${I("bike", "sm")} Send out</button><button class="btn" data-a="cook" data-id="${o.id}">${I("chef-hat", "sm")} Start cooking</button></div>`; }
    else if (s === "preparing") { top = `<span class="pill green">${I("flame", "xs")} Cooking since ${time(o.times.preparing)}</span>`;
      act = `<button class="btn shine" style="margin-top:14px" data-a="send" data-id="${o.id}">${I("bike", "sm")} Food ready: send for delivery</button>`; }
    else if (s === "out") { top = `<span class="pill solid">${I("bike", "xs")} ${esc((o.rider && o.rider.name) || "Rider")} on the way${o.rider && o.rider.at ? " · GPS " + time(o.rider.at) : ""}</span>`;
      act = `<div class="two">${o.pay_method === "cod" ? `<button class="btn ghost" data-a="noshow" data-id="${o.id}">Didn't take it</button>` : `<button class="btn ghost" data-a="nav" data-id="${o.id}">${I("navigation", "sm")} Map</button>`}
        <button class="btn" data-a="delivered" data-id="${o.id}">${I("circle-check", "sm")} Delivered</button></div>`; }
    else {
      top = `<span class="pill ${s === "delivered" ? "green" : "red"}">${STATUS[s]}</span>${o.rating ? ` <span class="rating" style="margin-left:6px">${o.rating} ${I("star", "xs")}</span>` : ""}`;
      if (o.refund === "due") act = `<div class="warn red" style="margin-top:12px">${I("hand-coins", "sm")} <span>Refund <b>${rs(o.total)}</b> to the customer by UPI${cust.phone ? ` (${esc(cust.phone)})` : ""}, then tap below.</span></div>
        <button class="btn" style="margin-top:10px" data-a="refunded" data-id="${o.id}">I've sent the refund</button>`;
      else if (o.refund) act = `<p class="note" style="margin:10px 0 0">Refund ${o.refund === "sent" ? "sent, waiting for the customer to confirm" : "received by the customer"}.</p>`;
    }
    const canCancel = ["accepted", "pay_claimed", "confirmed", "preparing", "out"].includes(s);
    return `<div class="ocard ${s === "placed" ? "ring" : s === "pay_claimed" ? "pay" : ""}" style="animation-delay:${i * 50}ms">
      <div class="hd"><b>${esc(o.id)}</b><span class="row" style="gap:6px">${pay}<span class="muted small">${time(o.times.created)}</span></span></div>
      <div style="margin-top:8px">${top}</div>
      <div class="row" style="margin-top:12px"><span class="grow"><b>${esc(cust.name || "Customer")}</b><br><span class="muted small">${I("map-pin", "xs")} ${esc(o.address.landmark)} · ${o.km} km</span></span>
        ${cust.phone ? `<button class="iconbtn" data-a="callc" data-p="${esc(cust.phone)}" aria-label="Call customer">${I("phone", "sm")}</button>` : ""}</div>
      <div style="margin-top:10px">${itemsHTML(o)}</div>
      ${o.note ? `<div class="warn" style="margin-top:8px">${I("square-pen", "sm")} ${esc(o.note)}</div>` : ""}
      <div class="line total" style="font-size:15px"><span>${o.pay_method === "cod" ? "Collect cash" : "Customer pays you"}</span><span>${rs(o.total)}</span></div>
      <div class="muted small">Kezia's fee ${o.commission_pct}% of food (${rs(o.item_total)}) = ${rs(fee)} · you keep <b class="green">${rs(o.total - fee)}</b></div>
      ${act}${canCancel && s !== "out" ? `<button class="link small" style="margin-top:12px;color:var(--ink-3)" data-a="kcancel" data-id="${o.id}">Cancel this order</button>` : ""}</div>`;
  }
  async function drawOrders() {
    const b = body(), p = place();
    if (!b) return;
    const pend = p && p.status === "pending" ? `<div class="warn" style="margin:0 var(--gut) 14px">${I("clock", "sm")} <span>Kezia's Food is checking your restaurant. Meanwhile add your menu, UPI ID and delivery rules in Menu and Settings.</span></div>` : "";
    const closed = !K.open ? `<div class="warn red" style="margin:0 var(--gut) 14px">${I("moon", "sm")} <span>You're closed, so customers can't order. Switch to Open at the top when the kitchen is ready.</span></div>` : "";
    const scrollTop = b.scrollTop;
    if (K.scope === "live") {
      const order = { placed: 0, pay_claimed: 1, accepted: 2, confirmed: 3, preparing: 4, out: 5 };
      const list = K.live.slice().sort((x, y) => order[x.status] - order[y.status]);
      const refunds = K.hist.filter(o => o.refund === "due");
      b.innerHTML = `${pend}${closed}<div class="chips pad" style="margin-bottom:12px"><button class="chip" data-a="scope" data-s="live" aria-pressed="true">Live ${list.length ? `(${list.length})` : ""}</button><button class="chip" data-a="scope" data-s="hist">Last 30 days</button></div>
        ${refunds.map(ocard).join("")}
        ${list.length ? list.map(ocard).join("") : empty("bell-ring", "No live orders", K.open ? "Keep this screen open. New orders ring loudly here." : "Open the kitchen to start getting orders.")}
        <div style="height:20px"></div>`;
      if (!K.histAt || Date.now() - K.histAt > 60000) { K.histAt = Date.now(); get(`/v1/restaurant/${encodeURIComponent(p.id)}/orders?scope=history`).then(j => { const had = K.hist.filter(o => o.refund === "due").length; K.hist = j.orders; if (K.hist.filter(o => o.refund === "due").length !== had && K.scope === "live") drawOrders(); }).catch(() => {}); }
    } else {
      b.innerHTML = `<div class="chips pad" style="margin-bottom:12px"><button class="chip" data-a="scope" data-s="live">Live</button><button class="chip" data-a="scope" data-s="hist" aria-pressed="true">Last 30 days</button></div>${skelLines(4)}`;
      try { K.hist = (await get(`/v1/restaurant/${encodeURIComponent(p.id)}/orders?scope=history`)).orders; K.histAt = Date.now(); } catch (e) { return fail(e); }
      if (K.scope !== "hist" || K.view !== "orders") return;
      $(".card", b).outerHTML = K.hist.length ? K.hist.map(ocard).join("") : empty("receipt", "No past orders", "Delivered and cancelled orders show here for 30 days.");
    }
    b.scrollTop = scrollTop;
  }
  const act = (path, bodyx = {}) => async (btn) => busy(btn, async () => { await post(`/v1/orders/${btn.dataset.id}/${path}`, bodyx); haptic("success"); await pollKitchen(); drawOrders(); });
  function sendOut(id, btn) {
    const riders = ((K.data && K.data.staff) || []).filter(s => s.role === "rider");
    const s = sheet(`<h2>Who's delivering?</h2><p class="sub">The rider shares live location with the customer from their phone while delivering.</p>
      <div>${riders.map(r => `<button class="opt" data-a="r" data-p="${esc(r.phone)}"><span class="tile">${I("bike", "sm")}</span><span><b>${esc(r.name || "Rider")}</b><span>${esc(r.phone)}</span></span>${I("chevron-right", "sm")}</button>`).join("")}
      <button class="opt" data-a="r" data-p=""><span class="tile gold">${I("user", "sm")}</span><span><b>I'll deliver it myself</b><span>This phone shares the live location</span></span>${I("chevron-right", "sm")}</button></div>
      ${riders.length ? "" : `<p class="note" style="margin-top:12px">Add your riders in Settings → Team so you can send orders to their phones.</p>`}`);
    bind(s, { r: b => busy(b, async () => { await post(`/v1/orders/${id}/dispatch`, b.dataset.p ? { rider_phone: b.dataset.p } : {}); s.close(); haptic("success"); toast("Out for delivery"); await pollKitchen(); drawOrders(); }) });
  }

  // ---------- menu ----------
  async function loadData() { const p = place(); if (!p) return; K.data = await get(`/v1/restaurant/${encodeURIComponent(p.id)}`); K.open = K.data.restaurant.is_open; }
  async function drawMenu() {
    const b = body();
    if (!K.data) { b.innerHTML = skelLines(6); try { await loadData(); } catch (e) { return fail(e); } if (K.view !== "menu") return; }
    const d = K.data, r = d.restaurant;
    const secs = [...d.sections, ...(d.items.some(i => !d.sections.some(s => s.id === i.section_id)) ? [{ id: 0, name: "No section" }] : [])];
    b.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="rcard" style="margin:0;width:100%;box-shadow:none;border-radius:0"><div class="im" ${bg(r.photo)}>
        <div class="tags"><span class="pill">${plural(d.items.length, "dish")}</span></div><button class="eta" data-a="cover">${I("camera", "xs")} Change cover</button></div></div></div>
      <div class="warn green" style="margin:0 var(--gut) 14px">${I("badge-percent", "sm")} <span>Kezia's Food fee is <b>${pct()}%</b> of the food price on delivered orders. Delivery and packing charges are all yours. Set prices with that in mind: we show what you keep on each dish.</span></div>
      ${secs.map(s => { const list = d.items.filter(i => (s.id ? i.section_id === s.id : !d.sections.some(x => x.id === i.section_id)));
        return `<div class="sec" style="margin-top:14px"><h2>${esc(s.name)} <span class="muted small">${list.length}</span></h2>${s.id ? `<button data-a="sec" data-id="${s.id}">${I("pencil", "xs")} Edit</button>` : ""}</div>
        <div class="card" style="padding:4px 14px">${list.length ? list.map(it => `<div class="mitem"><button class="ph" ${bg(it.photo)} data-a="photo" data-id="${it.id}" aria-label="Photo">${it.photo ? "" : I("camera", "sm")}</button>
          <button style="text-align:left;min-width:0" data-a="item" data-id="${it.id}">${vegMark(it.veg)} <b>${esc(it.name)}</b>${it.bestseller ? ` <span class="pill gold">${I("star", "xs")}</span>` : ""}<small>${rs(it.price)} · you keep ${rs(keep(it.price))}${it.in_stock ? "" : " · sold out"}</small></button>
          <span class="switch" role="switch" data-a="stock" data-id="${it.id}" aria-checked="${it.in_stock}" aria-label="In stock"></span></div>`).join("") : `<p class="note">No dishes yet.</p>`}</div>`; }).join("")}
      <div class="two pad" style="margin-bottom:24px"><button class="btn ghost" data-a="newsec">${I("plus", "sm")} Section</button><button class="btn" data-a="newitem">${I("plus", "sm")} Dish</button></div>
      <input type="file" accept="image/*" data-file hidden>`;
  }
  function itemSheet(it) {
    const d = K.data, isNew = !it;
    it = it || { name: "", description: "", price: "", veg: false, bestseller: false, in_stock: true, section_id: (d.sections[0] || {}).id };
    const s = sheet(`<h2>${isNew ? "New dish" : "Edit dish"}</h2><div class="form" style="margin-top:12px">
      <label class="field">Name<input class="input" data-f="name" value="${esc(it.name)}" maxlength="60" placeholder="e.g. Chicken Tikka Pizza"></label>
      <label class="field">Price (₹)<input class="input" data-f="price" inputmode="numeric" value="${esc(it.price)}" placeholder="249"><div class="keep" data-keep></div></label>
      <label class="field">Description<input class="input" data-f="description" value="${esc(it.description || "")}" maxlength="200" placeholder="8 inch · tandoori chicken, onion"></label>
      <label class="field">Section<select class="input" data-f="section_id">${d.sections.map(x => `<option value="${x.id}" ${x.id === it.section_id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      <div class="row between"><span>${vegMark(true)} Vegetarian</span><span class="switch" role="switch" data-t="veg" aria-checked="${!!it.veg}"></span></div>
      <div class="row between"><span>${I("star", "xs")} Bestseller tag</span><span class="switch" role="switch" data-t="bestseller" aria-checked="${!!it.bestseller}"></span></div>
      <div class="row between"><span>In stock</span><span class="switch" role="switch" data-t="in_stock" aria-checked="${it.in_stock !== false}"></span></div>
      <button class="btn" data-a="save">${isNew ? "Add dish" : "Save"}</button>${isNew ? "" : `<button class="btn danger" data-a="del">Delete dish</button>`}</div>`);
    const price = $("[data-f=price]", s);
    const kp = () => { const v = Math.round(Number(price.value) || 0); $("[data-keep]", s).innerHTML = v ? `${I("wallet", "xs")} You keep <b>${rs(keep(v))}</b> of ${rs(v)} after Kezia's ${pct()}% fee (${rs(v - keep(v))})` : `Kezia's fee: ${pct()}% of the price`; };
    price.oninput = () => { price.value = price.value.replace(/\D/g, "").slice(0, 5); kp(); }; kp();
    $$(".switch[data-t]", s).forEach(sw => { sw.onclick = () => { sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") !== "true"); haptic(); }; });
    bind(s, {
      save: b => busy(b, async () => {
        const v = { name: $("[data-f=name]", s).value.trim(), price: Number(price.value), description: $("[data-f=description]", s).value.trim(), section_id: Number($("[data-f=section_id]", s).value) || null };
        $$(".switch[data-t]", s).forEach(sw => { v[sw.dataset.t] = sw.getAttribute("aria-checked") === "true"; });
        if (!v.name || !v.price) throw new Error("Add a name and a price");
        const p = place().id;
        if (isNew) { const j = await post(`/v1/restaurant/${p}/items`, v); if (!v.in_stock) await api("PATCH", `/v1/restaurant/${p}/items/${j.item.id}`, { in_stock: false }); }
        else await api("PATCH", `/v1/restaurant/${p}/items/${it.id}`, v);
        s.close(); await loadData(); drawMenu(); toast(isNew ? "Dish added" : "Saved");
      }),
      del: async b => { if (!(await confirm("Delete this dish?", it.name, "Delete", true))) return; busy(b, async () => { await api("DELETE", `/v1/restaurant/${place().id}/items/${it.id}`); s.close(); await loadData(); drawMenu(); }); },
    });
  }
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
  function pickPhoto(path) {
    const f = $("[data-file]", K.el); f.value = "";
    f.onchange = () => f.files[0] && busy(null, async () => {
      toast("Uploading photo…", "image");
      const fd = new FormData(); fd.append("file", await shrink(f.files[0]), "photo.jpg");
      await api("POST", path, fd); await loadData(); drawMenu(); toast("Photo updated");
    });
    f.click();
  }

  // ---------- earnings ----------
  async function drawMoney() {
    const b = body(), p = place();
    b.innerHTML = `<div class="stats">${[1, 2, 3].map(() => `<div class="stat skel" style="height:66px"></div>`).join("")}</div>${skelLines(4)}`;
    let e; try { e = K.earn = await get(`/v1/restaurant/${encodeURIComponent(p.id)}/earnings`); } catch (er) { b.innerHTML = empty("circle-alert", "Couldn't load earnings", er.message); return; }
    if (K.view !== "money") return;
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 86400000); const k = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const row = e.days.find(x => x.d === k); return { d, food: row ? row.food : 0, n: row ? row.n : 0 }; });
    const max = Math.max(1, ...days.map(d => d.food));
    const dueAmt = e.due.commission;
    b.innerHTML = `<div class="stats stagger">${[["Today", e.today], ["7 days", e.week], ["30 days", e.month]].map(([l, x], i) => `<div class="stat" style="--i:${i}"><b>${rs(x.food + x.fees - x.commission)}</b><span>${l} · ${plural(x.orders, "order")}</span></div>`).join("")}</div>
      <div class="card"><div class="row between"><h3 style="margin:0">Food sales, last 14 days</h3><span class="muted small">${rs(days.reduce((s, d) => s + d.food, 0))}</span></div>
        <div class="bars" style="margin-top:14px">${days.map((d, i) => `<i style="height:${Math.max(4, d.food / max * 100)}%;animation-delay:${i * 30}ms;${d.food ? "" : "opacity:.25"}" title="${d.d.toDateString()}: ${rs(d.food)}"></i>`).join("")}</div>
        <div class="row between muted small" style="margin-top:6px"><span>${days[0].d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span>Today</span></div></div>
      <div class="due"><small>Kezia's Food fee to pay</small><b>${rs(dueAmt)}</b><p>${dueAmt ? `${pct()}% of ${rs(e.due.food)} food on ${plural(e.due.orders, "delivered order")} not yet paid for.` : "All paid up. Thank you!"}</p>
        ${dueAmt ? `<button class="btn gold" style="margin-top:14px;position:relative;z-index:1" data-a="paydue">${I("qr-code", "sm")} Pay ${rs(dueAmt)} by UPI</button>` : ""}</div>
      <div class="card"><h3>How the fee works</h3><p class="note" style="margin:0">Customers pay you directly. Kezia's Food takes <b>${pct()}%</b> of the food value of each <b>delivered</b> order, and nothing on cancelled orders, delivery or packing.
        The rate is fixed on each order when it's placed. Pay what's due here whenever you like (weekly is good). ${e.platform_upi ? "" : "The payment UPI ID isn't set up yet."}</p></div>
      ${e.settlements.length ? `<div class="sec"><h2>Fee payments</h2></div><div class="card" style="padding:4px 14px"><div class="list">${e.settlements.map(x => `<div class="li"><span class="tile ${x.status === "paid" ? "" : x.status === "rejected" ? "red" : "gold"}">${I(x.status === "paid" ? "circle-check" : x.status === "rejected" ? "circle-x" : "clock", "sm")}</span>
        <span><b>${rs(x.amount)}</b><br><span class="muted small">${plural(x.orders, "order")} · ref ${esc(x.utr)} · ${when(x.created_at)}</span></span>
        <span class="pill ${x.status === "paid" ? "green" : x.status === "rejected" ? "red" : "gold"}">${x.status === "claimed" ? "Checking" : x.status === "paid" ? "Received" : "Not received"}</span></div>`).join("")}</div></div>` : ""}
      <div style="height:20px"></div>`;
  }
  function payDue() {
    const e = K.earn, amt = e.due.commission, p = place();
    if (!e.platform_upi) return toast("Kezia's Food hasn't set its UPI ID yet. Call support", "info");
    const link = `upi://pay?pa=${encodeURIComponent(e.platform_upi)}&pn=${encodeURIComponent(e.platform_name || "Kezia's Food")}&am=${amt}.00&cu=INR&tn=${encodeURIComponent("Kezia fee " + p.id)}`;
    const s = sheet(`<h2>Pay Kezia's Food</h2><p class="sub">Pay <b>${rs(amt)}</b> to <span class="selectable">${esc(e.platform_upi)}</span>, then enter the UPI reference.</p>
      <div class="qrwrap" style="width:200px;height:200px" data-qr></div>
      <button class="btn soft" style="margin-top:22px" data-a="app">${I("smartphone", "sm")} Open UPI app</button>
      <label class="field" style="margin-top:14px">UPI reference / UTR<input class="input utr" data-utr inputmode="numeric" maxlength="12" placeholder="12-digit number"></label>
      <button class="btn" style="margin-top:12px" data-a="done">I've paid ${rs(amt)}</button>`);
    const qr = qrcode(0, "M"); qr.addData(link); qr.make(); $("[data-qr]", s).innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const u = $("[data-utr]", s); u.oninput = () => { u.value = u.value.replace(/\D/g, "").slice(0, 12); };
    bind(s, {
      app: async () => { if (!(await openExternal(link))) toast("No UPI app found. Scan the QR from another phone", "info"); },
      done: b => busy(b, async () => { if (u.value.length < 6) throw new Error("Enter the UPI reference from your payment"); await post(`/v1/restaurant/${p.id}/settle`, { utr: u.value }); s.close(); haptic("success"); toast("Thanks! We'll confirm it soon"); drawMoney(); }),
    });
  }

  // ---------- settings ----------
  const feeFor = (r, km) => km > r.max_km ? null : km <= r.base_km ? r.base_fee : r.base_fee + Math.ceil(km - r.base_km) * r.per_km;
  async function drawSettings() {
    const b = body();
    if (!K.data) { b.innerHTML = skelLines(6); try { await loadData(); } catch (e) { return fail(e); } if (K.view !== "settings") return; }
    const r = K.data.restaurant, staff = K.data.staff;
    const f = (k, label, extra = "", type = "text", mode = "text") => `<label class="field">${label}<input class="input" data-k="${k}" type="${type}" inputmode="${mode}" value="${esc(r[k] ?? "")}" ${extra}></label>`;
    const n = (k, label, unit) => `<label class="field">${label}<div class="row"><input class="input" data-k="${k}" inputmode="decimal" value="${esc(r[k] ?? "")}"><span class="muted small" style="flex:none;width:34px">${unit}</span></div></label>`;
    b.innerHTML = `<div class="card"><h3>Payments</h3><div class="form">${f("upi_id", "Your UPI ID (customers pay here)", 'placeholder="yourname@okaxis" autocapitalize="off"')}${f("upi_name", "Name on UPI", 'placeholder="As shown in UPI apps"')}
        <div class="row between"><span><b>Cash on delivery</b><br><span class="muted small">Riders collect cash. Customers who refuse orders twice lose this</span></span><span class="switch" role="switch" data-t="cod" aria-checked="${r.cod}"></span></div></div></div>
      <div class="card"><h3>Delivery charges</h3><div class="two" style="margin-top:0">${n("base_fee", "Fixed fee", "₹")}${n("base_km", "Covers first", "km")}${n("per_km", "Then per km", "₹")}${n("max_km", "Deliver up to", "km")}
        ${n("min_order", "Minimum order", "₹")}${n("packing", "Packing charge", "₹")}</div>
        <label class="field" style="margin-top:12px">Free delivery above (empty = never)<input class="input" data-k="free_above" inputmode="numeric" value="${esc(r.free_above ?? "")}" placeholder="e.g. 799"></label>
        <div class="keep" data-example style="margin-top:12px"></div></div>
      <div class="card"><h3>Timers</h3><div class="two" style="margin-top:0">${n("accept_min", "Time to accept", "min")}${n("pay_min", "Time for customer to pay", "min")}${n("cancel_min", "Customer cancel window", "min")}${n("prep_min", "Usual cooking time", "min")}</div>
        <p class="note" style="margin:10px 0 0">Unanswered orders expire after the accept time. Cancel window is at most 5 minutes after payment, then the order is yours.</p></div>
      <div class="card"><h3>Restaurant</h3><div class="form">${f("name", "Name")}${f("phone", "Phone customers call", "", "tel", "tel")}${f("area", "Area")}${f("address", "Address")}${f("cuisines", "Cuisines", 'placeholder="Pizza · Wazwan · Chinese"')}${f("hours", "Opening hours", 'placeholder="11 am – 11 pm"')}</div></div>
      <div class="pad"><button class="btn" data-a="savesettings">Save changes</button></div>
      ${isOwner() ? `<div class="sec"><h2>Team</h2><button data-a="addstaff">${I("plus", "xs")} Add</button></div>
        <div class="card" style="padding:4px 14px">${staff.length ? `<div class="list">${staff.map(x => `<div class="li"><span class="tile ${x.role === "manager" ? "gold" : ""}">${I(x.role === "manager" ? "user" : "bike", "sm")}</span>
          <span><b>${esc(x.name || x.phone)}</b><br><span class="muted small">${x.role === "manager" ? "Manager: orders, menu, settings" : "Rider: deliveries and live GPS"} · ${esc(x.phone)}</span></span>
          <button class="iconbtn plain" data-a="delstaff" data-p="${esc(x.phone)}" aria-label="Remove">${I("trash-2", "sm")}</button></div>`).join("")}</div>`
          : `<p class="note">Add your riders by phone number. They install Kezia's Food, log in with that number and see your deliveries.</p>`}</div>` : ""}
      <div style="height:24px"></div>`;
    const ex = () => {
      const v = k => { const i = $(`[data-k=${k}]`, b); return Number(i ? i.value : r[k]) || 0; };
      const rr = { base_fee: v("base_fee"), base_km: v("base_km"), per_km: v("per_km"), max_km: v("max_km") };
      $("[data-example]", b).innerHTML = `${I("route", "xs")} Example: ${[1, 3, 5, 8].map(km => { const x = feeFor(rr, km); return `${km} km → <b>${x === null ? "too far" : rs(x)}</b>`; }).join(" · ")}`;
    };
    $$("input", b).forEach(i => { i.oninput = ex; }); ex();
    $$(".switch[data-t]", b).forEach(sw => { sw.onclick = () => { sw.setAttribute("aria-checked", sw.getAttribute("aria-checked") !== "true"); haptic(); }; });
  }
  async function saveSettings(btn) {
    const r = K.data.restaurant, b = body(), out = {};
    $$("[data-k]", b).forEach(i => { const k = i.dataset.k, v = i.value.trim(); if (String(r[k] ?? "") !== v) out[k] = v === "" && ["free_above", "hours", "upi_name"].includes(k) ? null : v; });
    $$(".switch[data-t]", b).forEach(sw => { const v = sw.getAttribute("aria-checked") === "true"; if (v !== r[sw.dataset.t]) out[sw.dataset.t] = v; });
    if (out.phone) out.phone = phone10(out.phone);
    if (!Object.keys(out).length) return toast("Nothing changed", "info");
    await busy(btn, async () => { await api("PATCH", `/v1/restaurant/${place().id}`, out); await loadData(); await refreshPlaces(); drawSettings(); haptic("success"); toast("Saved"); });
  }

  // ---------- rider ----------
  function drawRides() {
    const b = body(); if (!b) return;
    const list = rideList;
    b.innerHTML = list.length ? list.map((o, i) => {
      const r = o.restaurant, me = mine(o), c = o.customer || {};
      return `<div class="ocard ${o.status !== "out" ? "" : "pay"}" style="animation-delay:${i * 50}ms"><div class="hd"><b>${esc(o.id)}</b><span class="pill ${o.status === "out" ? "solid" : "green"}">${o.status === "out" ? (me ? "You're delivering" : "Out") : o.status === "preparing" ? "Cooking" : "Confirmed"}</span></div>
        <div class="list" style="margin-top:6px"><div class="li"><span class="tile gold">${I("chef-hat", "sm")}</span><span><b>Pick up</b><br><span class="muted small">${esc(r.name)} · ${esc(r.area || "")}</span></span>
          <button class="iconbtn" data-a="mapto" data-lat="${r.lat}" data-lon="${r.lon}" aria-label="Directions">${I("navigation", "sm")}</button></div>
          <div class="li"><span class="tile">${I("house", "sm")}</span><span><b>${esc(c.name || "Customer")}</b><br><span class="muted small">${esc(o.address.landmark)} · ${o.km} km</span></span>
          <button class="iconbtn" data-a="mapto" data-lat="${o.address.lat}" data-lon="${o.address.lon}" aria-label="Directions">${I("navigation", "sm")}</button></div></div>
        <div style="margin-top:6px">${itemsHTML(o)}</div>
        <div class="line total" style="font-size:15px"><span>${o.pay_method === "cod" ? "Collect cash" : "Paid by UPI"}</span><span>${o.pay_method === "cod" ? rs(o.total) : I("circle-check", "sm green")}</span></div>
        ${c.phone ? `<button class="btn ghost sm" style="width:100%;margin-top:10px" data-a="callc" data-p="${esc(c.phone)}">${I("phone", "sm")} Call ${esc((c.name || "customer").split(" ")[0])}</button>` : ""}
        ${o.status !== "out" ? `<button class="btn shine" style="margin-top:10px" data-a="pickup" data-id="${o.id}">${I("bike", "sm")} Picked up: start delivery</button>`
          : me ? `<div class="two">${o.pay_method === "cod" ? `<button class="btn ghost" data-a="rnoshow" data-id="${o.id}">Didn't take it</button>` : `<span></span>`}<button class="btn" data-a="rdone" data-id="${o.id}">${I("circle-check", "sm")} Delivered</button></div>` : ""}</div>`;
    }).join("") + `<p class="note pad" style="text-align:center">Keep Kezia's Food open while delivering so the customer can follow you on the map.</p>`
      : empty("bike", "No deliveries right now", "Orders ready to deliver show up here. Your phone shares your location only while you're delivering.");
  }
  const ride = (path) => btn => busy(btn, async () => { await post(`/v1/orders/${btn.dataset.id}/${path}`); haptic("success"); await pollRides(); await pollKitchen(); drawRides(); });

  // ---------- wiring ----------
  function init(el) {
    K.el = el;
    bind(el, {
      view: b => { K.view = b.dataset.v; haptic(); $$("[data-a=view]", el).forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); },
      switch: () => { if (S.kitchens().length < 2) return;
        const s = sheet(`<h2>Your restaurants</h2>${S.kitchens().map(p => `<button class="opt" data-a="pickr" data-id="${esc(p.id)}" aria-checked="${p.id === place().id}"><span class="tile">${I("store", "sm")}</span><span><b>${esc(p.name)}</b><span>${p.role}</span></span><i class="radio"></i></button>`).join("")}`);
        bind(s, { pickr: b => { K.rid = b.dataset.id; KF.ls.set("kf_rid", K.rid); K.data = null; K.live = []; K.hist = []; s.close(); frame(); pollKitchen(); loadData().then(frame).catch(() => {}); } }); },
      open: async b => {
        const to = !K.open;
        if (to && K.data && !K.data.restaurant.upi_id && !K.data.restaurant.cod) return toast("Add your UPI ID in Settings first", "info");
        busy(b, async () => { await api("PATCH", `/v1/restaurant/${place().id}`, { is_open: to }); K.open = to; if (K.data) K.data.restaurant.is_open = to; haptic("success"); toast(to ? "You're open. Orders will ring here" : "Closed for now"); frame(); bell.awake(to); });
      },
      scope: b => { K.scope = b.dataset.s; drawOrders(); },
      accept: act("accept"),
      reject: async b => {
        const v = await ask("Decline this order?", "Tell the customer why.", [{ k: "reason", label: "Reason", value: "Sorry, we're too busy right now" }], "Decline order");
        if (v) act("reject", { reason: v.reason })(b);
      },
      gotpay: act("payment", { received: true }),
      nopay: async b => { if (await confirm("Payment not received?", "The customer is asked to check and pay again. They get 5 more minutes.", "Not received", true)) act("payment", { received: false })(b); },
      cook: act("preparing"),
      send: b => sendOut(b.dataset.id, b),
      delivered: act("delivered"),
      noshow: async b => { if (await confirm("Customer didn't take the order?", "This cancels it and counts against their cash-on-delivery use.", "Yes, cancel", true)) act("no-show")(b); },
      refunded: async b => { if (await confirm("Refund sent?", "Only tap yes after the money has left your UPI.", "Yes, sent")) act("refund-sent")(b); },
      kcancel: async b => {
        const o = K.live.find(x => x.id === b.dataset.id);
        const v = await ask("Cancel this order?", o && (o.status !== "accepted" && o.pay_method === "upi") ? "It's paid, so you'll need to refund the customer." : "The customer is told right away.", [{ k: "reason", label: "Reason", value: "Sorry, an item ran out" }], "Cancel order");
        if (v) act("cancel", { reason: v.reason })(b);
      },
      callc: b => call(b.dataset.p),
      nav: b => { const o = K.live.find(x => x.id === b.dataset.id); if (o) openExternal(mapsLink(o.address.lat, o.address.lon)); },
      mapto: b => openExternal(mapsLink(b.dataset.lat, b.dataset.lon)),
      pickup: ride("dispatch"), rdone: ride("delivered"),
      rnoshow: async b => { if (await confirm("Customer didn't take the order?", "This cancels it.", "Yes", true)) ride("no-show")(b); },
      cover: () => pickPhoto(`/v1/restaurant/${place().id}/photo`),
      photo: b => pickPhoto(`/v1/restaurant/${place().id}/items/${b.dataset.id}/photo`),
      item: b => itemSheet(K.data.items.find(i => i.id === Number(b.dataset.id))),
      newitem: () => K.data.sections.length ? itemSheet(null) : toast("Add a section first, like Pizza or Wazwan", "info"),
      stock: b => busy(null, async () => { const on = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", on); haptic();
        await api("PATCH", `/v1/restaurant/${place().id}/items/${b.dataset.id}`, { in_stock: on }); const it = K.data.items.find(i => i.id === Number(b.dataset.id)); it.in_stock = on; toast(on ? "Back in stock" : "Marked sold out"); }),
      newsec: async () => { const v = await ask("New section", "", [{ k: "name", label: "Name", placeholder: "e.g. Wazwan, Pizza, Drinks" }], "Add");
        if (v && v.name) busy(null, async () => { await post(`/v1/restaurant/${place().id}/sections`, { name: v.name }); await loadData(); drawMenu(); }); },
      sec: async b => {
        const s = K.data.sections.find(x => x.id === Number(b.dataset.id));
        const sh = sheet(`<h2>${esc(s.name)}</h2><div class="form" style="margin-top:12px"><label class="field">Name<input class="input" data-n value="${esc(s.name)}"></label>
          <button class="btn" data-a="ren">Save</button><button class="btn danger" data-a="drop">Delete section</button><p class="note">Deleting a section keeps its dishes under "No section".</p></div>`);
        bind(sh, {
          ren: x => busy(x, async () => { await api("PATCH", `/v1/restaurant/${place().id}/sections/${s.id}`, { name: $("[data-n]", sh).value }); sh.close(); await loadData(); drawMenu(); }),
          drop: x => busy(x, async () => { await api("DELETE", `/v1/restaurant/${place().id}/sections/${s.id}`); sh.close(); await loadData(); drawMenu(); }),
        });
      },
      paydue: () => payDue(),
      savesettings: b => saveSettings(b),
      addstaff: async () => {
        const s = sheet(`<h2>Add to your team</h2><p class="sub">They log in to Kezia's Food with this number.</p><div class="form">
          <div class="seg" data-role><button data-r="rider" aria-pressed="true">Rider</button><button data-r="manager" aria-pressed="false">Manager</button></div>
          <label class="field">Name<input class="input" data-n placeholder="e.g. Bilal"></label><label class="field">Mobile number<input class="input" data-p type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit number"></label>
          <button class="btn" data-a="add">Add</button></div>`);
        $("[data-role]", s).onclick = e => { const x = e.target.closest("button"); if (x) $$("[data-role] button", s).forEach(y => y.setAttribute("aria-pressed", y === x)); };
        bind(s, { add: x => busy(x, async () => {
          const j = await post(`/v1/restaurant/${place().id}/staff`, { name: $("[data-n]", s).value, phone: $("[data-p]", s).value, role: $("[data-role] [aria-pressed=true]", s).dataset.r });
          K.data.staff = j.staff; s.close(); drawSettings(); toast("Added to your team");
        }) });
      },
      delstaff: async b => { if (!(await confirm("Remove from team?", b.dataset.p, "Remove", true))) return; busy(b, async () => { await api("DELETE", `/v1/restaurant/${place().id}/staff/${encodeURIComponent(b.dataset.p)}`); await loadData(); drawSettings(); }); },
    });
    on("places", () => { if (!S.kitchens().some(p => p.id === K.rid)) { K.rid = (S.kitchens()[0] || {}).id || null; K.data = null; } if (!el.hidden && S.places.length) frame(); });
    on("auth", () => { K.data = null; K.live = []; K.hist = []; bell.stop(); gps.sync([]); });
  }
  async function show() {
    if (!S.places.length) return;
    frame();
    if (S.kitchens().length) { pollKitchen(); if (!K.data) loadData().then(() => { if (!K.el.hidden) frame(); }).catch(fail); bell.awake(!!K.open); KF.askNotify(); }
    if (S.rides().length) pollRides();
  }

  // icons: arrow-right
  KF.partner = { init, show, pollKitchen, pollRides };
})();
