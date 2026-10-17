"""Food photos bundled in the app (openly licensed, credited in Profile → Photo credits). Writes www/img/food/*.jpg + credits.json."""
import json, pathlib
from PIL import Image, ImageOps
H = pathlib.Path(__file__).resolve().parents[1]; ROOT = H.parents[1]
CAND = ROOT / "food/photos/candidates"; OUT = H / "www/img/food"; OUT.mkdir(parents=True, exist_ok=True)
# name: (source, size, centering)
PICK = {"pizza-1": ("pizza/4", (640, 480)), "pizza-2": ("pizza/1", (640, 480)), "pizza-3": ("pizza/5", (800, 500)), "wazwan": ("@wazwan-caterers-3", (800, 500)),
        "burger": ("burger/1", (640, 480)), "rolls": ("shawarma/2", (640, 480)), "noodles": ("noodles/3", (640, 480)), "momos": ("momos/3", (640, 480)),
        "biryani": ("biryani/3", (640, 480)), "fries": ("fries/1", (640, 480)), "coffee": ("coffee/0", (480, 480)), "cake": ("cake/1", (640, 480)),
        "kebab": ("kebab/3", (640, 480)), "banner-wazwan": ("@wazwan-caterers-3", (900, 420)), "banner-pizza": ("pizza/5", (900, 420))}
credits = {}
for name, (src, size) in PICK.items():
    if src.startswith("@"):
        path = ROOT / f"mobile/www/img/photos/{src[1:]}.jpg"; meta = json.loads((ROOT / "mobile/www/img/photos/credits.json").read_text())["photos"][src[1:]]
        cr = {"title": meta["title"], "by": meta["by"], "license": meta["license"], "source": meta["source"]}
    else:
        folder, n = src.split("/"); path = CAND / folder / f"{n}.jpg"; m = json.loads((CAND / folder / "meta.json").read_text())[int(n)]
        cr = {"title": m["title"], "by": m["creator"], "license": f'CC {m["license"].upper()} {m.get("license_version") or ""}'.strip(), "source": m["foreign_landing_url"]}
    im = ImageOps.fit(Image.open(path).convert("RGB"), size, Image.LANCZOS, centering=(.5, .5))
    im.save(OUT / f"{name}.jpg", quality=72, optimize=True, progressive=True)
    credits[name] = cr
(OUT / "credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
print(len(PICK), "photos", sum(f.stat().st_size for f in OUT.glob("*.jpg")) // 1024, "KB")
