#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-base-mainnet-verify}"
ART_DIR="$ROOT/.mainnet-readiness/$RUN_ID"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
mkdir -p "$ART_DIR"

export FOUNDRY_PROFILE=production

if [[ -f "$FOUNDRY_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$FOUNDRY_DIR/.env"
  set +a
fi

if [[ -f /root/.secrets/openclaw.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /root/.secrets/openclaw.env
  set +a
fi

if [[ -z "${BASESCAN_API_KEY:-}" ]]; then
  echo "FAIL: BASESCAN_API_KEY is required for verify" >&2
  exit 1
fi

if [[ -z "${VERIFY_BROADCAST_FILE:-}" ]] && [[ -f "$ROOT/.mainnet-readiness/latest-base-mainnet-broadcast.txt" ]]; then
  VERIFY_BROADCAST_FILE="$(cat "$ROOT/.mainnet-readiness/latest-base-mainnet-broadcast.txt")"
  export VERIFY_BROADCAST_FILE
fi

if [[ -z "${VERIFY_BROADCAST_FILE:-}" ]]; then
  VERIFY_BROADCAST_FILE="$FOUNDRY_DIR/broadcast/Deploy.s.sol/8453/run-latest.json"
  export VERIFY_BROADCAST_FILE
fi

if [[ ! -f "$VERIFY_BROADCAST_FILE" ]]; then
  echo "FAIL: VERIFY_BROADCAST_FILE does not exist: $VERIFY_BROADCAST_FILE" >&2
  exit 1
fi

printf '%s
' "$VERIFY_BROADCAST_FILE" > "$ART_DIR/verify-broadcast-file.txt"
cp "$VERIFY_BROADCAST_FILE" "$ART_DIR/verify-broadcast.json"
printf '%s
' "$RPC_URL" > "$ART_DIR/rpc-url.txt"

if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$ROOT" rev-parse HEAD > "$ART_DIR/git-commit.txt"
  git -C "$ROOT" status --short > "$ART_DIR/git-status.txt"
fi

cd "$FOUNDRY_DIR"
forge script script/VerifyAll.s.sol --ffi --rpc-url "$RPC_URL" | tee "$ART_DIR/verify.log"

echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-base-mainnet-verify.txt"
echo "DONE: Base mainnet verify artifacts at $ART_DIR"
