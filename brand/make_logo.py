"""Generate the Srinagar Bazaar logo set (SVG) from code, so every size is crisp.

Mark: a shopping bag (the bazaar) carrying a chinar leaf (Srinagar's emblem).
Run:  python brand/make_logo.py   -> brand/src/*.svg   (then brand/render.py for PNGs)
"""
import json, math, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "src"; OUT.mkdir(exist_ok=True)

# Brand colours
DAL = "#0D4F57"        # deep Dal lake teal (primary)
DAL_DEEP = "#08353B"
CHINAR = "#E4572E"     # chinar leaf in autumn (accent)
CHINAR_DEEP = "#B8361A"
SAFFRON = "#F4A93B"    # saffron (highlight)
SNOW = "#FFFFFF"
INK = "#0E1B1E"

# ---------- chinar leaf ----------
def chinar_points():
    """Chinar (Platanus orientalis): wide, deeply cut 5 lobes with long fingers, round sinuses,
    a few coarse teeth, broad truncate base. Angle 0 = up, clockwise. Not a maple: fewer points,
    deeper and rounder gaps, lobes spread wider."""
    spec = [  # (angle deg, radius, kind)
        (0, 1.00, "tip"), (5, .86, "s"), (8, .74, "tooth"), (12, .62, "s"), (21, .30, "sinus"),
        (34, .64, "s"), (43, .78, "tooth"), (49, .97, "tip"), (55, .80, "s"), (63, .58, "s"), (74, .29, "sinus"),
        (86, .55, "s"), (97, .74, "tip"), (104, .58, "s"), (113, .40, "s"), (124, .25, "sinus"),
        (136, .30, "tip"), (150, .17, "base"),
    ]
    left = [(-a, r, k) for a, r, k in reversed(spec) if a != 0]
    seq = left + spec  # from left base, over the top, to right base
    return [(r * math.sin(math.radians(a)), -r * math.cos(math.radians(a)), k) for a, r, k in seq]

def smooth(points, iters=3):
    """Chaikin smoothing that keeps tips and teeth sharp."""
    pts = points
    for _ in range(iters):
        out = []
        n = len(pts)
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            if p[2] in ("tip", "tooth", "lock"):
                out.append((p[0], p[1], "lock"))
            else:
                out.append((p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25, "s"))
            if q[2] in ("tip", "tooth", "lock"):
                out.append((p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75, "s"))
            else:
                out.append((p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75, "s"))
        pts = out
    return pts

def leaf_path(cx, cy, s):
    pts = chinar_points()
    # close the base through the stem joint
    stem_joint = (0, .14, "s")
    ring = smooth(pts + [stem_joint])
    d = "M" + " L".join(f"{cx + x * s:.2f},{cy + y * s:.2f}" for x, y, _ in ring) + "Z"
    return d

def veins(cx, cy, s):
    tips = [(0, 1.0), (49, .97), (-49, .97), (97, .74), (-97, .74)]
    base = (cx, cy + .10 * s)
    out = []
    for a, r in tips:
        t = math.radians(a)
        x, y = cx + .82 * r * math.sin(t) * s, cy - .82 * r * math.cos(t) * s
        mx, my = (base[0] + x) / 2 + (0 if a == 0 else math.copysign(.03 * s, a)), (base[1] + y) / 2
        out.append(f"M{base[0]:.1f},{base[1]:.1f} Q{mx:.1f},{my:.1f} {x:.1f},{y:.1f}")
    return " ".join(out)

def stem(cx, cy, s):
    return f"M{cx:.1f},{cy + .12 * s:.1f} C{cx + .02 * s:.1f},{cy + .30 * s:.1f} {cx + .06 * s:.1f},{cy + .42 * s:.1f} {cx + .12 * s:.1f},{cy + .52 * s:.1f}"

# ---------- pin ----------
def pin_path(cx, cy, R, tip_y):
    d = tip_y - cy
    a = math.asin(R / d)
    tx, ty = R * math.cos(a), R * math.sin(a)
    lx, ly, rx, ry = cx - tx, cy + ty, cx + tx, cy + ty
    # round the tip: stop 40 px short of it along each tangent, curve through the tip
    k = 40
    def back(px, py):
        L = math.hypot(px - cx, py - tip_y); return cx + (px - cx) / L * k, tip_y + (py - tip_y) / L * k
    (alx, aly), (arx, ary) = back(lx, ly), back(rx, ry)
    return (f"M{rx:.1f},{ry:.1f} A{R},{R} 0 1 0 {lx:.1f},{ly:.1f} L{alx:.1f},{aly:.1f} "
            f"Q{cx:.1f},{tip_y:.1f} {arx:.1f},{ary:.1f} Z")

