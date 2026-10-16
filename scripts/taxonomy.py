"""One category system for every source.

classify(raw, name) -> (group, category) or ("_excluded", reason).
`raw` is the source's own category text: Overture taxonomy ("clothing_store retail ..."),
OSM/AllThePlaces tags ("shop=clothes"), or Foursquare labels. First matching rule wins,
so order matters: name rules for Kashmir-specific trades come first, then exclusions,
then specific categories before broad ones.
"""
import re

# Shop names that pin down a Kashmiri trade better than any source category does.
NAME_RULES = [
    (r"house ?boat|boat ?house", "Stay & Travel", "Houseboat"),
    (r"shikara", "Stay & Travel", "Shikara & Boat Ride"),
    (r"pashmina|shawl|kani\b|sozni", "Kashmiri Crafts", "Shawls & Pashmina"),
    (r"carpet|\brugs?\b|namda|gabba", "Kashmiri Crafts", "Carpets & Rugs"),
    (r"papier|paper mache|walnut wood|handicraft|crewel|khatamband", "Kashmiri Crafts", "Handicrafts"),
    (r"saffron|dry ?fruits?|kesar", "Groceries", "Dry Fruits & Saffron"),
    (r"wazwan|waza\b|caterer", "Food & Drink", "Wazwan & Caterers"),
    (r"kandur|kaandur", "Food & Drink", "Bakery & Sweets"),
]

EXCLUDE = [
    (r"place_of_worship|religious|religion|mosque|shrine|temple|church|gurudwara|ziyarat", "religious place"),
    (r"government|community_and_government|town_hall|courthouse|police|fire_station|post_office|embassy|political|labor_union|public_service|office=ngo|non_governmental|charity|trusts\b|youth_organization|social_or_community|community_center|private_association|utility_provider|blood_and_plasma|sport_league", "government / non-profit"),
    (r"historic|monument|\bpark\b|^park|lake\b|mountain|bridge|nature_reserve|wildlife|botanical|public_plaza|stadium|cricket_ground|soccer_field|geographic|visitor_center|museum|library|river|national_park|amusement_park|public_fountain|military|jail|prison|sport_court", "landmark / public space"),
    (r"bus_station|train_station|\bairport\b|^airport|parking\b|amenity=atm|^atm\b", "transport / ATM"),
    (r"elementary_school|middle_school|high_school|public_school|private_school|religious_school|\bschool\b(?!.*(driving|language|art|dance|cooking|computer|music))|college_university|university|campus_building|educational_research|medical_school|nursing_school|educational_institution|office=educational", "school / college"),
]

