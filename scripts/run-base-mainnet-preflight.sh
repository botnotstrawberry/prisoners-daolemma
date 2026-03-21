#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOUNDRY_DIR="$ROOT/packages/foundry"
DEPLOYER_KEYSTORE="${DEPLOYER_KEYSTORE:-botnotstrawberry-base-wallet}"
DEPLOYER_PASSWORD_FILE="${DEPLOYER_PASSWORD_FILE:-/root/.secrets/botnotstrawberry-base-wallet.pass}"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"
CHAIN_ID_EXPECTED=8453
MAX_PLAYER_CAP=256
MAX_CAUSE_CAP=16
MAX_FEE_BPS=500
MAX_UINT32=4294967295
TIMING_GUARDRAIL_JOIN_SECONDS=0
TIMING_GUARDRAIL_COMMIT_BLOCKS=0
TIMING_GUARDRAIL_REVEAL_BLOCKS=0
TIMING_GUARDRAIL_REASON=""
OUT_DIR="${OUT_DIR:-$ROOT/.mainnet-readiness/$(date -u +%Y%m%dT%H%M%SZ)-base-mainnet-preflight}"
REQUIRE_CLEAN_GIT="${REQUIRE_CLEAN_GIT:-true}"
EXPECTED_GIT_COMMIT="${EXPECTED_GIT_COMMIT:-}"
PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER="${PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER:-false}"
mkdir -p "$OUT_DIR"

export FOUNDRY_PROFILE=production

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

record_git_provenance() {
  if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
    git -C "$ROOT" rev-parse HEAD > "$OUT_DIR/git-commit.txt"
    git -C "$ROOT" status --short > "$OUT_DIR/git-status.txt"
    git -C "$ROOT" diff --stat > "$OUT_DIR/git-diffstat.txt"
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
    fail "git working tree must be clean before Base mainnet preflight (set REQUIRE_CLEAN_GIT=false to override intentionally)"
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

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    fail "missing required env ${key}"
  fi
}

require_uint() {
  local key="$1"
  local value="${!key:-}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    fail "${key} must be an unsigned integer, got: ${value}"
  fi
}

validate_address() {
  local key="$1"
  local value="${!key}"
  local checksum
  if ! checksum=$(cast to-check-sum-address "$value" 2>/dev/null); then
    fail "${key} is not a valid address: ${value}"
  fi
  if [[ "$checksum" == "0x0000000000000000000000000000000000000000" ]]; then
    fail "${key} cannot be the zero address"
  fi
  echo "${checksum}"
}

require_clean_git

for key in \
  PRISONERS_OWNER \
  PRISONERS_TREASURY \
  PRISONERS_AUTH_VERIFIER \
  PRISONERS_ENTRY_FEE_WEI \
  PRISONERS_CREATOR_FEE_BPS \
  PRISONERS_CAUSE_FEE_BPS \
  PRISONERS_JOIN_DURATION_SECONDS \
  PRISONERS_COMMIT_DURATION_BLOCKS \
  PRISONERS_REVEAL_DURATION_BLOCKS \
  PRISONERS_MIN_PLAYERS \
  PRISONERS_MAX_PLAYERS \
  PRISONERS_MAX_CAUSES \
  BASESCAN_API_KEY
  do
  require_env "$key"
done

for key in \
  PRISONERS_ENTRY_FEE_WEI \
  PRISONERS_CREATOR_FEE_BPS \
  PRISONERS_CAUSE_FEE_BPS \
  PRISONERS_JOIN_DURATION_SECONDS \
  PRISONERS_COMMIT_DURATION_BLOCKS \
  PRISONERS_REVEAL_DURATION_BLOCKS \
  PRISONERS_MIN_PLAYERS \
  PRISONERS_MAX_PLAYERS \
  PRISONERS_MAX_CAUSES
  do
  require_uint "$key"
done

OWNER_CHECKSUM=$(validate_address PRISONERS_OWNER)
echo "$OWNER_CHECKSUM" | tee "$OUT_DIR/owner.txt" >/dev/null
TREASURY_CHECKSUM=$(validate_address PRISONERS_TREASURY)
echo "$TREASURY_CHECKSUM" | tee "$OUT_DIR/treasury.txt" >/dev/null
AUTH_VERIFIER_CHECKSUM=$(validate_address PRISONERS_AUTH_VERIFIER)
echo "$AUTH_VERIFIER_CHECKSUM" | tee "$OUT_DIR/auth-verifier.txt" >/dev/null

