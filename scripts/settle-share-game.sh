#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <game-id> <out-dir> <player-id> [player-id ...]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
GAME_ID="$1"
OUT_DIR="$2"
shift 2
PLAYERS=("$@")
RPC_URL="${RPC_URL:-https://sepolia.base.org}"
OWNER_KS=botnotstrawberry-base-wallet
OWNER_PW=/root/.secrets/botnotstrawberry-base-wallet.pass
PARALLELISM="${PARALLELISM:-8}"
CAUSE_COUNT=8
mkdir -p "$OUT_DIR/commit-bundles"

player_ks(){ echo "canary-player-$1"; }
player_pw(){ echo "/root/.secrets/canary-player-$1.pass"; }
player_cause(){ echo $(( (($1 - 1) % CAUSE_COUNT) + 1 )); }
log(){ printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

wait_batch() {
  local rc=0 pid
  for pid in "$@"; do
    wait "$pid" || rc=1
  done
  return "$rc"
}

advance_with_wait() {
  local label="$1" outfile="$2"
  cd "$FOUNDRY_DIR"
  for try in $(seq 1 90); do
    if node scripts-js/gameCli.js advance --rpc-url "$RPC_URL" --game-id "$GAME_ID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$outfile"; then
      log "Advance succeeded for ${label} on try ${try}"
      return 0
    fi
    sleep 5
  done
  return 1
}

parallel_prepare_commit() {
  local round="$1" pids=() rc=0 idx
  for idx in "${PLAYERS[@]}"; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC_URL" --game-id "$GAME_ID" --choice share --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --out "$OUT_DIR/commit-bundles/game-${GAME_ID}-round-${round}-player-${idx}.json" --json > "$OUT_DIR/prepare-r${round}-p${idx}.json"
      node scripts-js/gameCli.js commit --rpc-url "$RPC_URL" --game-id "$GAME_ID" --input "$OUT_DIR/commit-bundles/game-${GAME_ID}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$OUT_DIR/commit-r${round}-p${idx}.json"
    ) &
    pids+=("$!")
    if (( ${#pids[@]} >= PARALLELISM )); then
      wait_batch "${pids[@]}" || rc=1
      pids=()
    fi
  done
  if (( ${#pids[@]} > 0 )); then
    wait_batch "${pids[@]}" || rc=1
  fi
  return "$rc"
}

parallel_reveal() {
  local round="$1" pids=() rc=0 idx
  for idx in "${PLAYERS[@]}"; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js reveal --rpc-url "$RPC_URL" --game-id "$GAME_ID" --input "$OUT_DIR/commit-bundles/game-${GAME_ID}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$OUT_DIR/reveal-r${round}-p${idx}.json"
    ) &
    pids+=("$!")
    if (( ${#pids[@]} >= PARALLELISM )); then
      wait_batch "${pids[@]}" || rc=1
      pids=()
    fi
  done
  if (( ${#pids[@]} > 0 )); then
    wait_batch "${pids[@]}" || rc=1
  fi
  return "$rc"
}

parallel_claim() {
  local pids=() rc=0 idx
  for idx in "${PLAYERS[@]}"; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js claim --rpc-url "$RPC_URL" --game-id "$GAME_ID" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$OUT_DIR/claim-p${idx}.json"
    ) &
    pids+=("$!")
    if (( ${#pids[@]} >= PARALLELISM )); then
      wait_batch "${pids[@]}" || rc=1
      pids=()
    fi
  done
  if (( ${#pids[@]} > 0 )); then
    wait_batch "${pids[@]}" || rc=1
  fi
  return "$rc"
}

withdraw_all_causes() {
  local idx
  cd "$FOUNDRY_DIR"
  for idx in $(seq 1 8); do
    node scripts-js/gameCli.js withdraw-cause --rpc-url "$RPC_URL" --game-id "$GAME_ID" --cause-id "$idx" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$OUT_DIR/withdraw-cause-${idx}.json" || true
  done
}

log "Advance current game into commit"
advance_with_wait "join->commit" "$OUT_DIR/advance-start.json"

for round in 1 2 3; do
  log "Round ${round} commit"
  parallel_prepare_commit "$round"
  advance_with_wait "round-${round}-to-reveal" "$OUT_DIR/advance-r${round}-to-reveal.json"
  log "Round ${round} reveal"
  parallel_reveal "$round"
  advance_with_wait "round-${round}-after-reveal" "$OUT_DIR/advance-r${round}-after-reveal.json"
done

log "Claims"
parallel_claim

log "Treasury and cause withdrawals"
cd "$FOUNDRY_DIR"
node scripts-js/gameCli.js withdraw-treasury --rpc-url "$RPC_URL" --game-id "$GAME_ID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$OUT_DIR/withdraw-treasury.json" || true
withdraw_all_causes

log "Done"
