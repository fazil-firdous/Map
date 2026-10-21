#!/usr/bin/env bash
# Srinagar Bazaar: one-time VPS setup (Ubuntu 22.04/24.04, run as root).
#   bash install.sh --domain api.45-92-1-150.sslip.io [--kezia-owner 9XXXXXXXXX] [--kezia-sms-key KEY]
#     [--kezia-review 9XXXXXXXXX]   demo login for Play Store reviewers (fixed code; its orders never reach a restaurant)
#     [--kezia-clean-start]         ONE TIME before going live: backup, then delete all orders, the test restaurant and test logins
# Safe to run again: it updates the code and keeps your existing passwords and data.
set -euo pipefail

DOMAIN=""; REVIEW_PHONE=""; KEZIA_OWNER=""; KEZIA_SMS_KEY=""; KEZIA_REVIEW=""; KEZIA_CLEAN=0; BRANCH="ccr-cade9a1c-6u8263"; DIR=/opt/srinagar-bazaar
REPO="https://github.com/fazil-mastu/Map.git"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --review-phone) REVIEW_PHONE="$2"; shift 2 ;;
    --kezia-owner) KEZIA_OWNER="$2"; shift 2 ;;
    --kezia-sms-key) KEZIA_SMS_KEY="$2"; shift 2 ;;
    --kezia-review) KEZIA_REVIEW="$2"; shift 2 ;;
    --kezia-clean-start) KEZIA_CLEAN=1; shift ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) echo "Unknown option $1"; exit 1 ;;
  esac
done
[ -n "$DOMAIN" ] || { echo "Usage: bash install.sh --domain api.example.com [--review-phone 9xxxxxxxxx]"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo -i)"; exit 1; }

echo "==> Installing Docker and tools"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
apt-get install -y -qq git openssl cron >/dev/null

echo "==> Getting the code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else git clone -q --branch "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR"

ENV=server/.env
if [ ! -f "$ENV" ]; then
  echo "==> Creating $ENV with new random passwords"
  rnd() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-40; }
  cat > "$ENV" <<EOF
API_DOMAIN=$DOMAIN
WEB_DOMAIN=$DOMAIN
DB_PASSWORD=$(rnd)
APP_SECRET=$(rnd)
ADMIN_TOKEN=$(rnd)
SMS_PROVIDER=console
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
TWOFACTOR_API_KEY=
BACKUP_REMOTE=
REVIEW_PHONE=$REVIEW_PHONE
REVIEW_CODE=$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom) % 1000000 )))
EOF
  chmod 600 "$ENV"
fi

# Kezia's Food settings (also added to older .env files). Its API lives at kezia.<your domain without "api.">.
if ! grep -q '^KEZIA_SECRET=' "$ENV"; then
  echo "==> Adding Kezia's Food settings to $ENV"
  rnd() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-40; }
  {
    echo "KEZIA_DOMAIN=${KEZIA_DOMAIN:-kezia.${DOMAIN#api.}}"
    echo "KEZIA_SECRET=$(rnd)"
    echo "KEZIA_ADMIN_TOKEN=$(rnd)"
    echo "KEZIA_PLATFORM_UPI="
  } >> "$ENV"
fi
# Live now: no test logins, and the owner logs in by SMS like everyone else.
sed -i '/^KEZIA_TEST_OWNER_PHONE=/d; /^KEZIA_TEST_CUSTOMER_PHONE=/d; /^KEZIA_TEST_CODE=/d; /^KEZIA_OWNER_CODE=/d' "$ENV"

# Kezia's Food owner: the admin account (sees everything). Kept only in .env.
if [ -n "$KEZIA_OWNER" ]; then
  sed -i '/^KEZIA_OWNER_PHONE=/d' "$ENV"
  echo "KEZIA_OWNER_PHONE=$KEZIA_OWNER" >> "$ENV"
fi

