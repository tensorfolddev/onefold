#!/usr/bin/env bash
# restore-test.sh <stg|prod> [latest | backup name | path] — proves a backup really restores, touching nothing that's
# running: it goes into a throwaway Postgres, the installed release migrates it and loads every company from it, and
# the counts are printed. Monthly from cron (pings RESTORE_TEST_PING_URL when it passes); run it any time.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 1 ] || die "Usage: restore-test.sh <stg|prod> [latest | backup name | file.tar]"
need_env "$1"
fetch_backup "${2:-latest}"
NAME="$(basename "$BACKUP_FILE")"
WORK="$(mktemp -d)"
DB="onefold-restore-test-$$"
trap 'docker rm -f "$DB" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
tar -xf "$BACKUP_FILE" -C "$WORK"
[ -f "$WORK/db.dump" ] && [ -f "$WORK/data.tar.gz" ] || die "$NAME isn't a complete backup."
[ "$(backup_env "$WORK")" = "$ENV" ] || die "$NAME isn't a backup of $ENV."
FILES="$(tar -tzf "$WORK/data.tar.gz" | grep -c '^files/[^/]*/[^/]' || true)"

say "Restoring $NAME into a throwaway database"
docker run -d --rm --name "$DB" --memory 1g --cpus 1 \
  -e POSTGRES_USER=onefold_admin -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=onefold "$POSTGRES_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$DB" pg_isready -q -h 127.0.0.1 -U onefold_admin && break; sleep 1; done
run_sql() { docker exec -i "$DB" psql -U onefold_admin -d onefold -v ON_ERROR_STOP=1 -qtA "$@"; }
run_sql -c "create role onefold_app nologin" >/dev/null
docker exec -i "$DB" pg_restore -U onefold_admin -d onefold --exit-on-error --single-transaction <"$WORK/db.dump"

IMAGE="$(release IMAGE)"
if [ -n "$IMAGE" ]; then # the installed release must be able to upgrade and read this backup
  urls=(-e "DATABASE_ADMIN_URL=postgres://onefold_admin:restore-test@127.0.0.1:5432/onefold"
    -e "DATABASE_URL=postgres://onefold_check:restore-test-check@127.0.0.1:5432/onefold")
  docker run --rm --network "container:$DB" "${urls[@]}" "$IMAGE" node src/server/db/migrate.ts >/dev/null
  docker run --rm --network "container:$DB" "${urls[@]}" "$IMAGE" node src/server/db/upgradeCheck.ts verify
fi

counts="$(run_sql -F ' ' -c "select (select count(*) from orgs), (select count(*) from users),
  (select count(*) from tickets), (select count(*) from attachments), (select count(*) from drizzle.__drizzle_migrations)")" ||
  die "$NAME restored, but its tables can't be read — it's damaged or from an unknown version."
read -r orgs users tickets images migrations <<<"$counts"
[ "${migrations:-0}" -gt 0 ] || die "$NAME restored, but has no migration history."
say "OK — $NAME restores: $orgs companies, $users logins, $tickets tickets, $images images ($FILES files), $migrations migrations"
ping "$(setting RESTORE_TEST_PING_URL)"
