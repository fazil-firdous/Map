# Publishing Srinagar Bazaar on Google Play

Everything to paste into Play Console, in the order Play Console asks for it.
Files referenced here are in this repository.

## 0. Before you start

| You need | Where |
|---|---|
| The release bundle `app-release.aab` | `mobile/android/app/build/outputs/bundle/release/` (sent to you separately) |
| The upload key `srinagar-bazaar-upload.jks` and its password | Sent to you separately. **Keep both safe and private. Never put them in git.** |
| A working API address (domain or `sslip.io`, see `docs/DEPLOY.md`) | The app has `https://api.45-92-1-150.sslip.io` built in. If you use a different address, tell me and I'll rebuild in a few minutes. |
| Privacy policy URL | `https://api.45-92-1-150.sslip.io/privacy.html` (the server hosts it) |
| Account deletion URL | `https://api.45-92-1-150.sslip.io/privacy.html#delete` |
| Support email | `fazil.mastu@gmail.com` |

**Using your friend's account, then transferring.** The app is first created in your friend's
Play Console, and Play then lists your friend as the developer. After it's live, start a transfer
from that account to yours: Play Console → **Settings → Developer account → App transfers**,
or Google's "Transfer apps" help page. You'll need your own account's **developer account ID**
(shown in your Play Console settings). Both accounts must be in good standing, and the app's
package name (`in.srinagarbazaar.app`) stays the same. Google changes this flow from time to
time, so follow the steps Play Console shows at the time. Also ask your friend to add you as an
**Admin user** on the app straight away, so you can manage it before the transfer completes.

## 1. Create the app

- **App name:** Srinagar Bazaar
- **Default language:** English (United Kingdom) or English (India)
- **App or game:** App · **Free or paid:** Free
- Tick the developer programme policy and US export law declarations.

## 2. Store listing

**Short description (74 of 80 characters)**
```
Find any shop in Srinagar, nearest first. Call or WhatsApp. Works offline.
```

**Full description**
```
Srinagar Bazaar is the directory of Srinagar's shops, made for Srinagar.

Search the way you talk. Type "I want to buy bread", "need dawai", "kong", "phone charger" or "I want to visit Mughal gardens" and see the nearest places first.

• 10,000+ shops, clinics, hotels, houseboats and services across Srinagar
• Call, WhatsApp or get directions in one tap
• Works offline: the whole city is saved on your phone, so it keeps working when mobile data is slow or down
• Map of the city with shops marked, even without internet
• Today's status from shop owners: open now, closed today, opens late
• Offers from shops near you
• Search shops' stock lists, like "iPhone 15 cover" or "Nike shoes size 9"
• Ask the bazaar: tell nearby shops what you need and they reply
• Visiting Srinagar? A one-day plan, houseboats confirmed by several sources, and emergency numbers
• Kashmiri crafts: pashmina, carpets, papier-mâché, walnut wood and saffron sellers
• English and Urdu

For shop owners: claim your shop free with a code sent to your shop's phone. Update today's status, post offers, add your prices and stock, reply to customer requests, and see how many people visited, called and asked for directions. Only you see your numbers.

Help map Srinagar: add a missing shop, fix wrong details or add a photo, and climb the Bazaar Champions leaderboard. Top champions win prizes every month.

Map data © OpenStreetMap contributors. Places from Overture Maps Foundation and AllThePlaces, plus shops added by the people of Srinagar.
```

**Graphics** (all in this repository)
- App icon 512×512: `brand/png/play-icon-512.png`
- Feature graphic 1024×500: `brand/png/play-feature-graphic-1024x500.png`
- Phone screenshots, 1080×1920, upload in this order: `store/screenshots/1_home.png` … `7_ask.png`

**Category and contact**
- App category: **Travel & Local**
- Tags: Local, Shopping, Travel guide
- Email: `fazil.mastu@gmail.com` · Website: leave empty for now

## 3. App content (Policy → App content)

