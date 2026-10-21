"""Food photos bundled in the app (openly licensed, credited in Profile → Photo credits). Writes www/img/food/*.jpg + credits.json."""
import json, pathlib
from PIL import Image, ImageOps, ImageFilter
H = pathlib.Path(__file__).resolve().parents[1]; ROOT = H.parents[1]
CAND = ROOT / "food/photos/candidates"; OUT = H / "www/img/food"; OUT.mkdir(parents=True, exist_ok=True)
# name: (source, size). Only the pictures the app itself shows (home categories, welcome screen); dish photos live on
# the server (food/server/public/img). coffee.jpg is 80 Degrees' own cappuccino photo and isn't made here.
PICK = {"pizza-1": ("pizza/4", (640, 480)), "pizza-2": ("pizza/1", (640, 480)), "wazwan": ("@wazwan-caterers-3", (800, 500)),
        "burger": ("burger/1", (640, 480)), "rolls": ("shawarma/2", (640, 480)), "noodles": ("chillipaneer/0", (640, 480)), "momos": ("momos/3", (640, 480)),
        "biryani": ("biryani/3", (640, 480)), "fries": ("fries/1", (640, 480)), "cake": ("cake/1", (640, 480)), "kebab": ("kebab/3", (640, 480))}
HD = None
credits = {}
for name, (src, size) in PICK.items():
    if src.startswith("@"):
        path = ROOT / f"mobile/www/img/photos/{src[1:]}.jpg"; meta = json.loads((ROOT / "mobile/www/img/photos/credits.json").read_text())["photos"][src[1:]]
        cr = {"title": meta["title"], "by": meta["by"], "license": meta["license"], "source": meta["source"]}
    else:
        folder, n = src.split("/"); path = CAND / folder / f"{n}.jpg"; m = json.loads((CAND / folder / "meta.json").read_text())[int(n)]
        cr = {"title": m["title"], "by": m["creator"], "license": f'CC {m["license"].upper()} {m.get("license_version") or ""}'.strip(), "source": m["foreign_landing_url"]}
    im = ImageOps.fit(Image.open(path).convert("RGB"), size, Image.LANCZOS, centering=(.5, .5))
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2)) if size == HD else im
    im.save(OUT / f"{name}.jpg", quality=80 if size == HD else 72, optimize=True, progressive=True)
    credits[name] = cr
credits.update({k: v for k, v in json.loads((OUT / "credits.json").read_text()).items() if k not in PICK and (OUT / f"{k}.jpg").exists()})
(OUT / "credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
print(len(PICK), "photos", sum(f.stat().st_size for f in OUT.glob("*.jpg")) // 1024, "KB")
