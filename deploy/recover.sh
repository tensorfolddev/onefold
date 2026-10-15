#!/usr/bin/env bash
# recover.sh — the server is gone. On a fresh Ubuntu VPS, as root, this brings 1Fold back from the latest backups:
#   git clone https://github.com/tensorfolddev/onefold.git && sudo bash onefold/deploy/recover.sh
#   1. everything setup.sh installs (Docker, firewall, the onefold user, Caddy, the backup schedule)
#   2. it asks for rclone.conf — the copy in your password manager (the Drive login and the backup password)
#   3. for prod, then stg: the newest backup's settings come back, then the release it ran, then its data
#   4. you point the DNS records at this server (and DEPLOY_HOST in GitHub); Caddy fetches certificates itself
# At most the hour since the last backup is lost. RCLONE_CONF_FILE=<path> skips the paste.
ONEFOLD_AS_ROOT=1
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ "$(id -u)" = 0 ] || die "Run recover.sh as root: sudo bash deploy/recover.sh"
bash "$HERE/setup.sh" --recover

CONF="$ONEFOLD_HOME/rclone/rclone.conf"
if [ ! -s "$CONF" ]; then
  if [ -n "${RCLONE_CONF_FILE:-}" ]; then cp "$RCLONE_CONF_FILE" "$CONF"; else
    say "Paste rclone.conf (from your password manager), then press Ctrl-D:"
    cat >"$CONF"
  fi
fi
chmod 600 "$CONF" && chown -R "$RUN_AS:$RUN_AS" "$ONEFOLD_HOME/rclone"

for env in ${RECOVER_ENVS:-prod stg}; do
  remote_var="$(printf '%s' "$env" | tr '[:lower:]' '[:upper:]')_BACKUP_REMOTE"
  ask "$remote_var" "Where $env's backups are (rclone remote)" "onefold-$env:"
  REMOTE="${!remote_var}"
  ENV_DIR="$ONEFOLD_HOME/$env"
  mkdir -p "$ENV_DIR/backups" && chown -R "$RUN_AS:$RUN_AS" "$ENV_DIR"
  ENV="$env" # backup names of this environment only
  latest="$(rclone_list "$(at "$REMOTE" hourly)" | backup_names | tail -n 1)"
  if [ -z "$latest" ]; then say "No backups of $env at $REMOTE — skipping it (set it up fresh with setup.sh)"; continue; fi
  say "$env: bringing back $latest"
  rclone copyto "$(at "$REMOTE" "hourly/$latest")" "/backups/$latest"
  work="$(mktemp -d)"
  tar -xf "$ENV_DIR/backups/$latest" -C "$work" ./config
  for f in .env app.env release.env; do [ ! -f "$work/config/$f" ] || install -m 600 -o "$RUN_AS" -g "$RUN_AS" "$work/config/$f" "$ENV_DIR/$f"; done
  rm -rf "$work"
  commit="$(sed -n 's/^COMMIT=//p' "$ENV_DIR/release.env" 2>/dev/null || true)"
  rm -rf "$ENV_DIR/deploy" && mkdir -p "$ENV_DIR/deploy"
  repo_git() { git -c safe.directory="$ONEFOLD_HOME/repo" -C "$ONEFOLD_HOME/repo" "$@"; } # root, in onefold's repo
  if [ -n "$commit" ] && repo_git cat-file -e "$commit^{commit}" 2>/dev/null; then
    repo_git archive "$commit" deploy | tar -x -C "$ENV_DIR/deploy" --strip-components=1
  else
    cp -R "$HERE/." "$ENV_DIR/deploy/"
  fi
  chown -R "$RUN_AS:$RUN_AS" "$ENV_DIR" "$ONEFOLD_HOME/rclone" # rclone may have just refreshed (rewritten) its config as root
  sudo -u "$RUN_AS" ONEFOLD_HOME="$ONEFOLD_HOME" "$ENV_DIR/deploy/restore.sh" "$env" "$latest" --yes
done
chown -R "$RUN_AS:$RUN_AS" "$ONEFOLD_HOME/rclone"

say "Recovered. Now point DNS for both domains at this server, and update DEPLOY_HOST in GitHub's environments."
