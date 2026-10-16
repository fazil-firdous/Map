"""Fetch AllThePlaces (chain-store spiders) features inside the Srinagar bbox.

The full run is a ~2.7 GB zip of per-spider GeoJSON. We read the zip directory with HTTP
range requests and only download spiders whose name suggests India coverage, or whose
output (sampled) contains points in India.
Usage: python scripts/fetch_alltheplaces.py
"""
import io, json, re, zipfile, pathlib, urllib.request
UA = {"User-Agent": "srinagar-places-audit/0.1 (+https://github.com/fazil-mastu/map)"}
ROOT = pathlib.Path(__file__).resolve().parent.parent
XMIN, XMAX, YMIN, YMAX = 74.72, 74.90, 33.99, 34.20

class HttpFile(io.RawIOBase):
    def __init__(s, url):
        s.url, s.pos = url, 0
        req = urllib.request.Request(url, method="HEAD", headers=UA)
        s.size = int(urllib.request.urlopen(req, timeout=60).headers["Content-Length"])
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s, off, whence=0):
        s.pos = {0: off, 1: s.pos + off, 2: s.size + off}[whence]; return s.pos
    def read(s, n=-1):
        if n < 0: n = s.size - s.pos
        if n == 0 or s.pos >= s.size: return b""
        end = min(s.pos + n, s.size) - 1
        req = urllib.request.Request(s.url, headers={**UA, "Range": f"bytes={s.pos}-{end}"})
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(req, timeout=120).read(); break
            except Exception:
                if attempt == 3: raise
        s.pos += len(data); return data
    def readinto(s, b):
        d = s.read(len(b)); m = memoryview(b).cast("B"); m[:len(d)] = d; return len(d)

run = json.load(urllib.request.urlopen(urllib.request.Request("https://data.alltheplaces.xyz/runs/latest.json", headers=UA), timeout=60))
print("AllThePlaces run", run["run_id"])
z = zipfile.ZipFile(io.BufferedReader(HttpFile(run["output_url"]), buffer_size=1 << 20))
names = [i for i in z.infolist() if i.filename.endswith(".geojson")]
# Spiders with Indian output, from the run's brand insights (country -> spider splits),
# plus any spider named like an India spider.
ins = json.load(urllib.request.urlopen(urllib.request.Request(run["insights_url"], headers=UA), timeout=300))
in_spiders = {sp for b in ins["data"] for sp in (b.get("atp_splits") or {}).get("IN", {})}
india = [i for i in names if i.filename.rsplit("/", 1)[-1][:-8] in in_spiders
         or re.search(r"(_in|_india)\.geojson$", i.filename.lower())]
print(f"{len(names)} spiders, {len(india)} with Indian data, {sum(i.compress_size for i in india)/1e6:.1f} MB compressed")
feats = []
for i in india:
    try: gj = json.loads(z.read(i))
    except Exception as e: print("skip", i.filename, e); continue
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") != "Point": continue
        x, y = g["coordinates"][:2]
        if XMIN <= x <= XMAX and YMIN <= y <= YMAX:
            p = f.get("properties", {}); p["_spider"] = i.filename.rsplit("/", 1)[-1][:-8]
            feats.append({"lon": x, "lat": y, "props": p})
out = ROOT / "data_raw" / "atp" / "atp_srinagar.json"
json.dump({"run_id": run["run_id"], "features": feats}, open(out, "w"))
print(f"{len(feats)} features in Srinagar bbox -> {out}")
