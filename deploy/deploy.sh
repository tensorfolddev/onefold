#!/usr/bin/env bash
# deploy.sh <stg|prod> <commit> — releases that commit to one environment (CI runs it through ssh-entry.sh; so can you):
#   1. fetches the commit, and runs that release's own deploy.sh from a fresh copy of its deploy/ folder
#   2. a fresh backup: this release's restore point
#   3. the new image's migrations (they only ever add things, so the running version keeps working meanwhile)
#   4. the release's scripts become the environment's, website and worker restart on the new image; if the website
#      isn't healthy in time, the previous image (and its scripts) come back by themselves
# Roll back: deploy.sh <env> <previous commit> — the database never needs to go back (docs/specs … §12).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 2 ] || die "Usage: deploy.sh <stg|prod> <commit>"
need_env "$1"
SHA="$2"
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || die "That isn't a commit: $SHA"
NEW="$ENV_DIR/deploy.new"

# Stage 1, from the repo checkout: get the commit and hand over to its own deploy.sh.
if [ "${ONEFOLD_STAGE:-}" != "2" ]; then
  REPO="$ONEFOLD_HOME/repo"
  git -C "$REPO" fetch --quiet origin
  SHA="$(git -C "$REPO" rev-parse --verify --quiet "$SHA^{commit}")" || die "No commit $2 in the repository."
  [ "$ENV" != prod ] || git -C "$REPO" checkout --quiet --detach "$SHA" # the checkout follows production
  rm -rf "$NEW" && mkdir -p "$NEW"
  git -C "$REPO" archive "$SHA" deploy | tar -x -C "$NEW" --strip-components=1
  ONEFOLD_STAGE=2 exec "$NEW/deploy.sh" "$ENV" "$SHA"
fi

lock deploy
IMAGE="${DEPLOY_IMAGE:-$REGISTRY_IMAGE:$ENV-$SHA}"
PREVIOUS_IMAGE="$(release IMAGE)"
PREVIOUS_COMMIT="$(release COMMIT)"
FROM_RELEASE="" # set when this script runs from the release's fresh copy (not, say, a laptop trial)
[ "$HERE" != "$NEW" ] || FROM_RELEASE=1
say "Releasing ${SHA:0:7} to $ENV ($IMAGE)"

give_up() { [ -z "$FROM_RELEASE" ] || rm -rf "$NEW"; die "$@"; }
write_release() { # <image> <commit> <previous image> <previous commit>
  printf 'IMAGE=%s\nCOMMIT=%s\nPREVIOUS_IMAGE=%s\nPREVIOUS_COMMIT=%s\nDEPLOYED_AT=%s\n' \
    "$1" "$2" "$3" "$4" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$ENV_DIR/release.env.tmp"
  mv "$ENV_DIR/release.env.tmp" "$ENV_DIR/release.env"
}
# The release's scripts and compose file become the environment's own (the previous ones are kept for a rollback).
install_scripts() {
  [ -n "$FROM_RELEASE" ] || return 0
  rm -rf "$ENV_DIR/deploy.old"
  [ ! -d "$ENV_DIR/deploy" ] || mv "$ENV_DIR/deploy" "$ENV_DIR/deploy.old"
  mv "$NEW" "$ENV_DIR/deploy"
  HERE="$ENV_DIR/deploy"
}
restore_scripts() {
  [ -n "$FROM_RELEASE" ] && [ -d "$ENV_DIR/deploy.old" ] || return 0
  rm -rf "$ENV_DIR/deploy.failed"
  mv "$ENV_DIR/deploy" "$ENV_DIR/deploy.failed" && mv "$ENV_DIR/deploy.old" "$ENV_DIR/deploy"
  HERE="$ENV_DIR/deploy"
}

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull --quiet "$IMAGE" >/dev/null ||
  give_up "Couldn't get $IMAGE. CI builds it when $ENV moves to that commit (Actions → deploy)."
ensure_edge_network

# 2. The restore point (nothing to back up on an environment's very first release).
if [ -n "$PREVIOUS_IMAGE" ] && db_running; then
  "$HERE/backup.sh" "$ENV" "before-${SHA:0:7}" || give_up "The pre-release backup failed — nothing was changed."
fi

# 3. Migrations, with the new image, while the old version keeps serving. Only then is the release recorded.
IMAGE="$IMAGE" compose up -d --wait postgres
IMAGE="$IMAGE" compose run --rm migrate || give_up "Migrations failed — $ENV is still on ${PREVIOUS_COMMIT:0:7}, unchanged."
install_scripts
write_release "$IMAGE" "$SHA" "$PREVIOUS_IMAGE" "$PREVIOUS_COMMIT"

# 4. Switch; the previous image comes back if the new one doesn't get healthy.
if ! compose up -d --wait --wait-timeout 180 web worker; then
  compose logs --tail 100 web worker >"$ENV_DIR/deploy-failure.log" 2>&1 || true
  if [ -n "$PREVIOUS_IMAGE" ]; then
    say "The new release isn't healthy — putting ${PREVIOUS_COMMIT:0:7} back"
    restore_scripts
    write_release "$PREVIOUS_IMAGE" "$PREVIOUS_COMMIT" "" ""
    compose up -d --wait --wait-timeout 180 web worker || true
  fi
  die "Release ${SHA:0:7} to $ENV failed its health check — the website's last words are in $ENV_DIR/deploy-failure.log."
fi

# Keep this release's image and the one before it (older ones can be pulled again to roll back further).
docker image ls "$REGISTRY_IMAGE" --format '{{.Repository}}:{{.Tag}}' | { grep ":$ENV-" || true; } | while read -r old; do
  [ "$old" = "$IMAGE" ] || [ "$old" = "$PREVIOUS_IMAGE" ] || docker image rm "$old" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null 2>&1 || true
say "$ENV is on ${SHA:0:7}"
