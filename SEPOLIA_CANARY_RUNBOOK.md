# Base Sepolia Canary Runbook

This runbook is the repo-native operator path for the **first honest Base Sepolia canary**.

It is intentionally conservative:

- it uses the current repo scripts and contracts only
- it does not claim anything about Sepolia that has not been executed yet
- it treats Sepolia as a live rehearsal, not as a marketing milestone
- it prefers artifacts and independent checks over memory or screenshots alone

## 1. What this canary is meant to prove

A base canary should prove the current repo can do all of the following on **Base Sepolia**:

1. deploy the current `AgentAuthRegistry` + `PrisonersDaollema` + `GameChat` trio
2. confirm owner / treasury / verifier wiring onchain
3. whitelist real causes on the live deployment
4. admit at least a few wallets through the current auth path
5. run at least one real game through join -> commit/reveal -> terminal settlement
6. export evidence from the deployed contracts using the repo query tooling

## 2. What this canary does **not** prove yet

Before execution, this repo still does **not** have live proof for:

- actual Base Sepolia block timing / UX under real network latency
- explorer verification success on the deployed bytecode
- whether the chosen live auth rehearsal uses the full SIWA path or only the verifier-permit/register subset
- whether a second Sepolia scenario (cancelled or no-winner) is needed immediately after the first winner-path rehearsal

Treat those as open until captured in artifacts.

## 3. Recommended artifact directory

Use one timestamped directory per canary run so every output is easy to find later.

Example:

```bash
RUN_ID="$(date -u +%Y%m%d-%H%M%S)-base-sepolia-canary"
ARTIFACT_DIR_REL="canary/base-sepolia/${RUN_ID}"
ARTIFACT_DIR="packages/foundry/${ARTIFACT_DIR_REL}"
mkdir -p \
  "${ARTIFACT_DIR}" \
  "${ARTIFACT_DIR}/causes" \
  "${ARTIFACT_DIR}/auth" \
  "${ARTIFACT_DIR}/game/commit-bundles" \
  "${ARTIFACT_DIR}/query"
```

Use `ARTIFACT_DIR_REL` for repo CLIs that resolve `--out` paths from `packages/foundry`, and use `ARTIFACT_DIR` for shell redirection / `cp` / `tee` commands run from the repo root.

Suggested layout:

```text
packages/foundry/canary/base-sepolia/<run-id>/
  preflight.json
  deploy.log
  deployment-summary.json
  deployments-84532.json
  verify.log
  causes/
  auth/
  game/
  query/
  operator-notes.md
```

## 4. Prepare `.env`

Start from the tracked example:

```bash
cp packages/foundry/.env.example packages/foundry/.env
```

For the canary, set these explicitly:

- `BASESCAN_API_KEY`
- `PRISONERS_OWNER`
- `PRISONERS_TREASURY`
- `PRISONERS_AUTH_VERIFIER`

The deployment profile in `.env.example` already matches the recommended Base Sepolia canary profile from `PARAMETERS.md`:

- entry fee: `1000000000000000` wei (`0.001 ETH`)
- creator fee: `100` bps
- cause fee: `100` bps
- join duration: `900` seconds
- commit duration: `20` blocks
- reveal duration: `20` blocks
- min players: `3`
- max players: `32`
- max causes: `8`

If you intentionally override any of those, treat it as a canary deviation and record the reason.

## 5. Preflight the deployment inputs

Run the repo helper before sending any deployment tx:

```bash
yarn canary:preflight -- \
  --rpc-url baseSepolia \
  --deployer-keystore <deployer-keystore> \
  --out "${ARTIFACT_DIR_REL}/preflight.json"
```

What you want to see:

- chain id `84532`
- the chosen deployer keystore resolves cleanly
- owner / treasury / auth verifier resolve to the intended addresses
- the profile matches the recommended canary profile
- `BASESCAN_API_KEY` is present

If the helper warns that owner / treasury / verifier are falling back to deployer defaults, fix that before deployment unless that fallback is **explicitly** intended.

## 6. Deploy to Base Sepolia

Deploy with a named Foundry keystore:

```bash
yarn deploy -- --network baseSepolia --keystore <deployer-keystore> \
  | tee "${ARTIFACT_DIR}/deploy.log"
```

After deployment:

1. copy the repo deployment file into the run artifacts
2. keep the broadcast log / tx hashes