**Privacy policy:** `https://api.45-92-1-150.sslip.io/privacy.html`

**Ads:** No, the app doesn't contain ads.

**App access:** "All or some functionality is restricted." Add these instructions:
```
Everything except the shop-owner dashboard works without signing in.
To test the owner dashboard: open the Me tab → "Verify phone number" → enter
<REVIEW_PHONE> and code <REVIEW_CODE>. Then in the Me tab tap "Demo Shop (for app review)"
to open the owner dashboard (status, offers, prices, stock, customer requests, visit stats).
```
Choose `REVIEW_PHONE` (any 10-digit mobile number you control that no customer uses) and
`REVIEW_CODE` (6 digits), and put both in `server/.env`. The number is linked only to a hidden
demo shop that the public never sees, and no SMS is sent to it.

**Content rating:** run the questionnaire.
- Category: **All other app types**
- Violence, sexuality, language, controlled substances, gambling: **No** to all
- Users can interact or exchange information: **Yes** (shop owners reply to requests; users add shop details)
- Shares the user's location with other users: **No**
- Digital purchases: **No**
- Expected result: rated for everyone (3+ / Everyone) with "Users Interact".

**Target audience:** 13–15, 16–17 and 18+. Don't include under 13: that avoids the Families programme.

**News app:** No · **Government app:** No · **Financial features:** none · **Health:** none

**Data safety:** answer like this.

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes, it collects data |
| Is all collected data encrypted in transit? | Yes (HTTPS) |
| Can users ask for their data to be deleted? | Yes. URL: `https://api.45-92-1-150.sslip.io/privacy.html#delete` |
| Is data shared with third parties? | No (the SMS provider only delivers codes for us, which counts as a service provider, not sharing) |

Data types collected (none of them are shared or sold):

| Data type | Collected | Optional? | Purpose |
|---|---|---|---|
| Location: approximate | Yes | Optional | App functionality |
| Location: precise | Yes | Optional | App functionality (adding or confirming a shop, sorting by distance) |
| Personal info: name | Yes | Optional | App functionality (leaderboard) |
| Personal info: phone number | Yes | Optional | Account management, app functionality (claims, Ask replies) |
| Photos | Yes | Optional | App functionality (shop photos users upload) |
| App activity: other user-generated content | Yes | Optional | App functionality (shops, edits, requests) |
| App activity: app interactions | Yes | Required | Analytics (view and call counts shown to shop owners) |
| Device or other IDs | Yes | Required | App functionality, account management (random app ID) |

**Account deletion:** in-app path is Me → About & privacy → Delete my data. Web URL as above.

## 4. Release

1. **Testing → Internal testing → Create release.** Upload `app-release.aab`. When Play asks about
   app signing, choose **"Let Google manage and protect your app signing key"** (Play App Signing).
   Your `.jks` file is then only the *upload* key, and Google can reset it if it's ever lost.
2. Add 5–10 testers (Gmail addresses), install from the test link, and check on 2–3 real phones.
3. **Production → Create release.** Promote the same build. Release name: `1.0.1 (2)`.
   Release notes:
   ```
   First release: every shop in Srinagar, nearest first. Works offline.
   ```
4. Countries: **India** (add more later).
5. Send for review. First reviews usually take from a few hours to a few days.

Older personal accounts can usually publish straight to production. New personal accounts must
first run a closed test with 12 testers for 14 days, so using your friend's older account avoids that.

## 5. Every later update

1. Raise `versionCode` (1 → 2 → 3 …) and `versionName` in `mobile/android/app/build.gradle`.
2. `cd mobile && SB_API=https://api.45-92-1-150.sslip.io SB_PUBLIC_API=https://api.45-92-1-150.sslip.io npm run sync`
3. `cd android && ./gradlew bundleRelease` (needs `android/keystore.properties` pointing to your `.jks`)
4. Upload the new `.aab` in Play Console.

The shop data does **not** need an app update: phones download changes from your server on their own.
