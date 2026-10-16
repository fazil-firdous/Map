"""Merge Overture + OSM + AllThePlaces (+ Foursquare if downloaded) into one clean dataset.

Inputs (from the other scripts):
  srinagar_places.parquet            Overture   (extract_srinagar.py)
  osm_srinagar_places.parquet        OSM        (extract_osm.py)
  data_raw/osm_localities.parquet    OSM neighbourhood names (extract_osm.py)
  data_raw/atp/atp_srinagar.json     AllThePlaces (fetch_alltheplaces.py)
  data_raw/fsq_srinagar.parquet      Foursquare, optional (fetch_foursquare.py, needs HF_TOKEN)
Outputs:
  data/srinagar_businesses.parquet + .csv   one row per real business
  data/srinagar_excluded.parquet            everything dropped, with the reason
"""
import hashlib, json, pathlib, re, sys
from urllib.parse import urlparse
import duckdb, pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from taxonomy import classify

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data"; OUT.mkdir(exist_ok=True)
con = duckdb.connect(); con.install_extension("spatial"); con.load_extension("spatial")

# ---------- normalisers ----------
def norm_phones(*vals):
    out = []
    for v in vals:
        if v is None: continue
        for p in (v if isinstance(v, (list, tuple)) else re.split(r"[;,/]| or ", str(v))):
            d = re.sub(r"\D", "", str(p or ""))
            if d.startswith("0091"): d = d[4:]
            elif len(d) == 12 and d.startswith("91"): d = d[2:]
            elif len(d) == 13 and d.startswith("091"): d = d[3:]
            elif len(d) == 11 and d.startswith("0") and not d.startswith("0180"): d = d[1:]
            if re.fullmatch(r"1[89]00\d{6,8}|1860\d{7}", d): n = d            # toll-free: no +91
            elif len(d) == 10 and d[0] in "6789": n = "+91" + d              # mobile
            elif len(d) == 10 and d[0] in "12345": n = "+91" + d             # landline (0194 = Srinagar)
            else: continue
            if n not in out: out.append(n)
    return out

AGGREGATORS = re.compile(r"oyorooms|justdial|zomato|swiggy|tripadvisor|booking\.com|makemytrip|goibibo|"
                         r"agoda|airbnb|google\.|goo\.gl|maps\.app|indiamart|sulekha|magicpin|linktr\.ee|bit\.ly")
def sort_urls(*vals):
    r = {"website": None, "facebook": None, "instagram": None, "whatsapp": None}
    for v in vals:
        for u in (v if isinstance(v, (list, tuple)) else [v]):
            if not u or not str(u).strip(): continue
            u = str(u).strip()
            if not re.match(r"https?://", u):
                if "." not in u: continue
                u = "https://" + u.lstrip("/")
            host = (urlparse(u).hostname or "").lower().removeprefix("www.").removeprefix("m.")
            if not host: continue
            if host.endswith(("facebook.com", "fb.com", "fb.me")): k = "facebook"
            elif host.endswith(("instagram.com", "instagr.am")): k = "instagram"
            elif host in ("wa.me", "api.whatsapp.com", "whatsapp.com", "chat.whatsapp.com"): k = "whatsapp"
            elif AGGREGATORS.search(host) or host.endswith(("youtube.com", "youtu.be", "twitter.com", "x.com", "linkedin.com")): continue
            else: k = "website"
            if r[k] is None: r[k] = u
    if r["whatsapp"]:
        w = norm_phones(re.sub(r"\D", "", r["whatsapp"].split("?")[0]))
        r["whatsapp"] = w[0] if w else None
    return r

PLACEWORDS = {"srinagar", "kashmir", "j", "k", "jk", "jammu", "and", "india", "ladakh", "valley", "city", "the", "of"}
def clean_name(n):
    if not isinstance(n, str) or not n.strip(): return None
    n = re.sub(r"\s+", " ", n.replace("\ufffd", "")).strip(" .,-|")
    n = re.sub(r"^(m/s\.?|m/s)\s*", "", n, flags=re.I)
    return n or None
def is_junk_name(n, localities):
    if not isinstance(n, str) or len(n) < 3 or not re.search(r"[A-Za-z؀-ۿऀ-ॿ]", n): return True
    words = set(re.findall(r"[a-z]+", n.lower()))
    return not (words - PLACEWORDS - localities)
def key(n): return re.sub(r"[^a-z0-9]+", "", n.lower()) if isinstance(n, str) else ""

