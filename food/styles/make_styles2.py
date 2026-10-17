"""Twelve genuinely different light UI directions for the Kulgam Eats home screen (layout, shape, type and colour all differ).
Writes styles2.html; render2.js saves style2-01.png … style2-12.png and an overview sheet."""
import base64, io, json, math, pathlib, re
from PIL import Image
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
ICONS = ["map-pin", "chevron-down", "search", "pizza", "chef-hat", "soup", "coffee", "croissant", "sparkles", "star", "clock", "bike", "flame", "chevron-right",
         "house", "package", "store", "heart", "shopping-bag", "plus", "sliders-horizontal", "bell", "user", "utensils", "mic", "arrow-right", "tag", "navigation", "zap"]
SVG = {n: re.sub(r"^[\s\S]*?<svg[^>]*>|</svg>\s*$", "", (ROOT / f"mobile/node_modules/lucide-static/icons/{n}.svg").read_text()).replace("\n", "") for n in ICONS}
I = lambda n, c="": f'<svg class="ico {c}" viewBox="0 0 24 24">{SVG[n]}</svg>'
def img(name, w=600):
    im = Image.open(ROOT / f"mobile/www/img/photos/{name}.jpg").convert("RGB"); im.thumbnail((w, 400))
    b = io.BytesIO(); im.save(b, "JPEG", quality=68); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
P = {"chunk": img("fast-food-1"), "deg": img("restaurant-5"), "koshur": img("wazwan-caterers-3"), "brew": img("cafe-tea-3"), "bakery": img("bakery-sweets-0"), "kebab": img("fast-food-0")}
FONTS = {f.stem: base64.b64encode(f.read_bytes()).decode() for f in (H / "fonts").glob("*.woff2")}
FONTS.update({f"PJS-{w}": base64.b64encode((ROOT / f"mobile/www/fonts/PJS-{w}.woff2").read_bytes()).decode() for w in ("600", "800")})
ff = "".join(f'@font-face{{font-family:"{k.rsplit("-", 1)[0]}";src:url(data:font/woff2;base64,{v}) format("woff2");font-weight:{k.rsplit("-", 1)[1]};}}' for k, v in FONTS.items())
CATS = [("pizza", "Pizza"), ("chef-hat", "Wazwan"), ("soup", "Chinese"), ("coffee", "Cafe"), ("croissant", "Bakery")]
RESTS = [("Chunk City", "Pizza · Fast food", "chunk", "4.1", "30 min", "₹30"), ("Koshur Darbar", "Kashmiri · Wazwan", "koshur", "4.2", "40 min", "₹30"),
         ("80 Degrees", "Pizza · Chinese", "deg", "4.0", "30 min", "₹30"), ("Brew & Bites", "Cafe · Sandwiches", "brew", "4.3", "20 min", "₹30")]
status = '<div class="st"><b>9:41</b><span>●●●</span></div>'

