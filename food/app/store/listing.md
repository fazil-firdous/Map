# Kezia's Food: Play Console listing

Everything to paste into Play Console. Graphics are in this folder: `icon-512.png`, `feature-graphic-1024x500.png`,
`phone-1.png` … `phone-6.png` (1080×1920).

## Main store listing
- **App name:** Kezia's Food
- **Short description** (80 characters max):
  Order from Kulgam's restaurants. Pay them directly, watch your rider live.
- **Full description:**

Kezia's Food is Kulgam's own food app.

Order from the restaurants you love in Kulgam district, pay the restaurant directly, and watch your food come to your door on a live map.

🍕 KULGAM'S BEST KITCHENS
Pizza, wazwan, tandoori, Chinese, burgers, rolls, shakes and more, with real menus, sizes and prices.

📲 PAY THE RESTAURANT DIRECTLY
Scan the restaurant's UPI QR or tap GPay, PhonePe or Paytm, or pay cash on delivery where the restaurant offers it. Your money goes straight to the restaurant.

🛵 WATCH YOUR RIDER LIVE
Every restaurant delivers with its own rider. Follow your order from the kitchen to your door on the map.

✅ FAIR AND SIMPLE
See the delivery charge before you order. Cancel free before you pay, and for a short time after paying with a full refund.

🧑‍🍳 FOR RESTAURANTS
One app for restaurants too: new orders ring loudly, confirm payments, manage your menu and riders, and see your earnings.

Made in Kulgam, for Kulgam.

## Categorisation and contact
- **App category:** Food & Drink
- **Tags:** Food delivery, Restaurants
- **Contact email:** fazil.mastu@gmail.com
- **Website:** https://kezia.45-92-1-150.sslip.io/
- **Privacy policy:** https://kezia.45-92-1-150.sslip.io/privacy.html

## App content (Policy → App content)
- **App access:** "All or some functionality is restricted". Add the reviewer login:
  phone `9000000102`, code = `KEZIA_TEST_CODE` from the VPS `.env` (no SMS needed for this number).
  Instructions: "Enter the phone number, tap Send code, type the code. Browse 80 Degrees and place an order."
- **Ads:** No ads.
- **Content rating:** fill the questionnaire: category "Food & Drink / everything else", no violence, no user-generated
  public content, no gambling. Users can't chat with each other. Expected rating: Everyone / 3+.
- **Target audience:** 18 and over.
- **News app:** No. **COVID-19 app:** No. **Government app:** No. **Financial features:** None (payments happen in
  the customer's own UPI app, directly to the restaurant; the app doesn't process payments).
- **Data safety:**
  - Collected: **Name**, **Phone number** (account, app functionality), **Approximate and precise location**
    (delivery address; for riders, live position while delivering), **Purchase history** (orders).
  - Shared with third parties: order details are shared **with the restaurant you order from** (needed to deliver).
  - Data is encrypted in transit (HTTPS). Users can **request deletion** (in the app: Profile → Delete my account).
  - Not used for ads, not sold.
- **Permissions:** location (delivery address, rider tracking), notifications (order alerts).

## Release
1. **Testing → Internal testing → Create release**, upload `kezias-food-1.3.0.aab`, add yourself and helpers by
   Gmail. Live in minutes, no review wait.
2. **Testing → Closed testing**: same AAB, add at least **12 testers** (Gmail addresses) who opt in and use the app
   for **14 days in a row**. Required for new personal accounts before production.
3. After 14 days: **Apply for production** in the Dashboard, answer the questions, then **Production → Create
   release** with the latest AAB.
