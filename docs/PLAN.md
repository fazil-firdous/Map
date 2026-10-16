# Plan: Srinagar shops app

Status on 2026-10-16: the data is merged (10,055 businesses, 150 sights). Three working design
directions are in `proto/`. No production app exists yet.

## 1. Roadmap

| When | What | Done when |
|---|---|---|
| Weeks 1–2 | **Check the data on the ground.** Walk 3 markets (Lal Chowk/Residency Road, Maharaj Gunj, Hazratbal) and count every shop. Compare with the dataset. Unlock Foursquare (see `DATA.md`). Pick one of the three designs. | We know the real coverage per market, not a guess. |
| Weeks 3–10 | **Build the MVP (Android first).** Search that reads requests, shop page, map, add-a-shop, suggest-an-edit, claim-your-shop with OTP. Moderation screen for us. Backend on Supabase (Postgres + auth), the dataset loaded as the first rows. | 20 test users find what they ask for in 8 of 10 searches. |
| Weeks 8–12 | **Fill the gaps with people.** Pay 10–20 students ("bazaar champions") per verified new shop with a photo, phone and pin. Add Urdu labels. | 5,000 new or verified shops. |
| Month 4 | **Launch** on Play Store in Srinagar. Influencer push before tourist season (tulip garden opens late March). | 5,000 installs, 300 claimed shops. |
| Months 5–8 | **Start earning** (section 3). Add tourism features ahead of peak season, May–October. | Monthly revenue covers running costs. |
| Month 9+ | Other towns (Baramulla, Anantnag, Sopore, Gulmarg/Pahalgam for tourists), iPhone app, Kashmiri language. | |

Rule from day one: **every search that finds nothing is logged.** It's the list of shops we're missing.

## 2. Features beyond the prototypes

Ordered by value for Srinagar:

1. **Plain-language search** (in the prototypes). "I want to buy bread", "need dawai", "kong",
   "I want to visit Mughal gardens". English, Hindi-Urdu and Kashmiri words map to shop types.
   Nearest results come first. It's a word list, so there's no AI cost per search.
2. **Works offline.** The whole city's data is about 2 MB, so the phone can keep a copy. The app
   still works on slow mobile data or when mobile internet is cut, which happens in Kashmir.
3. **"Ask the bazaar".** Post "Who has a 32-inch LED TV in stock?". Matching shops nearby get it on
   WhatsApp and reply. Small shops without Instagram get customers this way, and they'd pay for it.
4. **Owner updates over WhatsApp.** The owner replies "closed today" or "new stock arrived" to our
   WhatsApp number, and the listing updates. No app needed for shopkeepers.
5. **Local opening hours.** Friday prayer break, Ramadan timings, winter hours during Chillai Kalan,
   "open after snowfall?". Big chain apps don't handle these.
6. **Visitor trust.** "GI-tagged pashmina" seller badge, a fair-price guide for shikara rides and
   shawls, and shops confirmed by several locals. Tourists worry about overpaying more than anything else.
7. **Walks.** "Old city craft walk" (Khanqah → Zaina Kadal copper and papier-mâché shops → Jamia
   Masjid) and "Boulevard evening" (Dal Lake → cafes → Nehru Park). Built from sights plus shops near them.
8. **"You might also like" suggestions**, as in the prototypes: pashmina leads to carpets and
   saffron, a chemist leads to clinics, a hotel leads to houseboats and taxis.
9. **"New this week"** feed of recently added shops. It rewards the people who add them.
10. Voice search in Urdu/Kashmiri, for older shoppers.

Not at the start: star ratings and reviews (fake reviews, fights). Use "Was this right? yes/no"
confirmations instead.

## 3. How you earn

Keep searching and listing **free forever**. Earn from shops and from tourism.

| Stream | Who pays | Rough price (to test) | When |
|---|---|---|---|
| **Pro listing**: photos, offers, product catalogue, call and view stats, "Verified owner" badge | Shop owners | ₹199–299 per month, or ₹1,999 per year | From launch, first 3 months free |
| **Promoted slot**: top 1–2 results for a type in an area ("Bakeries in Rajbagh"), always labelled "Promoted" | Shops | ₹500–2,000 per month per type and area | Once searches reach about 10k a month |
| **Tourism enquiries**: houseboats, shikara, taxis, tour packages, hotels | Operators | ₹50–200 per real enquiry, or 5–10% of a booking | First tourist season |
| **Wedding season**: wazwan cooks, decorators, photographers, tent houses | Vendors | Per enquiry, like tourism | Wedding season (mostly summer and autumn) |
| **Festival campaigns**: Eid, Ramadan, winter sale notifications to people in an area | Shops, local brands | ₹1,000–5,000 per campaign | After 10k active users |
| **Area reports**: how many shops of each type per area, gaps, new openings | Distributors, banks, FMCG brands | Per report | Year 2 |

Keep the data's licence in mind. Because OpenStreetMap data is merged in, selling the database
itself means it must be shared under ODbL. Selling **reports, ads and services** built on it is fine
with credit. See `DATA.md`.

Illustrative month, once running (not a forecast):
50 Pro shops × ₹249 = ₹12,450, plus 10 promoted slots × ₹1,000 = ₹10,000, plus 100 tourism
enquiries × ₹100 = ₹10,000. That's about ₹32,000 a month against running costs of roughly
₹6,000–12,000 (below), before marketing.

Also worth checking: J&K government startup schemes (JKEDI) and the Startup India Seed Fund.
Local tourism bodies may sponsor the "visit" section.

## 4. What it costs (estimates, October 2026; check current prices)

| Item | Cost |
|---|---|
| Google Play developer account | US$25 once |
| Server (small VPS, or Supabase free tier, then Pro at about US$25 a month) | ₹500–2,500 per month |
| Map tiles: self-host OSM-based tiles (Protomaps PMTiles) on the server or cheap storage. Don't use openstreetmap.org's own tile server in an app; its policy forbids that. | Close to ₹0 at this scale |
| OTP SMS for shop claims (Indian SMS needs DLT registration) | About ₹0.15–0.25 per SMS |
| Domain | About ₹800 per year |
| Bazaar champions (field data) | About ₹5–10 per verified new shop |
| Influencers | Varies widely. Start with 3–5 local micro-creators and pay per reel. |

Spend in this order: field data first, then the app, then influencers just before launch.
Influencers bring users once; good data keeps them.
