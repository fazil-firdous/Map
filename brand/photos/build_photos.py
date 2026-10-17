"""Turn the picked candidates into small app photos + credits.json (mobile/www/img/photos).

Each pick: app key -> candidate path (relative to candidates/). Sights use their app name,
shop photos use a category name (or a group name as fallback) and are shown as "representative";
a list gives variants, picked per shop so a row of cafes doesn't repeat one picture.
"""
import json, pathlib, re
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent
CAND = ROOT / "candidates"
OUT = ROOT.parents[1] / "mobile" / "www" / "img" / "photos"

SIGHTS = {
    "Dal Lake": "Dal Lake/4", "Nigeen Lake": "Nigeen Lake/1", "Jamia Masjid": "Jamia Masjid/0",
    "Khanqah Shah-e-Hamadan": "Khanqah Shah-e-Hamadan/1", "Makhdoom Sahib Shrine": "Makhdoom Sahib Shrine/0",
    "Cheshme Shahi": "Cheshme Shahi/1", "Ghanta Ghar, Lal Chowk": "Ghanta Ghar, Lal Chowk/1", "Nishat Bagh": "Nishat Bagh/0",
    "Shalimar Bagh": "Shalimar Bagh/3", "Dargah Hazratbal": "Dargah Hazratbal/0", "Shankaracharya Hill": "Shankaracharya Temple/1",
    "Hari Parbat": "Hari Parbat/4", "Parimahal": "Parimahal/3", "Zero Bridge": "Zero Bridge/1",
    "Pathar masjid": "Pathar masjid/retry/0", "Boat Tour": "Shikara & Boat Ride/3",
}
SHOPS = {
    "Houseboat": "Houseboat/2", "Shikara & Boat Ride": "Shikara & Boat Ride/3", "Hotel & Guesthouse": "Hotel & Guesthouse/1",
    "Travel Agent & Tours": "Travel Agent & Tours/4", "Taxi & Car Rental": "Taxi & Car Rental/retry/0",
    "Shawls & Pashmina": "Shawls & Pashmina/0", "Carpets & Rugs": "Carpets & Rugs/retry/5", "Handicrafts": "Handicrafts/retry/4",
    "Dry Fruits & Saffron": "Dry Fruits & Saffron/0", "Bakery & Sweets": "Bakery & Sweets/retry/0", "Cafe & Tea": ["Cafe & Tea/retry/3", "Restaurant/retry/4"],
    "Restaurant": ["Restaurant/retry/2", "Restaurant/retry/5"], "Wazwan & Caterers": "Wazwan & Caterers/retry/3", "Fast Food": ["Fast Food/0", "Fast Food/1"],
    "Grocery & General Store": ["Groceries/4", "Groceries/3"], "Fruit, Veg & Meat": "Fruit, Veg & Meat/1", "Clothing": ["Fashion/3", "Fashion/5"],
    "Jewellery & Watches": "Jewellery & Watches/0", "Salon & Barber": "Beauty & Fitness/2", "Hardware & Building": "Home & Hardware/retry/3",
    "Mechanic & Parts": "Automotive/0", "Bank": "Money/retry/4", "Mobile Phones": "Electronics/0", "Shopping Centre & Market": "Shopping/0",
    # whole groups, for categories without their own photo
    "Food & Drink": ["Restaurant/retry/2", "Restaurant/retry/5"], "Kashmiri Crafts": "Handicrafts/retry/4", "Groceries": "Groceries/4", "Fashion": ["Fashion/3", "Fashion/5"],
}

# Photos of these exact businesses (shop id -> path under shops/, from sweep_named.py, checked by hand)
BY_SHOP = {
    "SXR-27392FC2": "../shops/SXR-27392FC2/0", "SXR-3B6062FF": "../shops/SXR-3B6062FF/0",
    "SXR-C8F0B869": "../shops/SXR-C8F0B869/0", "SXR-E7AD8D5B": "../shops/SXR-E7AD8D5B/0",
}

slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
OUT.mkdir(parents=True, exist_ok=True)
credits, files = {"sights": {}, "shops": {}, "byShop": {}}, {}
for kind, picks in (("sights", SIGHTS), ("shops", SHOPS), ("byShop", BY_SHOP)):
    for key, srcs in picks.items():
      for src in [srcs] if isinstance(srcs, str) else srcs:
        *d, n = src.split("/"); folder = CAND.joinpath(*d)
        meta = json.loads((folder / "meta.json").read_text())[int(n)]
        name = slug(src.replace("/retry", "").replace("../shops/", "shop-"))
        if name not in files:
            im = ImageOps.exif_transpose(Image.open(folder / f"{n}.jpg")).convert("RGB")
            ImageOps.fit(im, (720, 405), Image.LANCZOS, centering=(0.5, 0.45)).save(OUT / f"{name}.jpg", quality=66, optimize=True, progressive=True)
            files[name] = {"file": f"{name}.jpg", "title": meta["title"], "by": meta["creator"],
                           "license": f"CC {meta['license'].upper()} {meta.get('license_version') or ''}".strip() if meta["license"] not in ("cc0", "pdm") else meta["license"].upper(),
                           "license_url": meta["license_url"], "source": meta["foreign_landing_url"]}
        credits[kind].setdefault(key, []).append(name)
(OUT / "credits.json").write_text(json.dumps({"photos": files, **credits}, ensure_ascii=False, indent=1))
print(len(files), "photos,", sum(f.stat().st_size for f in OUT.glob("*.jpg")) // 1024, "KB")
