"""Pack data/srinagar_businesses.parquet into compact JSON for the app prototype (app/shops.json)."""
import json, pathlib, duckdb
ROOT = pathlib.Path(__file__).resolve().parent.parent
B = duckdb.sql(f"SELECT * FROM '{ROOT/'data/srinagar_businesses.parquet'}'").df()
groups = B.group.value_counts().index.tolist()
cats = sorted(B.category.unique().tolist())
# Areas: localities with enough shops, positioned at the median of their shops.
L = duckdb.sql("""SELECT locality, count(*) n, median(lat) lat, median(lon) lon FROM B
                  WHERE locality IS NOT NULL GROUP BY 1 HAVING n >= 15 ORDER BY n DESC""").fetchall()
areas = [[a, n, round(lat, 5), round(lon, 5)] for a, n, lat, lon in L]
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
