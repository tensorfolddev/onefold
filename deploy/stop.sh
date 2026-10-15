#!/usr/bin/env bash
# stop.sh <stg|prod> — stops an environment's website, worker and database. Its data stays in its volumes, backups
# skip it while it's stopped, and its domain answers 502 until start.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_env "${1:-}"
compose stop
say "$ENV is stopped — start it again with start.sh $ENV"
