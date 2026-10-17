"""Chosen style D · Kahwa Green, v2: gradient background (green at the top blending to white), real food photos for
categories, realistic photo banners. Writes kahwa.html; render with render_kahwa.js."""
import base64, io, json, pathlib, re, sys
from PIL import Image, ImageOps
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
sys.argv = [sys.argv[0]]
import make_styles as M   # reuse icons, fonts, payment screen and base CSS
I = M.I
CAND = ROOT / "food/photos/candidates"

def photo(path, size, center=(.5, .5), q=74):
    im = ImageOps.fit(Image.open(path).convert("RGB"), size, Image.LANCZOS, centering=center)
    b = io.BytesIO(); im.save(b, "JPEG", quality=q); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
PICK = {"Pizza": "pizza/4", "Wazwan": "@wazwan-caterers-3", "Biryani": "biryani/3", "Burger": "burger/1", "Chinese": "noodles/3",
        "Momos": "momos/3", "Rolls": "shawarma/2", "Cakes": "cake/1", "Cafe": "coffee/0"}
def src(p): return ROOT / f"mobile/www/img/photos/{p[1:]}.jpg" if p.startswith("@") else CAND / f"{p}.jpg"
CAT = {k: photo(src(p), (180, 180)) for k, p in PICK.items()}
BAN1 = photo(src("@wazwan-caterers-3"), (640, 300), (.5, .55))
BAN2 = photo(CAND / "pizza/5.jpg", (640, 300), (.5, .5))
CARD = photo(CAND / "pizza/1.jpg", (600, 260), (.5, .5))
credits = {}
for k, p in list(PICK.items()) + [("Banner pizza", "pizza/5"), ("Card pizza", "pizza/1")]:
    if p.startswith("@"): continue
    folder, n = p.split("/"); m = json.loads((CAND / folder / "meta.json").read_text())[int(n)]
    credits[k] = {"title": m["title"], "by": m["creator"], "license": f'CC {m["license"].upper()} {m.get("license_version") or ""}'.strip(), "source": m["foreign_landing_url"]}
(ROOT / "food/photos/credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))

t = M.THEMES[3][2]
home = f"""<div class="ph kh"><div class="st">9:41<span>▮▮▮</span></div>
  <div class="hd"><div class="loc"><span class="pin">{I("map-pin")}</span><span><b>Kulgam town {I("chevron-down", "xs")}</b><small>Near Ghanta Ghar</small></span></div><span class="av">F</span></div>
  <div class="sb">{I("search")}Search “pizza”, “rista”, “Chunk City”</div>
  <div class="bans"><div class="ban" style="background-image:linear-gradient(90deg,rgb(8 60 34/.92) 0%,rgb(8 60 34/.7) 45%,rgb(8 60 34/0) 75%),url('{BAN1}')">
      <small>WAZWAN NIGHTS</small><b>Koshur Darbar</b><span>Trami for 2 from ₹1,199</span><em>Order now {I("chevron-right", "xs")}</em></div>
    <div class="ban" style="background-image:linear-gradient(90deg,rgb(120 40 10/.9) 0%,rgb(120 40 10/.6) 45%,rgb(0 0 0/0) 75%),url('{BAN2}')"><small>PIZZA TIME</small><b>Chunk City</b><span>From ₹199</span><em>Order now</em></div></div>
  <div class="dots"><i class="on"></i><i></i><i></i></div>
  <div class="h2">What's on your mind?</div>
  <div class="cu2">{"".join(f'<div class="c2"><i style="background-image:url({u})"></i>{k}</div>' for k, u in CAT.items())}</div>
  <div class="h2">Top in Kulgam</div>
  <div class="rc"><div class="im" style="background-image:url('{CARD}')"><span class="b hot">{I("flame", "xs")}Top in Kulgam</span><span class="b eta">{I("clock", "xs")}30–40 min</span></div>
    <div class="bd"><div class="row"><b>Chunk City</b><span class="rt">{I("star", "xs")}4.1</span></div><small>Pizza · Fast food · Shakes · 1.0 km</small>
    <div class="fee">{I("bike", "xs")}₹30 delivery · Min ₹150 · Own rider</div></div></div>
  <div class="cart"><span><b>2 items · ₹438</b><small>Delivery ₹30</small></span><b>View cart {I("chevron-right", "xs")}</b></div>
  <div class="nav"><span class="on">{I("house")}Home</span><span>{I("package")}Orders</span><span>{I("store")}My restaurant</span></div></div>"""

EXTRA = """
/* v2: background blends from soft green at the top to white */
.ph.kh, .ph.pay { background: linear-gradient(180deg, #c9ecd6 0%, #e3f5ea 22%, #f6fbf7 48%, #ffffff 70%); }
.ph.kh .sb { background: rgb(255 255 255 / .92); }
.bans { display: flex; gap: 10px; margin: 14px -16px 0; padding: 0 16px; overflow: hidden; }
.ban { flex: none; width: 282px; height: 136px; border-radius: 20px; background-size: cover; background-position: center; color: #fff; padding: 14px 16px; display: flex; flex-direction: column; justify-content: center;
  box-shadow: 0 14px 28px -14px rgb(15 138 79 / .7); position: relative; overflow: hidden; }
.ban small { font-size: 10px; font-weight: 800; letter-spacing: .14em; color: #ffd36b; }
.ban b { font-size: 21px; letter-spacing: -.02em; line-height: 1.1; margin-top: 3px; } .ban span { font-size: 12px; opacity: .95; margin-top: 2px; }
.ban em { font-style: normal; margin-top: 10px; align-self: flex-start; background: #fff; color: #0f8a4f; font-size: 11.5px; font-weight: 800; padding: 6px 11px; border-radius: 99px; display: inline-flex; gap: 3px; align-items: center; }
.dots { display: flex; gap: 5px; justify-content: center; margin-top: 9px; } .dots i { width: 6px; height: 6px; border-radius: 99px; background: #b9d8c4; } .dots i.on { width: 18px; background: #0f8a4f; }
.cu2 { display: flex; gap: 12px; margin: 0 -16px; padding: 0 16px; overflow: hidden; }
.c2 { flex: none; display: grid; justify-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #33443a; width: 62px; }
.c2 i { width: 62px; height: 62px; border-radius: 50%; background-size: cover; background-position: center; box-shadow: 0 0 0 2.5px #fff, 0 8px 16px -6px rgb(0 0 0 / .35); }
.c2:first-child i { box-shadow: 0 0 0 2.5px #0f8a4f, 0 0 0 5px #fff, 0 8px 18px -6px rgb(15 138 79 / .6); }
.ph.kh .h2 { margin-top: 14px; }
.ph.kh .rc .im { height: 104px; }
"""
style = ";".join(f"--{k}:{v}" for k, v in t.items())
css = M.CSS.replace("F6", M.font("600")).replace("F8", M.font("800")) + EXTRA
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>
<div class="board" id="kahwa" style="{style}"><div class="top"><div><h1>D · Kahwa Green, v2</h1><p>Green-to-white background, real food photos for categories, photo banners.</p></div>
<div class="sw">{"".join(f'<i style="background:{t[k]}"></i>' for k in ("p", "p2", "soft", "acc", "ink"))}</div></div>
<div class="phones">{home}{M.phone_pay(t)}</div></div></body></html>"""
(H / "kahwa.html").write_text(html)
print("kahwa.html", len(html) // 1024, "KB")
