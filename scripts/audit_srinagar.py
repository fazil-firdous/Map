"""Print a data-quality audit of srinagar_places.parquet."""
import pathlib
import duckdb

P = pathlib.Path(__file__).resolve().parent.parent / "srinagar_places.parquet"
con = duckdb.connect()
con.install_extension("spatial"); con.load_extension("spatial")
con.sql(f"CREATE VIEW p AS SELECT * FROM '{P}'")

def show(title, sql):
    print(f"\n=== {title} ===")
    con.sql(sql).show(max_rows=100, max_width=200)

total = con.sql("SELECT count(*) FROM p").fetchone()[0]
rel = con.sql("SELECT any_value(overture_release) FROM p").fetchone()[0]
print(f"Overture release {rel}\nTOTAL PLACES: {total:,}")

show("Top 30 categories (taxonomy.primary)", """
  SELECT coalesce(category,'(null)') AS category, count(*) AS n,
         round(100.0*count(*)/sum(count(*)) OVER (),2) AS pct
  FROM p GROUP BY 1 ORDER BY n DESC LIMIT 30""")

show("Coarse basic_category (top 20)", """
  SELECT coalesce(basic_category,'(null)') AS basic_category, count(*) AS n,
         round(100.0*count(*)/sum(count(*)) OVER (),2) AS pct
  FROM p GROUP BY 1 ORDER BY n DESC LIMIT 20""")

show("Field completeness", """
  SELECT round(100.0*avg((phone   IS NOT NULL)::INT),1) AS pct_phone,
         round(100.0*avg((website IS NOT NULL)::INT),1) AS pct_website,
         round(100.0*avg((social  IS NOT NULL)::INT),1) AS pct_social,
         round(100.0*avg((email   IS NOT NULL)::INT),1) AS pct_email,
         round(100.0*avg((address IS NOT NULL AND length(trim(address))>0)::INT),1) AS pct_any_address,
         round(100.0*avg((address IS NOT NULL AND trim(address)<>'' AND locality IS NOT NULL AND postcode IS NOT NULL)::INT),1) AS pct_full_address,
         round(100.0*avg((phone IS NULL AND website IS NULL AND social IS NULL)::INT),1) AS pct_no_contact
  FROM p""")

show("Completeness, corrected (blank strings, shared chain/toll-free numbers, social links in 'website' removed)", """
  WITH ph AS (SELECT phone, count(*) n FROM p WHERE trim(phone)<>'' GROUP BY 1)
  SELECT round(100.0*avg((ph.n IS NOT NULL AND ph.n < 5)::INT),1) AS pct_unique_phone,
         round(100.0*avg(coalesce(trim(website)<>'' AND website NOT SIMILAR TO
            '.*(facebook|instagram|youtube|wa\\.me|whatsapp|locate\\.jkb|jkbank|hdfc|axisbank|oyorooms|lalpathlabs).*', false)::INT),1) AS pct_own_website,
         round(100.0*avg(coalesce(length(trim(address)) >= 25, false)::INT),1) AS pct_address_25plus_chars
  FROM p LEFT JOIN ph USING (phone)""")

show("Social link platforms", """
  SELECT CASE WHEN social ILIKE '%facebook%' THEN 'facebook'
              WHEN social ILIKE '%instagram%' THEN 'instagram'
              WHEN social IS NULL THEN '(none)' ELSE 'other' END AS platform,
         count(*) n FROM p GROUP BY 1 ORDER BY n DESC""")

show("Confidence distribution", """
  SELECT CASE WHEN confidence >= 0.77 THEN 'high  (>=0.77)'
              WHEN confidence >= 0.50 THEN 'medium(0.50-0.77)'
              ELSE 'low   (<0.50)' END AS band,
         count(*) n, round(100.0*count(*)/sum(count(*)) OVER (),1) pct
  FROM p GROUP BY 1 ORDER BY 1""")
show("Confidence deciles", """
  SELECT floor(confidence*10)/10 AS bucket, count(*) n FROM p GROUP BY 1 ORDER BY 1""")

show("Sources / operating status", """
  SELECT array_to_string(source_datasets, '+') AS sources, coalesce(operating_status,'(null)') status,
         count(*) n FROM p GROUP BY 1,2 ORDER BY n DESC LIMIT 10""")

show("Stacked coordinates (>=3 places on the identical point = centroid-geocoded, not real location)", """
  WITH g AS (SELECT round(lon,5) x, round(lat,5) y, count(*) n FROM p GROUP BY 1,2)
  SELECT count(*) FILTER (WHERE n>=3) AS stacked_points, sum(n) FILTER (WHERE n>=3) AS places_on_them,
         round(100.0*sum(n) FILTER (WHERE n>=3)/sum(n),1) AS pct FROM g""")

# Likely duplicates: same normalised name within ~50 m.
con.sql("""
  CREATE TABLE pairs AS
  SELECT a.id id_a, b.id id_b, a.name, a.category cat_a, b.category cat_b,
         round(ST_Distance_Sphere(ST_Point(a.lon,a.lat), ST_Point(b.lon,b.lat)),1) AS dist_m
  FROM p a JOIN p b
    ON lower(trim(a.name)) = lower(trim(b.name)) AND a.id < b.id
   AND abs(a.lat-b.lat) < 0.0005 AND abs(a.lon-b.lon) < 0.0006
  WHERE a.name IS NOT NULL
    AND ST_Distance_Sphere(ST_Point(a.lon,a.lat), ST_Point(b.lon,b.lat)) <= 50""")
n_pairs, n_ids = con.sql("""SELECT count(*), (SELECT count(DISTINCT x) FROM
   (SELECT id_a x FROM pairs UNION SELECT id_b FROM pairs)) FROM pairs""").fetchone()
print(f"\n=== Likely duplicates (same name, <=50 m) ===\n{n_pairs:,} pairs involving {n_ids:,} places "
      f"({100*n_ids/total:.1f}% of all)")
show("Sample duplicate pairs", "SELECT * EXCLUDE (id_a,id_b) FROM pairs ORDER BY dist_m LIMIT 20")
show("Most repeated names in dup pairs", "SELECT name, count(*) pairs FROM pairs GROUP BY 1 ORDER BY 2 DESC LIMIT 10")

fz = con.sql("""
  SELECT count(*) FROM p a JOIN p b ON a.id<b.id AND abs(a.lat-b.lat)<0.0005 AND abs(a.lon-b.lon)<0.0006
  WHERE ST_Distance_Sphere(ST_Point(a.lon,a.lat),ST_Point(b.lon,b.lat))<=50
    AND jaro_winkler_similarity(lower(a.name),lower(b.name))>=0.92""").fetchone()[0]
print(f"\nFuzzy-name pairs (Jaro-Winkler >= 0.92, <=50 m): {fz} -- mostly bank vs its own ATM/CDM, i.e. not true duplicates")