RULES = [
    # Specific trades whose source tags would otherwise be caught by a broader group below.
    ("Health", "Optician", r"optician|eyewear|optometr|vision_or_eye|lasik|refractive"),
    ("Health", "Dentist", r"dent(al|ist)|orthodont|maxillofacial|prosthodont"),
    ("Health", "Doctor & Clinic", r"doctors_office|amenity=doctors|outpatient|surgery|womens_care|alcohol_and_drug"),
    ("Services", "Coaching & Training", r"tutoring|coaching|test_prep"),
    ("Services", "Events & Photography", r"photo|videograph|arts_and_entertainment"),
    # Food & Drink
    ("Food & Drink", "Bakery & Sweets", r"bakery|pastry|confection|sweet|candy|dessert|chocolat"),
    ("Food & Drink", "Cafe & Tea", r"cafe|coffee|tea_room|\btea\b|juice|smoothie|ice_cream"),
    ("Food & Drink", "Fast Food", r"fast_food|pizza|burger|chicken_restaurant|food_court|food_delivery|kebab"),
    ("Food & Drink", "Wazwan & Caterers", r"caterer|catering|banquet"),
    ("Food & Drink", "Restaurant", r"restaurant|eatery|dhaba|bar_and_grill|\bbar\b|pub\b|lounge|hookah|food_and_drink|\bfood\b|\bdhaba"),
    # Groceries
    ("Groceries", "Supermarket", r"supermarket|superstore|warehouse_club|hypermarket|department_store|shop=mall|discount_store"),
    ("Groceries", "Fruit, Veg & Meat", r"greengrocer|produce|fruit|vegetable|butcher|meat|seafood|poultry|fish"),
    ("Groceries", "Dry Fruits & Saffron", r"dry_fruit|nuts|spice"),
    ("Groceries", "Grocery & General Store", r"grocery|grocer|convenience|general_store|kirana|food_and_beverage_store|health_food|organic|dairy|beverage|wholesale_grocer|shop=food|water"),
    # Fashion
    ("Fashion", "Jewellery & Watches", r"jewel|watch|gold"),
    ("Fashion", "Shoes & Bags", r"shoe|footwear|\bbags?\b|shop=bag|luggage|leather"),
    ("Fashion", "Tailor & Boutique", r"tailor|boutique|sewing|alteration|bridal|fabric_store|shop=fabric|textile_?(store|shop)|linen"),
    ("Fashion", "Clothing", r"cloth|apparel|fashion|garment|uniform|lingerie|sportswear|traditional_clothing|t_shirt|accessories"),
    ("Fashion", "Cosmetics & Perfume", r"cosmetic|perfume|beauty_supply|skin_care|hair_supply"),
    # Kashmiri crafts
    ("Kashmiri Crafts", "Carpets & Rugs", r"carpet|\brugs?\b"),
    ("Kashmiri Crafts", "Handicrafts", r"arts_crafts|handicraft|craft=(handicraft|pottery|embroider|weaver|wood)|antique|art_gallery|souvenir|gift|flower|florist|shop=art\b"),
    # Stay & Travel
    ("Stay & Travel", "Houseboat", r"houseboat"),
    ("Stay & Travel", "Shikara & Boat Ride", r"boat"),
    ("Stay & Travel", "Hotel & Guesthouse", r"hotel|guest_house|guesthouse|lodg|resort|hostel|motel|inn\b|cottage|cabin|bed_and_breakfast|holiday_rental|service_apartment|tourism=apartment"),
    ("Stay & Travel", "Taxi & Car Rental", r"taxi|car_rental|bike_rental|rental_service"),
    ("Stay & Travel", "Travel Agent & Tours", r"travel|tour|sightseeing|airline|passport|visa"),
    # Health
    ("Health", "Pharmacy & Medical Store", r"pharm|chemist|medical_supply|surgical|vitamin"),
    ("Health", "Diagnostic Lab", r"laborator|diagnos|imaging|clinical_lab|testing"),
    
    ("Health", "Dentist", r"dent|orthodont|maxillofacial"),
    ("Health", "Hospital & Nursing Home", r"hospital|nursing_home"),
    ("Health", "Doctor & Clinic", r"clinic|doctor|health|medical|physio|therap|cardio|derma|neuro|gastro|ortho|pediatric|gyne|obstetric|fertility|audiolog|rheumat|naturopath|family_practice|home_health|\bcounseling|veterinar|animal_or_pet_service|wellness"),
    # Money
    ("Money", "Bank", r"bank|credit_union"),
    ("Money", "Finance & Insurance", r"financ|insurance|stock|broker|money_transfer|currency|bureau_de_change|payment|accountant"),
    # Electronics
    ("Electronics", "Mobile Phones", r"mobile|phone|telecom"),
    ("Electronics", "Computers & IT", r"computer|laptop|it_service|software|web_design|internet"),
    ("Electronics", "Electronics & Appliances", r"electronic|appliance|audio_visual|camera"),
    # Home & Hardware
    ("Home & Hardware", "Furniture & Furnishings", r"furniture|mattress|interior|furnishing|curtain|kitchen|home_goods|houseware|lighting|tile|bath"),
    ("Home & Hardware", "Hardware & Building", r"hardware|doityourself|build|construction|stonemason|paint|lumber|timber|granite|glass|metal|plumb|electrical|electrician|trade|home_improvement|sanitary|roofing|window|flooring|contractor|carpenter|hvac|solar|garden"),
    # Auto
    ("Automotive", "Fuel Station", r"fuel|gas_station|petrol"),
    ("Automotive", "Car & Bike Dealer", r"dealer|shop=car\b|shop=motorcycle|auto_company|auto_manufacturer"),
    ("Automotive", "Mechanic & Parts", r"car_repair|auto|car_parts|car_wash|tyre|tire_|motorcycle|battery|vehicle|detailing"),
    # Beauty & Fitness
    ("Beauty & Fitness", "Salon & Barber", r"hairdress|hair|barber|salon|beauty|makeup|spa\b|tattoo|laser_hair"),
    ("Beauty & Fitness", "Gym & Fitness", r"gym|fitness|yoga|sports_centre|sport_or_fitness|swimming|dance"),
    # Services
    ("Services", "Coaching & Training", r"tutoring|coaching|test_prep|educat|training|language_school|driving_school|art_school|cooking_school|specialty_school|vocational|career|preschool|day_care|childcare|kindergarten"),
    ("Services", "Events & Photography", r"wedding|event|photograph|videograph|studio|music_venue|theatre|cinema|movie"),
    ("Services", "Printing & Advertising", r"print|copyshop|sign_making|advertis|marketing|media|publish|graphic|radio|newspaper"),
    ("Services", "Real Estate", r"real_estate|estate_agent|property|home_developer"),
    ("Services", "Professional Services", r"lawyer|attorney|legal|consult|engineer|architect|professional|employment|office=|business_management|b2b"),
    ("Services", "Home Services & Repair", r"home_service|cleaning|laundry|dry_clean|laundromat|security|pest|janitorial|repair|handyman|funeral|astrolog"),
    # Shopping
    ("Shopping", "Books & Stationery", r"book|stationery|office_supply"),
    ("Shopping", "Toys, Sports & Hobbies", r"toy|sporting|sports|music|instrument|hobby|outdoor|hunting|bike_store|bicycle|\bpet|shop=pet|baby"),
    ("Shopping", "Shopping Centre & Market", r"shopping_mall|shopping_center|marketplace|^shopping|market"),
    ("Shopping", "Other Shop", r"shop=|store|retail|shopping"),
    ("Services", "Other Business", r"manufactur|industrial|company|exporter|wholesale|distributor|supplier|farm|agricultur|storage|freight|cargo|shipping|warehouse|commercial|corporate|machine_shop|enterprises|traders|industries"),
]

