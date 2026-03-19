#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
LOG_DIR="$ROOT/.mainnet-readiness/$(date -u +%Y%m%d)-production-gates"
LOG_FILE="$LOG_DIR/05-production-size-audit.log"
mkdir -p "$LOG_DIR"

cd "$FOUNDRY_DIR"
export FOUNDRY_PROFILE=production

forge build --sizes --skip test | tee "$LOG_FILE" >/dev/null || true

runtime_size=$(python3 - <<'PY' "$LOG_FILE"
import re, sys
text = open(sys.argv[1]).read().splitlines()
for line in text:
    if 'PrisonersDaollema' in line and '|' in line:
        parts=[p.strip() for p in line.strip('│| ').split('|')]
        # expected columns: Contract | Runtime Size (B) | Initcode Size (B) | Runtime Margin (B) | Initcode Margin (B)
        if len(parts) >= 5 and parts[0] == 'PrisonersDaollema':
            print(parts[1].replace(',',''))
            break
else:
    raise SystemExit('Could not find PrisonersDaollema row in size output')
PY
)

limit=24576
warn_margin=1500
preferred_margin=3000
margin=$((limit - runtime_size))

echo "PrisonersDaollema runtime size: ${runtime_size} B"
echo "EIP-170 runtime limit: ${limit} B"
echo "Runtime margin: ${margin} B"

if (( runtime_size > limit )); then
  echo "FAIL: runtime size exceeds EIP-170 limit"
  exit 1
fi

if (( margin < warn_margin )); then
  echo "WARN: runtime margin below ${warn_margin} B"
  exit 2
fi

if (( margin < preferred_margin )); then
  echo "WARN: runtime margin below preferred comfort margin ${preferred_margin} B"
  exit 0
fi

echo "PASS: production runtime size is within limits with comfortable margin"
