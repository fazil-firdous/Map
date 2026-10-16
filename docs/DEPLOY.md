# Putting Srinagar Bazaar on your VPS

One VPS runs everything: the database (PostgreSQL + PostGIS), the API, the photo store and HTTPS.
All shop data lives in **your** database. Nightly backups keep it safe.

## What to rent

| | Minimum | Comfortable |
|---|---|---|
| CPU / RAM | 2 vCPU / 2 GB | 2 vCPU / 4 GB |
| Disk | 40 GB SSD | 80 GB SSD (photos grow) |
| OS | Ubuntu 24.04 LTS | |
| Region | Mumbai or Bangalore (closest to Kashmir) | |

That's roughly ₹500–1,500 a month at most providers.

## 1. Domain (needed for HTTPS)

Android apps must talk to the server over HTTPS, and HTTPS needs a domain name.
- **Best:** buy `srinagarbazaar.in` (or similar) and add an **A record** `api` pointing to your VPS IP.
- **Free stop-gap:** use `api.<your-ip-with-dashes>.sslip.io`, e.g. `api.203-0-113-7.sslip.io`. It points to your IP automatically and gets a real certificate.

The app has `https://api.srinagarbazaar.in` built in. If you use another address, the app must be rebuilt with it (2 minutes, see "Rebuild the app").

## 2. Server setup (copy-paste, as root)

```bash
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

git clone https://github.com/fazil-mastu/map.git /opt/srinagar-bazaar
cd /opt/srinagar-bazaar
cp server/.env.example server/.env
nano server/.env      # fill in the values (below)
```

In `server/.env`:
```
API_DOMAIN=api.srinagarbazaar.in
DB_PASSWORD=<run: openssl rand -base64 36>
APP_SECRET=<run: openssl rand -base64 36>
ADMIN_TOKEN=<run: openssl rand -base64 36>
SMS_PROVIDER=console          # change to msg91 once your SMS template is approved
REVIEW_PHONE=<a test mobile number you own, for Google's reviewers>
REVIEW_CODE=<any 6 digits>
```

Start it and load the 10,055 shops (first time only):
```bash
docker compose -f server/docker-compose.yml --env-file server/.env up -d --build
docker compose -f server/docker-compose.yml --env-file server/.env exec api node scripts/seed.js
curl https://api.srinagarbazaar.in/v1/health        # → {"ok":true,...}
```

## 3. Backups (do this on day one)

```bash
crontab -e
# add this line: every night at 02:30
30 2 * * * /opt/srinagar-bazaar/server/scripts/backup.sh >> /var/log/sb-backup.log 2>&1
```
This keeps 14 days of database and photo backups in `server/backups/`. A VPS can still die,
so also copy them off the server: install `rclone`, connect a free Cloudflare R2 or Backblaze B2
bucket (`rclone config`), and set `BACKUP_REMOTE=r2:srinagar-bazaar-backups` in `.env`.

**Restore** (new server or after a mistake):
```bash
docker compose -f server/docker-compose.yml --env-file server/.env exec -T db \
  pg_restore -U bazaar -d bazaar --clean --if-exists < server/backups/db_YYYY-MM-DD_HHMM.dump
```

## 4. Daily running

- **Review queue:** `https://api.srinagarbazaar.in/admin/`, paste your `ADMIN_TOKEN`. Approve new shops, edits, photos and claims that need a call. 10 minutes a day at the start.
- **Logs:** `docker compose -f server/docker-compose.yml --env-file server/.env logs -f api`
- **Update the server after code changes:** `git pull && docker compose -f server/docker-compose.yml --env-file server/.env up -d --build`

## 5. SMS codes (before launch)

Indian SMS needs DLT registration. With MSG91 (or 2Factor):
1. Register as a business on a DLT portal (Jio, Airtel or Vodafone). This takes 1–3 days.
2. Register an OTP template, e.g. `Your Srinagar Bazaar code is {#var#}. Do not share it.`
3. Put `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` in `.env` and restart.

Until then, `SMS_PROVIDER=console` writes codes to the log, so you can verify owners by hand.
Cost is about ₹0.15–0.25 per code. It's only spent when someone claims a shop or verifies their number.

## Rebuild the app (if the API address changes)

On any computer with Node 20+, JDK 21 and the Android SDK:
```bash
cd mobile && npm ci
SB_API=https://YOUR-API SB_PUBLIC_API=https://YOUR-API npm run sync
npx capacitor-assets generate --android     # only if the logo changed
cd android && ./gradlew bundleRelease       # needs android/keystore.properties + your .jks
```
