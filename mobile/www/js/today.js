/* "Today in Srinagar": namaz times (calculated on the phone, works offline) and the weather (Open-Meteo, cached). */
(function () {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  // Srinagar, India time. Fajr/Isha 18° (Karachi method), Asr Hanafi, as most Kashmir calendars use.
  const LAT = 34.0837, LON = 74.7973, TZ = 5.5;

  function sun(jd) {
    const D = jd - 2451545.0;
    const g = (357.529 + 0.98560028 * D) % 360, q = (280.459 + 0.98564736 * D) % 360;
    const L = (q + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) % 360;
    const e = 23.439 - 0.00000036 * D;
    const RA = (Math.atan2(Math.cos(e * rad) * Math.sin(L * rad), Math.cos(L * rad)) * deg / 15 + 24) % 24;
    let eqt = q / 15 - RA; eqt -= 24 * Math.round(eqt / 24);
    return { decl: Math.asin(Math.sin(e * rad) * Math.sin(L * rad)) * deg, eqt };
  }
  function prayers(date = new Date()) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const A = Math.floor((14 - m) / 12), Y = y + 4800 - A, M = m + 12 * A - 3;
    const jd = d + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045 - LON / 360;
    const { decl, eqt } = sun(jd);
    const noon = 12 + TZ - LON / 15 - eqt;
    const hourAngle = alt => Math.acos((Math.sin(alt * rad) - Math.sin(decl * rad) * Math.sin(LAT * rad)) / (Math.cos(decl * rad) * Math.cos(LAT * rad))) * deg / 15;
    const asrAlt = Math.atan(1 / (2 + Math.tan(Math.abs(LAT - decl) * rad))) * deg;
    const t = { Fajr: noon - hourAngle(-18), Sunrise: noon - hourAngle(-0.833), Dhuhr: noon + 2 / 60, Asr: noon + hourAngle(asrAlt),
      Maghrib: noon + hourAngle(-0.833) + 1 / 60, Isha: noon + hourAngle(-18) };
    const base = new Date(y, m - 1, d);
    return Object.entries(t).map(([name, h]) => ({ name, at: new Date(base.getTime() + Math.round(h * 60) * 60000) }));
  }
  function nextPrayer(now = new Date()) {
    const list = prayers(now).filter(p => p.name !== "Sunrise");
    return list.find(p => p.at > now) || { name: "Fajr", at: prayers(new Date(now.getTime() + 864e5))[0].at };
  }
  const fmt = d => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])m/i, (_, x) => " " + x.toLowerCase() + "m");

  // WMO weather codes -> Lucide icon, label
  const WX = [[0, "sun", "Clear"], [2, "cloud-sun", "Partly cloudy"], [3, "cloud", "Cloudy"], [48, "cloud-fog", "Fog"], [57, "cloud-drizzle", "Drizzle"], [67, "cloud-rain", "Rain"],
    [77, "cloud-snow", "Snow"], [82, "cloud-rain", "Showers"], [86, "cloud-snow", "Snow showers"], [99, "cloud-lightning", "Thunderstorm"]];
  const wxOf = code => WX.find(([c]) => code <= c) || WX[WX.length - 1];
  async function weather() {
    let c = null; try { c = JSON.parse(localStorage.getItem("sb_wx2") || "null"); } catch {}
    if (c && Date.now() - c.t < 30 * 60000) return c;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata&forecast_days=1`);
      const j = await r.json();
      let [, icon, text] = wxOf(j.current.weather_code);
      if (!j.current.is_day && icon === "sun") icon = "moon";
      c = { t: Date.now(), temp: Math.round(j.current.temperature_2m), icon, text, hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]) };
      try { localStorage.setItem("sb_wx2", JSON.stringify(c)); } catch {}
      return c;
    } catch { return c; } // offline: last known, or nothing
  }
  window.SBToday = { prayers, nextPrayer, weather, fmt };
})();