# ---------- load each source into one shape ----------
rows = []
def add(src, sid, name, raw, lon, lat, phones, urls, email=None, address=None, postcode=None,
        hours=None, brand=None, conf=None, closed=False):
    rows.append(dict(source=src, source_id=f"{src}:{sid}", name=clean_name(name), raw=raw or "", lon=lon, lat=lat,
                     phones=norm_phones(*phones), **sort_urls(*urls), email=email or None,
                     address=(str(address).replace("\ufffd", "").strip() or None) if isinstance(address, str) else None, postcode=postcode or None,
                     opening_hours=hours or None, brand=brand or None, confidence=conf, closed=closed))

def lst(v):
    return list(v) if isinstance(v, (list, tuple)) or hasattr(v, "tolist") else None

ov = con.sql(f"SELECT * FROM '{ROOT/'srinagar_places.parquet'}'").df()
for r in ov.itertuples():
    add("overture", r.id, r.name, f"{r.category or ''} {r.basic_category or ''}", r.lon, r.lat,
        [lst(r.phones_all)],
        [lst(r.websites_all), lst(r.socials_all)],
        r.email, r.address, r.postcode, None, r.brand_name, r.confidence,
        closed=(r.operating_status or "") in ("permanently_closed", "temporarily_closed"))

osm = con.sql(f"SELECT * FROM '{ROOT/'osm_srinagar_places.parquet'}'").df()
for r in osm.itertuples():
    add("osm", r.osm_id, r.name, r.category, r.lon, r.lat, [r.phone, r.whatsapp], [r.website, r.social, r.instagram],
        r.email, r.address, r.postcode, r.opening_hours, r.brand)

atp_file = ROOT / "data_raw/atp/atp_srinagar.json"
if atp_file.exists():
    for f in json.load(open(atp_file))["features"]:
        p = f["props"]
        raw = " ".join(f"{k}={p[k]}" for k in ("shop", "amenity", "tourism", "healthcare", "leisure", "office") if k in p)
        name = p.get("name") or p.get("brand")
        if p.get("branch") and p.get("branch").lower() not in (name or "").lower(): name = f"{name} - {p['branch']}"
        add("alltheplaces", f"{p['_spider']}/{p.get('ref') or p.get('@source_uri') or (f['lon'], f['lat'])}", name, raw,
            f["lon"], f["lat"], [p.get("phone")], [p.get("website"), p.get("contact:facebook")], p.get("email"),
            p.get("addr:full") or p.get("addr:street_address"), p.get("addr:postcode"), p.get("opening_hours"), p.get("brand"))

fsq_file = ROOT / "data_raw/fsq_srinagar.parquet"
if fsq_file.exists():
    fsq = con.sql(f"SELECT * FROM '{fsq_file}'").df()
    g = lambda r, k: getattr(r, k, None)
    for r in fsq.itertuples():
        labels = g(r, "fsq_category_labels")
        raw = " ".join(map(str, labels)) if labels is not None else ""
        raw = re.sub(r"[ >]+", "_", raw.lower())
        fb = g(r, "facebook_id"); ig = g(r, "instagram")
        add("foursquare", g(r, "fsq_place_id"), g(r, "name"), raw, g(r, "longitude"), g(r, "latitude"),
            [g(r, "tel")], [g(r, "website"), f"https://facebook.com/{fb}" if fb else None,
                            f"https://instagram.com/{ig}" if ig else None],
            g(r, "email"), g(r, "address"), g(r, "postcode"), None, None, None,
            closed=g(r, "date_closed") is not None)

R = pd.DataFrame(rows)
R["rid"] = range(len(R))
print("Loaded:", R.source.value_counts().to_dict())

# ---------- record-level cleaning ----------
locs = con.sql(f"SELECT * FROM '{ROOT/'data_raw/osm_localities.parquet'}'").df()
loc_words = {w for n in locs.name for w in re.findall(r"[a-z]+", n.lower())}
cls = [classify(r.raw, r.name) for r in R.itertuples()]
R["group"], R["category"] = [c[0] for c in cls], [c[1] for c in cls]
R["drop_reason"] = None
R.loc[R.closed, "drop_reason"] = "marked closed"
R.loc[R.drop_reason.isna() & R.name.map(lambda n: is_junk_name(n, loc_words)), "drop_reason"] = "no real name"
R.loc[R.drop_reason.isna() & (R.group == "_excluded"), "drop_reason"] = R.category
# Stand-alone ATMs / cash machines ("J&K Bank - ATM"); keep "Bank and ATM" branches.
atm = R.name.fillna("").str.contains(r"\b(?:atm|cdm|crm|bna)\b", case=False, regex=True) & \
      ~R.name.fillna("").str.contains(r"(?:\band\b|&|\+)\s*atm|branch", case=False, regex=True)