```bash
cp packages/foundry/deployments/84532.json "${ARTIFACT_DIR}/deployments-84532.json"
```

## 7. Inspect the deployed wiring

Immediately inspect the live deployment from the repo deployment file:

```bash
yarn canary:deployment -- \
  --rpc-url baseSepolia \
  --out "${ARTIFACT_DIR_REL}/deployment-summary.json"
```

What you want to confirm:

- `GameChat.game()` points at the deployed `PrisonersDaollema`
- `PrisonersDaollema.authRegistry()` points at the deployed `AgentAuthRegistry`
- onchain owner / treasury / verifier match the intended `.env` values
- onchain default config still matches the recommended canary profile
- `currentGameId == 0`
- `activeGameId == 0`
- `messageCount == 0`

If any of those already show non-zero game or message state, the deployment is no longer a pristine pre-game canary instance.

## 8. Verify contracts on the explorer

Run the repo-native verify wrapper:

```bash
yarn verify -- --network baseSepolia | tee "${ARTIFACT_DIR}/verify.log"
```

Do not mark verification complete until you have either:

- successful verifier output in `verify.log`, and/or
- matching BaseScan contract pages saved in your operator notes

## 9. Whitelist live causes before `createGame()`

A fresh deployment has **zero active causes**, so `createGame()` will revert until the owner whitelists at least one.

Whitelist the real cause recipients you want to use in the canary.

Example:

```bash
yarn game:whitelist-cause -- \
  --rpc-url baseSepolia \
  --cause-id 1 \
  --recipient <cause-recipient-1> \
  --metadata-text "cause-alpha" \
  --wallet-keystore <owner-keystore>

yarn game:whitelist-cause -- \
  --rpc-url baseSepolia \
  --cause-id 2 \
  --recipient <cause-recipient-2> \
  --metadata-text "cause-beta" \
  --wallet-keystore <owner-keystore>

yarn game:whitelist-cause -- \
  --rpc-url baseSepolia \
  --cause-id 3 \
  --recipient <cause-recipient-3> \
  --metadata-text "cause-gamma" \
  --wallet-keystore <owner-keystore>
```

Then re-run the deployment inspection helper and save the refreshed state if you want the whitelist captured independently before gameplay starts.

## 10. Auth rehearsal: choose the honest level

`AUTH_SPEC.md` explicitly allows Base Sepolia testing without requiring full mainnet ERC-8004 dependency coupling.

That means there are **two honest canary levels**:

### A. Minimal live canary auth proof

This proves the onchain admission path now:

- verifier signs a finite-lifetime permit
- gameplay wallet registers it on Base Sepolia
- `AgentAuthRegistry` reflects the live auth record
- the wallet can join the game

Example per player:

```bash
mkdir -p "${ARTIFACT_DIR}/auth/player-1"

yarn auth:permit -- \
  --rpc-url baseSepolia \
  --registry <agent-auth-registry> \
  --wallet <player-wallet> \
  --agent-key-text canary-player-1 \
  --manifest-uri manifest://base-sepolia/canary/player-1 \
  --ttl-seconds 3600 \
  --nonce-text base-sepolia-canary-player-1 \
  --verifier-keystore <verifier-keystore> \
  --out "${ARTIFACT_DIR_REL}/auth/player-1/auth-permit.json"

yarn auth:register -- \
  --rpc-url baseSepolia \
  --permit-file "${ARTIFACT_DIR_REL}/auth/player-1/auth-permit.json" \
  --wallet-keystore <player-1-keystore>

yarn auth:status -- \
  --rpc-url baseSepolia \
  --permit-file "${ARTIFACT_DIR_REL}/auth/player-1/auth-permit.json" \
  --json > "${ARTIFACT_DIR}/auth/player-1/auth-status.json"
```

This is the minimum live canary needed to prove join gating on Base Sepolia.

### B. Full SIWA-backed auth rehearsal

Use this only if your agent-registry / wallet-ownership path is actually ready.

Important honesty note:

- `siwa-nonce` verifies ownership against the chain encoded in `--agent-registry`
- `permit` / `register` target the game chain
- if those are **not** the same chain for your live setup, do **not** pretend `auth:flow` is the right wrapper; run the steps manually so the chain boundaries stay explicit

If the single-chain path is valid for your canary, you may use `yarn auth:flow -- ...` and preserve the generated stage files.

## 11. Run the first live canary game

Recommended first game shape:

