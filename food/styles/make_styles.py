"""Light UI style options for Kulgam Eats: the same two screens (home, payment) in four palettes.
Writes styles.html; render with render.js to PNGs for choosing."""
import base64, io, pathlib, re
from PIL import Image
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
ICONS = ["map-pin", "chevron-down", "search", "pizza", "chef-hat", "soup", "coffee", "croissant", "sparkles", "star", "clock", "bike", "flame",
         "chevron-right", "x", "smartphone", "copy", "shield-check", "zap", "house", "package", "store", "circle-check", "indian-rupee"]
SVG = {n: re.sub(r"^[\s\S]*?<svg[^>]*>|</svg>\s*$", "", (ROOT / f"mobile/node_modules/lucide-static/icons/{n}.svg").read_text()).replace("\n", "") for n in ICONS}
I = lambda n, c="": f'<svg class="ico {c}" viewBox="0 0 24 24">{SVG[n]}</svg>'
def img(name, w=640):
    im = Image.open(ROOT / f"mobile/www/img/photos/{name}.jpg").convert("RGB"); im.thumbnail((w, 400))
    b = io.BytesIO(); im.save(b, "JPEG", quality=70); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
PIZZA, WAZ = img("fast-food-1"), img("wazwan-caterers-3")
font = lambda w: base64.b64encode((ROOT / f"mobile/www/fonts/PJS-{w}.woff2").read_bytes()).decode()

# name, tagline, tokens: bg, card, ink, ink2, primary, primary2 (gradient end), soft, glow rgb, accent
THEMES = [
  ("A · Saffron", "Warm orange on clean white. Closest to what people already trust (Swiggy-style).",
   dict(bg="#ffffff", bg2="#fff6ef", card="#ffffff", ink="#1b1b1f", ink2="#686b78", p="#fc6b1c", p2="#ff8f3c", soft="#fff1e6", glow="252 107 28", acc="#16a34a")),
  ("B · Chinar Red", "Rich red on soft cream. Bold and hungry-looking (Zomato-style), with a Kashmir touch.",
   dict(bg="#fffaf6", bg2="#fdeee8", card="#ffffff", ink="#1c1414", ink2="#6f6262", p="#e23744", p2="#ff5a5f", soft="#fdebec", glow="226 55 68", acc="#178a4c")),
  ("C · Berry Glow", "White with a pink-to-orange gradient. Keeps the glow you liked, in a light theme.",
   dict(bg="#ffffff", bg2="#fff0f6", card="#ffffff", ink="#1a1525", ink2="#6b6580", p="#ff2e83", p2="#ff7a3d", soft="#ffeaf3", glow="255 46 131", acc="#10a37f")),
  ("D · Kahwa Green", "Fresh green with saffron-gold accents. Calm, clean and different from the big apps.",
   dict(bg="#fbfcf8", bg2="#eef7ee", card="#ffffff", ink="#13201a", ink2="#5d6b63", p="#0f8a4f", p2="#22b46a", soft="#e7f5ec", glow="15 138 79", acc="#e8a317")),
]

def phone_home(t):
    chips = [("sparkles", "All"), ("pizza", "Pizza"), ("chef-hat", "Wazwan"), ("soup", "Chinese"), ("coffee", "Cafe")]
    return f"""<div class="ph"><div class="st">9:41<span>▮▮▮</span></div>
  <div class="hd"><div class="loc"><span class="pin">{I("map-pin")}</span><span><b>Kulgam town {I("chevron-down", "xs")}</b><small>Near Ghanta Ghar</small></span></div><span class="av">F</span></div>
  <div class="sb">{I("search")}Search “pizza”, “rista”, “Chunk City”</div>
  <div class="hero"><div><b>Hot food from<br>Kulgam's best</b><small>Restaurants deliver with their own riders</small><span class="tg">{I("zap", "xs")}Live tracking</span></div></div>
  <div class="h2">What's on your mind?</div>
  <div class="cu">{"".join(f'<div class="c{" on" if i == 0 else ""}"><i>{I(ic)}</i>{l}</div>' for i, (ic, l) in enumerate(chips))}</div>
  <div class="h2">Top in Kulgam</div>
  <div class="rc"><div class="im" style="background-image:url('{PIZZA}')"><span class="b hot">{I("flame", "xs")}Top in Kulgam</span><span class="b eta">{I("clock", "xs")}30–40 min</span></div>
    <div class="bd"><div class="row"><b>Chunk City</b><span class="rt">{I("star", "xs")}4.1</span></div><small>Pizza · Fast food · Shakes · 1.0 km</small>
    <div class="fee">{I("bike", "xs")}₹30 delivery · Min ₹150 · Own rider</div></div></div>
  <div class="cart"><span><b>2 items · ₹438</b><small>Delivery ₹30</small></span><b>View cart {I("chevron-right", "xs")}</b></div>
  <div class="nav"><span class="on">{I("house")}Home</span><span>{I("package")}Orders</span><span>{I("store")}My restaurant</span></div></div>"""

