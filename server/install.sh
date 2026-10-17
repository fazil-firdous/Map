#!/usr/bin/env bash
# Srinagar Bazaar: one-time VPS setup (Ubuntu 22.04/24.04, run as root).
#   bash install.sh --domain api.45-92-1-150.sslip.io --review-phone 9XXXXXXXXX
# Safe to run again: it updates the code and keeps your existing passwords and data.
set -euo pipefail

DOMAIN=""; REVIEW_PHONE=""; BRANCH="ccr-cade9a1c-6u8263"; DIR=/opt/srinagar-bazaar
REPO="https://github.com/fazil-mastu/Map.git"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --review-phone) REVIEW_PHONE="$2"; shift 2 ;;
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
    echo "KEZIA_TEST_OWNER_PHONE=9000000101"
    echo "KEZIA_TEST_CUSTOMER_PHONE=9000000102"
    echo "KEZIA_TEST_CODE=$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom) % 1000000 )))"
    echo "KEZIA_PLATFORM_UPI="
  } >> "$ENV"
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
  Test restaurant owner login: $KEZIA_TEST_OWNER_PHONE, code $KEZIA_TEST_CODE
  Test customer login:         $KEZIA_TEST_CUSTOMER_PHONE, code $KEZIA_TEST_CODE
Keep these private. They are stored in $DIR/$ENV
SMS codes for other numbers appear in:  $COMPOSE logs api | grep OTP
EOF
