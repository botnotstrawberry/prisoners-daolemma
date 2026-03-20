#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-base-mainnet-deploy}"
ART_DIR="$ROOT/.mainnet-readiness/$RUN_ID"
PRECHECK_DIR="$ART_DIR/preflight"
DEPLOYER_KEYSTORE="${DEPLOYER_KEYSTORE:-botnotstrawberry-base-wallet}"
DEPLOYER_PASSWORD_FILE="${DEPLOYER_PASSWORD_FILE:-/root/.secrets/botnotstrawberry-base-wallet.pass}"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
BROADCAST_SRC_REL="broadcast/Deploy.s.sol/8453/run-latest.json"
mkdir -p "$ART_DIR"

export FOUNDRY_PROFILE=production
export PRISONERS_STRICT_DEPLOY=true

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

OUT_DIR="$PRECHECK_DIR" bash "$ROOT/scripts/run-base-mainnet-preflight.sh"

if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$ROOT" rev-parse HEAD > "$ART_DIR/git-commit.txt"
  git -C "$ROOT" status --short > "$ART_DIR/git-status.txt"
  git -C "$ROOT" diff --stat > "$ART_DIR/git-diffstat.txt"
fi

cd "$FOUNDRY_DIR"
mkdir -p deployments
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --ffi --account "$DEPLOYER_KEYSTORE" --password-file "$DEPLOYER_PASSWORD_FILE" --broadcast | tee "$ART_DIR/deploy.log"
cp deployments/8453.json "$ART_DIR/deployments-8453.json"

if [[ ! -f "$BROADCAST_SRC_REL" ]]; then
  echo "FAIL: missing broadcast artifact $BROADCAST_SRC_REL" >&2
  exit 1
fi

cp "$BROADCAST_SRC_REL" "$ART_DIR/deploy-broadcast-run-latest.json"
printf '%s
' "$ART_DIR/deploy-broadcast-run-latest.json" > "$ROOT/.mainnet-readiness/latest-base-mainnet-broadcast.txt"
node scripts-js/generateTsAbis.js | tee "$ART_DIR/generate-ts-abis.log"

printf '%s
' "$RPC_URL" > "$ART_DIR/rpc-url.txt"
printf '%s
' "$DEPLOYER_KEYSTORE" > "$ART_DIR/deployer-keystore.txt"
echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-base-mainnet-deploy.txt"
echo "DONE: Base mainnet deploy artifacts at $ART_DIR"
