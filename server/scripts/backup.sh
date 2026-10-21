#!/usr/bin/env bash
# Nightly database + photo backup. Keeps 14 days on the VPS and (if BACKUP_REMOTE is set) copies off-site.
# Install with:  crontab -e   ->   30 2 * * * /opt/srinagar-bazaar/server/scripts/backup.sh >> /var/log/sb-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p backups
COMPOSE="docker compose -f docker-compose.yml --env-file .env"
$COMPOSE exec -T db pg_dump -U bazaar -d bazaar -Fc > "backups/db_$STAMP.dump"
$COMPOSE exec -T api tar -C /data -czf - uploads > "backups/uploads_$STAMP.tgz"
# Kezia's Food: its own database and photos (menus, covers)
$COMPOSE exec -T db pg_dump -U bazaar -d kezia -Fc > "backups/kezia_$STAMP.dump"
$COMPOSE exec -T kezia tar -C /data -czf - uploads > "backups/kezia_uploads_$STAMP.tgz"
# Check the dumps are readable before trusting them
$COMPOSE exec -T db pg_restore -l "/backups/db_$STAMP.dump" > /dev/null
$COMPOSE exec -T db pg_restore -l "/backups/kezia_$STAMP.dump" > /dev/null
find backups -name 'db_*.dump' -mtime +14 -delete
find backups -name 'uploads_*.tgz' -mtime +14 -delete
find backups -name 'kezia_*.dump' -mtime +30 -delete
find backups -name 'kezia_uploads_*.tgz' -mtime +30 -delete
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy backups "$BACKUP_REMOTE" --max-age 2d
fi
echo "$(date) backup ok: db_$STAMP.dump kezia_$STAMP.dump"
