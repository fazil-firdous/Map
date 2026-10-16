"""Extract OSM businesses (and a light basemap) for the Srinagar bbox from a .osm.pbf.

Usage: python scripts/extract_osm.py data_raw/jammu_and_kashmir.osm.pbf
Source: https://download.openstreetmap.fr/extracts/asia/india/ (Overpass mirrors were unreachable).
"""
import sys, json, pathlib, re
import osmium, duckdb, pandas as pd

XMIN, XMAX, YMIN, YMAX = 74.72, 74.90, 33.99, 34.20
ROOT = pathlib.Path(__file__).resolve().parent.parent
AMENITY = {"restaurant","cafe","fast_food","bank","atm","pharmacy","clinic","doctors","dentist","hospital",
           "fuel","bar","pub","ice_cream","marketplace","bureau_de_change","car_rental","car_wash",
           "veterinary","internet_cafe","food_court","driving_school","events_venue","childcare",
           "cinema","nightclub","studio","training","money_transfer","payment_centre","post_depot"}
LEISURE = {"fitness_centre","sports_centre","dance","swimming_pool"}
PLACES = {"suburb","neighbourhood","quarter","village","hamlet","locality","town"}
TOURISM = {"hotel","guest_house","hostel","motel","apartment"}
ROADS = {"motorway","trunk","primary","secondary","tertiary","unclassified","residential","living_street"}

SIGHT_TOURISM = {"attraction","viewpoint","museum","gallery","zoo","theme_park","artwork"}
def sight_kind(t):
    """Places people go to see, for 'I want to visit ...' searches."""
    if t.get("tourism") in SIGHT_TOURISM: return t["tourism"]
    if "historic" in t and t["historic"] not in ("yes", "milestone", "boundary_stone"): return "historic"
    if t.get("leisure") in ("park", "garden", "nature_reserve"): return "garden" if t["leisure"] == "garden" or "bagh" in t.get("name", "").lower() else t["leisure"]
    if t.get("amenity") == "place_of_worship" and ("wikidata" in t or "wikipedia" in t): return "shrine"
    if t.get("natural") in ("water", "peak") and "wikidata" in t: return t["natural"]
    if t.get("water") == "lake" and "wikidata" in t: return "lake"
    return None

def inside(x, y): return XMIN <= x <= XMAX and YMIN <= y <= YMAX

def biz_category(t):
    if "shop" in t: return f"shop={t['shop']}"
    if t.get("amenity") in AMENITY: return f"amenity={t['amenity']}"
    if t.get("tourism") in TOURISM: return f"tourism={t['tourism']}"
    if "craft" in t: return f"craft={t['craft']}"
    if "office" in t: return f"office={t['office']}"
    if "healthcare" in t: return f"healthcare={t['healthcare']}"
    if t.get("leisure") in LEISURE: return f"leisure={t['leisure']}"
    return None

class H(osmium.SimpleHandler):
    def __init__(s):
        super().__init__(); s.pois = []; s.roads = []; s.water = []; s.places = []; s.sights = []
    def _poi(s, kind, oid, t, x, y):
        cat = biz_category(t)
        if cat is None or not inside(x, y): return
        g = lambda *ks: next((t[k] for k in ks if k in t), None)
        addr = ", ".join(t[k] for k in ("addr:housenumber","addr:street","addr:suburb","addr:city") if k in t) or None
        s.pois.append(dict(osm_id=f"{kind}/{oid}", name=t.get("name") or t.get("name:en"), category=cat,
            phone=g("phone","contact:phone","mobile","contact:mobile"), website=g("website","contact:website","url"),
            social=g("contact:facebook","facebook"), instagram=g("contact:instagram","instagram"),
            whatsapp=g("contact:whatsapp","whatsapp"), email=g("email","contact:email"),
            brand=t.get("brand"), postcode=t.get("addr:postcode"),
            opening_hours=t.get("opening_hours"), address=addr, lon=x, lat=y, n_tags=len(t)))
    def _sight(s, kind, oid, t, x, y):
        kind_ = sight_kind(t)
        if kind_ and inside(x, y) and (t.get("name:en") or t.get("name")):
            s.sights.append(dict(osm_id=f"{kind}/{oid}", name=t.get("name:en") or t["name"], kind=kind_,
                                 wikidata=t.get("wikidata"), wikipedia=t.get("wikipedia"), lon=x, lat=y))
    def node(s, n):
        if n.tags and n.location.valid():
            t = dict(n.tags); x, y = n.location.lon, n.location.lat
            s._poi("node", n.id, t, x, y)
            s._sight("node", n.id, t, x, y)
            if t.get("place") in PLACES and "name" in t and XMIN-0.05 <= x <= XMAX+0.05 and YMIN-0.05 <= y <= YMAX+0.05:
                s.places.append(dict(name=t.get("name:en") or t["name"], place=t["place"], lon=x, lat=y))
    def way(s, w):
        t = dict(w.tags)
        try: pts = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError: return
        if not pts: return
        if biz_category(t):
            s._poi("way", w.id, t, sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))
        if sight_kind(t):
            s._sight("way", w.id, t, sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))
        if not any(inside(*p) for p in pts): return
        r5 = [[round(x,5), round(y,5)] for x, y in pts]
        if t.get("highway") in ROADS: s.roads.append(dict(c=r5, k=t["highway"]))
        elif t.get("natural") == "water" or t.get("waterway") in ("river","canal") or t.get("water"):
            s.water.append(dict(c=r5, area=t.get("natural") == "water" or "water" in t))

h = H(); h.apply_file(sys.argv[1], locations=True)
df = pd.DataFrame(h.pois)
out = ROOT / "osm_srinagar_places.parquet"
duckdb.sql("COPY (SELECT * FROM df) TO '%s' (FORMAT parquet)" % out)
(ROOT / "data_raw").mkdir(exist_ok=True)
json.dump({"roads": h.roads, "water": h.water}, open(ROOT / "data_raw" / "osm_basemap_full.json", "w"), separators=(",",":"))
sg = pd.DataFrame(h.sights)
duckdb.sql("COPY (SELECT * FROM sg) TO '%s' (FORMAT parquet)" % (ROOT / "data_raw" / "osm_sights.parquet"))
pl = pd.DataFrame(h.places)
duckdb.sql("COPY (SELECT * FROM pl) TO '%s' (FORMAT parquet)" % (ROOT / "data_raw" / "osm_localities.parquet"))
print(f"{len(pl)} locality names; {len(df)} OSM business POIs -> {out}; {len(h.roads)} road ways, {len(h.water)} water features")
