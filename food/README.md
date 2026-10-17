# Kezia's Food

Food ordering for Kulgam district. **One app** for everyone: customers order, and restaurant owners switch
to restaurant mode in the same app. Each restaurant **delivers with its own rider** and is **paid directly**
(UPI to the restaurant, or cash), so we need no payment gateway.

- `app/`: the Android app (Capacitor, plain JS, Kahwa Green design). `npm install`, then
  `KF_API=http://localhost:8090 npm run web && npm run serve` to try it in a browser, or `npm run sync` and
  `cd android && ./gradlew assembleRelease bundleRelease` for a signed build (needs `android/keystore.properties`
  and `keys/`, both kept out of git). `python3 scripts/make_logo.py && npm run assets` remakes the icons and splash.
- `server/`: the API (Fastify + Postgres): orders, the UPI payment flow, commission, admin page at `/admin/`.
  Deployed with the Srinagar Bazaar stack by `server/install.sh` at `kezia.<domain>`.
- `prototype/app.html`: early clickable UI prototype (customer flow, payment, live tracking, restaurant mode).
  `python prototype/build.py` packs it into one file: `prototype/dist/kulgam-eats-prototype.html`.
- `data/kulgam_restaurants.json`: food places around Kulgam, Devsar and Qazigund (Overture Maps), with phones.
- `data/build_basemap.py`: our own Kulgam map (roads + water from OpenStreetMap). The app routes on it, so
  road distance, delivery fee and rider tracking need no Google Maps key and work offline.

## Design decisions

- **Light theme only.** No dark UI for this app. Style options: `styles/style-A..D.png` (`python styles/make_styles.py && node styles/render.js`).
- **Kulgam district only.** No restaurants from Qazigund, Anantnag, Shopian or other districts. `data/kulgam_restaurants.json` is filtered to Kulgam district.

## Order rules (each restaurant can change the numbers)

| Step | Rule | Default |
|---|---|---|
| Place order | Minimum order value | ₹150 |
| Delivery fee | Fixed fee for the first km, then per extra km, by **road** distance | ₹30 up to 2 km, +₹10/km |
| Range | Restaurant delivers only within | 6 km |
| Accept | Restaurant must accept, or the order cancels itself (nothing paid yet) | 3 min |
| Pay (UPI) | Customer pays **after** acceptance, so nobody pays for an order a restaurant can't make | 10 min |
| Confirm payment | Restaurant checks its UPI app/SMS and taps Received / Not received. Customer can add the UPI ref (UTR) | target < 1 min; Help after 10 min |
| Cancel | Free before payment. After payment confirmation, free for a short window, then the kitchen starts | 2 min (max 5) |
| Refund | Cancelled after paying: the restaurant refunds the same UPI; the app tracks it | within 24 h |
| Cash | Cash on delivery only if the restaurant allows it | on |

## Payment without a gateway

- The app makes a **UPI QR with the exact amount and order number** from the restaurant's UPI ID
  (`upi://pay?pa=…&am=…&tn=ORDER`), and a "Pay with UPI app" button that opens GPay / PhonePe / Paytm.
- Restaurants should use a free **business UPI** (PhonePe Business, Paytm Business, BharatPe):
  UPI apps limit and warn on payments to personal UPI IDs.
- Our income doesn't touch customer payments: delivery fees go to the restaurant (they deliver), and we
  charge restaurants a monthly commission or plan by UPI. Add a gateway (Razorpay/Cashfree) later.

## Abuse protection (planned)

Phone OTP for every customer; cash orders only after one completed order or if the restaurant allows;
customers who don't pick up twice lose cash-on-delivery; restaurants that don't confirm payments or
refunds get hidden.
