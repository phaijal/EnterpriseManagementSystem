#!/usr/bin/env bash
# Daily ERPNext / MariaDB backup (Docker Compose).
#
# Usage (from anywhere):
#   ./scripts/backup-erpnext-db.sh
#
# Requires: docker compose, db service running, gzip.
# Optional: .env in repo root with ERPNEXT_DB_ROOT_PASSWORD (defaults to admin).
# Optional: BACKUP_DIR=/path/to/folder (default: <repo>/backups). Example: BACKUP_DIR=/Volumes/External/erp-backups
#
# macOS/Linux cron example (14:00 / 2 PM daily):
#   0 14 * * * /full/path/to/EnterpriseManagementSystem/scripts/backup-erpnext-db.sh >> /full/path/to/EnterpriseManagementSystem/backups/cron.log 2>&1
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.erpnext.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PASSWORD="${ERPNEXT_DB_ROOT_PASSWORD:-admin}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_GZ="$BACKUP_DIR/erpnext-db-${STAMP}.sql.gz"

if [[ ! -f "$ROOT/$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE in $ROOT" >&2
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" exec -T db \
  mysqladmin ping -h localhost -uroot -p"$PASSWORD" --silent >/dev/null 2>&1; then
  echo "MariaDB (db service) is not reachable. Start Docker and: docker compose -f $COMPOSE_FILE up -d" >&2
  exit 1
fi

echo "Backing up to $OUT_GZ …"
docker compose -f "$COMPOSE_FILE" exec -T \
  -e "MYSQL_PWD=${PASSWORD}" \
  db mysqldump -uroot \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --all-databases \
  | gzip -c >"$OUT_GZ"

echo "Done ($(du -h "$OUT_GZ" | cut -f1))."

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'erpnext-db-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