ENTRY_FEE_WEI="$PRISONERS_ENTRY_FEE_WEI"
CREATOR_FEE_BPS="$PRISONERS_CREATOR_FEE_BPS"
CAUSE_FEE_BPS="$PRISONERS_CAUSE_FEE_BPS"
JOIN_DURATION_SECONDS="$PRISONERS_JOIN_DURATION_SECONDS"
COMMIT_DURATION_BLOCKS="$PRISONERS_COMMIT_DURATION_BLOCKS"
REVEAL_DURATION_BLOCKS="$PRISONERS_REVEAL_DURATION_BLOCKS"
MIN_PLAYERS="$PRISONERS_MIN_PLAYERS"
MAX_PLAYERS="$PRISONERS_MAX_PLAYERS"
MAX_CAUSES="$PRISONERS_MAX_CAUSES"

(( ENTRY_FEE_WEI > 0 )) || fail "PRISONERS_ENTRY_FEE_WEI must be > 0"
(( JOIN_DURATION_SECONDS > 0 )) || fail "PRISONERS_JOIN_DURATION_SECONDS must be > 0"
(( COMMIT_DURATION_BLOCKS > 0 )) || fail "PRISONERS_COMMIT_DURATION_BLOCKS must be > 0"
(( REVEAL_DURATION_BLOCKS > 0 )) || fail "PRISONERS_REVEAL_DURATION_BLOCKS must be > 0"
(( MIN_PLAYERS >= 2 )) || fail "PRISONERS_MIN_PLAYERS must be >= 2"
(( MAX_PLAYERS > 0 )) || fail "PRISONERS_MAX_PLAYERS must be > 0"
(( MAX_CAUSES > 0 )) || fail "PRISONERS_MAX_CAUSES must be > 0"
(( MIN_PLAYERS <= MAX_PLAYERS )) || fail "PRISONERS_MIN_PLAYERS cannot exceed PRISONERS_MAX_PLAYERS"
(( MAX_PLAYERS <= MAX_PLAYER_CAP )) || fail "PRISONERS_MAX_PLAYERS cannot exceed ${MAX_PLAYER_CAP}"
(( MAX_CAUSES <= MAX_CAUSE_CAP )) || fail "PRISONERS_MAX_CAUSES cannot exceed ${MAX_CAUSE_CAP}"
(( MAX_CAUSES <= MAX_PLAYERS )) || fail "PRISONERS_MAX_CAUSES cannot exceed PRISONERS_MAX_PLAYERS"
(( CREATOR_FEE_BPS <= MAX_FEE_BPS )) || fail "PRISONERS_CREATOR_FEE_BPS cannot exceed ${MAX_FEE_BPS}"
(( CAUSE_FEE_BPS <= MAX_FEE_BPS )) || fail "PRISONERS_CAUSE_FEE_BPS cannot exceed ${MAX_FEE_BPS}"
(( JOIN_DURATION_SECONDS <= MAX_UINT32 )) || fail "PRISONERS_JOIN_DURATION_SECONDS cannot exceed ${MAX_UINT32} (uint32 max)"
(( COMMIT_DURATION_BLOCKS <= MAX_UINT32 )) || fail "PRISONERS_COMMIT_DURATION_BLOCKS cannot exceed ${MAX_UINT32} (uint32 max)"
(( REVEAL_DURATION_BLOCKS <= MAX_UINT32 )) || fail "PRISONERS_REVEAL_DURATION_BLOCKS cannot exceed ${MAX_UINT32} (uint32 max)"

if (( MAX_PLAYERS <= 8 )); then
  TIMING_GUARDRAIL_JOIN_SECONDS=300
  TIMING_GUARDRAIL_COMMIT_BLOCKS=60
  TIMING_GUARDRAIL_REVEAL_BLOCKS=60
  TIMING_GUARDRAIL_REASON="tiny mainnet canary floor"
elif (( MAX_PLAYERS <= 32 )); then
  TIMING_GUARDRAIL_JOIN_SECONDS=300
  TIMING_GUARDRAIL_COMMIT_BLOCKS=120
  TIMING_GUARDRAIL_REVEAL_BLOCKS=120
  TIMING_GUARDRAIL_REASON="32-player live Base Sepolia evidence showed 40-block windows were too tight"
else
  TIMING_GUARDRAIL_JOIN_SECONDS=600
  TIMING_GUARDRAIL_COMMIT_BLOCKS=320
  TIMING_GUARDRAIL_REVEAL_BLOCKS=320
  TIMING_GUARDRAIL_REASON="256-player local proof used 320/320/320 and no live-chain evidence yet justifies a tighter public-scale floor"
fi

