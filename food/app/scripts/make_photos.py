"""Food photos bundled in the app (openly licensed, credited in Profile → Photo credits). Writes www/img/food/*.jpg + credits.json."""
import json, pathlib
from PIL import Image, ImageOps, ImageFilter
H = pathlib.Path(__file__).resolve().parents[1]; ROOT = H.parents[1]
CAND = ROOT / "food/photos/candidates"; OUT = H / "www/img/food"; OUT.mkdir(parents=True, exist_ok=True)
# name: (source, size, centering)
PICK = {"pizza-1": ("pizza/4", (640, 480)), "pizza-2": ("pizza/1", (640, 480)), "pizza-3": ("pizza/5", (800, 500)), "wazwan": ("@wazwan-caterers-3", (800, 500)),
        "burger": ("burger/1", (640, 480)), "rolls": ("shawarma/2", (640, 480)), "noodles": ("noodles/3", (640, 480)), "momos": ("momos/3", (640, 480)),
        "biryani": ("biryani/3", (640, 480)), "fries": ("fries/1", (640, 480)), "coffee": ("coffee/0", (480, 480)), "cake": ("cake/1", (640, 480)),
        "kebab": ("kebab/3", (640, 480)), "banner-wazwan": ("@wazwan-caterers-3", (900, 420)), "banner-pizza": ("pizza/5", (900, 420))}
# 1.2: more dishes for real menus, at a higher resolution (sharp on any phone screen)
HD = (960, 720)
PICK.update({"tandoori": ("tandoori/1", HD), "butter-chicken": ("butterchicken/0", HD), "paneer": ("paneer/2", HD), "soup": ("soup/4", HD), "pasta": ("pasta/1", HD),
        "fried-rice": ("friedrice/0", HD), "shake": ("shake/1", HD), "mojito": ("mojito/3", HD), "ice-cream": ("brownie/4", HD), "brownie": ("brownie/1", HD),
        "naan": ("naan/0", HD), "sandwich": ("sandwich/4", HD), "fried-chicken": ("friedchicken/1", HD), "chilli-chicken": ("chillichicken/2", HD),
        "chilli-paneer": ("chillipaneer/0", HD), "wrap": ("wrap/2", HD), "salad": ("salad/3", HD), "tikka": ("tikka/0", HD), "lime-soda": ("lime/5", HD),
        "rice": ("rice/0", HD), "veg-curry": ("vegcurry/0", HD), "pizza-4": ("pizza/0", HD), "burger-2": ("burger/3", HD), "momos-2": ("momos/1", HD),
        "noodles-2": ("noodles/1", HD), "biryani-2": ("biryani/0", HD), "fries-2": ("fries/3", HD), "coffee-2": ("coffee/1", HD)})
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
(OUT / "credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
print(len(PICK), "photos", sum(f.stat().st_size for f in OUT.glob("*.jpg")) // 1024, "KB")