def phone_pay(t):
    qr = "".join('<i></i>' if (x * 7 + y * 13 + x * y) % 3 == 0 or (x < 7 and y < 7) or (x > 17 and y < 7) or (x < 7 and y > 17) else '<s></s>' for y in range(25) for x in range(25))
    return f"""<div class="ph pay"><div class="st">9:42<span>▮▮▮</span></div>
  <div class="hd"><span class="x">{I("x")}</span><span class="cd">{I("clock", "xs")}Pay within 9:41</span></div>
  <div class="amt"><small>Pay Chunk City</small><b>₹478</b><small class="ok">{I("circle-check", "xs")}Order KE1504 accepted</small></div>
  <div class="qrc"><div class="pulse"></div><div class="pulse p2"></div><div class="qr">{qr}</div></div>
  <div class="upi">UPI ID <b>demo@upi</b>{I("copy", "xs")}</div>
  <div class="cta">{I("smartphone")}Pay ₹478 with UPI app</div>
  <div class="apps"><span><i style="background:#4285f4">G</i>GPay</span><span><i style="background:#5f259f">Pe</i>PhonePe</span><span><i style="background:#00b9f1">P</i>Paytm</span><span><i style="background:#f47b20">B</i>BHIM</span></div>
  <div class="safe">{I("shield-check")}<span>Money goes straight to the restaurant. Check your UPI app shows <b>CHUNK CITY</b>.</span></div>
  <div class="utr">UPI reference (last 4 digits)<span>4821</span></div>
  <div class="cta big">I've paid ₹478</div></div>"""

