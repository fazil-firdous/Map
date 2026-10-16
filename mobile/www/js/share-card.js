/* Draws a shop card image (1080x1350) for WhatsApp/Instagram sharing: brand header, shop details, QR to directions. */
(function () {
  const W = 1080, H = 1350;
  const colors = { dal: "#0D4F57", dalDeep: "#08353B", chinar: "#E4572E", ink: "#0E1B1E", ink2: "#44575B", line: "#E1E7E8", snow: "#F3F6F6" };
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/); const lines = []; let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; if (lines.length === maxLines) break; } else line = t;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
      let l = lines[maxLines - 1]; while (ctx.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l + "…";
    }
    return lines;
  }
  function qr(ctx, text, x, y, size) {
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = size / n;
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 18, y - 18, size + 36, size + 36);
    ctx.fillStyle = colors.ink;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
  }

  window.makeShareCard = async function ({ name, category, area, phone, address, lat, lon, offer }) {
    await document.fonts.load("800 60px PJS"); await document.fonts.load("600 30px PJS");
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = colors.snow; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, 300); g.addColorStop(0, colors.dal); g.addColorStop(1, colors.dalDeep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300);
    try { const logo = await loadImg("img/logo-horizontal-white.png"); const h = 150; ctx.drawImage(logo, 70, 75, logo.width * h / logo.height, h); } catch {}
    // card
    ctx.fillStyle = "#fff"; roundRect(ctx, 50, 250, W - 100, 1000, 36); ctx.fill();
    ctx.fillStyle = colors.chinar; ctx.font = "800 30px PJS"; ctx.fillText(String(category).toUpperCase(), 110, 350);
    ctx.fillStyle = colors.ink; ctx.font = "800 76px PJS";
    const lines = wrap(ctx, name, W - 220, 3); lines.forEach((l, i) => ctx.fillText(l, 110, 450 + i * 88));
    let y = 450 + lines.length * 88 + 10;
    ctx.fillStyle = colors.ink2; ctx.font = "600 38px PJS"; ctx.fillText(`${area || "Srinagar"}, Srinagar`, 110, y); y += 50;
    if (offer) { ctx.fillStyle = "#FFF3DF"; roundRect(ctx, 100, y, W - 200, 84, 18); ctx.fill(); ctx.fillStyle = "#8A5300"; ctx.font = "800 34px PJS"; ctx.fillText(wrap(ctx, "Offer: " + offer, W - 260, 1)[0], 130, y + 55); y += 110; }
    ctx.strokeStyle = colors.line; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(110, y + 10); ctx.lineTo(W - 110, y + 10); ctx.stroke(); y += 80;
    if (phone) { ctx.fillStyle = colors.ink2; ctx.font = "600 30px PJS"; ctx.fillText("Call / WhatsApp", 110, y); ctx.fillStyle = colors.ink; ctx.font = "800 60px PJS"; ctx.fillText(phone, 110, y + 72); y += 130; }
    if (address) { ctx.fillStyle = colors.ink2; ctx.font = "600 32px PJS"; wrap(ctx, address, 560, 3).forEach((l, i) => ctx.fillText(l, 110, y + i * 44)); }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    qr(ctx, url, W - 110 - 260, 900, 260);
    ctx.fillStyle = colors.ink2; ctx.font = "600 26px PJS"; ctx.textAlign = "center"; ctx.fillText("Scan for directions", W - 110 - 130, 1210); ctx.textAlign = "left";
    ctx.fillStyle = colors.dal; ctx.font = "700 30px PJS"; ctx.fillText("Found on Srinagar Bazaar", 110, 1210);
    ctx.fillStyle = colors.ink2; ctx.font = "600 26px PJS"; ctx.fillText("Every shop in Srinagar, nearest first", 110, 1300);
    return new Promise(r => cv.toBlob(r, "image/png"));
  };
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
})();
