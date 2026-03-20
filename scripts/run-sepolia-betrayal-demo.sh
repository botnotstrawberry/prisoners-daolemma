#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)-base-sepolia-betrayal-demo}"
ART_DIR_REL="canary/base-sepolia/${RUN_ID}"
ART_DIR="$FOUNDRY_DIR/${ART_DIR_REL}"
mkdir -p "$ART_DIR" "$ART_DIR/auth" "$ART_DIR/game/commit-bundles" "$ART_DIR/query" "$ART_DIR/causes"

export FOUNDRY_PROFILE=production
export PRISONERS_OWNER="${PRISONERS_OWNER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_TREASURY="${PRISONERS_TREASURY:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_AUTH_VERIFIER="${PRISONERS_AUTH_VERIFIER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
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

player_addr(){
  case "$1" in
    1) echo 0x373c73a96C40F82D8E684448527E78Aa90572AaA ;;
    2) echo 0xd5B820002455D9E19044b2830Bb30eD813bf3424 ;;
    3) echo 0xbae5f91Cca261A85b7f2BCCb02b1de5F6cE88384 ;;
    *) return 1 ;;
  esac
}
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

prepare_and_commit() {
  local gid="$1" round="$2" player="$3" choice="$4"
  cd "$FOUNDRY_DIR"
  node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC" --game-id "$gid" --choice "$choice" --wallet-keystore "$(player_ks "$player")" --wallet-keystore-password-file "$(player_pw "$player")" --out "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${player}.json" --json > "$ART_DIR/game/game-${gid}-round-${round}-prepare-player-${player}.json"
  node scripts-js/gameCli.js commit --rpc-url "$RPC" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${player}.json" --wallet-keystore "$(player_ks "$player")" --wallet-keystore-password-file "$(player_pw "$player")" --json > "$ART_DIR/game/game-${gid}-round-${round}-commit-player-${player}.json"
}

reveal_from_bundle() {
  local gid="$1" round="$2" player="$3"
  cd "$FOUNDRY_DIR"
  node scripts-js/gameCli.js reveal --rpc-url "$RPC" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${player}.json" --wallet-keystore "$(player_ks "$player")" --wallet-keystore-password-file "$(player_pw "$player")" --json > "$ART_DIR/game/game-${gid}-round-${round}-reveal-player-${player}.json"
}

