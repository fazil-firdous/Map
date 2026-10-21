// Kezia's Food: the owner's mode. Dashboard (your commission, sales, orders, customers), every restaurant with its
// numbers and requests to approve, all orders, and users with the most active first. Uses the /v1/admin API.
(() => {
  const { $, $$, esc, I, rs, bgc, S, get, post, api, sheet, confirm, ask, toast, fail, busy, bind, haptic, on, skelLines, empty, when, plural, call } = KF;
  const { STATUS, OPEN } = KF.customer;
  const A = { el: null, view: "home", dash: null, rest: null, rfilter: "live", ofilter: "", usort: "active", uq: "" };
  const ago = d => { if (!d) return "never"; const m = (Date.now() - Date.parse(d)) / 60000;
    return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : (Math.round(m / 1440) === 1 ? "1 day ago" : `${Math.round(m / 1440)} days ago`); };
  const TITLES = { home: "Owner dashboard", rest: "Restaurants", orders: "All orders", users: "Users" };
  const statusPill = st => `<span class="pill ${st === "active" ? "green" : st === "pending" ? "gold" : st === "test" ? "" : "red"}">${{ active: "Live", pending: "Request", test: "Test", suspended: "Suspended" }[st]}</span>`;

  /** Count numbers up from 0 for a lively dashboard. */
  function countUp(root) {
    $$("[data-count]", root).forEach(el => {
      const to = Number(el.dataset.count), money = el.dataset.money === "1", t0 = performance.now(), dur = 700;
      const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        el.textContent = money ? rs(v) : v.toLocaleString("en-IN"); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  const num = (v, money) => `<span data-count="${v}" data-money="${money ? 1 : 0}">${money ? rs(0) : 0}</span>`;

  function frame() {
    A.el.innerHTML = `<div class="page-grad fadein" style="display:flex;flex-direction:column;height:100%"><div class="rm-head"><div class="row between">
        <span class="row"><span class="tile">${I("sparkles", "sm")}</span><span><b style="font-size:17px">Kezia's Food</b><br><span class="muted small">Owner account${S.user && S.user.name ? " · " + esc(S.user.name) : ""}</span></span></span>
        <button class="iconbtn" data-a="refresh" aria-label="Refresh">${I("refresh-cw", "sm")}</button></div><div class="vtitle">${TITLES[A.view]}</div></div>
      <div class="scroll" data-body></div></div>`;
    draw();
  }
  const body = () => $("[data-body]", A.el);
  function draw() { ({ home: drawHome, rest: drawRest, orders: drawOrders, users: drawUsers })[A.view](); }

  // ---------- dashboard ----------
  async function drawHome() {
    const b = body();
    if (!A.dash) b.innerHTML = `<div class="due skel" style="height:190px"></div><div class="stats">${[1, 2, 3].map(() => `<div class="stat skel" style="height:70px"></div>`).join("")}</div>${skelLines(4)}`;
    try { A.dash = await get("/v1/admin/dashboard"); } catch (e) { if (!A.dash) { b.innerHTML = empty("circle-alert", "Couldn't load the dashboard", e.message); return; } }
    if (A.view !== "home") return;
    const d = A.dash, t = d.totals;
    KF.badge("a:rest", d.places.pending); KF.badge("a:home", d.claims.length);
    const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(Date.now() - (13 - i) * 86400000), k = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const r = d.days.find(x => x.d === k) || { orders: 0, food: 0, commission: 0 }; return { dt, ...r }; });
    const metric = A.metric || "food", max = Math.max(1, ...days.map(x => x[metric]));
    const sc = b.scrollTop;
    b.innerHTML = `
      <div class="due fadein"><small>Your commission · all time</small><b>${num(t.commission_all, 1)}</b>
        <p>Today ${rs(t.commission_today)} · last 30 days ${rs(t.commission_30)}</p>
        <div class="duegrid"><div><span>To collect</span><b>${rs(t.commission_due)}</b></div><div><span>Checking</span><b>${rs(t.commission_checking)}</b></div><div><span>Received</span><b>${rs(t.commission_received)}</b></div></div></div>
      ${d.places.pending ? `<button class="warn" data-a="requests" style="margin:0 var(--gut) 14px;width:calc(100% - 2*var(--gut));text-align:left">${I("store", "sm")} <span class="grow"><b>${plural(d.places.pending, "restaurant request")}</b> waiting for your approval</span>${I("chevron-right", "sm")}</button>` : ""}
      ${d.claims.length ? `<div class="card"><h3>${I("hand-coins", "xs")} Commission payments to confirm</h3>${d.claims.map(c => `<div class="ci" style="grid-template-columns:1fr auto">
          <span><b>${esc(c.restaurant)}</b> paid <b class="green">${rs(c.amount)}</b><br><span class="muted small">${plural(c.orders, "order")} · UPI ref <span class="selectable">${esc(c.utr)}</span> · ${ago(c.created_at)}</span></span>
          <span class="row" style="gap:6px"><button class="btn danger sm" data-a="claim" data-id="${c.id}" data-ok="0">No</button><button class="btn sm" data-a="claim" data-id="${c.id}" data-ok="1">Got it</button></span></div>`).join("")}
        <p class="note" style="margin:6px 0 0">Check your UPI app for the amount and reference before confirming.</p></div>` : ""}
      <div class="stats stagger">
        <div class="stat" style="--i:0"><b>${num(t.orders_today)}</b><span>orders today</span></div>
        <div class="stat" style="--i:1"><b>${num(t.live)}</b><span>live now</span></div>
        <div class="stat" style="--i:2"><b>${num(t.food_today, 1)}</b><span>sales today</span></div>
        <div class="stat" style="--i:3"><b>${num(t.food_30, 1)}</b><span>sales · 30 days</span></div>
        <div class="stat" style="--i:4"><b>${num(t.delivered_30)}</b><span>delivered · 30 days</span></div>
        <div class="stat" style="--i:5"><b>${num(t.food_all, 1)}</b><span>sales · all time</span></div>
        <div class="stat" style="--i:6"><b>${num(d.users.total)}</b><span>customers · +${d.users.new_7} this week</span></div>
        <div class="stat" style="--i:7"><b>${num(d.users.ordering_30)}</b><span>ordered · 30 days</span></div>
        <div class="stat" style="--i:8"><b>${num(d.places.active)}</b><span>restaurants · ${d.places.open_now} open</span></div>
      </div>
      <div class="card"><div class="row between"><h3 style="margin:0">Last 14 days</h3><div class="chips" style="padding:0">${[["food", "Sales"], ["orders", "Orders"], ["commission", "Yours"]].map(([k, l]) => `<button class="chip" style="height:30px" data-a="metric" data-m="${k}" aria-pressed="${metric === k}">${l}</button>`).join("")}</div></div>
        <div class="bars" style="margin-top:14px;height:110px">${days.map((x, i) => `<i style="height:${Math.max(4, x[metric] / max * 100)}%;animation-delay:${i * 30}ms;${x[metric] ? "" : "opacity:.25"}" data-a="day" data-i="${i}"></i>`).join("")}</div>
        <div class="row between muted small" style="margin-top:6px"><span>${days[0].dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span data-dayinfo>Tap a bar</span><span>Today</span></div></div>
      <button class="card row" data-a="suggestions" style="width:calc(100% - 2*var(--gut));text-align:left"><span class="tile gold">${I("message-square", "sm")}</span>
        <span class="grow"><b>Suggestions</b><br><span class="muted small">${t.suggestions_new ? `${plural(t.suggestions_new, "new suggestion")} to read` : "Ideas and problems people send from the app"}</span></span>
        ${t.suggestions_new ? `<span class="pill solid">${t.suggestions_new}</span>` : I("chevron-right", "sm")}</button>
      <div class="sec"><h2>Commission per restaurant</h2><button data-a="rates">${I("pencil", "xs")} Edit</button></div>
      <div class="card" style="padding:4px 14px" data-rates><p class="note">Loading…</p></div>
      <div class="sec"><h2>Top restaurants · 30 days</h2><button data-a="goto" data-v="rest">All</button></div>
      <div class="card" style="padding:4px 14px">${d.top.length ? `<div class="list">${d.top.map((r, i) => `<div class="li"><span class="tile" ${bgc(r.photo)}>${r.photo ? "" : I("store", "sm")}</span>
          <span><b>${i + 1}. ${esc(r.name)}</b><br><span class="muted small">${plural(r.orders, "order")} · sales ${rs(r.food)}</span></span><b class="green">${rs(r.commission)}</b></div>`).join("")}</div>` : `<p class="note">No delivered orders in the last 30 days yet.</p>`}</div>
      <div class="sec"><h2>Most active customers</h2><button data-a="goto" data-v="users">All</button></div>
      <div class="card" style="padding:4px 14px">${d.active.length ? `<div class="list">${d.active.map(u => `<div class="li"><span class="avatar" style="width:40px;height:40px">${esc((u.name || "?")[0].toUpperCase())}</span>
          <span><b>${esc(u.name || "No name")}</b><br><span class="muted small">${esc(u.phone)} · ${plural(u.orders, "order")} · last ${ago(u.last)}</span></span><b>${rs(u.spent)}</b></div>`).join("")}</div>` : `<p class="note">No orders in the last 30 days yet.</p>`}</div>
      <div class="sec"><h2>Platform settings</h2><button data-a="settings">${I("pencil", "xs")} Edit</button></div>
      <div class="card"><div class="line"><span>Commission</span><b>${esc(d.settings.commission_pct)}% of food value</b></div>
        <div class="line"><span>Your UPI (restaurants pay you)</span><b>${esc(d.settings.platform_upi || "not set")}</b></div>
        <div class="line"><span>Support WhatsApp (restaurants & riders only)</span><b>${esc(d.settings.support_phone || "not set")}</b></div>
        <div class="line"><span>New customers: free delivery</span><b>${Number(d.settings.promo_new_orders) ? `first ${plural(Number(d.settings.promo_new_orders), "order")} up to ${rs(d.settings.promo_new_max)}` : "off"}</b></div>
        <div class="line"><span>Free delivery you paid so far</span><b>${rs(t.promo_cost)}</b></div></div>
      <p class="note pad" style="text-align:center;margin-bottom:24px">Banners and more are on the web admin page: ${esc(KF.API.replace("https://", ""))}/admin/</p>`;
    b.scrollTop = sc; countUp(b);
    A.days = days;
    // commission list (from the restaurants list)
    get("/v1/admin/restaurants").then(j => { A.rest = j; const box = $("[data-rates]", b); if (!box) return;
      box.innerHTML = `<div class="list">${j.restaurants.map(r => `<button class="li" style="width:100%;text-align:left" data-a="rate" data-id="${r.id}"><span class="tile ${r.commission_pct === null ? "" : "gold"}">${I("badge-percent", "sm")}</span>
        <span><b>${esc(r.name)}</b><br><span class="muted small">${r.commission_pct === null ? `default ${j.default_pct}%` : "own rate"} · ${statusPill(r.status)}</span></span><b style="font-size:17px">${r.rate}%</b></button>`).join("")}</div>`; }).catch(() => {});
  }

  // ---------- restaurants ----------
  async function drawRest() {
    const b = body();
    if (!A.rest) b.innerHTML = skelLines(5) + skelLines(5);
    try { A.rest = await get("/v1/admin/restaurants"); } catch (e) { if (!A.rest) { b.innerHTML = empty("circle-alert", "Couldn't load restaurants", e.message); return; } }
    if (A.view !== "rest") return;
    const all = A.rest.restaurants, count = st => all.filter(r => r.status === st).length;
    if (A.rfilter === "live") A.rfilter = count("pending") ? "pending" : "all";
    const list = all.filter(r => A.rfilter === "all" || r.status === A.rfilter);
    const f = [["pending", `Requests (${count("pending")})`], ["active", `Live (${count("active")})`], ["test", `Test (${count("test")})`], ["suspended", `Suspended (${count("suspended")})`], ["all", "All"]];
    b.innerHTML = `<div class="pad" style="margin-bottom:12px"><button class="btn sm" data-a="addrest" style="width:100%">${I("plus", "sm")} Add a restaurant</button></div>
      <div class="chips pad" style="margin-bottom:12px">${f.map(([k, l]) => `<button class="chip" data-a="rfilter" data-f="${k}" aria-pressed="${A.rfilter === k}">${l}</button>`).join("")}</div>
      ${list.length ? list.map((r, i) => `<div class="ocard" style="animation-delay:${i * 45}ms">
        <div class="row"><span class="tile" ${bgc(r.photo, "width:52px;height:52px;border-radius:14px")}>${r.photo ? "" : I("store", "sm")}</span>
          <span class="grow" style="min-width:0"><b class="ell" style="display:block;font-size:16px">${esc(r.name)}</b><span class="muted small">${esc(r.area || "")}${r.cuisines ? " · " + esc(r.cuisines) : ""}</span></span>
          <span style="text-align:right">${statusPill(r.status)}<br><span class="small ${r.is_open ? "green" : "muted"}" style="font-weight:800">${r.is_open ? "● Open" : "○ Closed"}</span></span></div>
        <div class="mgrid"><div><b>${r.delivered}</b><span>delivered</span></div><div><b>${rs(r.food)}</b><span>sales</span></div><div><b class="green">${rs(r.commission)}</b><span>your ${r.rate}%</span></div>
          <div><b class="${r.due ? "red" : ""}">${rs(r.due)}</b><span>to collect</span></div><div><b>${rs(r.received)}</b><span>received</span></div><div><b>${r.rating ? r.rating + "★" : "–"}</b><span>${r.dishes} dishes</span></div></div>
        ${!r.owner_phone ? `<div class="warn" style="margin-top:10px">${I("key-round", "sm")} <span>${r.pending_owner_phone ? `Waiting for <b>${esc(r.pending_owner_phone)}</b> to log in: it becomes theirs then.` : "No owner yet: you manage it. Hand it over when the owner is ready."}</span></div>` : ""}
        <div class="muted small" style="margin-top:10px">${I("user", "xs")} ${esc(r.owner_name || (r.owner_phone ? "Owner" : "You"))} ${esc(r.owner_phone || "")} · UPI ${esc(r.upi_id || "not set")} · ${r.cod ? "cash ok" : "UPI only"} · last order ${ago(r.last_order)}${r.missed ? ` · <span class="red">${r.missed} missed</span>` : ""}</div>
        <div class="two">${r.status === "pending" ? `<button class="btn danger" data-a="rstatus" data-id="${r.id}" data-s="suspended">Decline</button><button class="btn shine" data-a="rstatus" data-id="${r.id}" data-s="active">${I("check", "sm")} Approve</button>`
          : r.status === "active" ? `<button class="btn ghost" data-a="rorders" data-id="${r.id}">${I("receipt", "sm")} Orders</button><button class="btn soft" data-a="rate" data-id="${r.id}">${I("badge-percent", "sm")} Rate ${r.rate}%</button>`
          : r.status === "test" ? `<button class="btn ghost" data-a="rorders" data-id="${r.id}">${I("receipt", "sm")} Orders</button><button class="btn" data-a="rstatus" data-id="${r.id}" data-s="active">Make live</button>`
          : `<button class="btn ghost" data-a="rorders" data-id="${r.id}">${I("receipt", "sm")} Orders</button><button class="btn" data-a="rstatus" data-id="${r.id}" data-s="active">Re-activate</button>`}</div>
        <div class="two"><button class="btn soft" data-a="manage" data-id="${r.id}">${I("utensils", "sm")} Menu & settings</button><button class="btn ghost" data-a="handover" data-id="${r.id}">${I("key-round", "sm")} ${r.owner_phone ? "Change owner" : "Hand over"}</button></div>
        <div class="row" style="margin-top:10px;gap:14px">${r.owner_phone ? `<button class="link small" data-a="callp" data-p="${esc(r.owner_phone)}">${I("phone", "xs")} Call owner</button>` : ""}
          ${r.status === "active" ? `<button class="link small" style="color:var(--red)" data-a="rstatus" data-id="${r.id}" data-s="suspended">Suspend</button>` : ""}
          ${r.status !== "pending" && r.status !== "active" ? "" : `<button class="link small" style="color:var(--ink-3)" data-a="rstatus" data-id="${r.id}" data-s="test">Mark as test</button>`}</div></div>`).join("")
        : empty("store", A.rfilter === "pending" ? "No requests" : "Nothing here", A.rfilter === "pending" ? "New restaurants apply from Profile → Own a restaurant. They show up here for approval." : "No restaurants in this list.")}
      <div style="height:16px"></div>`;
    KF.badge("a:rest", count("pending"));
  }

  // ---------- orders ----------
  const ocard = (o, i) => `<button class="card" data-a="order" data-id="${esc(o.id)}" style="display:block;width:calc(100% - 2*var(--gut));text-align:left;animation:fadeup .4s var(--ease) both;animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="row between"><b>${esc(o.id)} · ${esc(o.restaurant)}</b><span class="pill ${OPEN.includes(o.status) ? "solid" : o.status === "delivered" ? "green" : "red"}">${STATUS[o.status]}</span></div>
      <div class="muted small" style="margin-top:4px">${esc(o.customer_name || "Customer")} ${esc(o.customer_phone || "")} · ${when(o.created_at)}</div>
      <div class="row between" style="margin-top:8px"><span class="small">${o.items.reduce((s, l) => s + l.qty, 0)} items · ${o.pay_method === "cod" ? "cash" : "UPI"}${o.refund ? ` · refund ${o.refund}` : ""}</span>
        <span><b>${rs(o.total)}</b> <span class="small green">+${rs(o.commission)}</span></span></div></button>`;
  async function drawOrders(rid) {
    const b = body();
    const f = [["", "All"], ["live", "Live"], ["delivered", "Delivered"], ["failed", "Cancelled"]];
    b.innerHTML = `<div class="chips pad" style="margin-bottom:12px">${f.map(([k, l]) => `<button class="chip" data-a="ofilter" data-f="${k}" aria-pressed="${A.ofilter === k}">${l}</button>`).join("")}</div><div data-list>${skelLines(4)}</div>`;
    let j; try { j = await get(`/v1/admin/orders?status=${A.ofilter}`); } catch (e) { $("[data-list]", b).innerHTML = empty("circle-alert", "Couldn't load orders", e.message); return; }
    if (A.view !== "orders") return;
    A.orders = j.orders;
    const sum = j.orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.commission, 0);
    $("[data-list]", b).innerHTML = j.orders.length ? `<p class="note pad" style="margin:0 0 10px">${plural(j.orders.length, "order")} shown · your commission on delivered ones ${rs(sum)}</p>${j.orders.map(ocard).join("")}<div style="height:16px"></div>`
      : empty("receipt", "No orders here", "Orders from every restaurant show up here.");
  }
  function orderSheet(o) {
    sheet(`<h2>${esc(o.id)} · ${STATUS[o.status]}</h2><p class="sub">${esc(o.restaurant)} · ${when(o.created_at)}</p>
      <div class="card" style="margin:0 0 12px">${o.items.map(l => `<div class="line"><span>${l.qty} × ${esc(l.name)}</span><b>${rs(l.price * l.qty)}</b></div>`).join("")}
        <div class="line"><span>Delivery (${o.km} km)</span><b>${rs(o.delivery_fee)}</b></div>${o.packing ? `<div class="line"><span>Packing</span><b>${rs(o.packing)}</b></div>` : ""}
        <div class="line total"><span>Total</span><span>${rs(o.total)}</span></div>
        <div class="line"><span>Your commission (${Number(o.commission_pct)}% of food)</span><b class="green">${rs(o.commission)}${o.status === "delivered" ? "" : " (only if delivered)"}</b></div>
        <div class="line"><span>Payment</span><b>${o.pay_method === "cod" ? "Cash" : "UPI"}${o.refund ? " · refund " + o.refund : ""}</b></div>
        <div class="line"><span>Customer</span><b>${esc(o.customer_name || "")} ${esc(o.customer_phone || "")}</b></div>
        <div class="line"><span>Address</span><b style="text-align:right">${esc(o.address.landmark)}</b></div>
        ${o.cancel_reason || o.reject_reason ? `<div class="line"><span>Reason</span><b style="text-align:right">${esc(o.cancel_reason || o.reject_reason)}</b></div>` : ""}
        ${o.rating ? `<div class="line"><span>Rating</span><b>${o.rating} ★</b></div>` : ""}</div>
      ${o.customer_phone ? `<button class="btn soft" data-a="callp" data-p="${esc(o.customer_phone)}">${I("phone", "sm")} Call customer</button>` : ""}`);
  }
  function restOrders(r) {
    KF.push(async (el, scr) => {
      el.innerHTML = `${KF.topbar(r.name)}<div class="scroll">${skelLines(4)}</div>`;
      bind(el, { back: () => KF.pop(scr), order: b => orderSheet(list.find(o => o.id === b.dataset.id)), callp: b => call(b.dataset.p) });
      let list = [];
      try { list = (await get(`/v1/admin/orders?restaurant=${encodeURIComponent(r.id)}`)).orders; } catch (e) { $(".scroll", el).innerHTML = empty("circle-alert", "Couldn't load", e.message); return; }
      $(".scroll", el).innerHTML = `<div class="stats" style="margin-top:6px"><div class="stat"><b>${r.delivered}</b><span>delivered</span></div><div class="stat"><b>${rs(r.food)}</b><span>sales</span></div><div class="stat"><b class="green">${rs(r.commission)}</b><span>your commission</span></div></div>
        ${list.length ? list.map(ocard).join("") : empty("receipt", "No orders yet", "")}<div style="height:16px"></div>`;
    });
  }

  // ---------- users ----------
  async function drawUsers() {
    const b = body();
    const f = [["active", "Most active"], ["spent", "Top spenders"], ["new", "Newest"]];
    if (!$("[data-uq]", b)) {
      b.innerHTML = `<div class="pad" style="margin-bottom:10px"><label class="searchbox" style="margin:0;height:46px">${I("search")}<input data-uq placeholder="Search name or phone" value="${esc(A.uq)}" style="border:0;outline:0;background:none;font:inherit;flex:1;color:var(--ink);min-width:0"></label></div>
        <div class="chips pad" style="margin-bottom:12px" data-uchips></div><div data-list></div>`;
      let t; $("[data-uq]", b).oninput = e => { clearTimeout(t); t = setTimeout(() => { A.uq = e.target.value.trim(); drawUsers(); }, 300); };
    }
    $("[data-uchips]", b).innerHTML = f.map(([k, l]) => `<button class="chip" data-a="usort" data-f="${k}" aria-pressed="${A.usort === k}">${l}</button>`).join("");
    const box = $("[data-list]", b); box.innerHTML = skelLines(5);
    let j; try { j = await get(`/v1/admin/users?sort=${A.usort}&q=${encodeURIComponent(A.uq)}`); } catch (e) { box.innerHTML = empty("circle-alert", "Couldn't load users", e.message); return; }
    if (A.view !== "users") return;
    A.users = j.users;
    box.innerHTML = j.users.length ? `<div class="card" style="padding:4px 14px"><div class="list stagger">${j.users.map((u, i) => `<button class="li" style="width:100%;text-align:left;--i:${Math.min(i, 15)}" data-a="user" data-id="${u.id}">
        <span class="avatar" style="width:40px;height:40px;${u.banned ? "background:var(--red)" : ""}">${esc((u.name || "?")[0].toUpperCase())}</span>
        <span style="min-width:0"><b>${esc(u.name || "No name")}</b>${u.role === "admin" ? ` <span class="pill gold">Owner</span>` : ""}${u.owns ? ` <span class="pill green">Restaurant</span>` : ""}${u.banned ? ` <span class="pill red">Blocked</span>` : ""}
          <br><span class="muted small">${esc(u.phone)} · ${plural(u.orders, "order")} · ${u.orders ? "last " + ago(u.last_order) : "joined " + ago(u.created_at)}</span></span>
        <b>${rs(u.spent)}</b></button>`).join("")}</div></div><div style="height:16px"></div>` : empty("users", "No users found", "");
  }
  function userSheet(u) {
    const s = sheet(`<div class="row"><span class="avatar" style="width:56px;height:56px;font-size:22px">${esc((u.name || "?")[0].toUpperCase())}</span><span><h2 style="margin:0">${esc(u.name || "No name")}</h2><span class="muted">${esc(u.phone)}</span></span></div>
      <div class="mgrid" style="margin:16px 0"><div><b>${u.orders}</b><span>orders</span></div><div><b>${u.delivered}</b><span>delivered</span></div><div><b>${rs(u.spent)}</b><span>spent</span></div>
        <div><b>${u.orders_30}</b><span>last 30 days</span></div><div><b class="${u.cancelled ? "red" : ""}">${u.cancelled}</b><span>cancelled</span></div><div><b class="${u.no_shows ? "red" : ""}">${u.no_shows}</b><span>cash no-shows</span></div></div>
      <p class="note">Joined ${when(u.created_at)}${u.owns ? ` · owns ${esc(u.owns)}` : ""}${u.last_order ? ` · last order ${ago(u.last_order)}` : ""}</p>
      <div class="two"><button class="btn soft" data-a="callp" data-p="${esc(u.phone)}">${I("phone", "sm")} Call</button>
        ${u.role === "admin" ? "" : `<button class="btn ${u.banned ? "" : "danger"}" data-a="ban">${u.banned ? "Unblock" : "Block"}</button>`}</div>`);
    bind(s, {
      callp: b => call(b.dataset.p),
      ban: async b => {
        if (!u.banned && !(await confirm("Block this user?", "They can't log in or order until you unblock them.", "Block", true))) return;
        busy(b, async () => { await post("/v1/admin/users/ban", { phone: u.phone, banned: !u.banned }); s.close(); toast(u.banned ? "Unblocked" : "Blocked"); drawUsers(); });
      },
    });
  }

  // ---------- suggestions ----------
  function openSuggestions() {
    KF.push(async (el, scr) => {
      el.innerHTML = `${KF.topbar("Suggestions")}<div class="scroll">${skelLines(4)}</div>`;
      const draw = async () => {
        let list; try { list = (await get("/v1/admin/suggestions")).suggestions; } catch (e) { $(".scroll", el).innerHTML = empty("circle-alert", "Couldn't load", e.message); return; }
        $(".scroll", el).innerHTML = list.length ? list.map((x, i) => `<div class="ocard" style="animation-delay:${Math.min(i, 10) * 40}ms;${x.status === "done" ? "opacity:.6" : ""}">
            <div class="hd"><b>${esc(x.name || "Someone")}</b><span class="pill ${x.kind === "customer" ? "" : "gold"}">${x.kind}</span></div>
            <p style="margin:8px 0;line-height:1.5" class="selectable">${esc(x.text)}</p>
            <div class="row between"><span class="muted small">${esc(x.phone || "")} · ${ago(x.created_at)}</span>
              <span class="row" style="gap:8px">${x.phone ? `<button class="link small" data-a="callp" data-p="${esc(x.phone)}">${I("phone", "xs")} Call</button>` : ""}
              <button class="btn ${x.status === "done" ? "ghost" : "soft"} sm" data-a="sdone" data-id="${x.id}" data-s="${x.status === "done" ? "new" : "done"}">${x.status === "done" ? "Mark new" : "Done"}</button></span></div></div>`).join("")
          : empty("message-square", "No suggestions yet", "Customers, restaurants and riders can send ideas from Profile → Send a suggestion.");
      };
      bind(el, { back: () => KF.pop(scr), callp: b => call(b.dataset.p),
        sdone: b => busy(b, async () => { await api("PATCH", `/v1/admin/suggestions/${b.dataset.id}`, { status: b.dataset.s }); await draw(); }) });
      scr.onClose(() => drawHome());
      draw();
    });
  }

  // ---------- wiring ----------
  function init(el) {
    A.el = el;
    bind(el, {
      refresh: b => { b.classList.add("spin1"); setTimeout(() => b.classList.remove("spin1"), 700); haptic(); draw(); },
      goto: b => KF.tab("a:" + b.dataset.v),
      requests: () => { A.rfilter = "pending"; KF.tab("a:rest"); },
      metric: b => { A.metric = b.dataset.m; haptic(); drawHome(); },
      day: b => { const d = A.days[b.dataset.i]; $("[data-dayinfo]", el).textContent = `${d.dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${d.orders} orders · ${rs(d.food)} · yours ${rs(d.commission)}`; haptic(); },
      claim: b => busy(b, async () => { await post(`/v1/admin/settlements/${b.dataset.id}/${b.dataset.ok === "1" ? "paid" : "reject"}`); haptic("success"); toast(b.dataset.ok === "1" ? "Marked as received" : "Marked as not received"); drawHome(); }),
      settings: async () => {
        const st = A.dash.settings;
        const v = await ask("Platform settings", "The commission applies to new orders. You can give a restaurant its own rate on its card.",
          [{ k: "commission_pct", label: "Commission (% of food value)", value: st.commission_pct, inputmode: "decimal" }, { k: "platform_upi", label: "Your UPI ID (restaurants pay your fee here)", value: st.platform_upi, placeholder: "you@ybl" },
           { k: "support_phone", label: "Support WhatsApp number (only restaurants and riders see it)", value: st.support_phone, inputmode: "tel" },
           { k: "promo_new_orders", label: "New customers: free delivery on their first … orders (0 = off)", value: st.promo_new_orders ?? 1, inputmode: "numeric" },
           { k: "promo_new_max", label: "…when the food is up to ₹", value: st.promo_new_max ?? 400, inputmode: "numeric" }]);
        if (v) busy(null, async () => { await api("PUT", "/v1/admin/settings", v); toast("Saved"); drawHome(); });
      },
      rfilter: b => { A.rfilter = b.dataset.f; haptic(); drawRest(); },
      rstatus: async b => {
        const r = A.rest.restaurants.find(x => x.id === b.dataset.id), s = b.dataset.s;
        const msg = { active: [`Make ${r.name} live?`, "Customers will see it and can order.", "Make live"], suspended: [`${r.status === "pending" ? "Decline" : "Suspend"} ${r.name}?`, "It disappears from the app. You can re-activate it later.", r.status === "pending" ? "Decline" : "Suspend"], test: [`Mark ${r.name} as test?`, "It stays visible with a TEST tag.", "Mark as test"] }[s];
        if (!(await confirm(msg[0], msg[1], msg[2], s === "suspended"))) return;
        busy(b, async () => { await api("PATCH", `/v1/admin/restaurants/${r.id}`, { status: s }); haptic("success"); toast("Updated"); drawRest(); });
      },
      rate: async b => {
        const r = A.rest.restaurants.find(x => x.id === b.dataset.id);
        const v = await ask(`Commission for ${r.name}`, `Leave empty to use the default ${A.rest.default_pct}%. Applies to new orders.`, [{ k: "pct", label: "Commission %", value: r.commission_pct ?? "", inputmode: "decimal", placeholder: String(A.rest.default_pct) }]);
        if (v) busy(null, async () => { await api("PATCH", `/v1/admin/restaurants/${r.id}`, { commission_pct: v.pct }); toast("Rate saved. Prices updated"); draw(); });
      },
      rorders: b => restOrders(A.rest.restaurants.find(x => x.id === b.dataset.id)),
      manage: b => KF.manage(A.rest.restaurants.find(x => x.id === b.dataset.id)),
      handover: async b => {
        const r = A.rest.restaurants.find(x => x.id === b.dataset.id);
        const v = await ask(`Hand ${r.name} to its owner`, "Enter the owner's mobile number. When they log in to Kezia's Food with it, the restaurant becomes theirs (orders, menu, earnings). You can still see everything.", [{ k: "phone", label: "Owner's mobile number", type: "tel", inputmode: "numeric", placeholder: "10-digit number", value: r.pending_owner_phone ? KF.phone10(r.pending_owner_phone) : "" }], "Hand over");
        if (v && v.phone) busy(null, async () => { const j = await post(`/v1/admin/restaurants/${r.id}/owner`, { phone: v.phone }); haptic("success");
          toast(j.done === "owner" ? "Done: it's theirs now" : "Saved: it becomes theirs when they log in"); drawRest(); });
      },
      addrest: async () => {
        const v = await ask("Add a restaurant", "It stays hidden until you make it live. Next you pin it on the map.", [{ k: "name", label: "Name", placeholder: "e.g. Chunk City" }, { k: "area", label: "Area", placeholder: "e.g. Ghanta Ghar, Kulgam" },
          { k: "address", label: "Address", placeholder: "Street, landmark" }, { k: "phone", label: "Restaurant phone", inputmode: "tel" }, { k: "cuisines", label: "What they serve", placeholder: "Pizza · Burgers" },
          { k: "commission_pct", label: "Commission % (empty = default)", inputmode: "decimal" }], "Next: location");
        if (!v || !v.name) return;
        const p = await KF.customer.pickPlace({ save: false, title: "Where is it?", hint: "Put the pin on the restaurant's door." });
        if (!p) return;
        busy(null, async () => { const j = await post("/v1/admin/restaurants", { ...v, lat: p.lat, lon: p.lon }); toast("Added. Now add its menu"); A.rfilter = "pending"; await drawRest(); KF.manage(j.restaurant); });
      },
      rates: () => toast("Tap a restaurant to change its rate", "badge-percent"),
      suggestions: () => openSuggestions(),
      ofilter: b => { A.ofilter = b.dataset.f; haptic(); drawOrders(); },
      order: b => orderSheet(A.orders.find(o => o.id === b.dataset.id)),
      usort: b => { A.usort = b.dataset.f; haptic(); drawUsers(); },
      user: b => userSheet(A.users.find(u => u.id === b.dataset.id)),
      callp: b => call(b.dataset.p),
    });
    on("auth", () => { A.dash = null; A.rest = null; });
    setInterval(() => { if (S.user && S.user.role === "admin" && !document.hidden && !A.el.hidden && A.view === "home" && !KF.topSheet()) drawHome(); }, 20000);
  }
  function show(view) { if (view) A.view = view; frame(); }

  // icons: chart-column store receipt users
  KF.admin = { init, show };
})();
