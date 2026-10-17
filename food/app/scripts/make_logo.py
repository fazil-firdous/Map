"""Kezia's Food logo: a white bowl with saffron steam on a fresh green gradient.
Writes the app icon sources for @capacitor/assets (assets/*.png) and a store icon (assets/store-icon-512.png).
Usage: python3 scripts/make_logo.py"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "assets")
FONTS = os.path.join(ROOT, "..", "styles", "fonts")
os.makedirs(OUT, exist_ok=True)
G1, G2, DEEP, GOLD, GOLD2 = (15, 138, 79), (34, 180, 106), (10, 107, 60), (232, 163, 23), (247, 196, 76)


def gradient(size, a=G1, b=G2):
    """Diagonal gradient from a (top-left) to b (bottom-right)."""
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * .55 + y / h * .45)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img


def mark(s, steam=True, color=(255, 255, 255, 255)):
    """The bowl and steam drawn at size s (RGBA, transparent background), 4x supersampled."""
    S = s * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 100
    # bowl: lower half of an ellipse, with a rim bar and a small foot
    d.chord([18 * u, 34 * u, 82 * u, 84 * u], 0, 180, fill=color)
    d.rounded_rectangle([14 * u, 55 * u, 86 * u, 62 * u], radius=3.5 * u, fill=color)
    d.rounded_rectangle([38 * u, 80 * u, 62 * u, 85 * u], radius=2.5 * u, fill=color)
    if steam:  # three wavy saffron plumes
        for i, x0 in enumerate((36, 50, 64)):
            pts = []
            for k in range(0, 41):
                t = k / 40
                y = 49 - t * 30 - (3 if i == 1 else 0) * t
                x = x0 + math.sin(t * math.pi * 2 + i) * 3.2
                pts.append((x * u, y * u))
            d.line(pts, fill=GOLD2 + (255,) if i == 1 else GOLD + (255,), width=int(5.2 * u), joint="curve")
            for p in (pts[0], pts[-1]):
                r = 2.6 * u
                d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GOLD2 + (255,) if i == 1 else GOLD + (255,))
    return im.resize((s, s), Image.LANCZOS)


def rounded(img, radius):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(m)
    return out


def shadowed(base, fg, offset, blur):
    sh = Image.new("RGBA", fg.size, (0, 0, 0, 0))
    sh.putalpha(fg.getchannel("A").point(lambda a: a * .35))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(Image.composite(Image.new("RGBA", fg.size, (6, 60, 32, 255)), Image.new("RGBA", fg.size, (0, 0, 0, 0)), sh.getchannel("A")), (0, offset))
    base.alpha_composite(fg)
    return base


N = 1024
bg = gradient((N, N)).convert("RGBA")
bg.save(os.path.join(OUT, "icon-background.png"))
# Foreground for adaptive icons: the mark must sit inside the central 66% safe zone
fg = Image.new("RGBA", (N, N), (0, 0, 0, 0))
m = mark(int(N * .56))
fg.alpha_composite(m, ((N - m.size[0]) // 2, (N - m.size[1]) // 2 - 6))
fg.save(os.path.join(OUT, "icon-foreground.png"))
full = bg.copy()
m2 = mark(int(N * .72))
layer = Image.new("RGBA", (N, N), (0, 0, 0, 0))
layer.alpha_composite(m2, ((N - m2.size[0]) // 2, (N - m2.size[1]) // 2 - 8))
full = shadowed(full, layer, 14, 18)
full.convert("RGB").save(os.path.join(OUT, "icon-only.png"))
rounded(full, 230).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "store-icon-512.png"))

# Splash: light green fade, the icon tile, wordmark in Fraunces
W = 2732
sp = Image.new("RGB", (W, W), (251, 252, 248))
top = gradient((W, W), (201, 236, 214), (227, 245, 234))
mask = Image.linear_gradient("L").resize((W, W)).point(lambda v: 255 - v)
sp.paste(top, (0, 0), mask)
tile = rounded(full, 230).resize((440, 440), Image.LANCZOS)
sp = sp.convert("RGBA")
sh = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([W // 2 - 200, W // 2 - 300 + 60, W // 2 + 200, W // 2 + 140 + 40], radius=200, fill=(15, 138, 79, 90))
sp.alpha_composite(sh.filter(ImageFilter.GaussianBlur(50)))
sp.alpha_composite(tile, (W // 2 - 220, W // 2 - 300))
d = ImageDraw.Draw(sp)
f = ImageFont.truetype(os.path.join(FONTS, "Fraunces-800.ttf") if os.path.exists(os.path.join(FONTS, "Fraunces-800.ttf")) else os.path.join(FONTS, "Fraunces-800.woff2"), 150)
d.text((W // 2, W // 2 + 250), "Kezia's Food", font=f, fill=DEEP, anchor="mm")
sp.convert("RGB").save(os.path.join(OUT, "splash.png"))
print("logo written to", OUT)
