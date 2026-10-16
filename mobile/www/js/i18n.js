/* Interface text in English and Urdu (beta). Shop data stays as the shop wrote it.
   Urdu strings should be checked by a native speaker before wide release. */
(function () {
  const T = {
    en: {
      home: "Home", map: "Map", ask: "Ask", saved: "Saved", me: "Me",
      morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", lookingFor: "What are you looking for?",
      searchPh: "Search shops, things or places", buy: "Buy", eat: "Eat", visit: "Visit", stay: "Stay",
      popular: "Popular near you", seeAll: "See all", placesToVisit: "Places to visit", catsNear: "Categories near you",
      crafts: "Kashmiri crafts", craftsSub: "Pashmina, carpets, papier-mâché and saffron from local makers.",
      offersNear: "Offers near you", visiting: "Visiting?", addShop: "Add a shop",
      missingTitle: "Know a shop that isn't here?", missingSub: "Small shops, new shops and Instagram sellers are the ones maps miss. Adding one takes 30 seconds and earns you points.",
      call: "Call", whatsapp: "WhatsApp", directions: "Directions", save: "Save", savedT: "Saved", share: "Share",
      openNow: "Open now", closedToday: "Closed today", opensLate: "Opens late", busy: "Busy right now",
      offline: "Offline. Showing saved city data.", nearest: "Nearest", complete: "Most complete",
      within1: "Within 1 km", hasPhone: "Has phone", confirmed: "Confirmed", exact: "Exact location", offers: "Offers",
      yourArea: "Your area", useGps: "Use my current location", searchArea: "Search area",
      askTitle: "Ask the bazaar", askSub: "Tell nearby shops what you need. Shops on the app reply here; others you can message on WhatsApp in one tap.",
      askWhat: "What do you need?", send: "Send request", myRequests: "My requests",
      champions: "Bazaar Champions", tourist: "Visiting Srinagar", emergency: "Emergency numbers", language: "Language",
      myShops: "My shops", about: "About & privacy", verifyPhone: "Verify phone number",
    },
    ur: {
      home: "ہوم", map: "نقشہ", ask: "پوچھیں", saved: "محفوظ", me: "پروفائل",
      morning: "صبح بخیر", afternoon: "آداب", evening: "شام بخیر", lookingFor: "آپ کیا ڈھونڈ رہے ہیں؟",
      searchPh: "دکان، چیز یا جگہ تلاش کریں", buy: "خریدیں", eat: "کھائیں", visit: "گھومیں", stay: "ٹھہریں",
      popular: "آپ کے قریب مشہور", seeAll: "سب دیکھیں", placesToVisit: "دیکھنے کی جگہیں", catsNear: "آپ کے قریب زمرے",
      crafts: "کشمیری دستکاری", craftsSub: "پشمینہ، قالین، پیپر ماشی اور زعفران، مقامی کاریگروں سے۔",
      offersNear: "آپ کے قریب آفرز", visiting: "سیاح ہیں؟", addShop: "دکان شامل کریں",
      missingTitle: "کوئی دکان یہاں نہیں ہے؟", missingSub: "چھوٹی اور نئی دکانیں اکثر نقشوں میں نہیں ہوتیں۔ شامل کرنے میں تیس سیکنڈ لگتے ہیں۔",
      call: "کال", whatsapp: "واٹس ایپ", directions: "راستہ", save: "محفوظ کریں", savedT: "محفوظ", share: "شیئر",
      openNow: "ابھی کھلا ہے", closedToday: "آج بند ہے", opensLate: "دیر سے کھلے گا", busy: "ابھی مصروف",
      offline: "انٹرنیٹ نہیں۔ محفوظ شدہ معلومات دکھائی جا رہی ہیں۔", nearest: "قریب ترین", complete: "مکمل معلومات",
      within1: "ایک کلومیٹر کے اندر", hasPhone: "فون نمبر", confirmed: "تصدیق شدہ", exact: "صحیح مقام", offers: "آفرز",
      yourArea: "آپ کا علاقہ", useGps: "میرا موجودہ مقام", searchArea: "علاقہ تلاش کریں",
      askTitle: "بازار سے پوچھیں", askSub: "قریبی دکانوں کو بتائیں آپ کو کیا چاہیے۔",
      askWhat: "آپ کو کیا چاہیے؟", send: "بھیجیں", myRequests: "میری درخواستیں",
      champions: "بازار چیمپئنز", tourist: "سرینگر کی سیر", emergency: "ہنگامی نمبر", language: "زبان",
      myShops: "میری دکانیں", about: "تعارف اور رازداری", verifyPhone: "فون نمبر کی تصدیق",
    },
  };
  let lang = "en";
  try { lang = localStorage.getItem("sb_lang") || (navigator.language || "").startsWith("ur") && "ur" || "en"; } catch {}
  window.I18N = {
    get lang() { return lang; },
    set(l) { lang = T[l] ? l : "en"; try { localStorage.setItem("sb_lang", lang); } catch {} this.apply(); },
    apply() { document.documentElement.lang = lang; document.documentElement.dir = lang === "ur" ? "rtl" : "ltr"; },
    t(k) { return (T[lang] && T[lang][k]) || T.en[k] || k; },
  };
  window.I18N.apply();
})();
