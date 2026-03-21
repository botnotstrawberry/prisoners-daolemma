#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)-base-sepolia-32p-design-dataset}"
ART_DIR_REL="canary/base-sepolia/${RUN_ID}"
ART_DIR="$FOUNDRY_DIR/${ART_DIR_REL}"
mkdir -p "$ART_DIR" "$ART_DIR/auth" "$ART_DIR/game/commit-bundles" "$ART_DIR/query" "$ART_DIR/causes" "$ART_DIR/funding"

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

RPC_URL="${RPC_URL:-https://sepolia.base.org}"
OWNER_KS=botnotstrawberry-base-wallet
OWNER_PW=/root/.secrets/botnotstrawberry-base-wallet.pass
PLAYER_COUNT=32
CAUSE_COUNT=8
TARGET_PLAYER_WEI="${TARGET_PLAYER_WEI:-5000000000000000}"
PARALLELISM="${PARALLELISM:-8}"
FROM_BLOCK=0
FUNDING_NONCE=""

log(){ printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
player_ks(){ echo "canary-player-$1"; }
player_pw(){ echo "/root/.secrets/canary-player-$1.pass"; }
player_keystore_path(){ echo "$HOME/.foundry/keystores/$(player_ks "$1")"; }
player_addr(){ cast wallet address --account "$(player_ks "$1")" --password-file "$(player_pw "$1")"; }
player_cause(){ echo $(( (($1 - 1) % CAUSE_COUNT) + 1 )); }

ensure_player_wallet() {
  local idx="$1" ks pw_file pw addr
  ks="$(player_ks "$idx")"
  pw_file="$(player_pw "$idx")"

  if [[ -f "$(player_keystore_path "$idx")" ]]; then
    if [[ ! -f "$pw_file" ]]; then
      log "Missing password file for existing keystore $ks"
      return 1
    fi
    python3 - <<'PY' "$(player_keystore_path "$idx")" "$ks" "$pw_file"
import json, subprocess, sys
path, ks, pw = sys.argv[1:4]
with open(path) as f:
    data = json.load(f)
if not data.get('address'):
    addr = subprocess.check_output(['cast','wallet','address','--account',ks,'--password-file',pw], text=True).strip().lower().removeprefix('0x')
    data['address'] = addr
    with open(path, 'w') as f:
        json.dump(data, f)
PY
    return 0
  fi

  if [[ -f "$pw_file" ]]; then
    log "Refusing to create $ks because password file already exists without keystore"
    return 1
  fi

  pw="$(openssl rand -hex 16)"
  umask 077
  printf '%s\n' "$pw" > "$pw_file"
  cast wallet new "$HOME/.foundry/keystores" "$ks" --unsafe-password "$pw" >/tmp/${ks}.wallet.out
  addr="$(player_addr "$idx")"
  python3 - <<'PY' "$(player_keystore_path "$idx")" "$addr"
import json, sys
path, addr = sys.argv[1:3]
with open(path) as f:
    data = json.load(f)
data['address'] = addr.lower().removeprefix('0x')
with open(path, 'w') as f:
    json.dump(data, f)
PY
  log "Created keystore $ks ($addr)"
}

ensure_player_funded() {
  local idx="$1" addr current delta
  addr="$(player_addr "$idx")"
  current="$(cast balance "$addr" --rpc-url "$RPC_URL")"
  if (( current >= TARGET_PLAYER_WEI )); then
    printf '%s\t%s\t%s\t%s\n' "$idx" "$addr" "$current" "0" >> "$ART_DIR/funding/player-balances.tsv"
    return 0
  fi
  delta=$(( TARGET_PLAYER_WEI - current ))
  log "Funding player $idx ($addr) with ${delta} wei using owner nonce ${FUNDING_NONCE}"
  cast send "$addr" --value "$delta" --nonce "$FUNDING_NONCE" --rpc-url "$RPC_URL" --account "$OWNER_KS" --password-file "$OWNER_PW" >/tmp/fund-player-${idx}.out
  FUNDING_NONCE=$(( FUNDING_NONCE + 1 ))
  printf '%s\t%s\t%s\t%s\n' "$idx" "$addr" "$current" "$delta" >> "$ART_DIR/funding/player-balances.tsv"
}

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
  for try in $(seq 1 90); do
    if (cd "$FOUNDRY_DIR" && node scripts-js/gameCli.js advance --rpc-url "$RPC_URL" --game-id "$gid" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$outfile"); then
      log "Advance succeeded for ${label} on try ${try}"
      return 0
    fi
    sleep 5
  done
  log "Advance failed for ${label}"
  return 1
}

wait_batch() {
  local rc=0 pid
  for pid in "$@"; do
    wait "$pid" || rc=1
  done
  return "$rc"
}

parallel_join_players() {
  local gid="$1" pids=() rc=0 idx cause
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    cause="$(player_cause "$idx")"
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js join --rpc-url "$RPC_URL" --game-id "$gid" --cause-id "$cause" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/join-player-${idx}.json"
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

parallel_post_cause_messages() {
  local gid="$1" pids=() rc=0 idx cause
  for idx in $(seq 1 8); do
    cause="$(player_cause "$idx")"
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js post-cause --rpc-url "$RPC_URL" --game-id "$gid" --cause-id "$cause" --text "Cause ${cause}: SHARE for three rounds. Preserve trust and split the pot." --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/post-cause-player-${idx}.json"
    ) &
    pids+=("$!")
  done
  wait_batch "${pids[@]}" || rc=1
  return "$rc"
}

parallel_commit_round() {
  local gid="$1" round="$2" pids=() rc=0 idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC_URL" --game-id "$gid" --choice share --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --out "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --json > "$ART_DIR/game/game-${gid}-round-${round}-prepare-player-${idx}.json"
      node scripts-js/gameCli.js commit --rpc-url "$RPC_URL" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${gid}-round-${round}-commit-player-${idx}.json"
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

parallel_reveal_round() {
  local gid="$1" round="$2" pids=() rc=0 idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js reveal --rpc-url "$RPC_URL" --game-id "$gid" --input "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/game-${gid}-round-${round}-reveal-player-${idx}.json"
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

parallel_claim_winners() {
  local gid="$1" pids=() rc=0 idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js claim --rpc-url "$RPC_URL" --game-id "$gid" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/claim-player-${idx}.json"
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

withdraw_causes() {
  local gid="$1" idx
  for idx in $(seq 1 "$CAUSE_COUNT"); do
    cd "$FOUNDRY_DIR"
    node scripts-js/gameCli.js withdraw-cause --rpc-url "$RPC_URL" --game-id "$gid" --cause-id "$idx" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/withdraw-cause-${idx}.json"
  done
}

write_operator_notes() {
  local gid="$1" deploy_tx="$2"
  {
    echo "# Operator Notes"
    echo
    echo "- Run id: $RUN_ID"
    echo "- Commit: $(cd "$ROOT" && git rev-parse HEAD)"
    echo "- RPC: $RPC_URL"
    echo "- Game id: $gid"
    echo "- Deploy tx: $deploy_tx"
    echo "- Profile: join=${PRISONERS_JOIN_DURATION_SECONDS}s commit=${PRISONERS_COMMIT_DURATION_BLOCKS} reveal=${PRISONERS_REVEAL_DURATION_BLOCKS} min=${PRISONERS_MIN_PLAYERS} max=${PRISONERS_MAX_PLAYERS} causes=${PRISONERS_MAX_CAUSES} entryFeeWei=${PRISONERS_ENTRY_FEE_WEI}"
    echo "- Scenario: 32-player cooperative design dataset (all players SHARE for 3 rounds across 8 causes)"
    echo "- Owner/verifier/treasury wallet: ${PRISONERS_OWNER}"
    echo
    echo "## Player wallets"
    for idx in $(seq 1 "$PLAYER_COUNT"); do
      echo "- Player ${idx}: $(player_addr "$idx") (keystore $(player_ks "$idx"), cause $(player_cause "$idx"))"
    done
  } > "$ART_DIR/operator-notes.md"
}

main() {
  log "Ensuring 32 player wallets exist"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    ensure_player_wallet "$idx"
  done

  : > "$ART_DIR/funding/player-balances.tsv"
  printf 'player\taddress\tbalanceWeiBefore\ttopupWei\n' > "$ART_DIR/funding/player-balances.tsv"

  FUNDING_NONCE="$(cast nonce "$PRISONERS_OWNER" --rpc-url "$RPC_URL" --block pending)"
  log "Funding players to target balance ${TARGET_PLAYER_WEI} wei starting from owner pending nonce ${FUNDING_NONCE}"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    ensure_player_funded "$idx"
  done

  log "Preflight"
  cd "$ROOT"
  yarn canary:preflight -- --rpc-url "$RPC_URL" --deployer-keystore "$OWNER_KS" --out "$ART_DIR_REL/preflight.json" | tee "$ART_DIR/preflight.log"

  log "Deploy fresh Sepolia contracts"
  cd "$FOUNDRY_DIR"
  mkdir -p deployments
  forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --ffi --account "$OWNER_KS" --password-file "$OWNER_PW" --broadcast | tee "$ART_DIR/deploy.log"
  cp deployments/84532.json "$ART_DIR/deployments-84532.json"
  DEPLOY_TX_HASH="$(jq -r '.transactions[0].hash' broadcast/Deploy.s.sol/84532/run-latest.json)"
  FROM_BLOCK="$(python3 - <<'PY' "$RPC_URL" "$DEPLOY_TX_HASH"
import json, subprocess, sys
rpc, tx_hash = sys.argv[1], sys.argv[2]
out = subprocess.check_output(['cast', 'receipt', tx_hash, '--rpc-url', rpc, '--json'], text=True)
block_number = json.loads(out)['blockNumber']
print(int(block_number, 16) if isinstance(block_number, str) else int(block_number))
PY
)"
  echo "$FROM_BLOCK" > "$ART_DIR/from-block.txt"

  log "Verify contracts"
  forge script script/VerifyAll.s.sol --ffi --rpc-url "$RPC_URL" | tee "$ART_DIR/verify.log"

  log "Deployment summary"
  node scripts-js/canaryCli.js deployment --rpc-url "$RPC_URL" --out "$ART_DIR_REL/deployment-summary.json" | tee "$ART_DIR/deployment-summary.txt"
  REG="$(jq -r '.addresses.registry' "$ART_DIR/deployment-summary.json")"

  log "Whitelist 8 causes"
  for idx in $(seq 1 "$CAUSE_COUNT"); do
    node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC_URL" --cause-id "$idx" --recipient "$(player_addr "$idx")" --metadata-text "design-dataset-cause-${idx}" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-${idx}.json"
  done

  log "Authorize and register 32 players"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    mkdir -p "$ART_DIR/auth/player-$idx"
    node scripts-js/authCli.js permit --rpc-url "$RPC_URL" --registry "$REG" --wallet "$(player_addr "$idx")" --agent-key-text "sepolia-32p-player-$idx" --manifest-uri "manifest://base-sepolia/32p-design/player-$idx" --ttl-seconds 14400 --nonce-text "sepolia-32p-player-$idx-${RUN_ID}" --verifier-keystore "$OWNER_KS" --verifier-keystore-password-file "$OWNER_PW" --out "$ART_DIR/auth/player-$idx/auth-permit.json"
    node scripts-js/authCli.js register --rpc-url "$RPC_URL" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/auth/player-$idx/auth-register.json"
    node scripts-js/authCli.js status --rpc-url "$RPC_URL" --permit-file "$ART_DIR/auth/player-$idx/auth-permit.json" --json > "$ART_DIR/auth/player-$idx/auth-status.json"
  done

  log "Create game"
  node scripts-js/gameCli.js create --rpc-url "$RPC_URL" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/create-game.json"
  GID="$(jq -r '.gameId' "$ART_DIR/game/create-game.json")"

  log "Join 32 players"
  parallel_join_players "$GID"
  node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"

  log "Post coalition messages"
  cd "$FOUNDRY_DIR"
  node scripts-js/gameCli.js post-global --rpc-url "$RPC_URL" --game-id "$GID" --text "Base Sepolia 32-player design dataset: cooperative coalition run." --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/post-global-player-1.json"
  parallel_post_cause_messages "$GID"
  node scripts-js/queryCli.js messages --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/messages-after-join.json"

  JOIN_DEADLINE="$(jq -r '.joinDeadline' "$ART_DIR/game/create-game.json")"
  wait_until_deadline "$JOIN_DEADLINE" "32-player join deadline"
  advance_with_wait "$GID" "join->commit" "$ART_DIR/game/start-advance.json"

  for round in 1 2 3; do
    log "Round ${round}: prepare + commit"
    parallel_commit_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-to-reveal" "$ART_DIR/game/round-${round}-to-reveal.json"

    log "Round ${round}: reveal"
    parallel_reveal_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-after-reveal" "$ART_DIR/game/round-${round}-after-reveal.json"
    node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-round-${round}.json"
  done

  log "Claim 32 winner shares"
  parallel_claim_winners "$GID"

  log "Withdraw treasury and cause balances"
  cd "$FOUNDRY_DIR"
  node scripts-js/gameCli.js withdraw-treasury --rpc-url "$RPC_URL" --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/withdraw-treasury.json"
  withdraw_causes "$GID"

  log "Export final evidence"
  node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-live.json"
  node scripts-js/queryCli.js messages --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/messages-final.json"
  node scripts-js/queryCli.js export --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --out "$ART_DIR_REL/query/game-${GID}-export-final" --json > "$ART_DIR/query/export.json"

  log "Generate judge pack"
  cd "$ROOT"
  yarn judge:evidence -- --bundle "$ART_DIR_REL" | tee "$ART_DIR/judge-evidence.log"

  write_operator_notes "$GID" "$DEPLOY_TX_HASH"

  log "Publish game data for web app"
  yarn games:publish | tee "$ART_DIR/games-publish.log"

  log "32-player Sepolia design dataset complete"
  echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
}

main "$@"
