"""Sweep openly licensed Srinagar photos (Openverse) and match their titles to business names in our data.
Matches go to shops/<shop id>/ for manual review. Usage: python sweep_named.py"""
import json, pathlib, re, time, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "shops"; OUT.mkdir(exist_ok=True)
UA = {"User-Agent": "SrinagarBazaar/1.0 (fazil.mastu@gmail.com)"}
OK = {"by", "by-sa", "cc0", "pdm"}
STOP = set("hotel hotels restaurant resort resorts residency cafe the and houseboat houseboats hb guest house inn srinagar kashmir shop store bakers bakery sweets veg non grill at dal lake pvt ltd of new group deluxe palace super view jk india".split())
d = json.load(open(ROOT.parents[1] / "mobile/www/data/bundle.json")); C = d["categories"]
names = {}
for s in d["shops"]:
    toks = [w for w in re.findall(r"[a-z]+", s[1].lower()) if w not in STOP and len(w) >= 3]
    if len(toks) >= 2 or (len(toks) == 1 and len(toks[0]) >= 7): names.setdefault(" ".join(toks), []).append(s)
QUERIES = ["srinagar houseboat", "dal lake houseboat", "nigeen houseboat", "houseboat kashmir", "srinagar hotel", "srinagar restaurant", "srinagar shop",
           "srinagar store", "srinagar bakery", "srinagar emporium", "srinagar cafe", "lal chowk", "srinagar market", "srinagar bazaar", "srinagar shawl",
           "srinagar carpet", "srinagar papier mache", "srinagar saffron", "srinagar sweets", "polo view srinagar", "residency road srinagar", "boulevard srinagar"]


def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()


found = 0; seen = set()
for q in QUERIES:
    for page in range(1, 6):
        u = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "license_type": "commercial,modification", "page_size": 20, "page": page})
        try: res = json.loads(get(u))["results"]
        except Exception as e: print("skip", q, page, str(e)[:60], flush=True); break
        if not res: break
        for r in res:
            if r["id"] in seen or r["license"] not in OK or (r.get("width") or 0) < 640: continue
            seen.add(r["id"])
            title = " ".join(re.findall(r"[a-z]+", (r.get("title") or "").lower()))
            tt = set(title.split())
            for key, shops in names.items():
                if all(k in tt for k in key.split()) and key in title:
                    s = shops[0]
                    dd = OUT / s[0]; dd.mkdir(exist_ok=True)
                    mf = dd / "meta.json"; meta = json.loads(mf.read_text()) if mf.exists() else []
                    if any(m["id"] == r["id"] for m in meta) or len(meta) >= 4: continue
                    try: (dd / f"{len(meta)}.jpg").write_bytes(get(r["url"]))
                    except Exception: continue
                    meta.append({k: r.get(k) for k in ("id", "title", "creator", "license", "license_version", "license_url", "foreign_landing_url", "url", "source")} | {"shop": s[1], "cat": C[s[3]], "key": key})
                    mf.write_text(json.dumps(meta, indent=1)); found += 1
                    print("MATCH", s[1], "|", C[s[3]], "<-", r.get("title"), flush=True)
        time.sleep(1.5)
print("done", found, "photos;", len(seen), "photos scanned", flush=True)