def bag_path(x0=250, y0=380, x1=774, y1=850, flare=34, r=64):
    """Shopping bag body: slightly wider at the bottom, rounded corners."""
    tl, tr = (x0 + flare, y0), (x1 - flare, y0)
    return (f"M{tl[0]+r},{y0} L{tr[0]-r},{y0} Q{tr[0]},{y0} {tr[0]+r*.12},{y0+r} L{x1-r*.05},{y1-r} Q{x1},{y1} {x1-r},{y1} "
            f"L{x0+r},{y1} Q{x0},{y1} {x0+r*.05},{y1-r} L{tl[0]-r*.12},{y0+r} Q{tl[0]},{y0} {tl[0]+r},{y0} Z")

HANDLE = "M398,420 C398,236 626,236 626,420"

def mark(gid="g", shadow=True, **_):
    """The mark: a chinar-orange shopping bag (bazaar) with a white chinar leaf (Srinagar), saffron handle.
    Drawn in a 1024 box, centred around x=512."""
    lc, ly, ls = 512, 650, 222
    flt = f' filter="url(#{gid}sh)"' if shadow else ""
    return f"""
  <defs>
    <linearGradient id="{gid}bag" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#FF8048"/><stop offset="1" stop-color="#D8361C"/></linearGradient>
    <linearGradient id="{gid}sf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD27A"/><stop offset="1" stop-color="#F29F2E"/></linearGradient>
    <linearGradient id="{gid}gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="{gid}sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#021C20" flood-opacity=".45"/></filter>
  </defs>
  <g{flt}><path d="{HANDLE}" fill="none" stroke="url(#{gid}sf)" stroke-width="54" stroke-linecap="round"/>
  <path d="{bag_path()}" fill="url(#{gid}bag)"/></g>
  <path d="{bag_path()}" fill="url(#{gid}gl)"/>
  <path d="M296,380 L728,380 L731,414 L293,414 Z" fill="#000" opacity=".10"/>
  <circle cx="398" cy="442" r="17" fill="#8E2412" opacity=".55"/><circle cx="626" cy="442" r="17" fill="#8E2412" opacity=".55"/>
  <g transform="rotate(-12 {lc} {ly})">
  <path d="{stem(lc, ly, ls)}" fill="none" stroke="#fff" stroke-width="{ls * .06:.1f}" stroke-linecap="round"/>
  <path d="{leaf_path(lc, ly, ls)}" fill="#fff"/>
  <path d="{veins(lc, ly, ls)}" fill="none" stroke="#F3B9A6" stroke-width="{ls * .03:.1f}" stroke-linecap="round"/>
  </g>"""

def svg(w, h, body, bg=None):
    bgr = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{bgr}{body}</svg>\n'

BG_GRAD = """<defs><radialGradient id="bg" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#16717B"/><stop offset=".55" stop-color="#0B4B53"/><stop offset="1" stop-color="#062A2F"/></radialGradient></defs>"""

# ---------- outlined text ----------
def text_path(text, font_file, size, x, y, tracking=0):
    f = TTFont(font_file)
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f["hmtx"]
    upm = f["head"].unitsPerEm; sc = size / upm
    pen_x = 0; parts = []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None: continue
        p = SVGPathPen(gs)
        gs[g].draw(TransformPen(p, (sc, 0, 0, -sc, x + pen_x, y)))
        parts.append(p.getCommands())
        pen_x += hmtx[g][0] * sc + tracking
    return " ".join(parts), pen_x

FONT_B = ROOT.parent / "data_raw/fonts/PJS-800.woff2"
FONT_S = ROOT.parent / "data_raw/fonts/PJS-600.woff2"

