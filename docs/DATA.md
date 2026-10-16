# Srinagar businesses dataset

One row per real business in the Srinagar bounding box (lon 74.72–74.90, lat 33.99–34.20),
merged from four open sources and cleaned. Built 2026-10-16.

| File | What it is |
|---|---|
| `data/srinagar_businesses.parquet` | The clean dataset, 10,055 businesses. Use this one. |
| `data/srinagar_businesses.csv` | Same rows for spreadsheets or a database import. List columns are joined with ` \| `. |
| `data/srinagar_excluded.parquet` | Every record dropped, with `drop_reason`, so nothing disappears silently. |
| `srinagar_places.parquet`, `osm_srinagar_places.parquet` | Raw source extracts (Overture, OSM). |

## Columns

| Column | Meaning |
|---|---|
| `place_id` | Stable ID, `SXR-` + 8 hex characters, derived from the best source record. |
| `name` | Shop name. Taken from AllThePlaces first, then OSM, then Overture (Overture's Facebook names are often long slogans). |
| `group`, `category` | Our own two-level categories (14 groups, 52 categories, listed below). |
| `brand` | Chain brand when known (KFC, HDFC Bank, Bata...). |
| `phone` | Best phone, normalised to `+91XXXXXXXXXX` (mobiles and 0194 landlines) or a bare toll-free number. |
| `phones_other` | Any further numbers. |
| `phone_is_chain` | True when `phone` is a head office or call centre number shared by many branches. Don't show it as "the shop's number". |
| `whatsapp`, `instagram`, `facebook`, `website` | Links sorted by type. Booking and listing sites (OYO, Justdial, Zomato...) are removed. |
| `email`, `address`, `pincode` | As given by the sources. Pincodes are kept only if valid (`19xxxx`). |
| `locality` | Nearest OSM neighbourhood name (Lal Chowk, Rajbagh, Karan Nagar...). Filled for 99.9% of rows. |
| `lat`, `lon` | Best location: AllThePlaces, then OSM, then Overture. |
| `location_precise` | False when Overture only knew the neighbourhood and put 3+ places on one identical point (about 10%). |
| `opening_hours` | OSM `opening_hours` syntax, when known. |
| `sources`, `source_count`, `source_ids` | Which sources list this business, and their record IDs for tracing back. |
| `overture_confidence` | Overture's 0–1 confidence that the place exists. |
| `quality_score` (0–100), `quality_tier` (A/B/C) | How complete and well-supported the record is (formula below). |
| `verification` | Always `unverified` for now. The app sets this when an owner or visitors confirm a shop. |

## Categories

- **Stay & Travel**: Hotel & Guesthouse, Houseboat, Shikara & Boat Ride, Taxi & Car Rental, Travel Agent & Tours
- **Health**: Doctor & Clinic, Hospital & Nursing Home, Pharmacy & Medical Store, Diagnostic Lab, Dentist, Optician
- **Services**: Coaching & Training, Professional Services, Printing & Advertising, Events & Photography, Real Estate, Home Services & Repair, Other Business
- **Food & Drink**: Restaurant, Cafe & Tea, Fast Food, Bakery & Sweets, Wazwan & Caterers
- **Fashion**: Clothing, Tailor & Boutique, Jewellery & Watches, Shoes & Bags, Cosmetics & Perfume
- **Home & Hardware**: Hardware & Building, Furniture & Furnishings
- **Automotive**: Car & Bike Dealer, Mechanic & Parts, Fuel Station
- **Shopping**: Shopping Centre & Market, Books & Stationery, Toys, Sports & Hobbies, Other Shop
- **Money**: Bank, Finance & Insurance
- **Electronics**: Mobile Phones, Computers & IT, Electronics & Appliances
- **Groceries**: Grocery & General Store, Supermarket, Fruit, Veg & Meat, Dry Fruits & Saffron
- **Beauty & Fitness**: Salon & Barber, Gym & Fitness
- **Kashmiri Crafts**: Shawls & Pashmina, Carpets & Rugs, Handicrafts
- **Other**: Uncategorised (294 rows with no usable category and no telling name)

Rules live in `scripts/taxonomy.py`. Names win over source tags for Kashmiri trades
(a "houseboat", "pashmina", "kandur", "wazwan" or "saffron" in the name decides the category).

## What was removed (2,715 source records)

| Reason | Records |
|---|---|
| School / college (private coaching and driving schools are kept) | 660 |
| ATM or transport stop (bank branches are kept) | 517 |
| Low confidence (< 0.3) and no phone, link or WhatsApp | 423 |
| Government office, police, utility, NGO | 415 |
| Mosque, shrine, temple, church | 272 |
| Park, monument, lake, bridge, stadium | 262 |
| No real name (empty, or only "Srinagar", "Kashmir", an area name) | 166 |

## How records are merged

Two records are the same business when either of these holds:

1. **Similar name, nearby.** The names match closely (Jaro-Winkler ≥ 0.90, or one contains the other). The distance limit is 120 m, raised to 600 m when one location is approximate, and cut to 40 m for chain names that appear at 3 or more places.
2. **Same phone.** They share a phone number that isn't a chain number, their names are fairly similar (≥ 0.75), and they are within 1 km of each other.

Matched groups are combined field by field. Result: 13,451 source records → 10,736 kept → **10,055 businesses**.
Of these, 464 are confirmed by two or more sources.

## Quality score

| Points | Condition |
|---|---|
| 25 | Listed by 2+ sources |
| 5 | Listed by 3+ sources |
| 20 | Precise location |
| 20 | Has the shop's own phone (5 if it only has a chain number) |
| 10 | Has a website, Instagram, Facebook or WhatsApp |
| 10 | Has an address or locality |
| 0–10 | Overture confidence × 10 (7 when Overture doesn't list it) |

Tier A is 75 or more (376 rows), B is 50–74 (5,639), C is below 50 (4,040).

## Sources and licences

| Source | Records in bbox | Licence | Notes |
|---|---|---|---|
| Overture Maps places, release 2026-09-23.1 | 10,592 | CDLA-Permissive-2.0 | 87% come from Facebook pages (Meta). Strong on contacts. |
| OpenStreetMap, openstreetmap.fr extract 2026-10-15 | 2,615 | **ODbL** | Volunteer-mapped. Precise pins, few contacts. |
| AllThePlaces, run 2026-10-10 | 244 | CC0 | Chain branches scraped from brand websites (banks, KFC, Bata...). |
| Foursquare OS Places | not yet | Apache-2.0 | Gated; see below. |

**ODbL matters.** Because OSM data is merged in, the combined database is an ODbL "derivative database".
If the app is used publicly you must credit "© OpenStreetMap contributors". If you publish
or distribute the database itself, you must offer it under ODbL as well. Showing it in an app
(a "produced work") only requires the credit. Keep OSM-derived rows traceable through `source_ids`
in case this needs revisiting.

## Why there isn't more data, and how to get more

The open map sources together hold about 10,000 Srinagar businesses. Based on how little the sources
overlap, the real number is likely 40,000 or more. The missing ones are mostly small shops with
no online presence, new shops, and Instagram-only sellers. Here is what's possible:

| Source | Status |
|---|---|
| Foursquare OS Places | Free, but gated since 2025. Make a Hugging Face account, accept the terms on the dataset page, create a read token, then run `HF_TOKEN=... python scripts/fetch_foursquare.py` and rerun the merge. It is picked up automatically. Probably adds a few thousand places. |
| Google Maps / Places API | Has the most data, but its terms forbid storing and re-publishing results. Not usable as a dataset source. |
| Justdial, IndiaMART, Zomato, Swiggy, Instagram | Scraping breaks their terms of service. Not used. |
| Udyam (MSME) and GST registrations | Only aggregate counts are public, not shop-level lists with locations. Useful for checking coverage, not for listings. |
| Overpass API (live OSM) | The servers were down on 2026-10-16. The extract above has the same data. |
| **People using the app** | The main way to reach the other 30,000. Add-a-shop, suggest-an-edit and owner claims (see the app prototype). |

## Rebuild

```
pip install -r requirements.txt
python scripts/extract_srinagar.py                    # Overture (latest release, found via STAC)
curl -O https://download.openstreetmap.fr/extracts/asia/india/jammu_and_kashmir.osm.pbf  # into data_raw/
python scripts/extract_osm.py data_raw/jammu_and_kashmir.osm.pbf
python scripts/fetch_alltheplaces.py
HF_TOKEN=... python scripts/fetch_foursquare.py       # optional
python scripts/merge_sources.py
python scripts/build_app_data.py                      # app/shops.json for the prototype
```
