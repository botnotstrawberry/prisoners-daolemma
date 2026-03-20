#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-base-mainnet-verify}"
ART_DIR="$ROOT/.mainnet-readiness/$RUN_ID"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
REQUIRE_CLEAN_GIT="${REQUIRE_CLEAN_GIT:-true}"
EXPECTED_GIT_COMMIT="${EXPECTED_GIT_COMMIT:-}"
mkdir -p "$ART_DIR"

export FOUNDRY_PROFILE=production

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

record_git_provenance() {
  if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
    git -C "$ROOT" rev-parse HEAD > "$ART_DIR/git-commit.txt"
    git -C "$ROOT" status --short > "$ART_DIR/git-status.txt"
    git -C "$ROOT" diff --stat > "$ART_DIR/git-diffstat.txt"
  fi
}

require_clean_git() {
  if [[ "$REQUIRE_CLEAN_GIT" != "true" ]]; then
    return 0
  fi

  if ! git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
    return 0
  fi

  local head status
  head="$(git -C "$ROOT" rev-parse HEAD)"
  status="$(git -C "$ROOT" status --porcelain=v1)"

  if [[ -n "$EXPECTED_GIT_COMMIT" && "$head" != "$EXPECTED_GIT_COMMIT" ]]; then
    record_git_provenance
    fail "expected git HEAD $EXPECTED_GIT_COMMIT but found $head"
  fi

  if [[ -n "$status" ]]; then
    record_git_provenance
    fail "git working tree must be clean before Base mainnet verify (set REQUIRE_CLEAN_GIT=false to override intentionally)"
  fi
}

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
  fail "BASESCAN_API_KEY is required for verify"
fi

require_clean_git

if [[ -z "${VERIFY_BROADCAST_FILE:-}" ]]; then
  if [[ -f "$ROOT/.mainnet-readiness/latest-base-mainnet-broadcast.txt" ]]; then
    fail "VERIFY_BROADCAST_FILE is required. Hint: export VERIFY_BROADCAST_FILE=$(cat "$ROOT/.mainnet-readiness/latest-base-mainnet-broadcast.txt")"
  fi
  fail "VERIFY_BROADCAST_FILE is required; pass the exact broadcast artifact captured by run-base-mainnet-deploy.sh"
fi

if [[ ! -f "$VERIFY_BROADCAST_FILE" ]]; then
  fail "VERIFY_BROADCAST_FILE does not exist: $VERIFY_BROADCAST_FILE"
fi

record_git_provenance
printf '%s\n' "$VERIFY_BROADCAST_FILE" > "$ART_DIR/verify-broadcast-file.txt"
cp "$VERIFY_BROADCAST_FILE" "$ART_DIR/verify-broadcast.json"
printf '%s\n' "$RPC_URL" > "$ART_DIR/rpc-url.txt"

cd "$FOUNDRY_DIR"
forge script script/VerifyAll.s.sol --ffi --rpc-url "$RPC_URL" | tee "$ART_DIR/verify.log"

echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-base-mainnet-verify.txt"
echo "DONE: Base mainnet verify artifacts at $ART_DIR"