# Demo login for Play Store review
if [ -n "$KEZIA_REVIEW" ]; then
  sed -i '/^KEZIA_REVIEW_PHONE=/d' "$ENV"
  echo "KEZIA_REVIEW_PHONE=$KEZIA_REVIEW" >> "$ENV"
  grep -q '^KEZIA_REVIEW_CODE=' "$ENV" || echo "KEZIA_REVIEW_CODE=$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom) % 1000000 )))" >> "$ENV"
fi

# Kezia's Food login SMS through renflair (key kept only in .env)
if [ -n "$KEZIA_SMS_KEY" ]; then
  sed -i '/^KEZIA_SMS_PROVIDER=/d; /^KEZIA_RENFLAIR_API_KEY=/d' "$ENV"
  { echo "KEZIA_SMS_PROVIDER=renflair"; echo "KEZIA_RENFLAIR_API_KEY=$KEZIA_SMS_KEY"; } >> "$ENV"
fi

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

echo "==> Starting database, API and HTTPS (first build takes a few minutes)"
COMPOSE="docker compose -f server/docker-compose.yml --env-file $ENV"
$COMPOSE up -d --build

echo "==> Waiting for the API"
for i in $(seq 1 60); do $COMPOSE exec -T api wget -qO- http://localhost:8080/v1/health >/dev/null 2>&1 && break; sleep 3; done
$COMPOSE exec -T api node scripts/seed.js
for i in $(seq 1 40); do $COMPOSE exec -T kezia wget -qO- http://localhost:8090/v1/health >/dev/null 2>&1 && break; sleep 3; done
$COMPOSE exec -T kezia node scripts/seed.js
if [ "$KEZIA_CLEAN" = 1 ]; then
  echo "==> Clean start: backup first, then removing all orders, the test restaurant and test logins"
  chmod +x server/scripts/backup.sh && server/scripts/backup.sh
  $COMPOSE exec -T kezia node scripts/clean_start.js
fi
$COMPOSE exec -T kezia node scripts/import_restaurants.js

echo "==> Nightly backups at 02:30"
chmod +x server/scripts/backup.sh
( crontab -l 2>/dev/null | grep -v srinagar-bazaar; echo "30 2 * * * $DIR/server/scripts/backup.sh >> /var/log/sb-backup.log 2>&1 # srinagar-bazaar" ) | crontab -

echo "==> Checking HTTPS (the certificate can take a minute the first time)"
for i in $(seq 1 30); do curl -fsS "https://$DOMAIN/v1/health" >/dev/null 2>&1 && break; sleep 4; done
curl -fsS "https://$DOMAIN/v1/health" && echo

set -a; . "$ENV"; set +a
cat <<EOF

Srinagar Bazaar is running.
  API health:     https://$DOMAIN/v1/health
  Privacy policy: https://$DOMAIN/privacy.html
  Review page:    https://$DOMAIN/admin/
  Admin token:    $ADMIN_TOKEN
  Reviewer login: phone $REVIEW_PHONE, code $REVIEW_CODE

Kezia's Food is running.
  API health:     https://$KEZIA_DOMAIN/v1/health
  Admin page:     https://$KEZIA_DOMAIN/admin/   (token: $KEZIA_ADMIN_TOKEN)
  Privacy, terms: https://$KEZIA_DOMAIN/privacy.html  https://$KEZIA_DOMAIN/terms.html
  Owner login (sees everything): ${KEZIA_OWNER_PHONE:-not set, add --kezia-owner} (code by SMS)
  Play Store demo login: ${KEZIA_REVIEW_PHONE:-not set (add --kezia-review 9XXXXXXXXX when you submit to Play)}${KEZIA_REVIEW_CODE:+, code $KEZIA_REVIEW_CODE}
Keep these private. They are stored in $DIR/$ENV
Kezia login SMS: ${KEZIA_SMS_PROVIDER:-console (codes only in: $COMPOSE logs kezia | grep OTP)}
EOF
