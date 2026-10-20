#!/usr/bin/env bash
# restore-company.sh <stg|prod> <backup.zip> [--yes] — puts ONE company back as its own backup has it (a .zip from that
# company's Google Drive, sent to you), touching no other company. The whole environment is backed up first, so it
# can be undone with restore.sh. It shows what's in the backup and asks you to type the company's name.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 2 ] || die "Usage: restore-company.sh <stg|prod> <backup.zip> [--yes]"
need_env "$1"
[ -f "$2" ] || die "No file $2"
FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
[ -n "$(release IMAGE)" ] || die "No release is installed for $ENV — run deploy.sh first."
lock restore

compose up -d --wait postgres
"$HERE/backup.sh" "$ENV" before-company-restore || die "Couldn't back up $ENV first — nothing was changed."
say "Restoring one company in $ENV from $(basename "$FILE")"
compose run --rm -e FILES_DIR=/data/files -v "${PROJECT}_files:/data/files" -v "$FILE:/restore/backup.zip:ro" \
  migrate node src/server/backup/restore.ts /restore/backup.zip ${3:+"$3"}
