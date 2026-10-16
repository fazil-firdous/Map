"""Shared helpers: latest Overture release discovery + DuckDB connection."""
import json, urllib.request
import duckdb

LEGACY_URL = "https://labs.overturemaps.org/data/releases.json"
STAC_URL = "https://stac.overturemaps.org/catalog.json"

def latest_release() -> str:
    # releases.json was retired (now an HTML "moved" page); try it, then fall back to STAC.
    try:
        with urllib.request.urlopen(LEGACY_URL, timeout=20) as r:
            return json.loads(r.read())["latest"]
    except Exception:
        with urllib.request.urlopen(STAC_URL, timeout=20) as r:
            return json.loads(r.read())["latest"]

def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    for ext in ("httpfs", "spatial"):
        con.install_extension(ext); con.load_extension(ext)
    # Overture's bucket is public: use an explicit anonymous secret so ambient
    # (proxy-injected) AWS_* env credentials aren't used to sign requests.
    con.sql("CREATE SECRET overture (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
    return con

def places_path(release: str) -> str:
    return f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
