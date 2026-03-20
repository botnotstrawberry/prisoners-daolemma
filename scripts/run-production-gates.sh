#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$ROOT/.mainnet-readiness/${STAMP}-production-gates"
mkdir -p "$OUT_DIR"

export FOUNDRY_PROFILE=production

run() {
  local name="$1"
  shift
  echo "== ${name} =="
  set +e
  "$@" > "$OUT_DIR/${name}.log" 2>&1
  local status=$?
  set -e
  echo "status=${status}"
  tail -n 40 "$OUT_DIR/${name}.log" || true
  echo
  if (( status != 0 )); then
    echo "FAIL: ${name}"
    return "$status"
  fi
  return 0
}

cd "$ROOT"
if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$ROOT" rev-parse HEAD > "$OUT_DIR/git-commit.txt"
  git -C "$ROOT" status --short > "$OUT_DIR/git-status.txt"
  git -C "$ROOT" diff --stat > "$OUT_DIR/git-diffstat.txt"
fi
printf '%s
' "$FOUNDRY_PROFILE" > "$OUT_DIR/foundry-profile.txt"

run 01-yarn-test yarn test
run 02-yarn-next-check-types yarn next:check-types
run 03-yarn-smoke-integration yarn smoke:integration
run 04-yarn-auth-expiry yarn workspace @prisoners-daollema/foundry load:harness:auth-expiry
run 05-production-size-check bash "$ROOT/scripts/check-production-size.sh"

echo "PASS: all production gates completed"
echo "Artifacts: $OUT_DIR"
