#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-fresh-sepolia-public-launch-rehearsal}"
ART_DIR="$ROOT/.mainnet-readiness/$RUN_ID"
mkdir -p "$ART_DIR" "$ART_DIR/auth" "$ART_DIR/game/commit-bundles" "$ART_DIR/query" "$ART_DIR/causes" "$ART_DIR/funding"

export FOUNDRY_PROFILE=production
export PRISONERS_OWNER="${PRISONERS_OWNER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_TREASURY="${PRISONERS_TREASURY:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export ERC8004_IDENTITY_REGISTRY="${ERC8004_IDENTITY_REGISTRY:-0x7177a6867296406881E20d6647232314736Dd09A}"
export PRISONERS_ENTRY_FEE_WEI="${PRISONERS_ENTRY_FEE_WEI:-1000000000000000}"
export PRISONERS_CREATOR_FEE_BPS="${PRISONERS_CREATOR_FEE_BPS:-100}"
export PRISONERS_CAUSE_FEE_BPS="${PRISONERS_CAUSE_FEE_BPS:-100}"
export PRISONERS_JOIN_DURATION_SECONDS="${PRISONERS_JOIN_DURATION_SECONDS:-300}"
export PRISONERS_COMMIT_DURATION_BLOCKS="${PRISONERS_COMMIT_DURATION_BLOCKS:-60}"
export PRISONERS_REVEAL_DURATION_BLOCKS="${PRISONERS_REVEAL_DURATION_BLOCKS:-60}"
export PRISONERS_MIN_PLAYERS="${PRISONERS_MIN_PLAYERS:-9}"
export PRISONERS_MAX_PLAYERS="${PRISONERS_MAX_PLAYERS:-9}"
export PRISONERS_MAX_CAUSES="${PRISONERS_MAX_CAUSES:-2}"

RPC_URL="${RPC_URL:-https://sepolia.base.org}"
OWNER_KS=botnotstrawberry-base-wallet
OWNER_PW=/root/.secrets/botnotstrawberry-base-wallet.pass
PLAYER_COUNT=9
CAUSE_COUNT=2
TARGET_PLAYER_WEI="${TARGET_PLAYER_WEI:-3000000000000000}"
PARALLELISM="${PARALLELISM:-5}"
FROM_BLOCK=0

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
  log "Funding player $idx ($addr) with ${delta} wei"
  local tx_hash pending_nonce
  pending_nonce="$(cast nonce "$PRISONERS_OWNER" --rpc-url "$RPC_URL" --block pending)"
  tx_hash="$(cast send "$addr" --value "$delta" --nonce "$pending_nonce" --rpc-url "$RPC_URL" --account "$OWNER_KS" --password-file "$OWNER_PW" --json | jq -r '.transactionHash')"
  cast receipt "$tx_hash" --rpc-url "$RPC_URL" >/dev/null
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

retry_capture_json() {
  local outfile="$1"
  shift
  local rc=0 try
  for try in $(seq 1 5); do
    if "$@" > "$outfile"; then
      return 0
    fi
    rc=$?
    log "Retry ${try}/5 for command: $*"
    sleep 5
  done
  return "$rc"
}

parallel_join_players() {
  local gid="$1" pids=() rc=0 idx cause
  for idx in $(seq 2 "$PLAYER_COUNT"); do
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

main() {
  log "Prepare player wallets"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    ensure_player_wallet "$idx"
  done

  log "Preflight"
  cd "$ROOT"
  yarn canary:preflight -- --rpc-url baseSepolia --deployer-keystore "$OWNER_KS" --out "$ART_DIR/preflight.json" | tee "$ART_DIR/preflight.log"

  log "Deploy"
  mkdir -p "$FOUNDRY_DIR/deployments"
  cd "$FOUNDRY_DIR"
  forge script script/Deploy.s.sol --rpc-url baseSepolia --ffi --account "$OWNER_KS" --password-file "$OWNER_PW" --broadcast | tee "$ART_DIR/deploy.log"
  cp deployments/84532.json "$ART_DIR/deployments-84532.json"
  DEPLOY_TX_HASH=$(jq -r '.transactions[0].hash' broadcast/Deploy.s.sol/84532/run-latest.json)
  FROM_BLOCK=$(python3 - <<'PY' "baseSepolia" "$DEPLOY_TX_HASH"
import json, subprocess, sys
rpc, tx_hash = sys.argv[1], sys.argv[2]
out = subprocess.check_output(['cast', 'receipt', tx_hash, '--rpc-url', rpc, '--json'], text=True)
print(int(json.loads(out)['blockNumber'], 16))
PY
)
  echo "$FROM_BLOCK" > "$ART_DIR/from-block.txt"

  log "Verify"
  forge script script/VerifyAll.s.sol --ffi --rpc-url baseSepolia | tee "$ART_DIR/verify.log"

  log "Deployment summary"
  node scripts-js/canaryCli.js deployment --rpc-url baseSepolia --out "$ART_DIR/deployment-summary.json" --json > "$ART_DIR/deployment-summary.txt"
  AUTH_REG=$(jq -r '.addresses.authRegistry' "$ART_DIR/deployment-summary.json")
  GAME_ADDR=$(jq -r '.addresses.game' "$ART_DIR/deployment-summary.json")
  DEPLOYED_ERC8004_REG=$(jq -r '.onchain.identityRegistry' "$ART_DIR/deployment-summary.json")
  if [[ "${DEPLOYED_ERC8004_REG,,}" != "${ERC8004_IDENTITY_REGISTRY,,}" ]]; then
    log "Deployment wired unexpected ERC-8004 registry: $DEPLOYED_ERC8004_REG (expected $ERC8004_IDENTITY_REGISTRY)"
    exit 1
  fi
  if [[ -f "$ART_DIR/from-block.txt" ]]; then
    FROM_BLOCK=$(cat "$ART_DIR/from-block.txt")
  fi

  log "Whitelist causes"
  for idx in $(seq 1 "$CAUSE_COUNT"); do
    retry_capture_json "$ART_DIR/causes/whitelist-cause-${idx}.json" \
      node scripts-js/gameCli.js whitelist-cause --rpc-url baseSepolia --cause-id "$idx" --recipient "$(player_addr "$idx")" --metadata-text "public-launch-cause-$idx" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json
  done

  log "Fund 9 players"
  : > "$ART_DIR/funding/player-balances.tsv"
  FUNDING_NONCE="$(cast nonce "$PRISONERS_OWNER" --rpc-url "$RPC_URL" --block pending)"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    ensure_player_funded "$idx"
  done

  log "Register 9 players on ERC-8004 Identity Registry"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    mkdir -p "$ART_DIR/auth/player-$idx"
    addr="$(player_addr "$idx")"
    node scripts-js/authCli.js status --rpc-url baseSepolia --identity-registry "$ERC8004_IDENTITY_REGISTRY" --auth-registry "$AUTH_REG" --game "$GAME_ADDR" --wallet "$addr" --json > "$ART_DIR/auth/player-$idx/auth-status.json"
    if [[ "$(jq -r '.isAuthorized' "$ART_DIR/auth/player-$idx/auth-status.json")" == "true" ]]; then
      jq -n --argjson player "$idx" --arg wallet "$addr" --arg status "already_registered" '{player:$player,wallet:$wallet,status:$status}' > "$ART_DIR/auth/player-$idx/auth-register.json"
      continue
    fi
    node scripts-js/authCli.js register --rpc-url baseSepolia --identity-registry "$ERC8004_IDENTITY_REGISTRY" --auth-registry "$AUTH_REG" --game "$GAME_ADDR" --wallet "$addr" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --agent-uri "manifest://public-launch/player-$idx" --json > "$ART_DIR/auth/player-$idx/auth-register.json"
    node scripts-js/authCli.js status --rpc-url baseSepolia --identity-registry "$ERC8004_IDENTITY_REGISTRY" --auth-registry "$AUTH_REG" --game "$GAME_ADDR" --wallet "$addr" --agent-id "$(jq -r '.agentId' "$ART_DIR/auth/player-$idx/auth-register.json")" --json > "$ART_DIR/auth/player-$idx/auth-status.json"
  done

  log "Public launch by player 1, then join players 2-9"
  node scripts-js/gameCli.js launch --rpc-url baseSepolia --join-duration-seconds "$PRISONERS_JOIN_DURATION_SECONDS" --cause-id 1 --wallet-keystore "$(player_ks 1)" --wallet-keystore-password-file "$(player_pw 1)" --json > "$ART_DIR/game/launch-game.json"
  GID=$(jq -r '.gameId' "$ART_DIR/game/launch-game.json")
  parallel_join_players "$GID"
  node scripts-js/queryCli.js summary --rpc-url baseSepolia --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"

  JOIN_DEADLINE=$(jq -r '.joinDeadline' "$ART_DIR/game/launch-game.json")
  wait_until_deadline "$JOIN_DEADLINE" "public-launch rehearsal join deadline"
  advance_with_wait "$GID" "join->commit" "$ART_DIR/game/start-advance.json"

  for round in 1 2 3; do
    log "Round ${round}: commit/reveal"
    parallel_commit_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-to-reveal" "$ART_DIR/game/round-${round}-to-reveal.json"
    parallel_reveal_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-after-reveal" "$ART_DIR/game/round-${round}-after-reveal.json"
    node scripts-js/queryCli.js summary --rpc-url baseSepolia --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-round-${round}.json"
  done

  log "Terminal actions"
  parallel_claim_winners "$GID"
  retry_capture_json "$ART_DIR/game/withdraw-treasury.json" \
    node scripts-js/gameCli.js withdraw-treasury --rpc-url baseSepolia --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json
  for idx in $(seq 1 "$CAUSE_COUNT"); do
    node scripts-js/gameCli.js withdraw-cause --rpc-url baseSepolia --game-id "$GID" --cause-id "$idx" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/withdraw-cause-${idx}.json"
  done
  node scripts-js/queryCli.js summary --rpc-url baseSepolia --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-final.json"
  node scripts-js/queryCli.js export --rpc-url baseSepolia --game-id "$GID" --from-block "$FROM_BLOCK" --out "$ART_DIR/query/export" --json > "$ART_DIR/query/export.json"
  log "Fresh Sepolia public-launch rehearsal complete"
  echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
}

main "$@"
