#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)-base-sepolia-32p-permissionless-chat}"
ART_DIR_REL="canary/base-sepolia/${RUN_ID}"
ART_DIR="$FOUNDRY_DIR/${ART_DIR_REL}"
mkdir -p \
  "$ART_DIR" \
  "$ART_DIR/auth" \
  "$ART_DIR/agent-instructions" \
  "$ART_DIR/causes" \
  "$ART_DIR/funding" \
  "$ART_DIR/game" \
  "$ART_DIR/game/commit-bundles" \
  "$ART_DIR/query"

export FOUNDRY_PROFILE=production
export PRISONERS_OWNER="${PRISONERS_OWNER:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export PRISONERS_TREASURY="${PRISONERS_TREASURY:-0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408}"
export ERC8004_IDENTITY_REGISTRY="${ERC8004_IDENTITY_REGISTRY:-0x7177a6867296406881E20d6647232314736Dd09A}"
export PRISONERS_ENTRY_FEE_WEI="${PRISONERS_ENTRY_FEE_WEI:-1000000000000000}"
export PRISONERS_CREATOR_FEE_BPS="${PRISONERS_CREATOR_FEE_BPS:-100}"
export PRISONERS_CAUSE_FEE_BPS="${PRISONERS_CAUSE_FEE_BPS:-100}"
export PRISONERS_JOIN_DURATION_SECONDS="${PRISONERS_JOIN_DURATION_SECONDS:-300}"
export PRISONERS_COMMIT_DURATION_BLOCKS="${PRISONERS_COMMIT_DURATION_BLOCKS:-60}"
export PRISONERS_REVEAL_DURATION_BLOCKS="${PRISONERS_REVEAL_DURATION_BLOCKS:-40}"
export PRISONERS_MIN_PLAYERS="${PRISONERS_MIN_PLAYERS:-32}"
export PRISONERS_MAX_PLAYERS="${PRISONERS_MAX_PLAYERS:-32}"
export PRISONERS_MAX_CAUSES="${PRISONERS_MAX_CAUSES:-2}"

RPC_URL="${RPC_URL:-https://sepolia.base.org}"
OWNER_KS="${OWNER_KS:-botnotstrawberry-base-wallet}"
OWNER_PW="${OWNER_PW:-/root/.secrets/botnotstrawberry-base-wallet.pass}"
PLAYER_COUNT=32
CAUSE_COUNT=2
TARGET_PLAYER_WEI="${TARGET_PLAYER_WEI:-2900000000000000}"
PARALLELISM="${PARALLELISM:-8}"
FROM_BLOCK=0
FUNDING_NONCE=""

CAUSE1_NAME="Protocol Guild"
CAUSE1_RECIPIENT="0xd16713A5D4Eb7E3aAc9D2228eB72f6f7328FADBD"
CAUSE2_NAME="Giveth Matching Pool"
CAUSE2_RECIPIENT="0x6e8873085530406995170Da467010565968C7C62"

log(){ printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
player_ks(){ echo "canary-player-$1"; }
player_pw(){ echo "/root/.secrets/canary-player-$1.pass"; }
player_keystore_path(){ echo "$HOME/.foundry/keystores/$(player_ks "$1")"; }
player_addr(){ cast wallet address --account "$(player_ks "$1")" --password-file "$(player_pw "$1")"; }
player_cause(){ if (( $1 <= 16 )); then echo 1; else echo 2; fi; }
player_cause_name(){ if (( $1 == 1 )); then echo "$CAUSE1_NAME"; else echo "$CAUSE2_NAME"; fi; }
player_cause_recipient(){ if (( $1 == 1 )); then echo "$CAUSE1_RECIPIENT"; else echo "$CAUSE2_RECIPIENT"; fi; }

cluster_for_player() {
  local idx="$1"
  if (( (idx >= 1 && idx <= 6) || (idx >= 17 && idx <= 22) )); then
    echo share
  elif (( (idx >= 7 && idx <= 12) || (idx >= 23 && idx <= 28) )); then
    echo catch
  else
    echo steal
  fi
}

choice_for_round() {
  local idx="$1" round="$2"
  if (( round >= 10 )); then
    echo share
    return 0
  fi

  case "$round" in
    1) cluster_for_player "$idx" ;;
    2)
      case "$(cluster_for_player "$idx")" in
        share) echo share ;;
        catch) echo catch ;;
        *) echo share ;;
      esac
      ;;
    *) echo share ;;
  esac
}