CSS = """
@font-face { font-family: P; src: url(data:font/woff2;base64,F6) format("woff2"); font-weight: 600; }
@font-face { font-family: P; src: url(data:font/woff2;base64,F8) format("woff2"); font-weight: 800; }
* { box-sizing: border-box; } body { margin: 0; font-family: P, sans-serif; background: #e9ebef; }
.ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; } .ico.xs { width: 13px; height: 13px; stroke-width: 2.4; }
.board { width: 1000px; padding: 34px 38px 38px; background: var(--bg2); position: relative; overflow: hidden; }
.board::before { content: ""; position: absolute; right: -120px; top: -160px; width: 520px; height: 520px; border-radius: 50%; background: radial-gradient(closest-side, rgb(var(--glow) / .22), transparent); }
.top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 26px; position: relative; }
.top h1 { margin: 0; font-size: 34px; letter-spacing: -.03em; color: var(--ink); } .top p { margin: 6px 0 0; color: var(--ink2); font-size: 15px; max-width: 520px; line-height: 1.45; }
.sw { display: flex; gap: 8px; } .sw i { width: 44px; height: 44px; border-radius: 14px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .06); }
.phones { display: flex; gap: 34px; justify-content: center; position: relative; }
.ph { width: 330px; height: 690px; border-radius: 40px; background: var(--bg); position: relative; overflow: hidden; padding: 0 16px; color: var(--ink);
  box-shadow: 0 0 0 8px #fff, 0 0 0 9px rgb(0 0 0 / .08), 0 30px 70px -20px rgb(var(--glow) / .45); }
.st { display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; padding: 14px 6px 6px; } .st span { letter-spacing: -2px; font-size: 10px; }
.hd { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.loc { display: flex; gap: 9px; align-items: center; } .loc b { font-size: 15px; display: flex; gap: 4px; align-items: center; } .loc small { font-size: 11px; color: var(--ink2); }
.pin { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; background: var(--soft); color: var(--p); }
.av { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; background: linear-gradient(135deg, var(--p), var(--p2)); box-shadow: 0 6px 16px -4px rgb(var(--glow) / .6); }
.sb { margin-top: 14px; height: 44px; border-radius: 14px; display: flex; gap: 9px; align-items: center; padding: 0 13px; font-size: 13px; color: var(--ink2); background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / .06), 0 4px 14px -6px rgb(0 0 0 / .12); }
.sb .ico { color: var(--p); }
.hero { margin-top: 14px; height: 120px; border-radius: 20px; padding: 16px; color: #fff; position: relative; overflow: hidden; background: linear-gradient(120deg, var(--p), var(--p2)); box-shadow: 0 14px 30px -12px rgb(var(--glow) / .7); }
.hero::after { content: ""; position: absolute; right: -30px; top: -30px; width: 140px; height: 140px; border-radius: 50%; background: rgb(255 255 255 / .18); }
.hero b { font-size: 19px; line-height: 1.15; letter-spacing: -.02em; } .hero small { display: block; font-size: 11.5px; opacity: .92; margin-top: 4px; }
.tg { display: inline-flex; gap: 5px; align-items: center; margin-top: 8px; background: rgb(255 255 255 / .22); padding: 4px 9px; border-radius: 99px; font-size: 11px; font-weight: 800; }
.h2 { font-size: 15px; font-weight: 800; margin: 16px 0 10px; letter-spacing: -.01em; }
.cu { display: flex; gap: 10px; } .c { display: grid; justify-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--ink2); }
.c i { width: 52px; height: 52px; border-radius: 17px; display: grid; place-items: center; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / .06); color: var(--ink); }
.c.on { color: var(--ink); } .c.on i { background: var(--soft); color: var(--p); box-shadow: 0 0 0 1.5px var(--p), 0 8px 18px -6px rgb(var(--glow) / .7); }
.rc { border-radius: 20px; overflow: hidden; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / .05), 0 12px 28px -14px rgb(0 0 0 / .25); }
.im { height: 112px; background-size: cover; background-position: center; position: relative; }
.b { position: absolute; display: inline-flex; gap: 4px; align-items: center; height: 22px; padding: 0 8px; border-radius: 99px; font-size: 10.5px; font-weight: 800; }
.b.hot { left: 10px; top: 10px; color: #fff; background: linear-gradient(120deg, var(--p), var(--p2)); box-shadow: 0 4px 14px rgb(var(--glow) / .6); } .b.eta { right: 10px; bottom: 10px; background: #fff; color: var(--ink); }
.bd { padding: 10px 12px 12px; } .row { display: flex; justify-content: space-between; align-items: center; } .bd b { font-size: 15px; } .bd small { font-size: 11.5px; color: var(--ink2); }
.rt { display: inline-flex; gap: 3px; align-items: center; background: var(--acc); color: #fff; font-size: 11px; font-weight: 800; padding: 3px 7px; border-radius: 8px; }
.fee { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgb(0 0 0 / .1); font-size: 11px; color: var(--ink2); display: flex; gap: 5px; align-items: center; } .fee .ico { color: var(--p); }
.cart { position: absolute; left: 14px; right: 14px; bottom: 70px; height: 54px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; color: #fff; font-size: 13px;
  background: linear-gradient(120deg, var(--p), var(--p2)); box-shadow: 0 0 0 4px rgb(var(--glow) / .12), 0 14px 30px -8px rgb(var(--glow) / .8); }
.cart small { display: block; font-size: 10.5px; opacity: .9; } .cart b { display: inline-flex; gap: 4px; align-items: center; }
.nav { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; display: grid; grid-template-columns: repeat(3, 1fr); background: #fff; box-shadow: 0 -1px 0 rgb(0 0 0 / .06); }
.nav span { display: grid; justify-items: center; align-content: center; gap: 2px; font-size: 10px; font-weight: 700; color: var(--ink2); } .nav span.on { color: var(--p); }
.pay .hd { margin-top: 8px; } .x { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / .08); }
.cd { display: inline-flex; gap: 5px; align-items: center; font-size: 11.5px; font-weight: 800; color: #d23a3a; background: #fdecec; padding: 5px 10px; border-radius: 99px; }
.amt { text-align: center; margin-top: 4px; } .amt small { display: block; font-size: 11.5px; color: var(--ink2); } .amt b { display: block; font-size: 40px; letter-spacing: -.03em; color: var(--p); line-height: 1.15; }
.amt .ok { display: inline-flex; gap: 4px; align-items: center; color: var(--acc); font-weight: 800; }
.qrc { width: 176px; height: 176px; margin: 14px auto 0; position: relative; display: grid; place-items: center; }
.pulse { position: absolute; inset: -10px; border-radius: 34px; border: 2px solid rgb(var(--glow) / .35); } .pulse.p2 { inset: -20px; border-radius: 40px; border-color: rgb(var(--glow) / .15); }
.qr { width: 176px; height: 176px; border-radius: 24px; padding: 14px; background: #fff; display: grid; grid-template-columns: repeat(25, 1fr); box-shadow: 0 0 0 2px var(--p), 0 16px 40px -10px rgb(var(--glow) / .8); }
.qr i { background: #111; } .qr s { background: #fff; }
.upi { text-align: center; font-size: 12px; color: var(--ink2); margin-top: 14px; display: flex; gap: 5px; justify-content: center; align-items: center; } .upi b { color: var(--ink); }
.cta { margin-top: 12px; height: 48px; border-radius: 15px; display: flex; gap: 8px; justify-content: center; align-items: center; color: #fff; font-weight: 800; font-size: 14px;
  background: linear-gradient(120deg, var(--p), var(--p2)); box-shadow: 0 12px 26px -10px rgb(var(--glow) / .9); }
.apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 9px; } .apps span { height: 52px; border-radius: 13px; background: var(--card); box-shadow: 0 0 0 1px rgb(0 0 0 / .07); display: grid; justify-items: center; align-content: center; gap: 3px; font-size: 9.5px; font-weight: 700; color: var(--ink2); }
.apps i { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: #fff; font-style: normal; font-size: 10px; font-weight: 800; }
.safe { margin-top: 10px; display: flex; gap: 8px; font-size: 11px; color: var(--ink2); line-height: 1.4; background: var(--soft); padding: 9px 10px; border-radius: 12px; } .safe .ico { color: var(--acc); } .safe b { color: var(--ink); }
.utr { margin-top: 9px; height: 42px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; padding: 0 12px; font-size: 11.5px; color: var(--ink2); background: var(--card); box-shadow: 0 0 0 1.5px var(--p), 0 0 0 5px rgb(var(--glow) / .12); }
.utr span { font-weight: 800; color: var(--ink); letter-spacing: .1em; font-size: 14px; }
.cta.big { position: absolute; left: 16px; right: 16px; bottom: 16px; height: 50px; }
"""
html = ["<!doctype html><html><head><meta charset='utf-8'><style>", CSS.replace("F6", font("600")).replace("F8", font("800")), "</style></head><body>"]
for i, (name, tag, t) in enumerate(THEMES):
    vars_ = ";".join(f"--{k}:{v}" for k, v in t.items())
    html.append(f"""<div class="board" id="s{i}" style="{vars_}"><div class="top"><div><h1>{name}</h1><p>{tag}</p></div>
      <div class="sw">{"".join(f'<i style="background:{t[k]}"></i>' for k in ("p", "p2", "soft", "acc", "ink"))}</div></div>
      <div class="phones">{phone_home(t)}{phone_pay(t)}</div></div>""")
html.append("</body></html>")
(H / "styles.html").write_text("".join(html))
print("styles.html", len("".join(html)) // 1024, "KB")
