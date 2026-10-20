#!/usr/bin/env bash
# setup.sh — prepares a fresh Ubuntu VPS (22.04 / 24.04 / 26.04) for 1Fold, once, as root, from a clone of the repo:
#   git clone https://github.com/tensorfolddev/onefold.git && sudo bash onefold/deploy/setup.sh
# Safe to run again: settings that exist are kept; only what's missing is added. It
#   - installs Docker, a firewall (SSH, HTTP, HTTPS only), automatic security updates and a swap file
#   - creates the "onefold" user that owns everything and that CI deploys as (paste CI's public key when asked)
#   - clones the repo to $ONEFOLD_HOME/repo and writes settings for prod and stg: random database passwords and
#     session secrets; it asks only for your domains, email (Resend) and backup monitor
#   - starts Caddy (HTTPS for both domains) and installs the backup schedule
# Any question can be answered ahead with an environment variable of the same name (e.g. PROD_DOMAIN=1fold.example).
#   --configure-only   settings and Caddy only (no packages, user, firewall or cron) — for trying it on a laptop
#   --recover          for recover.sh: everything except new settings, which come back from the backups
ONEFOLD_AS_ROOT=1
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/tensorfolddev/onefold.git}"
REPO_BRANCH="${REPO_BRANCH:-prod}"
upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

install_system() {
  [ "$(id -u)" = 0 ] || die "Run setup.sh as root: sudo bash deploy/setup.sh"
  export DEBIAN_FRONTEND=noninteractive
  say "Installing packages"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git ufw cron unattended-upgrades openssl >/dev/null
  if ! command -v docker >/dev/null; then
    say "Installing Docker"
    curl -fsSL https://get.docker.com | sh >/dev/null
  fi
  systemctl enable --now docker cron >/dev/null 2>&1
  echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | debconf-set-selections
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
  if [ -z "$(swapon --show 2>/dev/null)" ]; then
    say "Adding a 2 GB swap file"
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
  local ssh_port
  ssh_port="$({ sshd -T 2>/dev/null || true; } | awk '$1 == "port" && !p { print $2; p = 1 }')"
  say "Firewall: SSH (port ${ssh_port:-22}), HTTP and HTTPS only"
  ufw allow "${ssh_port:-22}/tcp" >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null

  id "$RUN_AS" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUN_AS"
  usermod -aG docker "$RUN_AS"
  ask DEPLOY_PUBKEY "Public SSH key CI deploys with (ssh-ed25519 …; empty to add later)" ""
  if [ -n "$DEPLOY_PUBKEY" ]; then
    # Pinned to ssh-entry.sh: the key can release a commit and do nothing else — no shell, no forwarding.
    local ssh_dir keys
    ssh_dir="$(getent passwd "$RUN_AS" | cut -d: -f6)/.ssh"
    keys="$ssh_dir/authorized_keys"
    install -d -m 700 -o "$RUN_AS" -g "$RUN_AS" "$ssh_dir"
    touch "$keys" && chmod 600 "$keys" && chown "$RUN_AS:$RUN_AS" "$keys"
    grep -qF "$DEPLOY_PUBKEY" "$keys" ||
      echo "restrict,command=\"$ONEFOLD_HOME/repo/deploy/ssh-entry.sh\" $DEPLOY_PUBKEY" >>"$keys"
  fi
  ask GHCR_TOKEN "GitHub token to pull private images (read:packages; empty if the package is public)" ""
  if [ -n "$GHCR_TOKEN" ]; then
    ask GHCR_USER "GitHub user that token belongs to" "tensorfolddev"
    printf '%s' "$GHCR_TOKEN" | sudo -u "$RUN_AS" docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  fi

  mkdir -p "$ONEFOLD_HOME" /var/log/onefold
  if [ ! -d "$ONEFOLD_HOME/repo/.git" ]; then
    say "Cloning $REPO_URL ($REPO_BRANCH)"
    git clone --quiet --branch "$REPO_BRANCH" "$REPO_URL" "$ONEFOLD_HOME/repo"
  fi
}

