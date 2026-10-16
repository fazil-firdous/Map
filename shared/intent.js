/* Srinagar Bazaar: reads plain requests ("I want to buy bread", "need dawai", "visit Mughal gardens").
   One file shared by the app (browser global SBIntent) and the server (require). No dependencies. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SBIntent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ITEMS = [
    ["bread|tsot|tsochwor|girda|lavasa|kulcha|bakarkhani|cakes?|pastry|pastries|biscuits?|rusk|kandur|bakery|bakers?", ["Bakery & Sweets"]],
    ["sweets?|mithai|halwa|chocolates?|desserts?", ["Bakery & Sweets"]],
    ["medicines?|dawai|dawa|tablets?|syrup|pharmacy|chemist|bandage|masks?|inhaler|insulin", ["Pharmacy & Medical Store", "Doctor & Clinic"]],
    ["doctor|clinic|fever|checkup|check-up|physio|hospital", ["Doctor & Clinic", "Hospital & Nursing Home"]],
    ["blood test|test|x-?ray|scan|mri|ultrasound|lab", ["Diagnostic Lab"]],
    ["glasses|specs|spectacles|lens|lenses|chashma|eye", ["Optician"]],
    ["teeth|tooth|dentist|dant", ["Dentist"]],
    ["phone|mobile|charger|sim|recharge|earphones?|headphones?|screen guard|phone cover", ["Mobile Phones", "Electronics & Appliances"]],
    ["laptop|computer|printer|keyboard|mouse|pendrive", ["Computers & IT"]],
    ["tv|fridge|washing machine|heater|blower|geyser|electric blanket|iron|mixer|fan", ["Electronics & Appliances"]],
    ["kangri|kanger|papier|paper mache|walnut wood|handicrafts?|souvenirs?|gifts?|copper|samovar|crewel", ["Handicrafts"]],
    ["pashmina|shawls?|stoles?|kani|sozni", ["Shawls & Pashmina"]],
    ["carpets?|rugs?|namda|gabba|kaleen", ["Carpets & Rugs"]],
    ["pheran|phiran|suits?|kurta|salwar|jeans|shirts?|jackets?|clothes|dress|abaya|hijab|burqa|sweaters?|coat", ["Clothing", "Tailor & Boutique"]],
    ["shoes?|chappals?|sandals?|boots|bags?|purse|luggage|suitcase", ["Shoes & Bags"]],
    ["gold|jewell?ery|rings?|necklace|earrings?|watch|watches|bangles", ["Jewellery & Watches"]],
    ["saffron|kong|kesar|dry ?fruits?|almonds?|walnuts?|badam|akhrot|dates|kahwa|kehwa", ["Dry Fruits & Saffron", "Grocery & General Store"]],
    ["rice|atta|flour|oil|sugar|tea leaves|chai patti|milk|eggs?|grocery|groceries|ration|soap|salt|maggi|biscuit", ["Grocery & General Store", "Supermarket"]],
    ["vegetables?|sabzi|haakh|nadru|fruits?|apples?|meat|gosht|mutton|chicken|fish", ["Fruit, Veg & Meat", "Grocery & General Store"]],
    ["cement|paint|pipes?|tiles?|sanitary|taps?|hardware|tools?|nails|wire|bulbs?|switch", ["Hardware & Building"]],
    ["furniture|sofa|bed|mattress|curtains?|almirah|tables?|chairs?", ["Furniture & Furnishings"]],
    ["tyres?|tires?|puncture|mechanic|car parts|bike parts|battery|oil change|car service|bike service", ["Mechanic & Parts"]],
    ["petrol|diesel|fuel|cng", ["Fuel Station"]],
    ["car|bike|scooty|scooter|motorcycle", ["Car & Bike Dealer", "Mechanic & Parts"]],
    ["haircut|hair cut|hair|beard|shave|facial|makeup|salon|parlou?r|barber|mehndi", ["Salon & Barber"]],
    ["gym|workout|yoga|fitness", ["Gym & Fitness"]],
    ["books?|notebooks?|pens?|stationery|copies", ["Books & Stationery"]],
    ["toys?|cricket|bat|football|sports|cycle|bicycle", ["Toys, Sports & Hobbies"]],
    ["wazwan|rista|gushtaba|rogan josh|tabakh maaz|waza|catering|caterer", ["Wazwan & Caterers", "Restaurant"]],
    ["pizza|burger|momos?|shawarma|rolls?|fast food|kebab|fries", ["Fast Food"]],
    ["coffee|cafe|noon chai|chai|tea|ice ?cream|shakes?|juice", ["Cafe & Tea"]],
    ["biryani|food|lunch|dinner|breakfast|meal|restaurant|eat|hungry|khana", ["Restaurant", "Fast Food", "Wazwan & Caterers"]],
    ["houseboats?", ["Houseboat"]],
    ["shikara|boat ride|boating", ["Shikara & Boat Ride", "Houseboat"]],
    ["hotels?|rooms?|stay|guest ?house|lodge|homestay", ["Hotel & Guesthouse", "Houseboat"]],
    ["taxi|cab|car rental|driver|sumo", ["Taxi & Car Rental"]],
    ["tours?|trips?|package|gulmarg|pahalgam|sonamarg|ladakh|travel agent", ["Travel Agent & Tours"]],
    ["bank|cash|account|loan", ["Bank", "Finance & Insurance"]],
    ["photographer|photo|studio|wedding video", ["Events & Photography"]],
    ["printing|print|xerox|photocopy|flex|banner|visiting card", ["Printing & Advertising"]],
    ["coaching|tuition|classes|neet|jee|driving school", ["Coaching & Training"]],
    ["tailor|stitch|stitching|alteration|darzi", ["Tailor & Boutique"]],
    ["laundry|dry ?clean|wash clothes", ["Home Services & Repair"]],
    ["perfume|attar|cosmetics|lipstick", ["Cosmetics & Perfume"]],
  ];
  const VISIT = /\b(visit|see|sightseeing|explore|go to|places?|ghoom\w*|sair|tourist|famous|attractions?|sights?)\b/;
  const FILLER = /\b(i|we|me|my|want|wanna|would|like|to|need|needs|buy|purchase|get|find|looking|for|where|can|could|im|a|an|the|some|near|nearby|please|chahiye|kharidna|hai|kahan|milega|shop|shops|store|in|at|from|good|best|cheap|is|of|and|visit|see|go|places?|place|tourist|famous|sightseeing|explore|ghoom\w*|sair|sights?|attractions?)\b/g;
  const SIGHT_SYN = [
    [/mughal/, /nishat|shalimar|chesh|chashm|naseem|parimahal|pari mahal|mughal/],
    [/gardens?|bagh|parks?|tulip|flowers?/, /bagh|garden|park|tulip/, ["garden", "park", "attraction"]],
    [/lakes?|water|boat|shikara|dal/, /lake|\bsar\b|dal|boat/, ["lake", "water"]],
    [/shrines?|dargah|mosques?|masjid|temples?|mandir|ziyarat|pray|spiritual|khanqah/, /masjid|dargah|ziyarat|shrine|khanqah|mandir|temple|hazratbal|makhdoom/, ["shrine"]],
    [/history|historic|heritage|old city|fort|monuments?|palace/, /darwaza|fort|palace|tomb|kadal|ghanta|historic|heritage|burzahom|harwan/, ["historic", "museum"]],
    [/hills?|views?|sunset|hike|trek/, /hill|parbat|view|parimahal/, ["peak", "viewpoint"]],
    [/museums?|art|gallery/, /museum|gallery|art/, ["museum", "gallery"]],
    [/market|bazaar|shopping|emporium|crafts?/, /market|emporium|haat|bazar|chowk/, ["market"]],
  ];
  const RELATED = {
    "Shawls & Pashmina": ["Carpets & Rugs", "Handicrafts", "Dry Fruits & Saffron"], "Carpets & Rugs": ["Shawls & Pashmina", "Handicrafts"],
    "Handicrafts": ["Shawls & Pashmina", "Carpets & Rugs"], "Dry Fruits & Saffron": ["Shawls & Pashmina", "Handicrafts"],
    "Bakery & Sweets": ["Cafe & Tea"], "Pharmacy & Medical Store": ["Doctor & Clinic", "Diagnostic Lab"],
    "Mobile Phones": ["Electronics & Appliances", "Computers & IT"], "Hotel & Guesthouse": ["Houseboat", "Taxi & Car Rental"],
    "Houseboat": ["Shikara & Boat Ride", "Hotel & Guesthouse"], "Wazwan & Caterers": ["Restaurant", "Events & Photography"],
    "Restaurant": ["Cafe & Tea", "Bakery & Sweets"], "Clothing": ["Tailor & Boutique", "Shoes & Bags"],
    "Salon & Barber": ["Cosmetics & Perfume"], "Hardware & Building": ["Furniture & Furnishings"], "Cafe & Tea": ["Bakery & Sweets", "Restaurant"],
  };
  const PLURAL = { "Bakery & Sweets": "bakeries", "Pharmacy & Medical Store": "chemists", "Restaurant": "restaurants", "Cafe & Tea": "cafes",
    "Hotel & Guesthouse": "hotels", "Houseboat": "houseboats", "Shawls & Pashmina": "pashmina sellers", "Carpets & Rugs": "carpet sellers",
    "Mobile Phones": "mobile shops", "Salon & Barber": "salons", "Grocery & General Store": "general stores", "Wazwan & Caterers": "wazwan cooks" };

  const plural = c => PLURAL[c] || c.toLowerCase();
  const KM = (la1, lo1, la2, lo2) => Math.hypot((lo2 - lo1) * 92.2, (la2 - la1) * 111.2);
  const reEsc = w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** Parse a request. categories: list of category names that exist in the data. */
  function parse(q, categories) {
    const have = new Set(categories);
    const raw = String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
    const visit = VISIT.test(raw) && !/\b(buy|need|eat|food)\b/.test(raw);
    const item = raw.replace(FILLER, " ").replace(/\s+/g, " ").trim();
    const cats = [];
    for (const [w, cs] of ITEMS) {
      if (new RegExp(`\\b(${w})\\b`).test(item || raw)) cs.forEach(c => have.has(c) && !cats.includes(c) && cats.push(c));
    }
    const words = item.split(" ").filter(w => w.length >= 3);
    return { raw, item, words, cats, intent: visit || (!item && VISIT.test(raw)) ? "visit" : "buy" };
  }

  /** Rank shops for a parsed request. shops: rows [id,name,g,c,locality,...,lat(12),lon(13),...,score(17)]. */
  function rankShops(p, shops, C, at) {
    const nameRx = p.words.length ? new RegExp(p.words.map(reEsc).join("|")) : null;
    const hits = [];
    for (const s of shops) {
      let rel = 0;
      const ci = p.cats.indexOf(C[s[3]]);
      if (ci === 0) rel = 3; else if (ci > 0) rel = 2;
      if (nameRx && nameRx.test(String(s[1]).toLowerCase())) rel += p.cats.length ? 1 : 3;
      if (!rel && !p.cats.length && nameRx && nameRx.test((C[s[3]] + " " + (s[4] || "")).toLowerCase())) rel = 1;
      if (rel) hits.push({ s, d: KM(at[0], at[1], s[12], s[13]), rel });
    }
    hits.sort((x, y) => (y.rel >= 3 && y.d < 3) - (x.rel >= 3 && x.d < 3) || x.d - y.d || y.s[17] - x.s[17]);
    return hits;
  }

  /** Rank sights [name, kind, lat, lon, fame] for a visit request. */
  function rankSights(p, sights, at) {
    const out = [];
    for (const g of sights) {
      const nm = g[0].toLowerCase(); let m = 0;
      if (p.item) {
        for (const [ask, nameRx, kinds] of SIGHT_SYN) if (ask.test(p.item) && (nameRx.test(nm) || (kinds || []).includes(g[1]))) m += 3;
        for (const w of p.item.split(" ")) if (w.length >= 4 && nm.includes(w)) m += 4;
        if (!m) continue;
      } else if (g[4] < 1) continue;
      out.push({ g, d: KM(at[0], at[1], g[2], g[3]), m });
    }
    return out.sort((x, y) => y.m - x.m || y.g[4] - x.g[4] || x.d - y.d);
  }

  return { parse, rankShops, rankSights, RELATED, plural, KM };
});
