#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
ART_DIR="$ROOT/.mainnet-readiness/20260319T0120Z-fresh-sepolia-production-rehearsal"
RPC=baseSepolia
OWNER_KS=botnotstrawberry-base-wallet
OWNER_PW=/root/.secrets/botnotstrawberry-base-wallet.pass
if [[ -f "$ART_DIR/from-block.txt" ]]; then
  FROM_BLOCK=$(cat "$ART_DIR/from-block.txt")
else
  DEPLOY_TX_HASH=$(jq -r '.transactions[0].hash' "$FOUNDRY_DIR/broadcast/Deploy.s.sol/84532/run-latest.json")
  FROM_BLOCK=$(python3 - <<'PY' "$RPC" "$DEPLOY_TX_HASH"
import json, subprocess, sys
rpc, tx_hash = sys.argv[1], sys.argv[2]
out = subprocess.check_output(['cast', 'receipt', tx_hash, '--rpc-url', rpc, '--json'], text=True)
print(int(json.loads(out)['blockNumber'], 16))
PY
)
  echo "$FROM_BLOCK" > "$ART_DIR/from-block.txt"
fi
GID=$(jq -r '.gameId' "$ART_DIR/game/create-game.json")

player_ks(){ echo "canary-player-$1"; }
player_pw(){ echo "/root/.secrets/canary-player-$1.pass"; }
log(){ printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

advance_with_wait() {
  local label="$1" outfile="$2"
  for try in $(seq 1 80); do
    if (cd "$FOUNDRY_DIR" && node scripts-js/gameCli.js advance --rpc-url "$RPC" --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$outfile"); then
      log "Advance succeeded for ${label} on try ${try}"
      return 0
    fi
    sleep 10
  done
  log "Advance failed for ${label}"
  return 1
}

parallel_commit_round() {
  local round="$1"
  local pids=()
  for idx in 1 2 3; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC" --game-id "$GID" --choice share --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --out "$ART_DIR/game/commit-bundles/game-${GID}-round-${round}-player-${idx}.json" --json > "$ART_DIR/game/game-${GID}-round-${round}-prepare-player-${idx}.json"
      node scripts-js/gameCli.js commit --rpc-url "$RPC" --game-id "$GID" --input "$ART_DIR/game/commit-bundles/game-${GID}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${GID}-round-${round}-commit-player-${idx}.json"
    ) &
    pids+=("$!")
  done
  local rc=0 pid
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  return "$rc"
}

parallel_reveal_round() {
  local round="$1"
  local pids=()
  for idx in 1 2 3; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js reveal --rpc-url "$RPC" --game-id "$GID" --input "$ART_DIR/game/commit-bundles/game-${GID}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${GID}-round-${round}-reveal-player-${idx}.json"
    ) &
    pids+=("$!")
  done
  local rc=0 pid
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  return "$rc"
}

log "Resume fresh Sepolia production rehearsal from live deployment/game"
cd "$FOUNDRY_DIR"
node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"
advance_with_wait "join->commit" "$ART_DIR/game/start-advance.json"

for round in 1 2 3; do
  log "Round ${round}: parallel commit/reveal"
  parallel_commit_round "$round"
  advance_with_wait "round-${round}-to-reveal" "$ART_DIR/game/round-${round}-to-reveal.json"
  parallel_reveal_round "$round"
  advance_with_wait "round-${round}-after-reveal" "$ART_DIR/game/round-${round}-after-reveal.json"
  node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-round-${round}.json"
done

log "Terminal actions"
for idx in 1 2 3; do
  node scripts-js/gameCli.js claim --rpc-url "$RPC" --game-id "$GID" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/claim-player-${idx}.json"
done
node scripts-js/gameCli.js withdraw-treasury --rpc-url "$RPC" --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/withdraw-treasury.json"
for idx in 1 2 3; do
  node scripts-js/gameCli.js withdraw-cause --rpc-url "$RPC" --game-id "$GID" --cause-id "$idx" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/withdraw-cause-${idx}.json"
done
node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-final.json"
node scripts-js/queryCli.js export --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --out "$ART_DIR/query/export" --json > "$ART_DIR/query/export.json"
node scripts-js/canaryCli.js deployment --rpc-url "$RPC" --out "$ART_DIR/deployment-summary.json" > "$ART_DIR/deployment-summary.txt"
log "Fresh Sepolia production rehearsal complete"
echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
