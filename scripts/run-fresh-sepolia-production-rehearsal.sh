#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-fresh-sepolia-production-rehearsal}"
ART_DIR="$ROOT/.mainnet-readiness/$RUN_ID"
mkdir -p "$ART_DIR" "$ART_DIR/auth" "$ART_DIR/game/commit-bundles" "$ART_DIR/query" "$ART_DIR/causes"

export FOUNDRY_PROFILE=production
export PRISONERS_OWNER="${PRISONERS_OWNER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_TREASURY="${PRISONERS_TREASURY:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_AUTH_VERIFIER="${PRISONERS_AUTH_VERIFIER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
# Fresh-rehearsal defaults: fast enough to iterate, roomy enough for public-testnet ops.
export PRISONERS_ENTRY_FEE_WEI="${PRISONERS_ENTRY_FEE_WEI:-1000000000000000}"
export PRISONERS_CREATOR_FEE_BPS="${PRISONERS_CREATOR_FEE_BPS:-100}"
export PRISONERS_CAUSE_FEE_BPS="${PRISONERS_CAUSE_FEE_BPS:-100}"
export PRISONERS_JOIN_DURATION_SECONDS="${PRISONERS_JOIN_DURATION_SECONDS:-120}"
export PRISONERS_COMMIT_DURATION_BLOCKS="${PRISONERS_COMMIT_DURATION_BLOCKS:-40}"
export PRISONERS_REVEAL_DURATION_BLOCKS="${PRISONERS_REVEAL_DURATION_BLOCKS:-40}"
export PRISONERS_MIN_PLAYERS="${PRISONERS_MIN_PLAYERS:-3}"
export PRISONERS_MAX_PLAYERS="${PRISONERS_MAX_PLAYERS:-32}"
export PRISONERS_MAX_CAUSES="${PRISONERS_MAX_CAUSES:-8}"

RPC=baseSepolia
OWNER_KS=botnotstrawberry-base-wallet
OWNER_PW=/root/.secrets/botnotstrawberry-base-wallet.pass
FROM_BLOCK=0

player_addr(){ case "$1" in 1) echo 0x373c73a96C40F82D8E684448527E78Aa90572AaA;; 2) echo 0xd5B820002455D9E19044b2830Bb30eD813bf3424;; 3) echo 0xbae5f91Cca261A85b7f2BCCb02b1de5F6cE88384;; esac; }
player_ks(){ echo "canary-player-$1"; }
player_pw(){ echo "/root/.secrets/canary-player-$1.pass"; }
log(){ printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

wait_until_deadline() {
  local ts="$1" label="$2" now sleep_for
  now="$(date +%s)"
  if (( now < ts + 5 )); then
    sleep_for=$(( ts + 5 - now ))
    log "Waiting ${sleep_for}s for ${label}"
    sleep "$sleep_for"
  fi
}

advance_with_wait() {
  local gid="$1" label="$2" outfile="$3"
  for try in $(seq 1 60); do
    if (cd "$FOUNDRY_DIR" && node scripts-js/gameCli.js advance --rpc-url "$RPC" --game-id "$gid" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$outfile"); then
      log "Advance succeeded for ${label} on try ${try}"
      return 0
    fi
    sleep 10
  done
  log "Advance failed for ${label}"
  return 1
}

parallel_commit_round() {
  local gid="$1" round="$2"
  local pids=()
  for idx in 1 2 3; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC" --game-id "$gid" --choice share --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --out "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --json > "$ART_DIR/game/game-${gid}-round-${round}-prepare-player-${idx}.json"
      node scripts-js/gameCli.js commit --rpc-url "$RPC" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${gid}-round-${round}-commit-player-${idx}.json"
    ) &
    pids+=("$!")
  done
  local rc=0 pid
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  return "$rc"
}

parallel_reveal_round() {
  local gid="$1" round="$2"
  local pids=()
  for idx in 1 2 3; do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js reveal --rpc-url "$RPC" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${gid}-round-${round}-reveal-player-${idx}.json"
    ) &
    pids+=("$!")
  done
  local rc=0 pid
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  return "$rc"
}

