# Shared by the deploy scripts: where things live, which environment, and docker compose / rclone for it.
# Works with the bash on Ubuntu and on a Mac (bash 3.2), so the scripts can be tried locally.
set -eEuo pipefail # -E: an ERR trap fires inside functions too (backup.sh's failure ping relies on it)
umask 077            # everything these scripts write (settings, backups) is private to the onefold user

ONEFOLD_HOME="${ONEFOLD_HOME:-/opt/onefold}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:-ghcr.io/tensorfolddev/onefold}"
POSTGRES_IMAGE="postgres:17.11-alpine"
RCLONE_IMAGE="rclone/rclone:1.75.1"
TOOLS_IMAGE="alpine:3.24.2"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" # the deploy folder this script runs from

RUN_AS="${RUN_AS:-onefold}" # the user that owns $ONEFOLD_HOME, runs the backups and that CI deploys as

say() { printf '\033[1m[onefold]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[onefold] %s\033[0m\n' "$*" >&2; exit 1; }

# Started with sudo? Carry on as $RUN_AS, so every file stays theirs (setup.sh and recover.sh need root and say so).
if [ "$(id -u)" = 0 ] && [ -z "${ONEFOLD_AS_ROOT:-}" ] && id "$RUN_AS" >/dev/null 2>&1; then
  exec sudo -u "$RUN_AS" ONEFOLD_HOME="$ONEFOLD_HOME" -- "$0" "$@"
fi

# ask <VAR> <question> [default]: keeps $VAR if it's set already, asks if someone's there, else takes the default.
ask() {
  local var="$1" question="$2" default="${3:-}" answer=""
  [ -z "${!var:-}" ] || return 0
  if [ -t 0 ]; then read -r -p "$question [$default]: " answer; fi
  printf -v "$var" '%s' "${answer:-$default}"
}

# need_env <stg|prod>: sets ENV, ENV_DIR and PROJECT, or stops with what to do.
need_env() {
  case "${1:-}" in stg | prod) ;; *) die "Which environment? Use stg or prod." ;; esac
  ENV="$1"
  ENV_DIR="$ONEFOLD_HOME/$ENV"
  PROJECT="onefold-$ENV"
  export ONEFOLD_ENV="$ENV"
  [ -f "$ENV_DIR/.env" ] && [ -f "$ENV_DIR/app.env" ] || die "$ENV_DIR/.env or app.env is missing — run setup.sh first."
}

# setting <NAME>: a value from the environment's .env (empty if unset).
setting() { sed -n "s/^$1=//p" "$ENV_DIR/.env" | tail -n 1; }
release() { [ -f "$ENV_DIR/release.env" ] && sed -n "s/^$1=//p" "$ENV_DIR/release.env" | tail -n 1 || true; }

# compose …: docker compose for this environment — its folder, its settings, its installed release.
compose() {
  local release_file="$ENV_DIR/release.env"
  [ -f "$release_file" ] || release_file=/dev/null
  # From the environment's folder: docker compose reads the folder it's started in, which may be one $RUN_AS can't
  # open (e.g. /root, after "sudo -u onefold …").
  (cd "$ENV_DIR" && docker compose -p "$PROJECT" --project-directory "$ENV_DIR" -f "$HERE/compose.yml" \
    --env-file "$ENV_DIR/.env" --env-file "$release_file" "$@")
}

db_running() { [ -n "$(compose ps --status running --quiet postgres 2>/dev/null)" ]; }

# rclone …: rclone in Docker, with the shared config ($ONEFOLD_HOME/rclone) and this environment's backups folder.
rclone() {
  local tty=()
  # A terminal only when someone is at one on both ends (rclone.sh config). With one, rclone's lines end in \r\n, which
  # breaks every script that reads its output (require_crypt, backup listings) when run by hand.
  [ -t 0 ] && [ -t 1 ] && tty=(-it)
  docker run --rm "${tty[@]+"${tty[@]}"}" --user "$(id -u):$(id -g)" \
    -v "$ONEFOLD_HOME/rclone:/config/rclone" -v "${ENV_DIR:-$ONEFOLD_HOME}/backups:/backups" \
    "$RCLONE_IMAGE" "$@"
}

