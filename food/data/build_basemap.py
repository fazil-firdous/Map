"""Kulgam-area basemap (roads + water) from the J&K OpenStreetMap extract, as compact JSON for the app's own map.
No tile server or API key needed, and it works offline. Usage: python food/data/build_basemap.py"""
import json, pathlib, osmium
ROOT = pathlib.Path(__file__).resolve().parents[2]
W, S, E, N = 74.86, 33.55, 75.22, 33.73   # Kulgam, Devsar, Yaripora, Qazigund
KIND = {"trunk": 0, "primary": 0, "secondary": 1, "tertiary": 1, "unclassified": 2, "residential": 2, "living_street": 2, "service": 3, "track": 3}
class H(osmium.SimpleHandler):
    def __init__(s): super().__init__(); s.roads = []; s.water = []
    def way(s, w):
        hw, wt, nat = w.tags.get("highway"), w.tags.get("waterway"), w.tags.get("natural")
        k = KIND.get((hw or "").replace("_link", ""))
        if k is None and not wt and nat != "water": return
        try: c = [(round(n.lon, 5), round(n.lat, 5)) for n in w.nodes]
        except osmium.InvalidLocationError: return
        if not any(W <= x <= E and S <= y <= N for x, y in c): return
        if k is not None: s.roads.append([k, c])
        elif wt in ("river", "stream", "canal"): s.water.append([0, c])
        elif nat == "water" and c[0] == c[-1]: s.water.append([1, c])
h = H(); h.apply_file(str(ROOT / "data_raw/jammu_and_kashmir.osm.pbf"), locations=True)
out = ROOT / "food/data/kulgam_basemap.json"
json.dump({"bbox": [W, S, E, N], "roads": h.roads, "water": h.water}, open(out, "w"), separators=(",", ":"))
print(len(h.roads), "roads,", len(h.water), "water;", out.stat().st_size // 1024, "KB")
