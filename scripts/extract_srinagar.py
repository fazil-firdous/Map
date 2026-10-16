"""Pull Overture places for the Srinagar bbox into srinagar_places.parquet."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from overture import latest_release, connect, places_path

XMIN, XMAX, YMIN, YMAX = 74.72, 74.90, 33.99, 34.20
OUT = pathlib.Path(__file__).resolve().parent.parent / "srinagar_places.parquet"

release = latest_release()
print(f"Overture release: {release}")
con = connect()
con.sql(f"""
COPY (
  SELECT
    id,
    names.primary                AS name,
    taxonomy.primary             AS category,   -- 'categories' was replaced by 'taxonomy'
    basic_category,
    taxonomy.hierarchy           AS category_hierarchy,
    phones[1]                    AS phone,
    websites[1]                  AS website,
    socials[1]                   AS social,
    emails[1]                    AS email,
    phones                       AS phones_all,
    websites                     AS websites_all,
    socials                      AS socials_all,
    brand.names.primary          AS brand_name,
    brand.wikidata               AS brand_wikidata,
    addresses[1].freeform        AS address,
    addresses[1].locality        AS locality,
    addresses[1].postcode        AS postcode,
    operating_status,
    list_distinct([s.dataset FOR s IN sources]) AS source_datasets,
    ST_X(geometry)               AS lon,
    ST_Y(geometry)               AS lat,
    confidence,
    '{release}'                  AS overture_release
  FROM read_parquet('{places_path(release)}', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {XMIN} AND {XMAX}
    AND bbox.ymin BETWEEN {YMIN} AND {YMAX}
) TO '{OUT}' (FORMAT parquet, COMPRESSION zstd)
""")
n = con.sql(f"SELECT count(*) FROM '{OUT}'").fetchone()[0]
print(f"Saved {n} rows -> {OUT}")