(( JOIN_DURATION_SECONDS >= TIMING_GUARDRAIL_JOIN_SECONDS )) || fail "PRISONERS_JOIN_DURATION_SECONDS=${JOIN_DURATION_SECONDS} is below the mainnet safety floor ${TIMING_GUARDRAIL_JOIN_SECONDS} for maxPlayers=${MAX_PLAYERS} (${TIMING_GUARDRAIL_REASON})"
(( COMMIT_DURATION_BLOCKS >= TIMING_GUARDRAIL_COMMIT_BLOCKS )) || fail "PRISONERS_COMMIT_DURATION_BLOCKS=${COMMIT_DURATION_BLOCKS} is below the mainnet safety floor ${TIMING_GUARDRAIL_COMMIT_BLOCKS} for maxPlayers=${MAX_PLAYERS} (${TIMING_GUARDRAIL_REASON})"
(( REVEAL_DURATION_BLOCKS >= TIMING_GUARDRAIL_REVEAL_BLOCKS )) || fail "PRISONERS_REVEAL_DURATION_BLOCKS=${REVEAL_DURATION_BLOCKS} is below the mainnet safety floor ${TIMING_GUARDRAIL_REVEAL_BLOCKS} for maxPlayers=${MAX_PLAYERS} (${TIMING_GUARDRAIL_REASON})"

[[ "$PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER" == "true" ]] || fail "set PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=true after confirming PRISONERS_AUTH_VERIFIER is an EOA with an available signing key"

cat > "$OUT_DIR/launch-config.txt" <<EOF
PRISONERS_OWNER=${OWNER_CHECKSUM}
PRISONERS_TREASURY=${TREASURY_CHECKSUM}
PRISONERS_AUTH_VERIFIER=${AUTH_VERIFIER_CHECKSUM}
PRISONERS_ENTRY_FEE_WEI=${ENTRY_FEE_WEI}
PRISONERS_CREATOR_FEE_BPS=${CREATOR_FEE_BPS}
PRISONERS_CAUSE_FEE_BPS=${CAUSE_FEE_BPS}
PRISONERS_JOIN_DURATION_SECONDS=${JOIN_DURATION_SECONDS}
PRISONERS_COMMIT_DURATION_BLOCKS=${COMMIT_DURATION_BLOCKS}
PRISONERS_REVEAL_DURATION_BLOCKS=${REVEAL_DURATION_BLOCKS}
PRISONERS_MIN_PLAYERS=${MIN_PLAYERS}
PRISONERS_MAX_PLAYERS=${MAX_PLAYERS}
PRISONERS_MAX_CAUSES=${MAX_CAUSES}
PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=${PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER}
TIMING_GUARDRAIL_JOIN_SECONDS=${TIMING_GUARDRAIL_JOIN_SECONDS}
TIMING_GUARDRAIL_COMMIT_BLOCKS=${TIMING_GUARDRAIL_COMMIT_BLOCKS}
TIMING_GUARDRAIL_REVEAL_BLOCKS=${TIMING_GUARDRAIL_REVEAL_BLOCKS}
TIMING_GUARDRAIL_REASON=${TIMING_GUARDRAIL_REASON}
EOF

jq -n \
  --arg owner "$OWNER_CHECKSUM" \
  --arg treasury "$TREASURY_CHECKSUM" \
  --arg authVerifier "$AUTH_VERIFIER_CHECKSUM" \
  --arg entryFeeWei "$ENTRY_FEE_WEI" \
  --argjson creatorFeeBps "$CREATOR_FEE_BPS" \
  --argjson causeFeeBps "$CAUSE_FEE_BPS" \
  --argjson joinDurationSeconds "$JOIN_DURATION_SECONDS" \
  --argjson commitDurationBlocks "$COMMIT_DURATION_BLOCKS" \
  --argjson revealDurationBlocks "$REVEAL_DURATION_BLOCKS" \
  --argjson minPlayers "$MIN_PLAYERS" \
  --argjson maxPlayers "$MAX_PLAYERS" \
  --argjson maxCauses "$MAX_CAUSES" \
  --arg foundryProfile "$FOUNDRY_PROFILE" \
  --arg rpcUrl "$RPC_URL" \
  --arg deployerKeystore "$DEPLOYER_KEYSTORE" \
  --arg authVerifierConfirmEoaSigner "$PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER" \
  --arg expectedGitCommit "$EXPECTED_GIT_COMMIT" \
  --arg timingGuardrailReason "$TIMING_GUARDRAIL_REASON" \
  --argjson timingGuardrailJoinSeconds "$TIMING_GUARDRAIL_JOIN_SECONDS" \
  --argjson timingGuardrailCommitBlocks "$TIMING_GUARDRAIL_COMMIT_BLOCKS" \
  --argjson timingGuardrailRevealBlocks "$TIMING_GUARDRAIL_REVEAL_BLOCKS" \
  '{
    owner: $owner,
    treasury: $treasury,
    authVerifier: $authVerifier,
    config: {
      entryFeeWei: $entryFeeWei,
      creatorFeeBps: $creatorFeeBps,
      causeFeeBps: $causeFeeBps,
      joinDurationSeconds: $joinDurationSeconds,
      commitDurationBlocks: $commitDurationBlocks,
      revealDurationBlocks: $revealDurationBlocks,
      minPlayers: $minPlayers,
      maxPlayers: $maxPlayers,
      maxCauses: $maxCauses
    },
    environment: {
      foundryProfile: $foundryProfile,
      rpcUrl: $rpcUrl,
      deployerKeystore: $deployerKeystore,
      authVerifierConfirmEoaSigner: $authVerifierConfirmEoaSigner,
      expectedGitCommit: $expectedGitCommit
    },
    bounds: {
      maxPlayerCap: 256,
      maxCauseCap: 16,
      maxFeeBps: 500,
      maxUint32: 4294967295
    },
    timingGuardrails: {
      joinSecondsFloor: $timingGuardrailJoinSeconds,
      commitBlocksFloor: $timingGuardrailCommitBlocks,
      revealBlocksFloor: $timingGuardrailRevealBlocks,
      reason: $timingGuardrailReason
    }
  }' > "$OUT_DIR/launch-config.json"