ensure_edge_network() { docker network inspect onefold-edge >/dev/null 2>&1 || docker network create onefold-edge >/dev/null; }

# Prints all lines but the last N (sorted input → everything older than the newest N).
all_but_last() { awk -v keep="$1" '{ line[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print line[i] }'; }

# One run at a time per environment and task (flock on Linux; on a Mac, where there's none, no lock).
lock() {
  command -v flock >/dev/null || return 0
  exec 9>"$ENV_DIR/.$1.lock"
  flock -w "${2:-900}" 9 || die "Another $1 is still running for $ENV."
}

# ping <url> [suffix]: tells a monitor (e.g. healthchecks.io) a job ran; never fails the job.
ping() { [ -z "${1:-}" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$1${2:-}" || true; }

# at <remote> <path>: a path on an rclone remote ("onefold-prod:" + "hourly" → "onefold-prod:hourly").
at() { case "$1" in *:) printf '%s%s' "$1" "$2" ;; *) printf '%s/%s' "${1%/}" "$2" ;; esac; }

# This environment's backup file names, oldest first, from a listing on stdin (never the other environment's).
backup_names() { grep -E "^onefold-${ENV:-(stg|prod)}-[0-9]{8}T[0-9]{6}Z(-[a-z0-9-]+)?\.tar$" | sort || true; }

# rclone_list <remote path>: its file names, or nothing if it doesn't exist yet (never fails the script).
rclone_list() { rclone lsf "$1" 2>/dev/null || true; }

# The backups folder: private, it holds the database and the settings.
backups_dir() { mkdir -p "$ENV_DIR/backups" && chmod 700 "$ENV_DIR/backups"; }

# require_crypt <remote>: backups hold every secret, so they only ever go to an rclone *crypt* remote.
require_crypt() {
  local name="${1%%:*}"
  rclone config show "$name" 2>/dev/null | grep -Eq '^type *= *crypt$' ||
    die "BACKUP_REMOTE ($1) isn't an rclone crypt remote — backups must be encrypted. See deploy/README.md → Backups."
}

# fetch_backup <latest | name | path>: sets BACKUP_FILE to a local .tar, downloading it from BACKUP_REMOTE if needed.
# "latest" is the newest backup here or on the remote.
fetch_backup() {
  local which="$1" remote
  remote="$(setting BACKUP_REMOTE)"
  backups_dir
  if [ -f "$which" ]; then
    BACKUP_FILE="$(cd "$(dirname "$which")" && pwd)/$(basename "$which")"
    return 0
  fi
  if [ "$which" = latest ]; then
    which="$({ ls -1 "$ENV_DIR/backups"; [ -z "$remote" ] || rclone_list "$(at "$remote" hourly)"; } | backup_names | tail -n 1)"
    [ -n "$which" ] || die "No backups found for $ENV."
  fi
  printf '%s\n' "$which" | backup_names | grep -q . || die "Not a backup name: $which"
  BACKUP_FILE="$ENV_DIR/backups/$which"
  [ ! -f "$BACKUP_FILE" ] || return 0
  [ -n "$remote" ] || die "$which isn't on this server, and BACKUP_REMOTE isn't set."
  say "Downloading $which"
  rclone copyto "$(at "$remote" "hourly/$which")" "/backups/$which" 2>/dev/null ||
    rclone copyto "$(at "$remote" "daily/$which")" "/backups/$which" || die "Couldn't download $which."
  chmod 600 "$BACKUP_FILE"
}

# backup_env <extracted backup folder>: which environment a backup was taken from.
backup_env() { sed -n 's/^environment=//p' "$1/BACKUP" 2>/dev/null | head -n 1; }