def main():
    # 1) Play Store / launcher icon: full-bleed square (stores apply their own mask)
    icon = svg(1024, 1024, BG_GRAD + '<rect width="1024" height="1024" fill="url(#bg)"/>' + f'<g transform="translate(0 -31)">{mark()}</g>')
    (OUT / "icon.svg").write_text(icon)
    # 2) Android adaptive icon: foreground inside the 66/108 safe zone, transparent
    fg = svg(1024, 1024, f'<g transform="translate(512 512) scale(.76) translate(-512 -543)">{mark(gid="f", shadow=False)}</g>')
    (OUT / "icon-foreground.svg").write_text(fg)
    (OUT / "icon-background.svg").write_text(svg(1024, 1024, BG_GRAD + '<rect width="1024" height="1024" fill="url(#bg)"/>'))
    # monochrome (Android 13 themed icons)
    mono = svg(1024, 1024, f'<g transform="translate(512 512) scale(.76) translate(-512 -543)"><mask id="m"><rect width="1024" height="1024" fill="#fff"/>'
               f'<path d="{leaf_path(512, 650, 222)}" fill="#000" transform="rotate(-12 512 650)"/></mask>'
               f'<path d="{HANDLE}" fill="none" stroke="#000" stroke-width="54" stroke-linecap="round"/><path d="{bag_path()}" fill="#000" mask="url(#m)"/></g>')
    (OUT / "icon-monochrome.svg").write_text(mono)

    # 3) Wordmark lockups (outlined text, no font needed anywhere)
    for name, ink, sub, pinbg in [("logo-horizontal", INK, "#51666A", DAL), ("logo-horizontal-white", SNOW, "#BFD6D8", SNOW)]:
        t1, w1 = text_path("Srinagar", FONT_B, 150, 290, 205, tracking=-3)
        t2, w2 = text_path("Bazaar", FONT_B, 150, 290, 360, tracking=-3)
        body = (f'<g transform="translate(-96 -12) scale(.44)">{mark(gid=name, shadow=False)}</g>'
                f'<path d="{t1}" fill="{ink}"/><path d="{t2}" fill="{CHINAR}"/>')
        (OUT / f"{name}.svg").write_text(svg(int(290 + max(w1, w2) + 20), 400, body))
    # single-line wordmark
    t, w = text_path("Srinagar Bazaar", FONT_B, 120, 0, 110, tracking=-2)
    (OUT / "wordmark.svg").write_text(svg(int(w) + 4, 140, f'<path d="{t}" fill="{INK}"/>'))

    # 4) Play Store feature graphic 1024x500, with Srinagar's real roads behind
    base = json.load(open(ROOT.parent / "app/basemap.json"))
    x0, x1, y0, y1 = 74.76, 74.90, 34.02, 34.13
    sx = 1024 / (x1 - x0); sy = 500 / (y1 - y0)
    roads = []
    for k, c in base["roads"]:
        if k > 2: continue
        pts = [(round((x - x0) * sx, 1), round((y1 - y) * sy, 1)) for x, y in c]
        if all(not (-50 < px < 1074 and -50 < py < 550) for px, py in pts): continue
        roads.append(f'<path d="M{" L".join(f"{px},{py}" for px, py in pts)}" stroke-width="{[3, 2.2, 1.2][k]}"/>')
    water = []
    for area, c in base["water"]:
        pts = [(round((x - x0) * sx, 1), round((y1 - y) * sy, 1)) for x, y in c]
        water.append(f'<path d="M{" L".join(f"{px},{py}" for px, py in pts)}{"Z" if area else ""}"/>')
    ta, wa = text_path("Srinagar Bazaar", FONT_B, 76, 380, 238, tracking=-1.5)
    tb, wb = text_path("Every shop in Srinagar, nearest first.", FONT_S, 30, 382, 292)
    feat = svg(1024, 500, BG_GRAD + '<rect width="1024" height="500" fill="url(#bg)"/>'
               f'<g fill="#0A444B" stroke="none" opacity=".9">{"".join(w for w in water if w.endswith("Z\"/>"))}</g>'
               f'<g fill="none" stroke="#3D8189" stroke-opacity=".35" stroke-linecap="round">{"".join(roads)}</g>'
               f'<rect width="1024" height="500" fill="url(#bg)" opacity=".55"/>'
               f'<g transform="translate(70 70) scale(.36)">{mark(gid="fg")}</g>'
               f'<path d="{ta}" fill="{SNOW}"/><path d="{tb}" fill="#CFE3E4"/>')
    (OUT / "feature-graphic.svg").write_text(feat)

    # 5) Splash (Capacitor expects 2732x2732, logo centred)
    for name, bg, ink in [("splash", "#F6F8F8", INK), ("splash-dark", "#0B1416", SNOW)]:
        t, w = text_path("Srinagar Bazaar", FONT_B, 120, 0, 0, tracking=-2)
        body = (f'<g transform="translate(1366 1180) scale(.62) translate(-512 -512)">{mark(gid=name)}</g>'
                f'<g transform="translate({1366 - w / 2:.1f} 1720)"><path d="{t}" fill="{ink}"/></g>')
        (OUT / f"{name}.svg").write_text(svg(2732, 2732, body, bg=bg))
    print("SVGs ->", OUT)

if __name__ == "__main__":
    main()