main() {
  log "Preflight"
  cd "$FOUNDRY_DIR"
  yarn canary:preflight -- --rpc-url "$RPC" --deployer-keystore "$OWNER_KS" --out "$ART_DIR_REL/preflight.json" | tee "$ART_DIR/preflight.log"

  log "Deploy fresh Sepolia contracts"
  mkdir -p deployments
  forge script script/Deploy.s.sol --rpc-url "$RPC" --ffi --account "$OWNER_KS" --password-file "$OWNER_PW" --broadcast | tee "$ART_DIR/deploy.log"
  cp deployments/84532.json "$ART_DIR/deployments-84532.json"
  DEPLOY_TX_HASH=$(jq -r '.transactions[0].hash' broadcast/Deploy.s.sol/84532/run-latest.json)
  FROM_BLOCK=$(python3 - <<'PY' "$RPC" "$DEPLOY_TX_HASH"
import json, subprocess, sys
rpc, tx_hash = sys.argv[1], sys.argv[2]
out = subprocess.check_output(['cast', 'receipt', tx_hash, '--rpc-url', rpc, '--json'], text=True)
block_number = json.loads(out)['blockNumber']
print(int(block_number, 16) if isinstance(block_number, str) else int(block_number))
PY
)
  echo "$FROM_BLOCK" > "$ART_DIR/from-block.txt"

  log "Verify contracts"
  forge script script/VerifyAll.s.sol --ffi --rpc-url "$RPC" | tee "$ART_DIR/verify.log"

  log "Capture deployment summary"
  node scripts-js/canaryCli.js deployment --rpc-url "$RPC" --out "$ART_DIR_REL/deployment-summary.json" | tee "$ART_DIR/deployment-summary.txt"

  log "Whitelist causes"
  node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC" --cause-id 1 --recipient "$(player_addr 1)" --metadata-text "coalition-alpha" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-1.json"
  node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC" --cause-id 2 --recipient "$(player_addr 3)" --metadata-text "coalition-beta" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-2.json"

  log "Auth 3 players"
  REG=$(jq -r '.addresses.registry' "$ART_DIR/deployment-summary.json")
  for idx in 1 2 3; do
    mkdir -p "$ART_DIR/auth/player-$idx"
    node scripts-js/authCli.js permit --rpc-url "$RPC" --registry "$REG" --wallet "$(player_addr "$idx")" --agent-key-text "sepolia-betrayal-player-$idx" --manifest-uri "manifest://sepolia-betrayal-demo/player-$idx" --ttl-seconds 14400 --nonce-text "sepolia-betrayal-player-$idx-${RUN_ID}" --verifier-keystore "$OWNER_KS" --verifier-keystore-password-file "$OWNER_PW" --out "$ART_DIR/auth/player-$idx/auth-permit.json"
    node scripts-js/authCli.js register --rpc-url "$RPC" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/auth/player-$idx/auth-register.json"
    node scripts-js/authCli.js status --rpc-url "$RPC" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --json > "$ART_DIR/auth/player-$idx/auth-status.json"
  done

  log "Create game"
  node scripts-js/gameCli.js create --rpc-url "$RPC" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/create-game.json"
  GID=$(jq -r '.gameId' "$ART_DIR/game/create-game.json")

  log "Join players (cause 1, cause 1, cause 2)"
  node scripts-js/gameCli.js join --rpc-url "$RPC" --game-id "$GID" --cause-id 1 --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/join-player-1.json"
  node scripts-js/gameCli.js join --rpc-url "$RPC" --game-id "$GID" --cause-id 1 --wallet-keystore "$(player_ks 2)" --wallet-keystore-password-file "$(player_pw 2)" --json > "$ART_DIR/game/join-player-2.json"
  node scripts-js/gameCli.js join --rpc-url "$RPC" --game-id "$GID" --cause-id 2 --wallet-keystore "$(player_ks 3)" --wallet-keystore-password-file "$(player_pw 3)" --json > "$ART_DIR/game/join-player-3.json"
  node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"

  log "Post strategic messages"
  node scripts-js/gameCli.js post-global --rpc-url "$RPC" --game-id "$GID" --text "Fresh Sepolia rehearsal: trust, cooperation, and incentives under pressure." --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/post-global-player-1.json"
  node scripts-js/gameCli.js post-cause --rpc-url "$RPC" --game-id "$GID" --cause-id 1 --text "Coalition Alpha: let's SHARE this round." --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/post-cause-player-1.json"
  node scripts-js/gameCli.js post-cause --rpc-url "$RPC" --game-id "$GID" --cause-id 1 --text "Agreed. I will SHARE with the coalition." --wallet-keystore "$(player_ks 2)" --wallet-keystore-password-file "$(player_pw 2)" --json > "$ART_DIR/game/post-cause-player-2.json"

  JOIN_DEADLINE=$(jq -r '.joinDeadline' "$ART_DIR/game/create-game.json")
  wait_until_deadline "$JOIN_DEADLINE" "join deadline"
  advance_with_wait "$GID" "join->commit" "$ART_DIR/game/start-advance.json"

  log "Prepare and commit round 1 (player 2 betrays)"
  prepare_and_commit "$GID" 1 1 share
  prepare_and_commit "$GID" 1 2 steal
  prepare_and_commit "$GID" 1 3 share

  advance_with_wait "$GID" "round-1-to-reveal" "$ART_DIR/game/round-1-to-reveal.json"

  log "Reveal round 1"
  reveal_from_bundle "$GID" 1 1
  reveal_from_bundle "$GID" 1 2
  reveal_from_bundle "$GID" 1 3

  advance_with_wait "$GID" "round-1-after-reveal" "$ART_DIR/game/round-1-after-reveal.json"
  node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-final.json"
  node scripts-js/queryCli.js messages --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/messages-final.json"

  log "Claim winner + withdraws"
  node scripts-js/gameCli.js claim --rpc-url "$RPC" --game-id "$GID" --wallet-keystore "$(player_ks 2)" --wallet-keystore-password-file "$(player_pw 2)" --json > "$ART_DIR/game/claim-player-2.json"
  node scripts-js/gameCli.js withdraw-treasury --rpc-url "$RPC" --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/withdraw-treasury.json"
  node scripts-js/gameCli.js withdraw-cause --rpc-url "$RPC" --game-id "$GID" --cause-id 1 --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/withdraw-cause-1.json"
  node scripts-js/queryCli.js export --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --out "$ART_DIR_REL/query/game-${GID}-export-final" --json > "$ART_DIR/query/export.json"
  node scripts-js/queryCli.js summary --rpc-url "$RPC" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-live.json"

  log "Publish games for web app"
  cd "$ROOT"
  yarn games:publish | tee "$ART_DIR/games-publish.log"

  log "Sepolia betrayal demo complete"
  echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
}

main "$@"
