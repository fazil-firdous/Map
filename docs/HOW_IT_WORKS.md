# How Srinagar Bazaar works

## Ask the bazaar: how requests reach shopkeepers

A customer writes "32-inch LED TV in stock today". The server reads it (TV → Electronics), finds
matching shops within 2.5 km, and the request travels two ways.

**1. Shops on the app (claimed by their owner).** The request lands in the owner's **Requests**
inbox inside the app. The owner taps Reply, and the customer sees it in their Ask tab.
This costs nothing: it's our own server.

**2. Shops not on the app yet.** The customer sees a list of those shops with a **Message**
button. Tapping it opens **the customer's own WhatsApp** with the message already typed, to the
shop's number from our data. The customer presses send. The message comes from the customer's own
number, so **we pay nothing and need no WhatsApp approval**. This is a normal `wa.me` link.

So in version 1, no message is ever sent "by Srinagar Bazaar's number". That keeps cost at ₹0
and avoids spam rules.

**Later (once there's income): our own WhatsApp number.** Meta's WhatsApp Business Platform
(Cloud API) lets the app send requests *from a Srinagar Bazaar number* to shops that agreed to it:
- You need a phone number that isn't on regular WhatsApp (a new SIM is fine), a Meta Business
  account, business verification, and message templates approved by Meta.
- Shops must opt in, e.g. a "Send me customer requests on WhatsApp" switch in their dashboard.
- Meta charges per message the business starts (a "utility" template). In India that is
  roughly ₹0.1–₹0.9 per message depending on type; check Meta's current rate card.
  Replies inside a 24-hour customer-service window cost less or nothing.
- The shop's reply comes to our server (webhook) and is shown to the customer in the app.
Build this only when owners ask for it, or as part of the paid Pro plan.

## Owner tools (free now, paid later)

When an owner claims a shop with a code sent to the shop's listed phone, they get:
- **Visits, calls, WhatsApp taps, direction requests.** Shown only to the owner. The public never
  sees these numbers, and they're counted without knowing who the visitor is.
- **Today's status:** open now, closed today, opens late, busy. Lasts 14 hours, then clears.
- **Offers** (1 day, 3 days or 1 week, up to 3 at a time). Shown on the shop, on the map's Offers
  filter and on the home screen nearby.
- **Bazaar rates:** their own price list (e.g. "Shikara 1 hour: Rs 800").
- **Stock list:** paste lines like `iPhone 15 cover | Rs 300`. Shoppers searching for it find the shop.
- **Customer requests** inbox, **photos**, hours, WhatsApp, Instagram.

Only the owner can change these. Visitors can only *suggest* edits, which you approve in the admin page.

## Bazaar Champions

**What it is.** Anyone can add missing shops, fix wrong details, add photos and confirm shops.
Each approved contribution earns points, and the top people each month win prizes. This is how
the map grows from 10,000 shops to the 30,000–40,000 that really exist, without paying a field team.

| Action | Points | Rule that stops cheating |
|---|---|---|
| Add a missing shop | +10 | Only after you approve it in the admin page; duplicates within 150 m are refused |
| Add a photo | +3 | Only after approval |
| Fix wrong info | +2 | Only after approval |
| Confirm a shop ("Still here?") | +1 | Phone must be within 300 m of the shop; max 20 a day; once per shop per 90 days |

Two confirmations from different people mark a shop **Verified**. Fake entries can be rejected
and the account banned from the admin page.

**Prizes that cost you nothing.** Ask partner shops for prizes (a free wazwan meal, a ₹500 voucher,
a free haircut). In return the shop is shown as "This month's prize sponsor" on the Champions
screen and in your Instagram post. You get prizes, the shop gets promotion, and you spend ₹0.
Add a small cash prize (₹1,000–2,000) only if growth needs a push.

## Spend less

| Thing | How it's kept cheap |
|---|---|
| Map | Our own city map is built into the app: no Google Maps API bill. Directions open the free Google Maps app. |
| Search | A word list ("dawai" → chemists), not an AI service: ₹0 per search. |
| Messages | Ask uses the customer's own WhatsApp: ₹0. In-app replies: ₹0. |
| SMS | Only when someone claims a shop or verifies their number, about ₹0.2 each. |
| Server | One VPS, about ₹500–1,500 a month, with photos stored on the same disk. |
| Data | The city ships inside the app (2 MB); phones download only changes. Small bandwidth bill. |
| Field data | Bazaar Champions plus sponsored prizes instead of paid surveyors. |
| Marketing | QR stickers (₹2–5 each in bulk) on shop counters; micro-influencers paid in free Pro listings for shops they like. |

## Earn more

Keep searching free for everyone, and charge businesses. Turn on in this order:

1. **Pro listing** (from about month 2), ₹199–299 a month: photos at the top, more than 3 offers,
   30-day and 90-day stats instead of 7, a bigger stock list, and a "Verified owner" badge.
2. **Promoted slot**, ₹500–2,000 a month: the top place for a type in an area ("Bakeries near
   Rajbagh"), always labelled "Promoted".
3. **Tourism enquiries** in season (April–October), ₹50–200 per real enquiry, or 5–10% of a booking,
   from houseboats, shikara, taxis and tour operators.
4. **Wedding season** directory: wazwan cooks, decorators, photographers, tent houses, per enquiry.
5. **Festival campaigns** (Eid, winter sale): ₹1,000–5,000 to notify people near the shop.

## More features that bring users

1. **QR stickers** on shop counters: "Find us on Srinagar Bazaar". Scanning opens the shop's page;
   owners claim to get their sticker. This is free marketing in every bazaar.
2. **Invite a friend:** both get points when the friend adds their first shop.
3. **Push notifications** (Firebase, free): "Your request got 3 replies", "New offer near you", "Shop you saved is open now".
4. **Collections** for moments: "Eid shopping", "Open late in Ramadan", "Wedding season", "Winter: heaters and kangri".
5. **Recommended by locals:** "Recommend" taps from verified visitors, instead of star reviews.
6. **Home-screen widget:** "Chemists open now near me".
7. **Shop of the week** reel on your Instagram, made from owners' photos. Owners will share it.
8. **"Tell me when it's available"**: if nobody has the item, the customer is told when a shop adds it to its stock list.