R.loc[R.drop_reason.isna() & atm, "drop_reason"] = "transport / ATM"
# Overture puts places it can only place at neighbourhood level on one shared point.
st = R[R.source == "overture"].groupby([R.lon.round(5), R.lat.round(5)]).rid.transform("count")
R["approx"] = False; R.loc[st.index, "approx"] = st >= 3
# Phones used by many different names are chain call centres / toll-free numbers.
ph = R.explode("phones").dropna(subset=["phones"])
shared = set(ph.groupby("phones").name.nunique().loc[lambda s: s >= 4].index)
R["phones"] = R.phones.map(lambda ps: [p for p in ps if p not in shared] + [p for p in ps if p in shared])
R["chain_phone"] = R.phones.map(lambda ps: bool(ps) and ps[0] in shared)
R["k"] = R.name.map(key)

# Low-value Overture/Foursquare records: unlikely to exist and nothing to contact.
weak = (R.drop_reason.isna() & R.source.isin(["overture", "foursquare"]) & (R.confidence.fillna(1) < 0.3)
        & R.phones.map(len).eq(0) & R.website.isna() & R.instagram.isna() & R.whatsapp.isna())
R.loc[weak, "drop_reason"] = "low confidence, no contact details"

keep = R[R.drop_reason.isna()].copy()

# ---------- find the same business across (and within) sources ----------
# Shared chain/toll-free numbers must not glue different branches together.
# Chain names (same name at 3+ places) only merge when nearly on top of each other.
keep["common"] = keep.groupby("k").rid.transform("count").ge(3) & keep.k.ne("")
keep["own_phones"] = keep.phones.map(lambda ps: [p for p in ps if p not in shared])
con.register("k", keep[["rid", "source", "k", "lon", "lat", "approx", "common", "own_phones"]])
pairs = con.sql("""
  WITH a AS (SELECT * FROM k WHERE k <> '')
  SELECT x.rid r1, y.rid r2
  FROM a x JOIN a y ON x.rid < y.rid AND abs(x.lat - y.lat) < 0.006 AND abs(x.lon - y.lon) < 0.007
  WHERE (
      ST_Distance_Sphere(ST_Point(x.lon, x.lat), ST_Point(y.lon, y.lat))
        <= CASE WHEN x.common OR y.common THEN 40 WHEN x.approx OR y.approx THEN 600 ELSE 120 END
      AND (jaro_winkler_similarity(x.k, y.k) >= 0.90
           OR (least(length(x.k), length(y.k)) >= 6
               AND (contains(x.k, y.k) OR contains(y.k, x.k))
               AND least(length(x.k), length(y.k)) >= 0.5 * greatest(length(x.k), length(y.k)))))
    OR (len(list_intersect(x.own_phones, y.own_phones)) > 0
        AND jaro_winkler_similarity(x.k, y.k) >= 0.75
        AND ST_Distance_Sphere(ST_Point(x.lon, x.lat), ST_Point(y.lon, y.lat)) <= 1000)
""").fetchall()
parent = {r: r for r in keep.rid}
def find(a):
    while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
for a, b in pairs: parent[find(a)] = find(b)
keep["cluster"] = keep.rid.map(find)

# ---------- build one record per cluster ----------
NAME_PRI = {"alltheplaces": 0, "osm": 1, "foursquare": 2, "overture": 3}
LOC_PRI = {"alltheplaces": 0, "osm": 1, "foursquare": 2, "overture": 3}
def first(vals):
    return next((v for v in vals if v is not None and v == v and v != ""), None)

out = []
for cid, g in keep.groupby("cluster", sort=False):
    g_name = g.sort_values(by="source", key=lambda s: s.map(NAME_PRI))
    g_loc = g.assign(p=g.source.map(LOC_PRI) + g.approx * 10 - g.confidence.fillna(0)).sort_values("p")
    cats = g_name[g_name.category != "Uncategorised"]
    cat_row = (cats if len(cats) else g_name).iloc[0]
    # Overture usually has the richer category for the same place; prefer it unless it is generic.
    ovc = g[(g.source == "overture") & ~g.category.isin(["Uncategorised", "Other Shop", "Other Business", "Shopping Centre & Market"])]
    if len(ovc) and cat_row.category in ("Other Shop", "Other Business", "Uncategorised"): cat_row = ovc.iloc[0]
    phones = list(dict.fromkeys(p for ps in g.phones for p in ps))
    srcs = sorted(set(g.source), key=NAME_PRI.get)
    anchor = g_name.source_id.iloc[0]
    loc = g_loc.iloc[0]
    out.append(dict(
        place_id="SXR-" + hashlib.md5(anchor.encode()).hexdigest()[:8].upper(),
        name=g_name.name.iloc[0], group=cat_row.group, category=cat_row.category, brand=first(g.brand),
        phone=phones[0] if phones else None, phones_other=phones[1:], phone_is_chain=bool(phones) and phones[0] in shared,
        whatsapp=first(g.whatsapp), website=first(g_name.website), instagram=first(g.instagram), facebook=first(g.facebook),
        email=first(g.email), address=max((a for a in g.address if isinstance(a, str) and a), key=len, default=None),
        pincode=first(g.postcode.map(lambda p: p if p and re.fullmatch(r"19\d{4}", str(p).replace(" ", "")) else None)),
        lat=round(loc.lat, 6), lon=round(loc.lon, 6), location_precise=not bool(loc.approx),
        opening_hours=first(g.opening_hours), sources=srcs, source_count=len(srcs),
        source_ids=list(g.source_id), overture_confidence=g.confidence.max() if g.confidence.notna().any() else None,
    ))
