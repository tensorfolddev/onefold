#!/usr/bin/env bash
# compose.sh <stg|prod> <docker compose arguments…> — any docker compose command for one environment, e.g.
#   compose.sh prod logs -f --tail 100 web
#   compose.sh prod exec postgres psql -U onefold_admin onefold
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env "${1:-}"
shift
compose "$@"
