#!/usr/bin/env bash
# status.sh [stg|prod] — what's installed and running, per environment.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
for env in ${1:-prod stg}; do
  [ -f "$ONEFOLD_HOME/$env/.env" ] || continue
  need_env "$env"
  say "$env — release $(release COMMIT | cut -c1-7) (deployed $(release DEPLOYED_AT)); newest backup here: $(ls -1 "$ENV_DIR/backups" 2>/dev/null | backup_names | tail -n 1)"
  compose ps --format 'table {{.Service}}\t{{.Status}}'
done
