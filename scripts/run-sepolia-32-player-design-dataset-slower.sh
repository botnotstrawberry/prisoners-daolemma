#!/usr/bin/env bash
set -euo pipefail

# Prepared slower 32-player Base Sepolia profile.
# Wrapper for the underlying run script using the slower 32-player timing budget.
# Usage:
#   bash scripts/run-sepolia-32-player-design-dataset-slower.sh

export RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)-base-sepolia-32p-design-dataset-slower}"
export PRISONERS_JOIN_DURATION_SECONDS="${PRISONERS_JOIN_DURATION_SECONDS:-300}"
export PRISONERS_COMMIT_DURATION_BLOCKS="${PRISONERS_COMMIT_DURATION_BLOCKS:-120}"
export PRISONERS_REVEAL_DURATION_BLOCKS="${PRISONERS_REVEAL_DURATION_BLOCKS:-120}"
export PRISONERS_MIN_PLAYERS="${PRISONERS_MIN_PLAYERS:-3}"
export PRISONERS_MAX_PLAYERS="${PRISONERS_MAX_PLAYERS:-32}"
export PRISONERS_MAX_CAUSES="${PRISONERS_MAX_CAUSES:-8}"
export PRISONERS_ENTRY_FEE_WEI="${PRISONERS_ENTRY_FEE_WEI:-1000000000000000}"
export TARGET_PLAYER_WEI="${TARGET_PLAYER_WEI:-5000000000000000}"
export PARALLELISM="${PARALLELISM:-16}"

exec "$(cd "$(dirname "$0")" && pwd)/run-sepolia-32-player-design-dataset.sh"
