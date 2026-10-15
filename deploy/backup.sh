#!/usr/bin/env bash
# backup.sh <stg|prod> [label] — one backup of an environment as a single .tar: its database (pg_dump), its uploaded
# files and WhatsApp session, and its settings. Sent encrypted (an rclone crypt remote, BACKUP_REMOTE in .env) to
# that environment's Google Drive folder. Hourly from cron, and before every release (labelled before-<commit>).
# Keeps 48 hourly and 30 daily on Drive, the newest 3 here. Each success pings BACKUP_PING_URL (healthchecks.io
# emails you when a ping is missed); a failure pings BACKUP_PING_URL/fail.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 1 ] || die "Usage: backup.sh <stg|prod> [label]"
need_env "$1"
LABEL="${2:-}"
[[ "$LABEL" =~ ^[a-z0-9-]*$ ]] || die "A label is lowercase letters, digits and dashes."
PING_URL="$(setting BACKUP_PING_URL)"
REMOTE="$(setting BACKUP_REMOTE)"
KEEP_HOURLY=48
KEEP_DAILY=30
KEEP_LOCAL=3

if ! db_running; then
  say "$ENV isn't running — no backup"
  exit 0
fi
lock backup
WORK="$(mktemp -d)"
# Whatever stops it (an error, a refusal), a failed backup pings BACKUP_PING_URL/fail — healthchecks.io emails you.
trap 'code=$?; rm -rf "$WORK"; [ "$code" = 0 ] || ping "$PING_URL" /fail' EXIT
[ -z "$REMOTE" ] || require_crypt "$REMOTE"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="onefold-$ENV-$STAMP${LABEL:+-$LABEL}.tar"
backups_dir
mkdir -p "$WORK/config"

compose exec -T postgres pg_dump -U onefold_admin -d onefold --format=custom >"$WORK/db.dump"
# The files are live (the WhatsApp session changes all the time): "a file changed while it was read" is fine (exit 1).
docker run --rm -v "${PROJECT}_files:/data/files:ro" -v "${PROJECT}_whatsapp:/data/whatsapp:ro" "$TOOLS_IMAGE" \
  sh -c 'tar -C /data -czf - files whatsapp; [ $? -le 1 ]' >"$WORK/data.tar.gz"
cp "$ENV_DIR/.env" "$ENV_DIR/app.env" "$WORK/config/"
[ ! -f "$ENV_DIR/release.env" ] || cp "$ENV_DIR/release.env" "$WORK/config/"
printf 'environment=%s\ncreated=%s\nlabel=%s\ncommit=%s\n' "$ENV" "$STAMP" "$LABEL" "$(release COMMIT)" >"$WORK/BACKUP"
(umask 077 && tar -C "$WORK" -cf "$ENV_DIR/backups/$NAME.part" . && mv "$ENV_DIR/backups/$NAME.part" "$ENV_DIR/backups/$NAME")
ls -1 "$ENV_DIR/backups" | backup_names | all_but_last "$KEEP_LOCAL" | while read -r f; do rm -f "$ENV_DIR/backups/$f"; done

if [ -z "$REMOTE" ]; then
  say "Backed up $NAME on this server only — set BACKUP_REMOTE in $ENV_DIR/.env to send backups to Google Drive"
else
  rclone copyto "/backups/$NAME" "$(at "$REMOTE" "hourly/$NAME")"
  daily="$(rclone_list "$(at "$REMOTE" daily)")"
  if ! grep -q "^onefold-$ENV-${STAMP:0:8}" <<<"$daily"; then
    rclone copyto "/backups/$NAME" "$(at "$REMOTE" "daily/$NAME")" # the day's first backup is also its daily one
  fi
  for kind in hourly daily; do
    keep=$KEEP_HOURLY; [ "$kind" = hourly ] || keep=$KEEP_DAILY
    rclone_list "$(at "$REMOTE" "$kind")" | backup_names | all_but_last "$keep" | while read -r f; do
      rclone deletefile "$(at "$REMOTE" "$kind/$f")"
    done
  done
  say "Backed up $NAME to $REMOTE"
fi
ping "$PING_URL"