belief_for_cluster() {
  local cluster="$1" round="$2"
  case "$round:$cluster" in
    1:share) echo "You believe the table is leaning too hard into Catch, so Share is your best response." ;;
    1:catch) echo "You believe the table is leaning too hard into Steal, so Catch is your best response." ;;
    1:steal) echo "You believe the table is leaning too hard into Share, so Steal is your best response." ;;
    2:share) echo "You believe the surviving field still overweights Catch, so Share remains your best response." ;;
    2:catch) echo "You believe the surviving field will overcorrect after the first elimination and expose itself to Catch." ;;
    *) echo "From this point you believe Share is the optimal path to preserve a winner set and close the game cleanly." ;;
  esac
}

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

register_player_8004() {
  local idx="$1" addr status_file register_file balance is_authorized agent_uri
  addr="$(player_addr "$idx")"
  status_file="$ART_DIR/auth/player-$idx/auth-status.json"
  register_file="$ART_DIR/auth/player-$idx/auth-register.json"

  node "$FOUNDRY_DIR/scripts-js/authCli.js" status \
    --rpc-url "$RPC_URL" \
    --identity-registry "$ERC8004_IDENTITY_REGISTRY" \
    --auth-registry "$AUTH_REG" \
    --game "$GAME_ADDR" \
    --wallet "$addr" \
    --json > "$status_file"

  is_authorized="$(jq -r '.isAuthorized' "$status_file")"
  balance="$(jq -r '.balance // "0"' "$status_file")"
  if [[ "$is_authorized" == "true" && "$balance" != "0" ]]; then
    jq -n \
      --argjson player "$idx" \
      --arg wallet "$addr" \
      --arg balance "$balance" \
      --arg status "already_registered" \
      '{player:$player,wallet:$wallet,balance:$balance,status:$status}' > "$register_file"
    return 0
  fi

  agent_uri="data:application/json;base64,$(printf '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"prisoners-32p-player-%s","description":"Prisoners DAOlemma 32-player Base Sepolia competitive chat run agent %s for run %s"}' "$idx" "$idx" "$RUN_ID" | base64 -w0)"

  node "$FOUNDRY_DIR/scripts-js/authCli.js" register \
    --rpc-url "$RPC_URL" \
    --identity-registry "$ERC8004_IDENTITY_REGISTRY" \
    --auth-registry "$AUTH_REG" \
    --game "$GAME_ADDR" \
    --wallet "$addr" \
    --wallet-keystore "$(player_ks "$idx")" \
    --wallet-keystore-password-file "$(player_pw "$idx")" \
    --agent-uri "$agent_uri" \
    --json > "$register_file"

  node "$FOUNDRY_DIR/scripts-js/authCli.js" status \
    --rpc-url "$RPC_URL" \
    --identity-registry "$ERC8004_IDENTITY_REGISTRY" \
    --auth-registry "$AUTH_REG" \
    --game "$GAME_ADDR" \
    --wallet "$addr" \
    --agent-id "$(jq -r '.agentId' "$register_file")" \
    --json > "$status_file"
}

