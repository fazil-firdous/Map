"""Pack data/srinagar_businesses.parquet into compact JSON for the app prototype (app/shops.json)."""
import json, pathlib, re, duckdb
from difflib import SequenceMatcher
ROOT = pathlib.Path(__file__).resolve().parent.parent
B = duckdb.sql(f"SELECT * FROM '{ROOT/'data/srinagar_businesses.parquet'}'").df()
groups = B.group.value_counts().index.tolist()
cats = sorted(B.category.unique().tolist())
# Areas: localities with enough shops, positioned at the median of their shops.
L = duckdb.sql("""SELECT locality, count(*) n, median(lat) lat, median(lon) lon FROM B
                  WHERE locality IS NOT NULL GROUP BY 1 HAVING n >= 15 ORDER BY n DESC""").fetchall()
areas = [[a, n, round(lat, 5), round(lon, 5)] for a, n, lat, lon in L]
# Lal Chowk is a square, not an OSM neighbourhood, but it is where most people say they are.
# Point: Ghanta Ghar (OSM node 6360951960).
areas.insert(0, ["Lal Chowk", int(duckdb.sql("SELECT count(*) FROM B WHERE abs(lat-34.07127)<0.009 AND abs(lon-74.81061)<0.011").fetchone()[0]), 34.07127, 74.81061])
ai = {a[0]: i for i, a in enumerate(areas)}
SRC = {"overture": 1, "osm": 2, "alltheplaces": 4, "foursquare": 8}
nz = lambda v: None if v is None or v != v else v
rows = []
for r in B.itertuples():
    rows.append([r.place_id, r.name, groups.index(r.group), cats.index(r.category), nz(r.locality), ai.get(nz(r.locality), -1),
                 nz(r.phone), nz(r.whatsapp), nz(r.website), nz(r.instagram), nz(r.facebook), nz(r.address),
                 round(r.lat, 5), round(r.lon, 5), int(r.location_precise), nz(r.opening_hours),
                 sum(SRC[s] for s in r.sources), int(r.quality_score), int(r.phone_is_chain), nz(r.pincode)])
json.dump({"groups": groups, "categories": cats, "areas": areas, "shops": rows},
          open(ROOT / "app/shops.json", "w"), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
print(len(rows), "shops,", len(areas), "areas;", groups)

# ---- sights, for "I want to visit ..." ----
# Well-known sights OSM maps as areas/relations the extractor skips; IDs and centres from the OSM extract.
FAMOUS = [
    ("way/610925478", "Dal Lake", "lake", 34.09330, 74.84140),
    ("node/9145011538", "Nigeen Lake", "lake", 34.12088, 74.83371),
    ("way/55527076", "Jamia Masjid", "shrine", 34.09847, 74.80972),
    ("way/168791945", "Khanqah Shah-e-Hamadan", "shrine", 34.09132, 74.80791),
    ("way/680716357", "Makhdoom Sahib Shrine", "shrine", 34.10360, 74.81503),
    ("way/62069786", "Cheshme Shahi", "garden", 34.08603, 74.88689),
    ("way/168100747", "Jawaharlal Nehru Memorial Botanical Garden", "garden", 34.09169, 74.88172),
    ("node/6360951960", "Ghanta Ghar, Lal Chowk", "historic", 34.07127, 74.81061),
    ("node/9052808325", "Polo View Market", "market", 34.07358, 74.82013),
]
G = duckdb.sql(f"SELECT * FROM '{ROOT/'data_raw/osm_sights.parquet'}'").df()
GENERIC = {"garden", "gardens", "mughal", "masjid", "temple", "shrine", "market", "museum", "srinagar", "kashmir", "colony", "ground", "children", "memorial"}
seen, sights = set(), []
for oid, name, kind, lat, lon in FAMOUS:
    seen.add(re.sub(r"[^a-z]", "", name.lower())); sights.append([name, kind, lat, lon, 2])
for r in G.sort_values("wikidata", na_position="last").itertuples():
    k = re.sub(r"[^a-z]", "", r.name.lower())
    if k in seen or k in ("lalchowk",) or re.search(r"corps|army|cantonment|police", k): continue
    # Same sight under another spelling ("Chesmeshahi", "Khushaal sar") within ~2 km.
    words = set(re.findall(r"[a-z]{6,}", r.name.lower())) - GENERIC
    if any(words & set(re.findall(r"[a-z]{6,}", x[0].lower())) and abs(x[2] - r.lat) < 0.014 and abs(x[3] - r.lon) < 0.016
           for x in sights): continue
    if any(SequenceMatcher(None, k, re.sub(r"[^a-z]", "", x[0].lower())).ratio() >= 0.75
           and abs(x[2] - r.lat) < 0.02 and abs(x[3] - r.lon) < 0.03 for x in sights): continue
    seen.add(k)
    fame = 2 if isinstance(r.wikidata, str) else 0 if r.kind == "park" else 1
    sights.append([r.name, r.kind, round(r.lat, 5), round(r.lon, 5), fame])
json.dump(sights, open(ROOT / "app/sights.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(len(sights), "sights")
