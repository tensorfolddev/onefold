#!/usr/bin/env bash
# start.sh <stg|prod> — starts an environment again on its installed release (data stays in its volumes).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env "${1:-}"
[ -n "$(release IMAGE)" ] || die "No release is installed for $ENV yet — run deploy.sh."
ensure_edge_network
compose up -d --wait --wait-timeout 180 postgres web worker
say "$ENV is running $(release COMMIT | cut -c1-7)"