_name = [(re.compile(p, re.I), g, c) for p, g, c in NAME_RULES]
_excl = [(re.compile(p, re.I), r) for p, r in EXCLUDE]
_rules = [(g, c, re.compile(p, re.I)) for g, c, p in RULES]

# Used only when a place has no usable source category: guess from words in its name.
NAME_FALLBACK = [
    (r"\b(masjid|mosque|shrine|ziyarat|asthan|khanqah|imambara|mandir|temple|church|gurdwara|gurudwara)\b", "_excluded", "religious place"),
    (r"\b(school|college|university|institute of)\b", "_excluded", "school / college"),
    (r"medicate|medicos?\b|medical (hall|store|agency)|chemists?\b|pharma", "Health", "Pharmacy & Medical Store"),
    (r"\b(hotel|guest ?house|resort|inn|lodge|residency|homestay)\b", "Stay & Travel", "Hotel & Guesthouse"),
    (r"\b(travels?|tours?|holidays|trips?|tourism)\b", "Stay & Travel", "Travel Agent & Tours"),
    (r"\b(restaurant|dhaba|kitchen|biryani|grill|food)\b", "Food & Drink", "Restaurant"),
    (r"\b(cafe|caf\u00e9|coffee|chai|tea)\b", "Food & Drink", "Cafe & Tea"),
    (r"\b(bakers?|bakery|sweets|confectioner)", "Food & Drink", "Bakery & Sweets"),
    (r"\b(clinic|hospital|dr\.?|doctor|diagnostic|dental|physio)\b", "Health", "Doctor & Clinic"),
    (r"\b(salon|saloon|parlour|parlor|beauty|makeover)\b", "Beauty & Fitness", "Salon & Barber"),
    (r"\b(gym|fitness)\b", "Beauty & Fitness", "Gym & Fitness"),
    (r"\b(jewell?ers?|jewell?ery|gold)\b", "Fashion", "Jewellery & Watches"),
    (r"\b(boutique|tailors?|collections?|garments?|fashion|cloth|wear)\b", "Fashion", "Clothing"),
    (r"\b(mobiles?|telecom)\b", "Electronics", "Mobile Phones"),
    (r"\b(electronics?|computers?|laptops?)\b", "Electronics", "Electronics & Appliances"),
    (r"\b(motors|automobiles?|auto)\b", "Automotive", "Mechanic & Parts"),
    (r"\b(hardware|electricals?|sanitary|paints?|furniture|steel|cement)\b", "Home & Hardware", "Hardware & Building"),
    (r"\b(coaching|academy|classes|tuition|tutorials)\b", "Services", "Coaching & Training"),
    (r"\b(studio|photography|events?)\b", "Services", "Events & Photography"),
    (r"\b(store|stores|mart|shop|emporium|bazaar|general)\b", "Shopping", "Other Shop"),
    (r"\b(traders|enterprises|industries|agency|agencies|company|pvt|ltd|solutions)\b", "Services", "Other Business"),
]
_lodging = re.compile(r"hotel|lodg|guest_?house|resort|hostel|motel|tourism=")
_school = re.compile(r"\b(school|college|university|vidyalaya|madrasa|darul uloom)\b")
_not_school = re.compile(r"driving|coaching|tuition|beauty|dance|music|art\b|computer|cooking|language|makeup")
_fallback = [(re.compile(p, re.I), g, c) for p, g, c in NAME_FALLBACK]

def classify(raw: str, name: str = ""):
    raw = raw.lower() if isinstance(raw, str) else ""
    name = name.lower() if isinstance(name, str) else ""
    lodging = _lodging.search(raw) or name.startswith("oyo ")
    for rx, g, c in _name:
        # "OYO Shawl Guest House" is a hotel: name words don't override a lodging tag.
        if rx.search(name) and not (lodging and c not in ("Houseboat",)):
            return g, c
    for rx, reason in _excl:
        if rx.search(raw):
            return "_excluded", reason
    if _school.search(name) and not _not_school.search(name):
        return "_excluded", "school / college"
    for g, c, rx in _rules:
        if rx.search(raw):
            return g, c
    for rx, g, c in _fallback:
        if rx.search(name):
            return g, c
    return "Other", "Uncategorised"

GROUPS = list(dict.fromkeys([g for g, _, _ in RULES] + [g for _, g, _ in NAME_RULES] + ["Other"]))
