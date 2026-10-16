"""Compare Overture vs OSM businesses for Srinagar; writes match table + prints report."""
import pathlib, duckdb
ROOT = pathlib.Path(__file__).resolve().parent.parent
con = duckdb.connect(); con.install_extension("spatial"); con.load_extension("spatial")

# Coarse shared groups so the two taxonomies can be compared.
GROUP = r"""CASE
  WHEN regexp_matches(c, '(grocery|convenience|supermarket|general|kirana|greengrocer|fruit|vegetable|dairy|butcher|meat|seafood|spice|dry_fruit|food_and_bev|frozen)') THEN 'grocery & daily food'
  WHEN regexp_matches(c, '(bakery|pastry|confection|sweet|candy|dessert)') THEN 'bakery & sweets'
  WHEN regexp_matches(c, '(restaurant|cafe|coffee|fast_food|food_court|ice_cream|tea|eatery|bar$|pub)') THEN 'restaurant & cafe'
  WHEN regexp_matches(c, '(hotel|guest_house|hostel|motel|resort|lodg|houseboat|bed_and_breakfast|apartment)') THEN 'hotel & lodging'
  WHEN regexp_matches(c, '(travel|tour|taxi|car_rental)') THEN 'travel & taxi'
  WHEN regexp_matches(c, '(bank|atm|credit_union|bureau_de_change|financ|insurance)') THEN 'bank & finance'
  WHEN regexp_matches(c, '(pharm|chemist|hospital|clinic|doctor|dentist|health|medical|diagnos|lab|optician|veterinar)') THEN 'health & pharmacy'
  WHEN regexp_matches(c, '(cloth|fashion|apparel|shoe|boutique|tailor|fabric|textile|jewel|bag)') THEN 'clothing, shoes & jewellery'
  WHEN regexp_matches(c, '(mobile|phone|electronic|computer|appliance)') THEN 'electronics & mobile'
  WHEN regexp_matches(c, '(hardware|furniture|paint|building|doityourself|home|garden|houseware|electrical|trade|plumb)') THEN 'hardware & home'
  WHEN regexp_matches(c, '(car|auto|motorcycle|tyre|fuel|gas_station|vehicle)') THEN 'automotive & fuel'
  WHEN regexp_matches(c, '(hairdress|beauty|salon|barber|cosmetic|(^| |_)spa)') THEN 'beauty & salon'
  WHEN regexp_matches(c, '(craft|carpet|handicraft|antique|gift|art|souvenir|shawl|wood|papier)') THEN 'crafts, carpets & gifts'
  WHEN regexp_matches(c, '(book|stationery|copyshop|print)') THEN 'books & stationery'
  WHEN regexp_matches(c, '(office|professional|lawyer|account|consult|estate_agent|ngo|company|government|it$)') THEN 'offices & services'
  ELSE 'other' END"""

con.sql(f"""CREATE TABLE ov AS SELECT id, name, coalesce(category,'') AS category, phone, website, lon, lat,
  (SELECT {GROUP} FROM (SELECT lower(coalesce(category,'')||' '||coalesce(basic_category,'')) c)) AS grp
  FROM '{ROOT/'srinagar_places.parquet'}'
  WHERE coalesce(category,'') NOT IN ('school','education','college_university','muslim_place_of_worship',
        'religious_organization','historic_site','park','landmark_and_historical_building','mosque')""")
con.sql(f"""CREATE TABLE osm AS SELECT *, (SELECT {GROUP} FROM (SELECT lower(category) c)) AS grp
  FROM '{ROOT/'osm_srinagar_places.parquet'}'""")

norm = lambda col: f"regexp_replace(lower(coalesce({col},'')), '[^a-z0-9]+', '', 'g')"
con.sql(f"""CREATE TABLE m AS
  SELECT o.osm_id, v.id AS ov_id, o.name osm_name, v.name ov_name, o.category osm_cat, v.category ov_cat,
         ST_Distance_Sphere(ST_Point(o.lon,o.lat), ST_Point(v.lon,v.lat)) AS dist_m,
         jaro_winkler_similarity({norm('o.name')}, {norm('v.name')}) AS sim
  FROM osm o JOIN ov v ON abs(o.lat-v.lat) < 0.001 AND abs(o.lon-v.lon) < 0.0012
  WHERE o.name IS NOT NULL AND v.name IS NOT NULL
    AND ST_Distance_Sphere(ST_Point(o.lon,o.lat), ST_Point(v.lon,v.lat)) <= 100
    AND (jaro_winkler_similarity({norm('o.name')}, {norm('v.name')}) >= 0.88
         OR (length({norm('o.name')}) >= 5 AND contains({norm('v.name')}, {norm('o.name')}))
         OR (length({norm('v.name')}) >= 5 AND contains({norm('o.name')}, {norm('v.name')})))
  QUALIFY row_number() OVER (PARTITION BY o.osm_id ORDER BY sim DESC, dist_m) = 1""")