parallel_register_players() {
  local pids=() rc=0 idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    (
      mkdir -p "$ART_DIR/auth/player-$idx"
      register_player_8004 "$idx"
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

is_player_alive() {
  local gid="$1" idx="$2" addr out
  addr="$(player_addr "$idx")"
  out="$(cast call "$GAME_ADDR" 'isAlive(uint256,address)(bool)' "$gid" "$addr" --rpc-url "$RPC_URL")"
  [[ "$out" == "true" ]]
}

alive_player_indices() {
  local gid="$1" idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    if is_player_alive "$gid" "$idx"; then
      echo "$idx"
    fi
  done
}

first_alive_in_cause() {
  local gid="$1" cause="$2" idx
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    if (( $(player_cause "$idx") != cause )); then
      continue
    fi
    if is_player_alive "$gid" "$idx"; then
      echo "$idx"
      return 0
    fi
  done
  return 1
}

write_agent_prompts() {
  local idx cause cause_name cluster round1_choice round2_choice
  cat > "$ART_DIR/agent-instructions/GENERAL_PROMPT.md" <<EOF
# 32-Player Base Sepolia Competitive Chat Run — Agent Prompt

Objective: try to WIN while staying within the contract's exact move set.

Valid choices (use these exact terms only):
- Share
- Catch
- Steal

Important mapping:
- If you think in terms of a defensive "block" move, that maps to **Catch**.
- Do not use invalid option names onchain; the valid contract terms are exactly **Share / Catch / Steal**.

Strategic rule:
- Before round 10, each agent is trying to WIN using what it believes is the optimal strategy.
- If the game reaches round 10, every surviving agent must choose **Share** from that point onward.

Cause layout:
- Cause 1: ${CAUSE1_NAME} — ${CAUSE1_RECIPIENT}
- Cause 2: ${CAUSE2_NAME} — ${CAUSE2_RECIPIENT}
EOF

  for idx in $(seq 1 "$PLAYER_COUNT"); do
    cause="$(player_cause "$idx")"
    cause_name="$(player_cause_name "$cause")"
    cluster="$(cluster_for_player "$idx")"
    round1_choice="$(choice_for_round "$idx" 1)"
    round2_choice="$(choice_for_round "$idx" 2)"

    cat > "$ART_DIR/agent-instructions/player-${idx}.md" <<EOF
# Player ${idx} prompt

- Wallet: $(player_addr "$idx")
- Cause: ${cause} — ${cause_name}
- Cluster: ${cluster}

## Contract-valid choices
Use these exact onchain choice names only:
- Share
- Catch
- Steal

If you would normally say "block", use **Catch**.

## Goal
Try to WIN. Before round 10 you should choose what you believe is the optimal strategy for survival and eventual victory.

## Planned beliefs / choices
- Round 1 planned choice: ${round1_choice}
  - $(belief_for_cluster "$cluster" 1)
- Round 2 planned choice if still alive: ${round2_choice}
  - $(belief_for_cluster "$cluster" 2)
- Rounds 3-9 planned choice if still alive: Share
  - $(belief_for_cluster "$cluster" 3)
- Round 10+ hard convergence rule: Share

## Reminder
These prompts are for a real game test, not an all-share proof. The opening rounds are intentionally competitive.
EOF
  done
}

post_global_if_alive() {
  local gid="$1" idx="$2" text="$3"
  if ! is_player_alive "$gid" "$idx"; then
    return 0
  fi
  (
    cd "$FOUNDRY_DIR"
    node scripts-js/gameCli.js post-global --rpc-url "$RPC_URL" --game-id "$gid" --text "$text" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/post-global-g${gid}-p${idx}-$(date -u +%s%N).json"
  )
}

post_cause_if_alive() {
  local gid="$1" idx="$2" cause="$3" text="$4"
  if ! is_player_alive "$gid" "$idx"; then
    return 0
  fi
  (
    cd "$FOUNDRY_DIR"
    node scripts-js/gameCli.js post-cause --rpc-url "$RPC_URL" --game-id "$gid" --cause-id "$cause" --text "$text" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --json > "$ART_DIR/game/post-cause-g${gid}-c${cause}-p${idx}-$(date -u +%s%N).json"
  )
}

post_join_phase_chat() {
  local gid="$1"
  post_global_if_alive "$gid" 1 "32-player permissionless Sepolia run: real game, valid choices are Share / Catch / Steal, and if you think 'block' that means Catch."
  post_global_if_alive "$gid" 17 "Two causes live tonight: ${CAUSE1_NAME} and ${CAUSE2_NAME}. We are playing to win, not auto-sharing from the start."
  post_cause_if_alive "$gid" 1 1 "${CAUSE1_NAME}: remember the only valid moves are Share, Catch, Steal. Opening posture is competitive; round 10+ converges to Share if we get there."
  post_cause_if_alive "$gid" 17 2 "${CAUSE2_NAME}: same rules. We are trying to win first; only round 10+ hard-converges to Share."
}

post_round_chat() {
  local gid="$1" round="$2" cause1_lead cause2_lead
  cause1_lead="$(first_alive_in_cause "$gid" 1 || true)"
  cause2_lead="$(first_alive_in_cause "$gid" 2 || true)"

  case "$round" in
    1)
      [[ -n "$cause1_lead" ]] && post_cause_if_alive "$gid" "$cause1_lead" 1 "Round 1: we are playing to win. Valid moves are Share / Catch / Steal. If you say block, submit Catch."
      [[ -n "$cause2_lead" ]] && post_cause_if_alive "$gid" "$cause2_lead" 2 "Round 1: same reminder — Share / Catch / Steal only. Competitive opening, no auto-share proof run."
      post_global_if_alive "$gid" 1  "Round 1 thesis: if the table leans too hard into Catch, Share wins the read."
      post_global_if_alive "$gid" 7  "Round 1 thesis: if the table leans too hard into Steal, Catch is the punish."
      post_global_if_alive "$gid" 13 "Round 1 thesis: if the table leans too hard into Share, Steal is the punish."
      post_global_if_alive "$gid" 19 "Round 1 reminder: this is a real game test and everyone is trying to win."
      ;;
    2)
      [[ -n "$cause1_lead" ]] && post_cause_if_alive "$gid" "$cause1_lead" 1 "Round 2: survivors keep optimizing. Share / Catch / Steal remain the only valid choices."
      [[ -n "$cause2_lead" ]] && post_cause_if_alive "$gid" "$cause2_lead" 2 "Round 2: still competitive. If you think block, the onchain move is Catch."
      post_global_if_alive "$gid" 1  "Round 2 belief update: some survivors still expect too much Catch."
      post_global_if_alive "$gid" 7  "Round 2 belief update: others think the field will overcorrect after the first wipeout."
      ;;
    *)
      [[ -n "$cause1_lead" ]] && post_cause_if_alive "$gid" "$cause1_lead" 1 "Round ${round}: surviving players now judge Share the best path to preserve a winner set. Hard rule remains Share from round 10 onward."
      [[ -n "$cause2_lead" ]] && post_cause_if_alive "$gid" "$cause2_lead" 2 "Round ${round}: surviving players now judge Share the best path to preserve a winner set. Hard rule remains Share from round 10 onward."
      post_global_if_alive "$gid" 1  "Round ${round}: current best response is Share to lock in a winner path from the surviving set."
      ;;
  esac
}