configure_env() { # <env>: settings for one environment (kept if they exist)
  local env="$1" up dir domain limits
  up="$(upper "$env")"
  dir="$ONEFOLD_HOME/$env"
  mkdir -p "$dir/backups" && chmod 700 "$dir/backups"
  [ -d "$dir/deploy" ] || cp -R "$HERE" "$dir/deploy"
  domain="$PROD_DOMAIN"
  limits="DB_MEMORY=1g\nDB_CPUS=1\nWEB_MEMORY=1g\nWEB_CPUS=1\nWORKER_MEMORY=512m\nWORKER_CPUS=0.5"
  if [ "$env" = stg ]; then
    domain="$STG_DOMAIN"
    limits="DB_MEMORY=512m\nDB_CPUS=0.5\nWEB_MEMORY=512m\nWEB_CPUS=0.5\nWORKER_MEMORY=256m\nWORKER_CPUS=0.25"
  fi
  if [ ! -f "$dir/.env" ]; then
    ask "${up}_BACKUP_PING_URL" "$env: healthchecks.io ping URL for hourly backups (empty for none)" ""
    local ping_var="${up}_BACKUP_PING_URL"
    (umask 077 && cat >"$dir/.env" <<SETTINGS
# 1Fold $env — settings for docker compose and the deploy scripts (the app never sees them). Private.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
WEB_DB_PASSWORD=$(openssl rand -hex 24)
# Limits, so staging can never slow production down.
$(printf "$limits")
# Backups: the rclone remote they go to (encrypted — see deploy/README.md), and monitors that email you when a ping
# is missed (healthchecks.io: one check per environment for hourly backups, one for the monthly restore test).
BACKUP_REMOTE=onefold-$env:
BACKUP_PING_URL=${!ping_var}
RESTORE_TEST_PING_URL=
SETTINGS
    )
  fi
  if [ ! -f "$dir/app.env" ]; then
    local key_var="${up}_RESEND_API_KEY" from_var="${up}_EMAIL_FROM" default_from
    if [ "$env" = prod ]; then default_from="1Fold <no-reply@tensorfold.ai>"; else default_from="1Fold Staging <no-reply@$STG_DOMAIN>"; fi
    ask "$key_var" "$env: 1Fold's own Resend API key — only for sign-up confirmations and password resets; each company sets its own email in Integrations (empty to add later in $dir/app.env)" ""
    ask "$from_var" "$env: send emails from" "$default_from"
    ask GOOGLE_CLIENT_ID "Google OAuth client id, for companies' own Drive backups (empty to add later — deploy/README.md)" ""
    ask GOOGLE_CLIENT_SECRET "Google OAuth client secret (empty to add later)" ""
    (umask 077 && cat >"$dir/app.env" <<SETTINGS
# 1Fold $env — what the website and worker read. Private. After changing it: deploy/start.sh $env
APP_URL=https://$domain
SESSION_SECRET=$(openssl rand -base64 36 | tr -d '\n')
# 1Fold's own email — only "confirm your email" and "reset your password"; companies send through their own.
RESEND_API_KEY=${!key_var}
EMAIL_FROM=${!from_var}
# Google sign-in, so each company can connect its own Google Drive for its daily backups (Integrations → Google Drive).
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
SETTINGS
    )
  fi
}

start_edge() {
  local edge="$ONEFOLD_HOME/edge"
  mkdir -p "$edge"
  cp "$HERE/edge/compose.yml" "$HERE/edge/Caddyfile" "$edge/"
  if [ ! -f "$edge/.env" ]; then
    printf 'PROD_DOMAIN=%s\nSTG_DOMAIN=%s\nACME_EMAIL=%s\n' "$PROD_DOMAIN" "$STG_DOMAIN" "$ACME_EMAIL" >"$edge/.env"
  fi
  ensure_edge_network
  say "Starting Caddy"
  docker compose -p onefold-edge --project-directory "$edge" -f "$edge/compose.yml" --env-file "$edge/.env" up -d --quiet-pull
}

install_schedule() {
  cat >/etc/cron.d/onefold <<CRON
# 1Fold — hourly backups (prod at :07, staging at :37) and a monthly restore test. Logs in /var/log/onefold.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ONEFOLD_HOME=$ONEFOLD_HOME
7 * * * *  $RUN_AS $ONEFOLD_HOME/prod/deploy/backup.sh prod >>/var/log/onefold/backup-prod.log 2>&1
37 * * * * $RUN_AS $ONEFOLD_HOME/stg/deploy/backup.sh stg >>/var/log/onefold/backup-stg.log 2>&1
23 4 1 * * $RUN_AS $ONEFOLD_HOME/prod/deploy/restore-test.sh prod >>/var/log/onefold/restore-test.log 2>&1
CRON
  cat >/etc/logrotate.d/onefold <<'ROTATE'
/var/log/onefold/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
ROTATE
}

[ "$MODE" = --configure-only ] || install_system
ask PROD_DOMAIN "Production domain" "1fold.tensorfold.ai"
ask STG_DOMAIN "Staging domain" "teamfold.tensorfold.ai"
ask ACME_EMAIL "Email for Let's Encrypt (certificate expiry notices)" "tensorfold@gmail.com"
mkdir -p "$ONEFOLD_HOME/rclone"
if [ "$MODE" != --recover ]; then
  for env in prod stg; do configure_env "$env"; done
fi
start_edge
if [ "$MODE" != --configure-only ]; then
  install_schedule
  chown -R "$RUN_AS:$RUN_AS" "$ONEFOLD_HOME" /var/log/onefold
fi
[ "$MODE" = --recover ] && exit 0

cat <<NEXT

$(say "Set up. What's left:")
  1. DNS: point A records for $PROD_DOMAIN and $STG_DOMAIN at this server. Caddy gets certificates by itself.
  2. Backups to Google Drive (deploy/README.md → "Backups"):  sudo -u $RUN_AS $ONEFOLD_HOME/repo/deploy/rclone.sh config
     Then keep a copy of $ONEFOLD_HOME/rclone/rclone.conf in your password manager — recovery needs it.
  3. GitHub → Settings → Environments → "prod" and "stg": variable DEPLOY_HOST (this server's address); secrets
     DEPLOY_SSH_KEY (CI's private key) and DEPLOY_KNOWN_HOSTS (ssh-keyscan <address>). Repository variable
     DEPLOY_ENABLED = true.
  4. First release: GitHub → Actions → deploy → Run workflow (prod, then stg) — or on this server:
     sudo -u $RUN_AS $ONEFOLD_HOME/repo/deploy/deploy.sh prod <commit>
NEXT
