#!/usr/bin/env bash
# restore.sh <stg|prod> <latest | backup name | path to a .tar> [--yes] — puts an environment's data back to a backup:
# database, uploaded files, WhatsApp session. The current state is backed up first, so a restore can be undone too.
# The backup goes into a new database that replaces the old one only once it's complete; meanwhile the website and
# worker are stopped. They come back on the installed release, which applies any newer migrations on top.
# Settings (.env files) are left as they are — recover.sh brings those back on a new server. A backup of the other
# environment is refused unless ALLOW_OTHER_ENV=1.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 2 ] || die "Usage: restore.sh <stg|prod> <latest | backup name | file.tar> [--yes]"
need_env "$1"
[ -n "$(release IMAGE)" ] || die "No release is installed for $ENV — run deploy.sh first (recover.sh does both)."
lock restore
fetch_backup "$2"
NAME="$(basename "$BACKUP_FILE")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xf "$BACKUP_FILE" -C "$WORK"
[ -f "$WORK/db.dump" ] && [ -f "$WORK/data.tar.gz" ] || die "$NAME isn't a complete backup."
FROM="$(backup_env "$WORK")"
[ "$FROM" = "$ENV" ] || [ "${ALLOW_OTHER_ENV:-}" = 1 ] ||
  die "$NAME is a backup of ${FROM:-another environment}, not $ENV. (To copy its data into $ENV on purpose: ALLOW_OTHER_ENV=1.)"

if [ "${3:-}" != "--yes" ]; then
  printf 'This replaces ALL of %s data with %s.\nType %s to go on: ' "$ENV" "$NAME" "$ENV"
  read -r answer
  [ "$answer" = "$ENV" ] || die "Nothing was changed."
fi

psql_admin() { compose exec -T postgres psql -U onefold_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
has_data() { [ "$(compose exec -T postgres psql -U onefold_admin -d onefold -tAc "select to_regclass('public.orgs') is not null" 2>/dev/null)" = t ]; }
compose up -d --wait postgres
if has_data; then # even when it was stopped: what's there now gets its own backup first
  "$HERE/backup.sh" "$ENV" before-restore || die "Couldn't back up the current data first — nothing was changed."
fi

say "Restoring $ENV from $NAME"
compose stop web worker >/dev/null 2>&1 || true
compose run --rm migrate # on a new server: makes the database and its roles first

psql_admin -c "drop database if exists onefold_restore" -c "create database onefold_restore owner onefold_admin"
compose exec -T postgres pg_restore -U onefold_admin -d onefold_restore --exit-on-error --single-transaction <"$WORK/db.dump"
# Both renames in one transaction: either the restored database is "onefold", or nothing changed.
psql_admin --single-transaction \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'onefold' and pid <> pg_backend_pid()" \
  -c "alter database onefold rename to onefold_replaced" \
  -c "alter database onefold_restore rename to onefold"
psql_admin -c "drop database onefold_replaced"
compose run --rm migrate # migrations newer than the backup

docker run --rm -i -v "${PROJECT}_files:/data/files" -v "${PROJECT}_whatsapp:/data/whatsapp" "$TOOLS_IMAGE" \
  sh -c 'find /data/files /data/whatsapp -mindepth 1 -delete && tar -C /data -xzf -' <"$WORK/data.tar.gz"
compose up -d --wait --wait-timeout 180 web worker
say "$ENV is back to $NAME"