# Real Kulgam roads for the map-first style
bm = json.load(open(ROOT / "food/data/kulgam_basemap.json"))
W0, E0, S0, N0 = 75.000, 75.035, 33.636, 33.658
def proj(x, y): return ((x - W0) / (E0 - W0) * 330, (N0 - y) / (N0 - S0) * 430)
roads = []
for k, c in bm["roads"]:
    pts = [proj(x, y) for x, y in c if W0 - .003 < x < E0 + .003 and S0 - .003 < y < N0 + .003]
    if len(pts) > 1: roads.append((k, "M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in pts)))
water = []
for a, c in bm["water"]:
    pts = [proj(x, y) for x, y in c if W0 - .01 < x < E0 + .01 and S0 - .01 < y < N0 + .01]
    if len(pts) > 1: water.append((a, "M" + " L".join(f"{p:.1f},{q:.1f}" for p, q in pts) + ("Z" if a else "")))
MAPSVG = ('<svg class="mapsvg" viewBox="0 0 330 430">' + "".join(f'<path d="{d}" class="{"wa" if a else "wl"}"/>' for a, d in water)
          + "".join(f'<path d="{d}" class="r{k}"/>' for k, d in sorted(roads, key=lambda r: -r[0])) + "</svg>")
PINS = [("Chunk City", 75.02186, 33.64715, "pizza"), ("Koshur Darbar", 75.01486, 33.64703, "chef-hat"), ("80 Degrees", 75.01231, 33.64593, "pizza"), ("Brew & Bites", 75.02194, 33.6464, "coffee"), ("Spicy Ocean", 75.01971, 33.64674, "soup")]

S = []  # (title, one-line idea, css, html)

# 1 Classic cards
S.append(("Classic Cards", "Big food photos in a clean list. Familiar, like Swiggy.", """
.s1{background:#fff;font-family:PJS;color:#1b1b1f} .s1 .hd{display:flex;justify-content:space-between;align-items:center;padding:6px 16px}
.s1 .hd b{font-size:16px;display:flex;gap:4px;align-items:center} .s1 .hd small{display:block;font-size:11px;color:#777;font-weight:600}
.s1 .sr{margin:10px 16px;height:44px;border-radius:12px;border:1px solid #e6e6ea;display:flex;gap:8px;align-items:center;padding:0 12px;color:#999;font-size:13px} .s1 .sr .ico{color:#fc6b1c}
.s1 .cats{display:flex;gap:14px;padding:8px 16px} .s1 .cat{display:grid;justify-items:center;gap:5px;font-size:11px;font-weight:700;color:#555}
.s1 .cat i{width:52px;height:52px;border-radius:50%;background:#fff3ea;display:grid;place-items:center;color:#fc6b1c}
.s1 h3{margin:12px 16px 8px;font-size:15px} .s1 .card{margin:0 16px 14px;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px -12px rgb(0 0 0/.3)}
.s1 .card .im{height:120px;background-size:cover;background-position:center;position:relative} .s1 .card .im span{position:absolute;left:10px;bottom:10px;background:#fc6b1c;color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:6px}
.s1 .card .bd{padding:10px 12px} .s1 .card b{font-size:15px} .s1 .card small{display:block;color:#777;font-size:11.5px;margin-top:2px}
.s1 .rt{float:right;background:#16a34a;color:#fff;font-size:11px;font-weight:800;padding:2px 6px;border-radius:6px}""",
lambda: f"""{status}<div class="hd"><div><b>{I("map-pin")} Kulgam town {I("chevron-down","xs")}</b><small>Near Ghanta Ghar</small></div>{I("user")}</div>
<div class="sr">{I("search")}Search for restaurant or dish</div><div class="cats">{"".join(f'<div class="cat"><i>{I(i)}</i>{l}</div>' for i,l in CATS)}</div>
<h3>Top in Kulgam</h3>{"".join(f'<div class="card"><div class="im" style="background-image:url({P[p]})"><span>FREE DELIVERY ABOVE ₹499</span></div><div class="bd"><span class="rt">★ {r}</span><b>{n}</b><small>{c} · {t}</small></div></div>' for n,c,p,r,t,f in RESTS[:2])}"""))

# 2 Soft UI (neumorphism)
S.append(("Soft UI", "Pillowy, raised buttons on calm grey. Very soft and premium.", """
.s2{background:#e9eef3;font-family:Poppins;color:#2b3445} .s2 .neu{background:#e9eef3;box-shadow:7px 7px 16px #c9d0d9,-7px -7px 16px #fff}
.s2 .in{box-shadow:inset 5px 5px 10px #c9d0d9,inset -5px -5px 10px #fff}
.s2 .hd{display:flex;justify-content:space-between;align-items:center;padding:8px 18px} .s2 .hd b{font-size:15px} .s2 .hd small{display:block;font-size:11px;color:#8792a5}
.s2 .rb{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#ff7a45}
.s2 .sr{margin:14px 18px;height:48px;border-radius:24px;display:flex;gap:10px;align-items:center;padding:0 16px;color:#98a2b3;font-size:13px}
.s2 .cats{display:flex;gap:12px;padding:6px 18px 4px} .s2 .cat{display:grid;justify-items:center;gap:8px;font-size:10.5px;font-weight:500;color:#5b6577}
.s2 .cat i{width:50px;height:50px;border-radius:18px;display:grid;place-items:center;color:#5b6577} .s2 .cat.on i{color:#ff7a45}
.s2 h3{margin:18px 18px 12px;font-size:15px;font-weight:700} .s2 .row{display:flex;gap:14px;align-items:center;margin:0 18px 16px;padding:12px;border-radius:24px}
.s2 .row .ph{width:70px;height:70px;border-radius:50%;background-size:cover;background-position:center;border:4px solid #e9eef3;box-shadow:4px 4px 10px #c9d0d9,-4px -4px 10px #fff;flex:none}
.s2 .row b{font-size:14px;font-weight:700} .s2 .row small{display:block;font-size:11px;color:#8792a5;margin-top:2px} .s2 .row em{font-style:normal;font-size:11px;color:#ff7a45;font-weight:700}
.s2 .add{margin-left:auto;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#ff7a45}""",
lambda: f"""{status}<div class="hd"><div><small>Deliver to</small><b>Kulgam town</b></div><span class="rb neu">{I("bell")}</span></div>
<div class="sr in">{I("search")}Find pizza, rista, kahwa…</div>
<div class="cats">{"".join(f'<div class="cat{" on" if k==0 else ""}"><i class="{"in" if k==0 else "neu"}">{I(i)}</i>{l}</div>' for k,(i,l) in enumerate(CATS))}</div>
<h3>Popular near you</h3>{"".join(f'<div class="row neu"><span class="ph" style="background-image:url({P[p]})"></span><div><b>{n}</b><small>{c}</small><em>★ {r} · {t}</em></div><span class="add neu">{I("plus")}</span></div>' for n,c,p,r,t,f in RESTS[:4])}"""))

# 3 Glass pastel
S.append(("Glass Pastel", "Frosted glass cards floating on soft colour blobs. Modern iOS feel.", """
.s3{font-family:Outfit;color:#1d1b2e;background:#fdf7ff;overflow:hidden} .s3::before{content:"";position:absolute;inset:0;background:radial-gradient(160px 160px at 10% 15%,#ffc9a8,transparent),radial-gradient(200px 200px at 95% 30%,#d6c4ff,transparent),radial-gradient(180px 180px at 20% 75%,#b8f0d8,transparent),radial-gradient(200px 200px at 90% 95%,#ffd1e8,transparent)}
.s3 > *{position:relative} .s3 .gl{background:rgb(255 255 255/.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgb(255 255 255/.8);box-shadow:0 10px 30px -14px rgb(80 60 140/.35)}
.s3 .hd{display:flex;justify-content:space-between;align-items:center;margin:6px 16px;padding:10px 14px;border-radius:22px} .s3 .hd b{font-size:15px;font-weight:800} .s3 .hd small{display:block;font-size:11px;color:#6d6a85;font-weight:500}
.s3 h1{margin:16px 18px 4px;font-size:30px;line-height:1.05;font-weight:800;letter-spacing:-.03em} .s3 h1 span{color:#8a5cf6}
.s3 .sr{margin:12px 16px;height:48px;border-radius:24px;display:flex;gap:10px;align-items:center;padding:0 16px;color:#6d6a85;font-size:13px}
.s3 .cats{display:flex;gap:8px;padding:2px 16px;flex-wrap:wrap} .s3 .cat{display:flex;gap:6px;align-items:center;padding:8px 12px;border-radius:99px;font-size:12px;font-weight:500} .s3 .cat.on{background:#1d1b2e;color:#fff;border-color:#1d1b2e}
.s3 .feat{margin:14px 16px;border-radius:28px;padding:10px} .s3 .feat .im{height:150px;border-radius:20px;background-size:cover;background-position:center}
.s3 .feat .bd{display:flex;justify-content:space-between;align-items:center;padding:10px 6px 4px} .s3 .feat b{font-size:17px;font-weight:800} .s3 .feat small{display:block;color:#6d6a85;font-size:11.5px}
.s3 .go{width:42px;height:42px;border-radius:50%;background:#8a5cf6;color:#fff;display:grid;place-items:center;box-shadow:0 8px 20px -6px #8a5cf6}""",
lambda: f"""{status}<div class="hd gl"><div><small>Delivering to</small><b>Kulgam town</b></div>{I("sliders-horizontal")}</div>
<h1>What are you<br><span>craving</span> today?</h1><div class="sr gl">{I("search")}Search dishes or restaurants</div>
<div class="cats">{"".join(f'<span class="cat gl{" on" if k==0 else ""}">{I(i,"xs")}{l}</span>' for k,(i,l) in enumerate(CATS))}</div>
{"".join(f'<div class="feat gl"><div class="im" style="background-image:url({P[p]})"></div><div class="bd"><div><b>{n}</b><small>{c} · ★ {r} · {t}</small></div><span class="go">{I("arrow-right")}</span></div></div>' for n,c,p,r,t,f in RESTS[:1])}"""))

# 4 Neo-brutal
S.append(("Bold Blocks", "Thick outlines, flat bright colours, chunky shadows. Fun and loud.", """
.s4{background:#fff4dc;font-family:SpaceGrotesk;color:#111} .s4 .bx{border:2.5px solid #111;box-shadow:4px 4px 0 #111;border-radius:14px}
.s4 .hd{display:flex;justify-content:space-between;align-items:center;padding:6px 16px} .s4 .hd b{font-family:ArchivoBlack;font-size:20px;letter-spacing:-.02em}
.s4 .loc{display:inline-flex;gap:6px;align-items:center;margin:4px 16px;padding:6px 10px;background:#ffd23f;font-weight:700;font-size:12.5px}
.s4 .sr{margin:12px 16px;height:48px;display:flex;gap:10px;align-items:center;padding:0 14px;background:#fff;font-weight:500;font-size:13px}
.s4 h2{font-family:ArchivoBlack;font-size:26px;line-height:1;margin:16px 16px 10px;text-transform:uppercase} .s4 h2 span{background:#ff5c8a;color:#fff;padding:0 6px;border:2.5px solid #111}
.s4 .cats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 16px} .s4 .cat{height:60px;display:grid;place-items:center;align-content:center;gap:2px;font-weight:700;font-size:12px}
.s4 .card{margin:16px;background:#fff;overflow:hidden} .s4 .card .im{height:110px;background-size:cover;background-position:center;border-bottom:2.5px solid #111}
.s4 .card .bd{padding:10px 12px;display:flex;justify-content:space-between;align-items:center} .s4 .card b{font-family:ArchivoBlack;font-size:16px} .s4 .card small{display:block;font-size:11.5px;font-weight:500}
.s4 .tag{background:#4d7cff;color:#fff;font-weight:700;font-size:12px;padding:6px 10px}""",
lambda: f"""{status}<div class="hd"><b>KULGAM EATS</b>{I("shopping-bag")}</div><span class="loc bx">{I("map-pin","xs")}Kulgam town</span>
<div class="sr bx">{I("search")}Pizza? Rista? Shake?</div><h2>Hungry? <span>Order</span> now</h2>
<div class="cats">{"".join(f'<div class="cat bx" style="background:{bg}">{I(i)}{l}</div>' for (i,l),bg in zip(CATS+[("sparkles","All")],["#ffd23f","#ff5c8a","#7ee0b5","#4d7cff","#fff","#ff9f43"]))}</div>
{"".join(f'<div class="card bx"><div class="im" style="background-image:url({P[p]})"></div><div class="bd"><div><b>{n}</b><small>{c} · ★ {r}</small></div><span class="tag bx">{t}</span></div></div>' for n,c,p,r,t,f in RESTS[:1])}"""))

# 5 Minimal Nordic
S.append(("Quiet Minimal", "Lots of white space, elegant serif headings, thin lines. Calm and classy.", """
.s5{background:#fbfaf7;font-family:PJS;color:#1e1e1c} .s5 .hd{display:flex;justify-content:space-between;padding:10px 22px;font-size:12px;color:#77756f;font-weight:600}
.s5 h1{font-family:Fraunces;font-weight:600;font-size:34px;line-height:1.05;margin:22px 22px 8px;letter-spacing:-.02em} .s5 h1 i{color:#5b7f6a}
.s5 p{margin:0 22px 18px;color:#77756f;font-size:13px} .s5 .sr{margin:0 22px 22px;padding:0 0 10px;border-bottom:1px solid #1e1e1c;display:flex;gap:10px;align-items:center;font-size:14px;color:#9a978f}
.s5 .tabs{display:flex;gap:18px;padding:0 22px;font-size:13px;font-weight:600;color:#9a978f} .s5 .tabs .on{color:#1e1e1c;border-bottom:2px solid #5b7f6a;padding-bottom:6px}
.s5 .li{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;margin:0 22px;padding:16px 0;border-bottom:1px solid #e8e5dd}
.s5 .li .ph{width:64px;height:64px;border-radius:4px;background-size:cover;background-position:center} .s5 .li b{font-family:Fraunces;font-weight:600;font-size:17px}
.s5 .li small{display:block;color:#77756f;font-size:11.5px;margin-top:3px} .s5 .li em{font-style:normal;font-size:12px;color:#5b7f6a;font-weight:700}""",
lambda: f"""{status}<div class="hd"><span>{I("map-pin","xs")} Kulgam town</span><span>Menu</span></div>
<h1>Good food,<br><i>close to home.</i></h1><p>Kulgam's restaurants, delivered by their own people.</p><div class="sr">{I("search")}Search</div>
<div class="tabs"><span class="on">All</span><span>Pizza</span><span>Wazwan</span><span>Cafe</span><span>Bakery</span></div>
{"".join(f'<div class="li"><span class="ph" style="background-image:url({P[p]})"></span><div><b>{n}</b><small>{c}</small></div><em>{t}</em></div>' for n,c,p,r,t,f in RESTS)}"""))

# 6 Bubbly playful
S.append(("Candy Pop", "Round, bouncy and colourful, with sticker badges. Feels young and friendly.", """
.s6{background:#fffaf0;font-family:Nunito;color:#2a2440} .s6 .hd{display:flex;justify-content:space-between;align-items:center;padding:6px 16px}
.s6 .hd b{font-size:15px;font-weight:900} .s6 .hd small{display:block;font-size:11px;color:#8a83a3;font-weight:700} .s6 .av{width:40px;height:40px;border-radius:14px;background:#ffd84d;display:grid;place-items:center;font-weight:900}
.s6 .hero{margin:12px 16px;border-radius:30px;padding:18px;background:#7b5cff;color:#fff;position:relative;overflow:hidden;height:130px}
.s6 .hero b{font-size:24px;font-weight:900;line-height:1.05;display:block;max-width:170px} .s6 .hero .stk{position:absolute;right:16px;top:20px;transform:rotate(12deg);background:#ffd84d;color:#2a2440;font-weight:900;padding:10px 12px;border-radius:16px;font-size:13px;box-shadow:0 6px 0 #e0b400}
.s6 .hero .blob{position:absolute;right:-30px;bottom:-40px;width:150px;height:150px;border-radius:50%;background:#ff7ac0}
.s6 .cats{display:flex;gap:10px;padding:6px 16px} .s6 .cat{display:grid;justify-items:center;gap:6px;font-size:11.5px;font-weight:900}
.s6 .cat i{width:54px;height:54px;border-radius:20px;display:grid;place-items:center;color:#2a2440;box-shadow:0 5px 0 rgb(0 0 0/.12)}
.s6 h3{margin:16px 16px 10px;font-size:17px;font-weight:900} .s6 .row{display:flex;gap:12px;overflow:hidden;padding:0 16px}
.s6 .card{width:170px;flex:none;border-radius:26px;background:#fff;padding:8px;box-shadow:0 6px 0 #efe6d6} .s6 .card .im{height:110px;border-radius:20px;background-size:cover;background-position:center;position:relative}
.s6 .card .im span{position:absolute;right:8px;top:8px;background:#fff;border-radius:12px;padding:3px 8px;font-size:11px;font-weight:900} .s6 .card b{display:block;font-weight:900;font-size:14px;margin:8px 4px 0} .s6 .card small{display:block;margin:0 4px 4px;color:#8a83a3;font-size:11px;font-weight:700}""",
lambda: f"""{status}<div class="hd"><div><small>Yum delivered to</small><b>Kulgam town ▾</b></div><span class="av">F</span></div>
<div class="hero"><span class="blob"></span><b>Hungry tummy? We got you!</b><span class="stk">₹30<br>delivery</span></div>
<div class="cats">{"".join(f'<div class="cat"><i style="background:{bg}">{I(i)}</i>{l}</div>' for (i,l),bg in zip(CATS,["#ffd84d","#ff9ec9","#9ee6c4","#a7c5ff","#ffc59e"]))}</div>
<h3>Faves near you 😋</h3><div class="row">{"".join(f'<div class="card"><div class="im" style="background-image:url({P[p]})"><span>★ {r}</span></div><b>{n}</b><small>{t} · {c.split(" · ")[0]}</small></div>' for n,c,p,r,t,f in RESTS[:2])}</div>"""))

# 7 Kashmiri heritage
S.append(("Kashmiri Heritage", "Cream, deep maroon and gold, khatamband patterns, arch-shaped photos. Proudly local.", """
.s7{background:#f6eedf;font-family:PJS;color:#3b1218} .s7 .pat{height:16px;background:repeating-linear-gradient(45deg,#c9a24d 0 2px,transparent 2px 10px),repeating-linear-gradient(-45deg,#c9a24d 0 2px,transparent 2px 10px);opacity:.55}
.s7 .hd{text-align:center;padding:10px 16px 6px} .s7 .hd b{font-family:DMSerifDisplay;font-weight:400;font-size:26px;color:#7a1f2b} .s7 .hd small{display:block;font-size:11px;letter-spacing:.2em;color:#a07a3a;font-weight:800}
.s7 .sr{margin:12px 18px;height:46px;border-radius:4px;border:1.5px solid #c9a24d;background:#fffaf0;display:flex;gap:10px;align-items:center;padding:0 14px;font-size:13px;color:#8a6b62}
.s7 .cats{display:flex;justify-content:space-between;padding:6px 18px} .s7 .cat{display:grid;justify-items:center;gap:6px;font-size:11px;font-weight:800;color:#7a1f2b}
.s7 .cat i{width:52px;height:52px;display:grid;place-items:center;border:1.5px solid #c9a24d;border-radius:50% 50% 10px 10px;background:#fffaf0}
.s7 h3{font-family:DMSerifDisplay;font-weight:400;font-size:21px;text-align:center;margin:16px 0 10px;color:#7a1f2b} .s7 h3::before,.s7 h3::after{content:" ❖ ";color:#c9a24d;font-size:12px}
.s7 .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 18px} .s7 .card{background:#fffaf0;border:1.5px solid #c9a24d;padding:6px;border-radius:70px 70px 8px 8px}
.s7 .card .im{height:120px;border-radius:64px 64px 4px 4px;background-size:cover;background-position:center} .s7 .card b{display:block;font-family:DMSerifDisplay;font-weight:400;font-size:15px;text-align:center;margin-top:6px}
.s7 .card small{display:block;text-align:center;font-size:10.5px;color:#8a6b62;margin-bottom:4px}""",
lambda: f"""{status}<div class="pat"></div><div class="hd"><small>KULGAM</small><b>Dastarkhwan</b></div>
<div class="sr">{I("search")}Search wazwan, pizza, kahwa…</div><div class="cats">{"".join(f'<div class="cat"><i>{I(i)}</i>{l}</div>' for i,l in CATS)}</div>
<h3>Taste of Kulgam</h3><div class="grid">{"".join(f'<div class="card"><div class="im" style="background-image:url({P[p]})"></div><b>{n}</b><small>{c.split(" · ")[-1]} · {t}</small></div>' for n,c,p,r,t,f in RESTS[:4])}</div>"""))

# 8 Bento grid
S.append(("Bento Grid", "Tiles of different sizes, like a modern dashboard. Lots on one screen, neatly.", """
.s8{background:#f1f1ee;font-family:SpaceGrotesk;color:#141414} .s8 .hd{display:flex;justify-content:space-between;align-items:center;padding:6px 14px} .s8 .hd b{font-size:20px;font-weight:700;letter-spacing:-.03em}
.s8 .loc{display:inline-flex;gap:6px;align-items:center;font-size:12px;font-weight:500;background:#fff;padding:6px 10px;border-radius:99px}
.s8 .g{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:86px;gap:10px;padding:10px 14px} .s8 .t{border-radius:22px;background:#fff;padding:12px;position:relative;overflow:hidden}
.s8 .big{grid-row:span 2;grid-column:span 2;background-size:cover;background-position:center;color:#fff;display:flex;flex-direction:column;justify-content:flex-end}
.s8 .big::before{content:"";position:absolute;inset:0;background:linear-gradient(transparent 40%,rgb(0 0 0/.65))} .s8 .big > *{position:relative} .s8 .big b{font-size:22px} .s8 .big small{font-size:12px;opacity:.9}
.s8 .lime{background:#c6f432} .s8 .blk{background:#141414;color:#fff} .s8 .t b{font-size:15px;display:block} .s8 .t small{font-size:11px;opacity:.7} .s8 .t .ico{position:absolute;right:12px;top:12px}
.s8 .num{font-size:30px;font-weight:700;letter-spacing:-.04em} .s8 .sr{grid-column:span 2;height:52px;display:flex;align-items:center;gap:10px;color:#777;font-size:13px}
.s8 .ph{background-size:cover;background-position:center;color:#fff;display:flex;flex-direction:column;justify-content:flex-end} .s8 .ph::before{content:"";position:absolute;inset:0;background:linear-gradient(transparent 30%,rgb(0 0 0/.6))} .s8 .ph > *{position:relative}""",
lambda: f"""{status}<div class="hd"><b>Kulgam Eats</b><span class="loc">{I("map-pin","xs")}Kulgam town</span></div>
<div class="g"><div class="t sr">{I("search")}Search anything</div>
<div class="t big" style="background-image:url({P['chunk']})"><small>Top in Kulgam · ★ 4.1</small><b>Chunk City</b><small>Pizza · 30 min · ₹30 delivery</small></div>
<div class="t lime">{I("pizza")}<b>Pizza</b><small>12 places</small></div><div class="t blk">{I("chef-hat")}<b>Wazwan</b><small>6 places</small></div>
<div class="t">{I("bike")}<span class="num">22</span><small>min average delivery</small></div><div class="t ph" style="background-image:url({P['brew']})"><b>Cafes</b><small>Kahwa & coffee</small></div>
<div class="t ph" style="background-image:url({P['bakery']})"><b>Bakery</b><small>Fresh kulcha</small></div><div class="t lime">{I("tag")}<b>Offers</b><small>3 today</small></div></div>"""))

# 9 Photo story
S.append(("Photo Stories", "Instagram-style: story circles on top, big full-width food photos below.", """
.s9{background:#fff;font-family:Poppins;color:#111} .s9 .hd{display:flex;justify-content:space-between;align-items:center;padding:4px 16px} .s9 .hd b{font-size:20px;font-weight:700;letter-spacing:-.02em}
.s9 .stories{display:flex;gap:12px;padding:10px 16px;overflow:hidden} .s9 .sto{display:grid;justify-items:center;gap:4px;font-size:10.5px;font-weight:500;width:62px;flex:none;text-align:center}
.s9 .sto i{width:62px;height:62px;border-radius:50%;padding:3px;background:linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf)} .s9 .sto i span{display:block;width:100%;height:100%;border-radius:50%;border:2.5px solid #fff;background-size:cover;background-position:center}
.s9 .post{margin-top:6px} .s9 .post .top{display:flex;gap:8px;align-items:center;padding:6px 16px;font-size:13px;font-weight:700} .s9 .post .top span{width:30px;height:30px;border-radius:50%;background-size:cover}
.s9 .post .im{height:250px;background-size:cover;background-position:center;position:relative} .s9 .post .im em{position:absolute;left:12px;bottom:12px;font-style:normal;background:rgb(255 255 255/.92);padding:6px 10px;border-radius:10px;font-size:12px;font-weight:700}
.s9 .post .act{display:flex;gap:16px;padding:10px 16px;align-items:center} .s9 .post .act .ord{margin-left:auto;background:#111;color:#fff;font-size:12px;font-weight:700;padding:8px 14px;border-radius:99px}
.s9 .post p{margin:0 16px;font-size:12px} .s9 .post p b{font-weight:700}""",
lambda: f"""{status}<div class="hd"><b>Kulgam Eats</b><span>{I("heart")} {I("shopping-bag")}</span></div>
<div class="stories">{"".join(f'<div class="sto"><i><span style="background-image:url({P[p]})"></span></i>{n.split()[0]}</div>' for n,c,p,r,t,f in RESTS+[("City Cafe","","bakery","","","")])}</div>
<div class="post"><div class="top"><span style="background-image:url({P['chunk']})"></span>Chunk City · <small style="color:#888;font-weight:500">Kulgam</small></div>
<div class="im" style="background-image:url({P['kebab']})"><em>Seekh kebab platter · ₹249</em></div>
<div class="act">{I("heart")}{I("bike")}<small>30 min · ₹30</small><span class="ord">Order now</span></div><p><b>chunkcity</b> Fresh off the grill tonight 🔥</p></div>"""))

# 10 Material You
S.append(("Material You", "Google's Android style: soft tonal colours, big rounded containers. Feels native on Android.", """
.s10{background:#fdf8fd;font-family:Outfit;color:#1d1b20} .s10 .top{display:flex;align-items:center;gap:12px;margin:6px 14px;height:54px;border-radius:28px;background:#eee7f4;padding:0 16px;color:#49454f;font-size:14px}
.s10 .top .av{margin-left:auto;width:32px;height:32px;border-radius:50%;background:#6750a4;color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px}
.s10 .chips{display:flex;gap:8px;padding:8px 14px;flex-wrap:wrap} .s10 .chip{height:34px;display:inline-flex;align-items:center;gap:6px;padding:0 14px;border-radius:10px;border:1px solid #79747e;font-size:12.5px;font-weight:500}
.s10 .chip.on{background:#e8def8;border-color:#e8def8;color:#1d192b} .s10 h3{margin:14px 18px 10px;font-size:20px;font-weight:500}
.s10 .card{margin:0 14px 12px;border-radius:28px;background:#f3edf7;overflow:hidden;display:flex} .s10 .card .im{width:120px;flex:none;background-size:cover;background-position:center;border-radius:28px;margin:6px}
.s10 .card .bd{padding:14px 12px} .s10 .card b{font-size:16px;font-weight:800;display:block} .s10 .card small{display:block;font-size:12px;color:#49454f;margin:3px 0 10px}
.s10 .tonal{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:99px;background:#e8def8;color:#4a4458;font-size:12.5px;font-weight:800}
.s10 .fab{position:absolute;right:16px;bottom:22px;height:56px;border-radius:16px;background:#eaddff;color:#21005d;display:flex;align-items:center;gap:10px;padding:0 18px;font-weight:800;font-size:14px;box-shadow:0 4px 10px rgb(0 0 0/.18)}""",
lambda: f"""{status}<div class="top">{I("search")}Search Kulgam Eats<span class="av">F</span></div>
<div class="chips">{"".join(f'<span class="chip{" on" if k==0 else ""}">{I(i,"xs")}{l}</span>' for k,(i,l) in enumerate(CATS))}</div>
<h3>Near Kulgam town</h3>{"".join(f'<div class="card"><span class="im" style="background-image:url({P[p]})"></span><div class="bd"><b>{n}</b><small>{c}<br>★ {r} · {t} · {f} delivery</small><span class="tonal">{I("plus","xs")}View menu</span></div></div>' for n,c,p,r,t,f in RESTS[:3])}
<span class="fab">{I("shopping-bag")}Cart · 2</span>"""))

# 11 Map first
S.append(("Map First", "Home is a live map of Kulgam with restaurant pins; the list slides up from below.", """
.s11{background:#f4f1ea;font-family:PJS;color:#1b1b1f} .s11 .mapsvg{position:absolute;left:0;top:0;width:330px;height:430px} .s11 .wl{fill:none;stroke:#b9dbe6;stroke-width:5}
.s11 .wa{fill:#cfe7ee;stroke:none} .s11 .r0{fill:none;stroke:#f6cf7c;stroke-width:6;stroke-linecap:round} .s11 .r1{fill:none;stroke:#fff;stroke-width:4.5;stroke-linecap:round} .s11 .r2{fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round} .s11 .r3{fill:none;stroke:#e7e2d6;stroke-width:1.4}
.s11 .float{position:absolute;left:14px;right:14px;top:44px;height:48px;border-radius:24px;background:#fff;display:flex;gap:10px;align-items:center;padding:0 16px;color:#888;font-size:13px;box-shadow:0 8px 24px -8px rgb(0 0 0/.3)}
.s11 .pn{position:absolute;transform:translate(-50%,-100%);display:grid;justify-items:center} .s11 .pn i{width:34px;height:34px;border-radius:50%;background:#e23744;color:#fff;display:grid;place-items:center;border:3px solid #fff;box-shadow:0 4px 12px rgb(226 55 68/.6)}
.s11 .pn span{margin-top:3px;background:#fff;font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:6px;box-shadow:0 2px 6px rgb(0 0 0/.2);white-space:nowrap}
.s11 .me{position:absolute;width:18px;height:18px;border-radius:50%;background:#2f6fed;border:3px solid #fff;box-shadow:0 0 0 8px rgb(47 111 237/.2)}
.s11 .sheet{position:absolute;left:0;right:0;bottom:0;height:290px;background:#fff;border-radius:26px 26px 0 0;box-shadow:0 -10px 30px -10px rgb(0 0 0/.25);padding:8px 16px}
.s11 .sheet::before{content:"";display:block;width:40px;height:4px;border-radius:2px;background:#ddd;margin:0 auto 10px} .s11 .sheet h3{margin:0 0 8px;font-size:16px}
.s11 .li{display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid #f0f0f0} .s11 .li .ph{width:52px;height:52px;border-radius:14px;background-size:cover;background-position:center}
.s11 .li b{font-size:14px} .s11 .li small{display:block;font-size:11px;color:#777} .s11 .li em{margin-left:auto;font-style:normal;font-size:11.5px;font-weight:800;color:#e23744}""",
lambda: MAPSVG + f"""{status}<div class="float">{I("search")}Search Kulgam restaurants</div>
{"".join(f'<div class="pn" style="left:{proj(x,y)[0]:.0f}px;top:{proj(x,y)[1]:.0f}px"><i>{I(ic,"xs")}</i><span>{n}</span></div>' for n,x,y,ic in PINS[:4])}
<span class="me" style="left:{proj(75.0172,33.6431)[0]-9:.0f}px;top:{proj(75.0172,33.6431)[1]-9:.0f}px"></span>
<div class="sheet"><h3>5 restaurants within 1 km</h3>{"".join(f'<div class="li"><span class="ph" style="background-image:url({P[p]})"></span><div><b>{n}</b><small>{c} · ★ {r}</small></div><em>{t}</em></div>' for n,c,p,r,t,f in RESTS[:3])}</div>"""))

# 12 Search first
S.append(("Just Ask", "One big friendly search box: type or speak what you want, and the app finds it.", """
.s12{background:linear-gradient(180deg,#fff7ed 0%,#fff 55%);font-family:PJS;color:#1b1b1f} .s12 .hd{display:flex;justify-content:space-between;padding:8px 20px;font-size:12px;font-weight:700;color:#8a7f72}
.s12 .mid{padding:30px 20px 0;text-align:center} .s12 .logo{width:64px;height:64px;border-radius:22px;margin:0 auto 14px;display:grid;place-items:center;background:#ff6a2b;color:#fff;box-shadow:0 14px 30px -10px #ff6a2b}
.s12 .logo .ico{width:32px;height:32px} .s12 h1{margin:0;font-size:26px;letter-spacing:-.02em} .s12 h1 span{color:#ff6a2b} .s12 p{margin:6px 0 0;color:#8a7f72;font-size:13px}
.s12 .ask{margin:22px 4px 0;border-radius:24px;background:#fff;padding:16px;text-align:left;box-shadow:0 0 0 2px #ff6a2b,0 18px 40px -16px rgb(255 106 43/.7)}
.s12 .ask .q{font-size:17px;font-weight:800;min-height:46px} .s12 .ask .q i{display:inline-block;width:2px;height:18px;background:#ff6a2b;vertical-align:-3px;margin-left:2px}
.s12 .ask .bar{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:#8a7f72;font-size:11.5px} .s12 .ask .mic{width:40px;height:40px;border-radius:50%;background:#ff6a2b;color:#fff;display:grid;place-items:center}
.s12 .sug{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px} .s12 .sug span{padding:8px 12px;border-radius:99px;background:#fff;border:1px solid #f1e3d3;font-size:12px;font-weight:700}
.s12 .ans{margin:20px 20px 0;padding:12px;border-radius:18px;background:#fff;box-shadow:0 8px 24px -14px rgb(0 0 0/.3);display:flex;gap:12px;align-items:center;text-align:left}
.s12 .ans .ph{width:56px;height:56px;border-radius:14px;background-size:cover;background-position:center} .s12 .ans b{font-size:14px} .s12 .ans small{display:block;font-size:11.5px;color:#8a7f72}""",
lambda: f"""{status}<div class="hd"><span>{I("map-pin","xs")} Kulgam town</span><span>Orders</span></div>
<div class="mid"><div class="logo">{I("utensils")}</div><h1>What should we<br>bring you, <span>Fazil?</span></h1><p>Type or say it. Pizza, rista, cake for tonight…</p>
<div class="ask"><div class="q">Chicken pizza under ₹300<i></i></div><div class="bar"><span>{I("sparkles","xs")} 3 restaurants have it near you</span><span class="mic">{I("mic")}</span></div></div>
<div class="sug"><span>🍕 Pizza</span><span>🍖 Wazwan</span><span>☕ Kahwa</span><span>🎂 Cake</span><span>🔥 Offers</span></div></div>
<div class="ans"><span class="ph" style="background-image:url({P['chunk']})"></span><div><b>Chicken Tikka Pizza · ₹269</b><small>Chunk City · 1.0 km · 30 min</small></div></div>"""))

CSS = ff + """*{box-sizing:border-box} body{margin:0;background:#dfe2e8;font-family:PJS}
.ico{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:-3px} .ico.xs{width:13px;height:13px;stroke-width:2.4}
.card-wrap{width:420px;padding:22px 20px 26px;background:#fff;border-radius:28px;display:inline-block;vertical-align:top;margin:12px}
.card-wrap h2{margin:0;font-size:22px;letter-spacing:-.02em;font-family:PJS;font-weight:800;color:#15171c} .card-wrap h2 span{color:#9aa0ab;font-size:15px;margin-right:6px}
.card-wrap p{margin:4px 0 16px;color:#5d6370;font-size:13.5px;line-height:1.4;min-height:38px;font-family:PJS;font-weight:600}
.phone{width:330px;height:690px;margin:0 auto;border-radius:38px;position:relative;overflow:hidden;box-shadow:0 0 0 7px #16181d,0 24px 60px -24px rgb(0 0 0/.5)}
.st{display:flex;justify-content:space-between;padding:12px 20px 4px;font-size:12px;position:relative;z-index:2} .st span{font-size:8px;letter-spacing:1px}
"""
html = ["<!doctype html><html><head><meta charset='utf-8'><style>", CSS]
for i, (t, d, css, _) in enumerate(S, 1): html.append(css)
html.append("</style></head><body>")
for i, (t, d, css, body) in enumerate(S, 1):
    html.append(f'<div class="card-wrap" id="w{i}"><h2><span>{i:02d}</span>{t}</h2><p>{d}</p><div class="phone s{i}">{body()}</div></div>')
html.append("</body></html>")
(H / "styles2.html").write_text("".join(html))
print(len(S), "styles,", len("".join(html)) // 1024, "KB")
