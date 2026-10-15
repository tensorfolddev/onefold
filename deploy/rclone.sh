#!/usr/bin/env bash
# rclone.sh <rclone arguments…> — rclone (in Docker) with 1Fold's config, $ONEFOLD_HOME/rclone/rclone.conf. Set up the
# backup remotes once with `rclone.sh config` (see deploy/README.md); then e.g. `rclone.sh lsf onefold-prod:hourly`.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p "$ONEFOLD_HOME/rclone" "$ONEFOLD_HOME/backups"
ENV_DIR="$ONEFOLD_HOME" rclone "$@"