- `3-6` wallets
- `2-3` active causes
- finite permit expiry on every admitted wallet
- one small winner-path game first, because it exercises the broadest live surface:
  - joins
  - commits
  - reveals
  - settlement finalization
  - winner claims
  - treasury withdrawal
  - cause withdrawals

### 11.1 Create the game

```bash
yarn game:create -- \
  --rpc-url baseSepolia \
  --wallet-keystore <owner-keystore> \
  --json > "${ARTIFACT_DIR}/game/create.json"
```

Capture the `gameId` from that output.

### 11.2 Join admitted wallets

Example:

```bash
yarn game:join -- --rpc-url baseSepolia --game-id <game-id> --cause-id 1 --wallet-keystore <player-1-keystore>
yarn game:join -- --rpc-url baseSepolia --game-id <game-id> --cause-id 2 --wallet-keystore <player-2-keystore>
yarn game:join -- --rpc-url baseSepolia --game-id <game-id> --cause-id 3 --wallet-keystore <player-3-keystore>
```

### 11.3 Advance / commit / reveal

After the join window closes:

```bash
yarn game:advance -- --rpc-url baseSepolia --game-id <game-id> --wallet-keystore <owner-keystore>
```

Per player, prepare and submit a commit bundle:

```bash
yarn game:prepare-commit -- \
  --rpc-url baseSepolia \
  --game-id <game-id> \
  --choice share \
  --wallet-keystore <player-1-keystore> \
  --out "${ARTIFACT_DIR_REL}/game/commit-bundles/player-1-round-1.json"

yarn game:commit -- \
  --rpc-url baseSepolia \
  --game-id <game-id> \
  --input "${ARTIFACT_DIR_REL}/game/commit-bundles/player-1-round-1.json" \
  --wallet-keystore <player-1-keystore>
```

Then reveal from the same saved bundle:

```bash
yarn game:reveal -- \
  --rpc-url baseSepolia \
  --game-id <game-id> \
  --input "${ARTIFACT_DIR_REL}/game/commit-bundles/player-1-round-1.json" \
  --wallet-keystore <player-1-keystore>
```

Repeat for each player and phase transition as required by the live game state.

### 11.4 Execute the live terminal path

For a winner-path canary, keep going until you have all applicable live outputs:

- `yarn game:claim -- ...` for each winner
- `yarn game:withdraw-treasury -- ...`
- `yarn game:withdraw-cause -- ...` for each funded cause

If the game cancels instead, use `yarn game:refund -- ...` and record that the canary became a cancellation-path rehearsal instead of a winner-path rehearsal.

## 12. Export live evidence from the repo query tooling

At minimum capture both a live summary and a full export.

### 12.1 Summary

```bash
yarn query:summary -- \
  --rpc-url baseSepolia \
  --game-id <game-id> \
  --json > "${ARTIFACT_DIR}/query/game-summary-live.json"
```

### 12.2 Full export

```bash
yarn query:export -- \
  --rpc-url baseSepolia \
  --game-id <game-id> \
  --chat <game-chat-address> \
  --out "${ARTIFACT_DIR_REL}/query/export"
```

Expected export artifacts:

- `game-summary.json`
- `roster.json`
- `causes.json`
- `rounds.json`
- `auth.json`
- `payouts.json`
- `messages.jsonl` when chat is configured and used
- `export-manifest.json`

## 13. Operator notes to write down immediately

Do not rely on memory. Add a short `operator-notes.md` for the run with:

- commit hash used
- exact cause recipients used
- exact wallets used for owner / verifier / players
- whether auth proof was minimal permit/register or full SIWA-backed
- whether explorer verification succeeded
- whether the first live path was winner / cancelled / no-winner
- any timing surprises on Base Sepolia
- any commands that needed a second attempt
- any unexplained failure or mismatch

## 14. Suggested go / no-go interpretation

A base canary is **good enough to continue** if all of these are true:

- deploy + onchain inspection match intended wiring
- at least one live game reaches a terminal state on Base Sepolia
- the applicable terminal actions succeed onchain
- query export completes and the artifacts are readable
- the run notes do not reveal an unresolved correctness issue

It is **not** good enough yet if any of these remain true:

- owner / treasury / verifier wiring differ from the intended values
- no cause whitelist was captured
- auth was bypassed in a way that does not match the chosen honesty level
- the game never reached a terminal state
- evidence export is missing or contradictory
- explorer verification was expected but not actually confirmed