printf '%s\n' "joinSecondsFloor=${TIMING_GUARDRAIL_JOIN_SECONDS}" "commitBlocksFloor=${TIMING_GUARDRAIL_COMMIT_BLOCKS}" "revealBlocksFloor=${TIMING_GUARDRAIL_REVEAL_BLOCKS}" "reason=${TIMING_GUARDRAIL_REASON}" > "$OUT_DIR/timing-guardrails.txt"

record_git_provenance

DEPLOYER_ADDR=$(cast wallet address --keystore "/root/.foundry/keystores/${DEPLOYER_KEYSTORE}" --password-file "$DEPLOYER_PASSWORD_FILE")
echo "$DEPLOYER_ADDR" | tee "$OUT_DIR/deployer-address.txt" >/dev/null
printf '%s\n' "$DEPLOYER_KEYSTORE" > "$OUT_DIR/deployer-keystore.txt"
printf '%s\n' "$RPC_URL" > "$OUT_DIR/rpc-url.txt"

CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
if [[ "$CHAIN_ID" != "$CHAIN_ID_EXPECTED" ]]; then
  fail "expected Base mainnet chain id ${CHAIN_ID_EXPECTED}, got ${CHAIN_ID}"
fi

echo "$CHAIN_ID" | tee "$OUT_DIR/chain-id.txt" >/dev/null

AUTH_VERIFIER_CODE=$(cast code "$AUTH_VERIFIER_CHECKSUM" --rpc-url "$RPC_URL")
if [[ "$AUTH_VERIFIER_CODE" != "0x" && "$AUTH_VERIFIER_CODE" != "0x0" ]]; then
  fail "PRISONERS_AUTH_VERIFIER must be an EOA signer address; contract code detected at ${AUTH_VERIFIER_CHECKSUM}"
fi
printf '%s\n' 'Confirmed: PRISONERS_AUTH_VERIFIER is expected to be an EOA with an available signing key; contract verifiers (e.g. Safe / EIP-1271) are not supported by the current AgentAuthRegistry ECDSA flow.' > "$OUT_DIR/auth-verifier-requirements.txt"

BALANCE_WEI=$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC_URL")
echo "$BALANCE_WEI" | tee "$OUT_DIR/deployer-balance-wei.txt" >/dev/null

if [[ "$BALANCE_WEI" == "0" ]]; then
  fail "deployer wallet has zero Base mainnet ETH"
fi

echo "FOUNDRY_PROFILE=${FOUNDRY_PROFILE}" | tee "$OUT_DIR/foundry-profile.txt" >/dev/null
cd "$FOUNDRY_DIR"
mkdir -p deployments
FOUNDRY_PROFILE=production forge build --sizes --skip test | tee "$OUT_DIR/production-build-sizes.log" >/dev/null

cat > "$OUT_DIR/first-game-readiness.txt" <<EOF
This preflight validates deploy-time config, provenance, chain, signer shape, buildability, and roster-aware timing floors.
It does NOT prove the first game can be opened yet.
Before createGame(), make sure at least one cause has been whitelisted onchain.
Do not interpret a tiny-canary timing profile as authorization for a later public-scale roster.
EOF

echo "PASS: Base mainnet deploy preflight checks passed (cause whitelist still must be configured before createGame)" | tee "$OUT_DIR/status.txt"