B = pd.DataFrame(out)

# ---------- locality (nearest OSM neighbourhood/suburb name) ----------
con.register("b", B[["place_id", "lon", "lat"]]); con.register("l", locs)
loc = con.sql("""
  SELECT place_id, arg_min(name, d * CASE WHEN place IN ('suburb','neighbourhood','quarter') THEN 1 ELSE 1.6 END) locality
  FROM (SELECT b.place_id, l.name, l.place, ST_Distance_Sphere(ST_Point(b.lon,b.lat), ST_Point(l.lon,l.lat)) d
        FROM b JOIN l ON abs(b.lat-l.lat) < 0.03 AND abs(b.lon-l.lon) < 0.035)
  WHERE d <= 3000 GROUP BY 1""").df()
B = B.merge(loc, on="place_id", how="left")

# ---------- quality score (0-100) ----------
has = lambda c: B[c].notna()
B["quality_score"] = (
    25 * (B.source_count >= 2) + 5 * (B.source_count >= 3)
    + 20 * B.location_precise
    + 20 * (has("phone") & ~B.phone_is_chain) + 5 * B.phone_is_chain
    + 10 * (has("website") | has("instagram") | has("facebook") | has("whatsapp"))
    + 10 * (has("address") | has("locality"))
    + (B.overture_confidence.fillna(0.7) * 10)
).round().clip(0, 100).astype(int)
B["quality_tier"] = pd.cut(B.quality_score, [-1, 49, 74, 100], labels=["C", "B", "A"]).astype(str)
B["verification"] = "unverified"
B = B.sort_values(["group", "category", "quality_score", "name"], ascending=[True, True, False, True])
cols = ["place_id", "name", "group", "category", "brand", "phone", "phones_other", "phone_is_chain", "whatsapp",
        "website", "instagram", "facebook", "email", "address", "locality", "pincode", "lat", "lon",
        "location_precise", "opening_hours", "sources", "source_count", "source_ids", "overture_confidence",
        "quality_score", "quality_tier", "verification"]
B = B[cols]

con.register("B", B)
con.sql(f"COPY B TO '{OUT/'srinagar_businesses.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
flat = B.copy()
for c in ("phones_other", "sources", "source_ids"): flat[c] = flat[c].map(lambda v: " | ".join(v))
flat.to_csv(OUT / "srinagar_businesses.csv", index=False)
X = R[R.drop_reason.notna()][["source", "source_id", "name", "raw", "lon", "lat", "drop_reason"]]
con.register("X", X)
con.sql(f"COPY X TO '{OUT/'srinagar_excluded.parquet'}' (FORMAT parquet)")

# ---------- report ----------
print(f"\nInput records: {len(R):,}  dropped: {len(X):,}  kept: {len(keep):,}  -> merged businesses: {len(B):,}")
print("Dropped by reason:", X.drop_reason.value_counts().to_dict())
print("Cluster sizes:", keep.groupby("cluster").size().value_counts().sort_index().to_dict())
print("By source combination:", B.sources.map(" + ".join).value_counts().to_dict())
print("Tiers:", B.quality_tier.value_counts().to_dict())
print("With phone %.1f%% | own phone %.1f%% | whatsapp %.1f%% | instagram %.1f%% | website %.1f%% | locality %.1f%% | precise %.1f%%" % (
    100*B.phone.notna().mean(), 100*(B.phone.notna() & ~B.phone_is_chain).mean(), 100*B.whatsapp.notna().mean(),
    100*B.instagram.notna().mean(), 100*B.website.notna().mean(), 100*B.locality.notna().mean(), 100*B.location_precise.mean()))
print("\nBy group:\n" + B.groupby("group").size().sort_values(ascending=False).to_string())