con.sql(f"COPY m TO '{ROOT/'osm_overture_matches.parquet'}' (FORMAT parquet)")

def show(t, q): print(f"\n=== {t} ==="); con.sql(q).show(max_rows=60, max_width=200)
n_ov, n_osm = (con.sql(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("ov","osm"))
n_osm_named = con.sql("SELECT count(*) FROM osm WHERE name IS NOT NULL").fetchone()[0]
n_m = con.sql("SELECT count(*) FROM m").fetchone()[0]
n_ov_m = con.sql("SELECT count(DISTINCT ov_id) FROM m").fetchone()[0]
print(f"Overture businesses (non-business categories removed): {n_ov:,}")
print(f"OSM business POIs: {n_osm:,} ({n_osm_named:,} named, {100*n_osm_named/n_osm:.0f}%)")
print(f"Matched pairs (same place, <=100 m, similar name): {n_m:,}")
print(f"  -> {100*n_m/n_osm_named:.1f}% of named OSM POIs are also in Overture")
print(f"  -> {100*n_ov_m/n_ov:.1f}% of Overture businesses are also in OSM")
print(f"Union (dedup'd) ~ {n_ov + n_osm - n_m:,}  | OSM adds {n_osm - n_m:,} places Overture doesn't have")
lp = n_ov * n_osm_named / max(n_m, 1)
print(f"Lincoln-Petersen capture-recapture estimate of 'mappable' businesses: ~{lp:,.0f} "
      "(a LOWER bound: both sources favour the same visible, prominent places)")

show("OSM top 25 tags", "SELECT category, count(*) n, round(100.0*n/sum(n) OVER (),1) pct FROM osm GROUP BY 1 ORDER BY n DESC LIMIT 25")
show("Side by side by group", """
  WITH a AS (SELECT grp, count(*) ov FROM ov GROUP BY 1), b AS (SELECT grp, count(*) osm FROM osm GROUP BY 1),
       c AS (SELECT o.grp, count(*) both_ FROM m JOIN osm o USING (osm_id) GROUP BY 1)
  SELECT grp, coalesce(ov,0) overture, coalesce(osm,0) osm, coalesce(both_,0) in_both,
         round(coalesce(osm,0)::DOUBLE/nullif(ov,0),2) osm_per_overture
  FROM a FULL JOIN b USING (grp) LEFT JOIN c USING (grp) ORDER BY overture + osm DESC""")
show("Field completeness", """
  SELECT 'overture' src, round(100*avg((name IS NOT NULL)::INT),1) named, round(100*avg(coalesce(trim(phone)<>'',false)::INT),1) phone,
         round(100*avg(coalesce(trim(website)<>'',false)::INT),1) website, NULL opening_hours FROM ov
  UNION ALL
  SELECT 'osm', round(100*avg((name IS NOT NULL)::INT),1), round(100*avg((phone IS NOT NULL)::INT),1),
         round(100*avg((website IS NOT NULL)::INT),1), round(100*avg((opening_hours IS NOT NULL)::INT),1) FROM osm""")
show("Coverage by ~1 km grid cell (cells where one source has >=5 places)", """
  WITH g AS (SELECT 'ov' s, floor(lon/0.01) gx, floor(lat/0.009) gy FROM ov UNION ALL
             SELECT 'osm', floor(lon/0.01), floor(lat/0.009) FROM osm),
       c AS (SELECT gx, gy, count(*) FILTER (WHERE s='ov') ov, count(*) FILTER (WHERE s='osm') osm FROM g GROUP BY ALL)
  SELECT count(*) cells, count(*) FILTER (WHERE ov>=5 AND osm=0) ov_only, count(*) FILTER (WHERE osm>=5 AND ov=0) osm_only,
         count(*) FILTER (WHERE osm>ov) osm_denser FROM c WHERE ov>=5 OR osm>=5""")
show("Densest OSM-only places (OSM POIs with no Overture match, named, by group)", """
  SELECT o.grp, count(*) n, string_agg(o.name, ' | ' ORDER BY o.n_tags DESC)[:140] examples
  FROM osm o ANTI JOIN m USING (osm_id) WHERE o.name IS NOT NULL GROUP BY 1 ORDER BY n DESC""")
show("Sample matches", "SELECT osm_name, ov_name, osm_cat, ov_cat, round(dist_m) m, round(sim,2) sim FROM m USING SAMPLE 12 ROWS (reservoir, 3)")