parallel_commit_round() {
  local gid="$1" round="$2" alive_file="$ART_DIR/game/alive-round-${round}-before-commit.txt" pids=() rc=0 idx choice
  mapfile -t alive < <(alive_player_indices "$gid")
  if (( ${#alive[@]} == 0 )); then
    log "No alive players found before round ${round} commit"
    return 1
  fi
  printf '%s\n' "${alive[@]}" > "$alive_file"

  for idx in "${alive[@]}"; do
    choice="$(choice_for_round "$idx" "$round")"
    (
      cd "$FOUNDRY_DIR"
      node scripts-js/gameCli.js prepare-commit --rpc-url "$RPC_URL" --game-id "$gid" --choice "$choice" --wallet-keystore "$(player_ks "$idx")" --wallet-keystore-password-file "$(player_pw "$idx")" --out "$ART_DIR/game/commit-bundles/game-${gid}-round-${round}-player-${idx}.json" --json > "$ART_DIR/game/game-${gid}-round-${round}-prepare-player-${idx}.json"
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
  local gid="$1" round="$2" alive_file="$ART_DIR/game/alive-round-${round}-before-commit.txt" pids=() rc=0 idx
  mapfile -t alive < "$alive_file"
  for idx in "${alive[@]}"; do
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
  mapfile -t winners < <(alive_player_indices "$gid")
  for idx in "${winners[@]}"; do
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
    echo "- Timing rationale: user-directed data-driven 32p profile using 300s / 60 / 40 from the successful slower Sepolia artifact evidence"
    echo "- Cause 1: ${CAUSE1_NAME} -> ${CAUSE1_RECIPIENT}"
    echo "- Cause 2: ${CAUSE2_NAME} -> ${CAUSE2_RECIPIENT}"
    echo "- Realistic routing note: those addresses are used as recipient addresses for realistic cause routing on Sepolia"
    echo "- Strategy profile: competitive opening using Share/Catch/Steal beliefs, then Share convergence for surviving winners; hard rule is Share from round 10 onward"
    echo "- Cause withdrawals: intentionally skipped because the configured cause recipients are external realistic addresses whose private keys are not available in this environment"
    echo
    echo "## Player wallets"
    for idx in $(seq 1 "$PLAYER_COUNT"); do
      echo "- Player ${idx}: $(player_addr "$idx") (keystore $(player_ks "$idx"), cause $(player_cause "$idx"), cluster $(cluster_for_player "$idx"))"
    done
  } > "$ART_DIR/operator-notes.md"
}

main() {
  log "Ensuring 32 player wallets exist"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    ensure_player_wallet "$idx"
  done

  log "Writing agent prompts"
  write_agent_prompts

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
  node scripts-js/canaryCli.js deployment --rpc-url "$RPC_URL" --out "$ART_DIR_REL/deployment-summary.json" --json > "$ART_DIR/deployment-summary.txt"
  AUTH_REG="$(jq -r '.addresses.authRegistry' "$ART_DIR/deployment-summary.json")"
  GAME_ADDR="$(jq -r '.addresses.game' "$ART_DIR/deployment-summary.json")"
  DEPLOYED_ERC8004_REG="$(jq -r '.onchain.identityRegistry' "$ART_DIR/deployment-summary.json")"
  if [[ "${DEPLOYED_ERC8004_REG,,}" != "${ERC8004_IDENTITY_REGISTRY,,}" ]]; then
    log "Deployment wired unexpected ERC-8004 registry: $DEPLOYED_ERC8004_REG (expected $ERC8004_IDENTITY_REGISTRY)"
    exit 1
  fi

  log "Whitelist 2 realistic causes"
  node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC_URL" --cause-id 1 --recipient "$CAUSE1_RECIPIENT" --metadata-text "$CAUSE1_NAME" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-1.json"
  node scripts-js/gameCli.js whitelist-cause --rpc-url "$RPC_URL" --cause-id 2 --recipient "$CAUSE2_RECIPIENT" --metadata-text "$CAUSE2_NAME" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/causes/whitelist-cause-2.json"

  log "Register 32 players on ERC-8004 Identity Registry"
  parallel_register_players

  log "Verify 32 players are authorized through ERC-8004 ownership"
  for idx in $(seq 1 "$PLAYER_COUNT"); do
    jq -e '.isAuthorized == true and ((.balance | tonumber) > 0)' "$ART_DIR/auth/player-$idx/auth-status.json" >/dev/null
  done

  log "Create game"
  node scripts-js/gameCli.js create --rpc-url "$RPC_URL" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/create-game.json"
  GID="$(jq -r '.gameId' "$ART_DIR/game/create-game.json")"

  log "Join 32 players across 2 causes"
  parallel_join_players "$GID"
  node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-joins.json"
  jq -e '.game.counts.joined == 32 and .game.counts.alive == 32 and .game.counts.usedCauses == 2' "$ART_DIR/query/game-summary-after-joins.json" >/dev/null

  log "Post join-phase chat"
  post_join_phase_chat "$GID"
  node scripts-js/queryCli.js messages --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/messages-after-joins.json"

  JOIN_DEADLINE="$(jq -r '.joinDeadline' "$ART_DIR/game/create-game.json")"
  wait_until_deadline "$JOIN_DEADLINE" "32-player join deadline"
  advance_with_wait "$GID" "join->commit" "$ART_DIR/game/start-advance.json"

  TERMINAL=false
  for round in $(seq 1 12); do
    log "Round ${round}: strategy chat + commit"
    post_round_chat "$GID" "$round"
    parallel_commit_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-to-reveal" "$ART_DIR/game/round-${round}-to-reveal.json"

    log "Round ${round}: reveal"
    parallel_reveal_round "$GID" "$round"
    advance_with_wait "$GID" "round-${round}-after-reveal" "$ART_DIR/game/round-${round}-after-reveal.json"
    node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-after-round-${round}.json"

    phase="$(jq -r '.game.phase' "$ART_DIR/query/game-summary-after-round-${round}.json")"
    if [[ "$phase" == "Ended" || "$phase" == "Cancelled" ]]; then
      TERMINAL=true
      break
    fi
  done

  if [[ "$TERMINAL" != true ]]; then
    log "Game did not reach a terminal phase within 12 rounds"
    exit 1
  fi

  log "Claim winner shares"
  parallel_claim_winners "$GID"

  log "Withdraw treasury"
  node scripts-js/gameCli.js withdraw-treasury --rpc-url "$RPC_URL" --game-id "$GID" --wallet-keystore "$OWNER_KS" --wallet-keystore-password-file "$OWNER_PW" --json > "$ART_DIR/game/withdraw-treasury.json"

  log "Export final evidence"
  node scripts-js/queryCli.js summary --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/game-summary-final.json"
  jq -e '.game.phase == "Ended" and .game.outcome == "Winners" and .game.counts.joined == 32 and .game.counts.usedCauses == 2 and .game.counts.claimed == .game.settlement.winnerCount' "$ART_DIR/query/game-summary-final.json" >/dev/null
  node scripts-js/queryCli.js messages --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --json > "$ART_DIR/query/messages-final.json"
  node scripts-js/queryCli.js export --rpc-url "$RPC_URL" --game-id "$GID" --from-block "$FROM_BLOCK" --out "$ART_DIR_REL/query/game-${GID}-export-final" --json > "$ART_DIR/query/export.json"

  log "Generate judge pack"
  cd "$ROOT"
  yarn judge:evidence -- --bundle "$ART_DIR_REL" | tee "$ART_DIR/judge-evidence.log"

  write_operator_notes "$GID" "$DEPLOY_TX_HASH"

  log "32-player permissionless chat run complete"
  echo "$ART_DIR" > "$ROOT/.mainnet-readiness/latest-fresh-sepolia-rehearsal.txt"
}

main "$@"
