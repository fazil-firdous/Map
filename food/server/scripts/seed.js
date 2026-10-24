// Platform settings (support number, Kezia's UPI ID). With SEED_TEST_RESTAURANT=1 (local tests only) it also adds the
// test restaurant (KF-TEST) with a menu and banners. Safe to run again: it doesn't duplicate anything.
const db = require("../src/db");

const MENU = [
  ["Pizza", [["Margherita Pizza", 199, true, "8 inch · cheese, tomato, oregano", "asset:pizza-1.jpg", true], ["Chicken Tikka Pizza", 269, false, "8 inch · tandoori chicken, onion, capsicum", "asset:pizza-2.jpg", true],
             ["BBQ Chicken Pizza", 349, false, "10 inch · smoky BBQ sauce, double cheese", "asset:pizza-2.jpg"]]],
  ["Wazwan", [["Rista (2 pcs)", 260, false, "Meatballs in red gravy", "asset:wazwan.jpg", true], ["Rogan Josh", 290, false, "Mutton in Kashmiri chilli gravy", "asset:wazwan.jpg"],
              ["Gushtaba (2 pcs)", 310, false, "Meatballs in yoghurt gravy", "asset:wazwan.jpg"], ["Wazwan Trami for 2", 1199, false, "Rista, rogan josh, tabak maaz, kebab, gushtaba, rice", "asset:wazwan.jpg"]]],
  ["Burgers & Rolls", [["Zinger Burger", 169, false, "Crispy chicken, lettuce, mayo", "asset:burger.jpg", true], ["Chicken Shawarma Roll", 139, false, "Garlic sauce, pickles", "asset:rolls.jpg"],
                       ["Veg Burger", 109, true, "Aloo tikki, cheese", "asset:burger.jpg"]]],
  ["Chinese", [["Chicken Chow Mein", 179, false, "Wok-tossed noodles", "asset:noodles.jpg"], ["Chicken Momos (8 pcs)", 159, false, "Steamed, red chutney", "asset:momos.jpg", true],
               ["Veg Momos (8 pcs)", 129, true, "Steamed, red chutney", "asset:momos.jpg"]]],
  ["Biryani", [["Chicken Biryani", 229, false, "With raita", "asset:biryani.jpg", true], ["Veg Biryani", 179, true, "With raita", "asset:biryani.jpg"]]],
  ["Sides & Drinks", [["Peri Peri Fries", 119, true, "Large", "asset:fries.jpg"], ["Cold Coffee", 129, true, "With ice cream", "asset:coffee.jpg"], ["Chocolate Cake Slice", 99, true, "", "asset:cake.jpg"]]],
];

async function testRestaurant() {
  await db.q(`INSERT INTO restaurants (id, name, phone, area, address, lat, lon, cuisines, photo, status, is_open, upi_id, upi_name, cod, prep_min)
    VALUES ('KF-TEST', 'Kezia''s Test Kitchen', $1, 'Kulgam town', 'Near Ghanta Ghar, Kulgam', 33.6463, 75.0193, 'Pizza · Wazwan · Chinese · Biryani', 'asset:pizza-2.jpg',
            'test', true, 'kezias.test@upi', 'Kezia''s Test Kitchen', true, 20)
    ON CONFLICT (id) DO NOTHING`, [process.env.TEST_OWNER_PHONE ? "+91" + process.env.TEST_OWNER_PHONE.replace(/\D/g, "").slice(-10) : null]);
  const has = await db.one("SELECT count(*)::int n FROM menu_sections WHERE restaurant_id = 'KF-TEST'");
  if (!has.n) {
    for (const [i, [section, items]] of MENU.entries()) {
      const s = await db.one("INSERT INTO menu_sections (restaurant_id, name, sort) VALUES ('KF-TEST', $1, $2) RETURNING id", [section, i]);
      for (const [j, [name, price, veg, desc, photo, best]] of items.entries())
        await db.q("INSERT INTO menu_items (restaurant_id, section_id, name, price, veg, description, photo, bestseller, sort) VALUES ('KF-TEST', $1, $2, $3, $4, $5, $6, $7, $8)",
          [s.id, name, price, veg, desc || null, photo, !!best, j]);
    }
  }
  const b = await db.one("SELECT count(*)::int n FROM banners WHERE restaurant_id = 'KF-TEST'");
  if (!b.n) {
    await db.q(`INSERT INTO banners (kicker, title, subtitle, photo, restaurant_id, sort) VALUES
      ('WAZWAN NIGHTS', 'Kezia''s Test Kitchen', 'Trami for 2 from ₹1,199', 'asset:wazwan.jpg', 'KF-TEST', 1),
      ('PIZZA TIME', 'Hot pizza in 30 min', 'From ₹199 · Kulgam town', 'asset:pizza-1.jpg', 'KF-TEST', 2)`);
  }
}

(async () => {
  if (process.env.SEED_TEST_RESTAURANT === "1") await testRestaurant();
  // Contact number shown in the app's Help: the owner's number unless one is already set
  const support = process.env.SUPPORT_PHONE || process.env.OWNER_PHONE;
  if (support) await db.q("UPDATE settings SET value = $1 WHERE key = 'support_phone' AND value = '\"\"'", [JSON.stringify("+91" + support.replace(/\D/g, "").slice(-10))]);
  if (process.env.KEZIA_PLATFORM_UPI) await db.q("UPDATE settings SET value = $1 WHERE key = 'platform_upi' AND value = '\"\"'", [JSON.stringify(process.env.KEZIA_PLATFORM_UPI)]);
  console.log("seed done");
  await db.pool.end();
})().catch(e => { console.error(e); process.exit(1); });
