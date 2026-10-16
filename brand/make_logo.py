"""Generate the Srinagar Bazaar logo set (SVG) from code, so every size is crisp.

Mark: a chinar leaf (Kashmir's emblem) inside a map pin.
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

def mark(cx=512, cy=420, R=300, tip=930, leaf_scale=282, pin_fill=SNOW, gid="g"):
    leaf_cy = cy + .20 * leaf_scale
    return f"""
  <defs>
    <linearGradient id="{gid}leaf" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{CHINAR}"/><stop offset="1" stop-color="{CHINAR_DEEP}"/></linearGradient>
  </defs>
  <path d="{pin_path(cx, cy, R, tip)}" fill="{pin_fill}"/>
  <g transform="rotate(-14 {cx} {leaf_cy})">
  <path d="{stem(cx, leaf_cy, leaf_scale)}" fill="none" stroke="{CHINAR_DEEP}" stroke-width="{leaf_scale * .05:.1f}" stroke-linecap="round"/>
  <path d="{leaf_path(cx, leaf_cy, leaf_scale)}" fill="url(#{gid}leaf)"/>
  <path d="{veins(cx, leaf_cy, leaf_scale)}" fill="none" stroke="{SAFFRON}" stroke-opacity=".5" stroke-width="{leaf_scale * .026:.1f}" stroke-linecap="round"/>
  </g>"""

def svg(w, h, body, bg=None):
    bgr = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{bgr}{body}</svg>\n'

BG_GRAD = f"""<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{DAL}"/><stop offset="1" stop-color="{DAL_DEEP}"/></linearGradient></defs>"""

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
    icon = svg(1024, 1024, BG_GRAD + '<rect width="1024" height="1024" fill="url(#bg)"/>' + mark())
    (OUT / "icon.svg").write_text(icon)
    # 2) Android adaptive icon: foreground inside the 66/108 safe zone, transparent
    fg = svg(1024, 1024, f'<g transform="translate(512 512) scale(.68) translate(-512 -540)">{mark(gid="f")}</g>')
    (OUT / "icon-foreground.svg").write_text(fg)
    (OUT / "icon-background.svg").write_text(svg(1024, 1024, BG_GRAD + '<rect width="1024" height="1024" fill="url(#bg)"/>'))
    # monochrome (Android 13 themed icons)
    mono = svg(1024, 1024, f'<g transform="translate(512 512) scale(.68) translate(-512 -540)"><path d="{pin_path(512, 420, 300, 930)}" fill="#000"/>'
               f'<path d="{leaf_path(512, 420 + .20 * 282, 282)}" fill="#fff" transform="rotate(-14 512 {420 + .20 * 282})"/></g>')
    (OUT / "icon-monochrome.svg").write_text(mono)

    # 3) Wordmark lockups (outlined text, no font needed anywhere)
    for name, ink, sub, pinbg in [("logo-horizontal", INK, "#51666A", DAL), ("logo-horizontal-white", SNOW, "#BFD6D8", SNOW)]:
        t1, w1 = text_path("Srinagar", FONT_B, 150, 330, 205, tracking=-3)
        t2, w2 = text_path("Bazaar", FONT_B, 150, 330, 360, tracking=-3)
        body = (f'<g transform="translate(10 0) scale(.30)">{mark(pin_fill=pinbg if name.endswith("white") else DAL, gid=name)}</g>'
                f'<path d="{t1}" fill="{ink}"/><path d="{t2}" fill="{CHINAR}"/>')
        (OUT / f"{name}.svg").write_text(svg(int(330 + max(w1, w2) + 20), 400, body))
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
