"""Find openly licensed photos (Openverse -> Flickr) for sights and shop types, for manual picking.

Only licences that allow commercial use and changes: CC0, public domain, CC BY, CC BY-SA.
Output: candidates/<key>/<n>.jpg + candidates/<key>/meta.json, and contact sheets to choose from.
"""
import json, pathlib, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "candidates"; OUT.mkdir(exist_ok=True)
UA = {"User-Agent": "SrinagarBazaar/1.0 (fazil.mastu@gmail.com)"}
OK_LICENSES = {"by", "by-sa", "cc0", "pdm"}

ITEMS = {
    # sights (key = sight name in the app)
    "Dal Lake": "Dal Lake Srinagar", "Nigeen Lake": "Nigeen Lake Srinagar", "Jamia Masjid": "Jamia Masjid Srinagar",
    "Khanqah Shah-e-Hamadan": "Khanqah Shah Hamadan Srinagar", "Makhdoom Sahib Shrine": "Makhdoom Sahib Srinagar",
    "Cheshme Shahi": "Chashme Shahi Srinagar", "Jawaharlal Nehru Memorial Botanical Garden": "Botanical Garden Srinagar",
    "Ghanta Ghar, Lal Chowk": "Lal Chowk Srinagar", "Naseem Bagh": "Naseem Bagh Srinagar",
    "Indira Gandhi Memorial Tulip Garden": "Tulip garden Srinagar", "Nishat Bagh": "Nishat Bagh", "Shalimar Bagh": "Shalimar Bagh Srinagar",
    "Dargah Hazratbal": "Hazratbal Srinagar", "Shankaracharya Temple": "Shankaracharya temple Srinagar", "Hari Parbat": "Hari Parbat Srinagar",
    "Parimahal": "Pari Mahal Srinagar", "Zero Bridge": "Zero Bridge Srinagar", "Pathar masjid": "Pathar Masjid Srinagar",
    "SPS Museum": "SPS Museum Srinagar", "Burzahom Archaelogical Site": "Burzahom",
    # shop types (key = category or group in the app)
    "Houseboat": "houseboat Dal Lake", "Shikara & Boat Ride": "shikara Dal Lake", "Hotel & Guesthouse": "hotel Srinagar Kashmir",
    "Travel Agent & Tours": "Gulmarg", "Taxi & Car Rental": "taxi Kashmir road",
    "Shawls & Pashmina": "pashmina shawl Kashmir", "Carpets & Rugs": "Kashmiri carpet", "Handicrafts": "papier mache Kashmir",
    "Dry Fruits & Saffron": "saffron Kashmir", "Bakery & Sweets": "Kashmiri bread bakery", "Cafe & Tea": "kahwa tea Kashmir",
    "Restaurant": "Kashmiri food", "Wazwan & Caterers": "wazwan", "Fast Food": "kebab street food India",
    "Groceries": "grocery shop India", "Fruit, Veg & Meat": "vegetable market Srinagar", "Fashion": "clothes shop market India",
    "Jewellery & Watches": "jewellery shop India", "Health": "pharmacy medicine India", "Money": "bank India",
    "Electronics": "mobile phone shop India", "Home & Hardware": "hardware shop India", "Automotive": "auto repair workshop India",
    "Beauty & Fitness": "barber shop India", "Services": "office India", "Shopping": "Srinagar market", "Other": "Srinagar street",
}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

def search(q):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": q, "source": "flickr", "license_type": "commercial,modification", "page_size": 20, "aspect_ratio": "wide"})
    for attempt in range(4):
        try: return json.loads(get(url))["results"]
        except Exception as e:
            time.sleep(10 * (attempt + 1))
    return []

for key, q in ITEMS.items():
    d = OUT / key.replace("/", "-")
    if (d / "meta.json").exists(): continue
    d.mkdir(exist_ok=True)
    res = [r for r in search(q) if r["license"] in OK_LICENSES and (r.get("width") or 0) >= 800][:6]
    meta = []
    for i, r in enumerate(res):
        try:
            (d / f"{i}.jpg").write_bytes(get(r["url"]))
            meta.append({k: r.get(k) for k in ("id", "title", "creator", "creator_url", "license", "license_version", "license_url", "foreign_landing_url", "url")})
        except Exception:
            meta.append(None)
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    print(key, len([m for m in meta if m]))
    time.sleep(3)

# Contact sheets: 4 items per sheet, 6 candidates each.
keys = [k for k in ITEMS]
for s in range(0, len(keys), 4):
    sheet = Image.new("RGB", (6 * 260 + 160, 4 * 170), "white"); dr = ImageDraw.Draw(sheet)
    for row, key in enumerate(keys[s:s + 4]):
        dr.text((4, row * 170 + 70), key[:22], fill="black")
        for i in range(6):
            f = OUT / key.replace("/", "-") / f"{i}.jpg"
            if not f.exists(): continue
            im = Image.open(f).convert("RGB"); im.thumbnail((250, 160))
            sheet.paste(im, (160 + i * 260, row * 170 + 5)); dr.text((165 + i * 260, row * 170 + 8), str(i), fill="yellow")
    sheet.save(OUT / f"sheet_{s // 4:02d}.jpg", quality=80)
print("sheets done")
