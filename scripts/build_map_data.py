"""Pack Overture + OSM places and the OSM basemap into compact JSON for map/index.html."""
import json, pathlib, duckdb
ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP = ROOT / "map"


src = (ROOT / "scripts/compare_osm_overture.py").read_text()
GROUP = src.split('GROUP = r"""')[1].split('"""')[0]

con = duckdb.connect()
groups = [l.split("THEN '")[1].split("'")[0] for l in GROUP.splitlines() if "THEN '" in l] + ["other"]
gi = {g: i for i, g in enumerate(groups)}
q = lambda s: con.sql(s).fetchall()
ov = q(f"""
  WITH p AS (SELECT * FROM '{ROOT/'srinagar_places.parquet'}'),
       st AS (SELECT round(lon,5) x, round(lat,5) y, count(*) n FROM p GROUP BY 1,2),
       mm AS (SELECT ov_id, any_value(osm_name) osm_name FROM '{ROOT/'osm_overture_matches.parquet'}' GROUP BY 1)
  SELECT round(p.lon,5), round(p.lat,5), p.name, (SELECT {GROUP} FROM (SELECT lower(coalesce(category,'')||' '||coalesce(basic_category,'')) c)),
         coalesce(p.category,''), nullif(trim(p.phone),''), nullif(trim(p.website),''), nullif(trim(p.social),''),
         round(p.confidence,2), nullif(trim(p.address),''), mm.osm_name, st.n >= 3
  FROM p JOIN st ON round(p.lon,5)=st.x AND round(p.lat,5)=st.y LEFT JOIN mm ON mm.ov_id = p.id""")
osm = q(f"""
  SELECT round(lon,5), round(lat,5), name, (SELECT {GROUP} FROM (SELECT lower(category) c)), category,
         phone, website, social, opening_hours, address, osm_id
  FROM '{ROOT/'osm_srinagar_places.parquet'}'
  WHERE osm_id NOT IN (SELECT osm_id FROM '{ROOT/'osm_overture_matches.parquet'}')""")
# columns: lon, lat, name, group, category, phone, web, social, conf|hours, address, extra(osm name|osm id), source(0 ov-only,1 both,2 osm-only), stacked
P = [[r[0], r[1], r[2], gi[r[3]], r[4], r[5], r[6], r[7], r[8], r[9], r[10], 1 if r[10] else 0, int(r[11])] for r in ov]
P += [[r[0], r[1], r[2], gi[r[3]], r[4], r[5], r[6], r[7], r[8], r[9], r[10], 2, 0] for r in osm]
clean = lambda v: v.replace("\ufffd", "").strip() or None if isinstance(v, str) else v  # source has some mojibake
P = [[clean(v) for v in row] for row in P]
json.dump({"groups": groups, "places": P}, open(MAP / "places.json", "w"), separators=(",", ":"), ensure_ascii=False)

# Lighter basemap: 4 dp (~10 m) and drop repeated vertices.
bm = json.load(open(ROOT / "data_raw" / "osm_basemap_full.json"))
def thin(c):
    out = []
    for x, y in c:
        p = [round(x, 4), round(y, 4)]
        if not out or out[-1] != p: out.append(p)
    return out
rank = {"motorway":0,"trunk":0,"primary":1,"secondary":1,"tertiary":2,"unclassified":3,"residential":3,"living_street":3}
lite = {"roads": [[rank[r["k"]], thin(r["c"])] for r in bm["roads"]],
        "water": [[int(w["area"]), thin(w["c"])] for w in bm["water"]]}
json.dump(lite, open(MAP / "basemap.json", "w"), separators=(",", ":"))
print(len(P), "points;", groups)
