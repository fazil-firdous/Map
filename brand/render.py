"""Render brand/src/*.svg to PNGs at the sizes stores and Android need (headless Chromium)."""
import os, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
SRC, PNG = ROOT / "src", ROOT / "png"
PNG.mkdir(exist_ok=True)
JOBS = [  # (svg, out, width, height, transparent)
    ("icon.svg", "play-icon-512.png", 512, 512, False),
    ("icon.svg", "icon-1024.png", 1024, 1024, False),
    ("icon.svg", "icon-192.png", 192, 192, False),
    ("icon.svg", "icon-48.png", 48, 48, False),
    ("icon-foreground.svg", "icon-foreground-1024.png", 1024, 1024, True),
    ("icon-background.svg", "icon-background-1024.png", 1024, 1024, False),
    ("icon-monochrome.svg", "icon-monochrome-1024.png", 1024, 1024, True),
    ("feature-graphic.svg", "play-feature-graphic-1024x500.png", 1024, 500, False),
    ("logo-horizontal.svg", "logo-horizontal.png", None, 400, True),
    ("logo-horizontal-white.svg", "logo-horizontal-white.png", None, 400, True),
    ("wordmark.svg", "wordmark.png", None, 140, True),
    ("splash.svg", "splash-2732.png", 2732, 2732, False),
    ("splash-dark.svg", "splash-dark-2732.png", 2732, 2732, False),
]

with sync_playwright() as p:
    exe = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
    b = p.chromium.launch(executable_path=exe)
    for src, out, w, h, transparent in JOBS:
        svg = (SRC / src).read_text()
        vb = [float(v) for v in svg.split('viewBox="')[1].split('"')[0].split()]
        if w is None: w = round(vb[2] * h / vb[3])
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.set_content(f'<html><body style="margin:0;background:transparent">'
                       f'<img src="data:image/svg+xml;base64,{__import__("base64").b64encode(svg.encode()).decode()}" style="width:{w}px;height:{h}px;display:block"></body></html>')
        pg.wait_for_timeout(150)
        pg.screenshot(path=str(PNG / out), omit_background=transparent, clip={"x": 0, "y": 0, "width": w, "height": h})
        pg.close()
        print(out, w, h)
    b.close()
