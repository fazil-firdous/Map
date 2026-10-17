"""Openly licensed food photos (Openverse; CC BY / BY-SA / CC0) for Kulgam Eats categories and banners. Candidates for manual picking."""
import json, pathlib, sys, time, urllib.parse, urllib.request
H = pathlib.Path(__file__).resolve().parent; OUT = H / "candidates"
UA = {"User-Agent": "KulgamEats/0.1 (fazil.mastu@gmail.com)"}
OK = {"by", "by-sa", "cc0", "pdm"}
Q = {"pizza": "pizza slice cheese", "noodles": "chow mein noodles", "momos": "momos dumplings", "biryani": "chicken biryani", "burger": "chicken burger",
     "shawarma": "shawarma wrap", "cake": "chocolate cake slice", "coffee": "cold coffee glass", "kebab": "seekh kebab", "fries": "french fries",
     "wazwan": "rogan josh mutton curry", "tea": "kashmiri kahwa tea"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
for key, q in Q.items():
    d = OUT / key; d.mkdir(parents=True, exist_ok=True)
    if (d / "meta.json").exists(): continue
    u = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "license_type": "commercial,modification", "page_size": 20, "source": "flickr"})
    try: res = json.loads(get(u))["results"]
    except Exception as e: print("skip", key, e); continue
    meta = []
    for r in res:
        if r["license"] not in OK or (r.get("width") or 0) < 700 or len(meta) >= 6: continue
        try: (d / f"{len(meta)}.jpg").write_bytes(get(r["url"])); meta.append({k: r.get(k) for k in ("title", "creator", "license", "license_version", "license_url", "foreign_landing_url")})
        except Exception: pass
    (d / "meta.json").write_text(json.dumps(meta, indent=1)); print(key, len(meta), flush=True); time.sleep(2)
