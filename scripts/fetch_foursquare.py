"""Fetch Foursquare OS Places (Apache-2.0) for the Srinagar bbox.

The dataset is gated on Hugging Face: create a free account, accept the terms at
https://huggingface.co/datasets/foursquare/fsq-os-places, create a read token, then:
    HF_TOKEN=hf_xxx python scripts/fetch_foursquare.py
Writes data_raw/fsq_srinagar.parquet, which scripts/merge_sources.py picks up automatically.
"""
import os, sys, json, pathlib, urllib.request
import duckdb
ROOT = pathlib.Path(__file__).resolve().parent.parent
XMIN, XMAX, YMIN, YMAX = 74.72, 74.90, 33.99, 34.20
tok = os.environ.get("HF_TOKEN") or sys.exit("Set HF_TOKEN (see docstring).")
meta = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://huggingface.co/api/datasets/foursquare/fsq-os-places", headers={"Authorization": f"Bearer {tok}"})))
release = sorted({f["rfilename"].split("/")[1] for f in meta["siblings"] if f["rfilename"].startswith("release/dt=")})[-1]
print("Foursquare release", release)
con = duckdb.connect()
for e in ("httpfs",): con.install_extension(e); con.load_extension(e)
con.sql(f"CREATE SECRET hf (TYPE huggingface, TOKEN '{tok}')")
src = f"hf://datasets/foursquare/fsq-os-places/release/{release}/places/parquet/*.parquet"
cols = {r[0] for r in con.sql(f"DESCRIBE SELECT * FROM '{src}'").fetchall()}
lat, lon = ("latitude", "longitude") if "latitude" in cols else ("lat", "lon")
out = ROOT / "data_raw" / "fsq_srinagar.parquet"
con.sql(f"""COPY (SELECT *, '{release}' AS fsq_release FROM '{src}'
  WHERE {lat} BETWEEN {YMIN} AND {YMAX} AND {lon} BETWEEN {XMIN} AND {XMAX}
  {"AND date_closed IS NULL" if "date_closed" in cols else ""}) TO '{out}' (FORMAT parquet)""")
print(con.sql(f"SELECT count(*) FROM '{out}'").fetchone()[0], "places ->", out)
