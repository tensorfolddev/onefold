#!/usr/bin/env bash
# ssh-entry.sh — the only thing CI's SSH key may run on the server: setup.sh pins the key to this script
# (restrict,command="…" in ~onefold/.ssh/authorized_keys). CI sends "deploy <stg|prod> <commit>".
# The release runs detached, its output going to $ONEFOLD_HOME/<env>/deploy.log, so a dropped connection can't stop
# it halfway; meanwhile CI follows the output and gets its exit code.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

read -r -a words <<<"${SSH_ORIGINAL_COMMAND:-$*}"
[[ "${words[0]:-}" != */ssh-entry.sh ]] || words=("${words[@]:1}") # sent with this script's own path in front
[ "${#words[@]}" = 3 ] && [ "${words[0]}" = deploy ] || die 'Only "deploy <stg|prod> <commit>" is allowed here.'
need_env "${words[1]}"
SHA="${words[2]}"
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || die "That isn't a commit: $SHA"

RUN="$(mktemp "$ENV_DIR/.deploy-run.XXXXXX")"
setsid --wait nohup "$ONEFOLD_HOME/repo/deploy/deploy.sh" "$ENV" "$SHA" >"$RUN" 2>&1 </dev/null &
pid=$!
tail -n +1 -f --pid="$pid" "$RUN" || true
code=0
wait "$pid" || code=$?
{ printf '\n== %s  deploy %s %s  (exit %s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ENV" "$SHA" "$code"; cat "$RUN"; } >>"$ENV_DIR/deploy.log"
rm -f "$RUN"
exit "$code"