main() {
  log "Preflight"
  cd "$ROOT"
  yarn canary:preflight -- --rpc-url "$RPC" --deployer-keystore "$OWNER_KS" --out "$ART_DIR/preflight.json" | tee "$ART_DIR/preflight.log"

  log "Deploy"
  mkdir -p "$FOUNDRY_DIR/deployments"
  cd "$FOUNDRY_DIR"
  forge script script/Deploy.s.sol --rpc-url "$RPC" --ffi --account "$OWNER_KS" --password-file "$OWNER_PW" --broadcast | tee "$ART_DIR/deploy.log"
  cp deployments/84532.json "$ART_DIR/deployments-84532.json"
  DEPLOY_TX_HASH=$(jq -r '.transactions[0].hash' broadcast/Deploy.s.sol/84532/run-latest.json)
  FROM_BLOCK=$(python3 - <<'PY' "$RPC" "$DEPLOY_TX_HASH"
import json, subprocess, sys
rpc, tx_hash = sys.argv[1], sys.argv[2]
out = subprocess.check_output(['cast', 'receipt', tx_hash, '--rpc-url', rpc, '--json'], text=True)
print(int(json.loads(out)['blockNumber'], 16))
PY
)
  echo "$FROM_BLOCK" > "$ART_DIR/from-block.txt"

  log "Verify"
  forge script script/VerifyAll.s.sol --ffi --rpc-url "$RPC" | tee "$ART_DIR/verify.log"

  log "Deployment summary"
  node scripts-js/canaryCli.js deployment --rpc-url "$RPC" --out "$ART_DIR/deployment-summary.json" | tee "$ART_DIR/deployment-summary.txt"
  if [[ -f "$ART_DIR/from-block.txt" ]]; then
    FROM_BLOCK=$(cat "$ART_DIR/from-block.txt")
  fi

  log "Whitelist causes"
  for idx in 1 2 3; do
    node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC" --cause-id "$idx" --recipient "$(player_addr "$idx")" --metadata-text "fresh-rehearsal-cause-$idx" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-${idx}.json"
  done

  log "Auth 3 players"
  REG=$(jq -r '.addresses.registry' "$ART_DIR/deployment-summary.json")
  for idx in 1 2 3; do
    mkdir -p "$ART_DIR/auth/player-$idx"
    node scripts-js/authCli.js permit --rpc-url "$RPC" --registry "$REG" --wallet "$(player_addr "$idx")" --agent-key-text "fresh-rehearsal-player-$idx" --manifest-uri "manifest://fresh-rehearsal/player-$idx" --ttl-seconds 14400 --nonce-text "fresh-rehearsal-player-$idx-${RUN_ID}" --verifier-keystore "$OWNER_KS" --verifier-keystore-password-file "$OWNER_PW" --out "$ART_DIR/auth/player-$idx/auth-permit.json"
    node scripts-js/authCli.js register --rpc-url "$RPC" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/auth/player-$idx/auth-register.json"
    node scripts-js/authCli.js status --rpc-url "$RPC" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --json > "$ART_DIR/auth/player-$idx/auth-status.json"
  done

  log "Create and join one rehearsal game"
  node scripts-js/gameCli.js create --rpc-url "$RPC" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/create-game.json"
  GID=$(jq -r '.gameId' "$ART_DIR/game/create-game.json")
  for idx in 1 2 3; do
    node scripts-js/gameCli.js join --rpc-url "$RPC" --game-id "$GID" --cause-id "$idx" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/join-player-${idx}.json"
  done
  node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"

  JOIN_DEADLINE=$(jq -r '.joinDeadline' "$ART_DIR/game/create-game.json")
  wait_until_deadline "$JOIN_DEADLINE" "fresh rehearsal join deadline"
  advance_with_wait "$GID" "join->commit" "$ART_DIR/game/start-advance.json"

  for round in 1 2 3; do
    log "Round ${round}: commit/reveal"
    parallel_commit_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-to-reveal" "$ART_DIR/game/round-${round}-to-reveal.json"
    parallel_reveal_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-after-reveal" "$ART_DIR/game/round-${round}-after-reveal.json"
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
  log "Fresh Sepolia production rehearsal complete"
  echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
}

main "$@"
