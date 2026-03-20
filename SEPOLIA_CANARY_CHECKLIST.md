# Base Sepolia Canary Checklist

Use this alongside `SEPOLIA_CANARY_RUNBOOK.md`.

## 1. Before deploy

- [ ] Choose a run id and create an artifact directory under `packages/foundry/canary/base-sepolia/<run-id>/`
- [ ] Record the repo commit hash in `operator-notes.md`
- [ ] Copy `packages/foundry/.env.example` to `packages/foundry/.env`
- [ ] Set `BASESCAN_API_KEY`
- [ ] Set explicit `PRISONERS_OWNER`
- [ ] Set explicit `PRISONERS_TREASURY`
- [ ] Set explicit `PRISONERS_AUTH_VERIFIER`
- [ ] Confirm the canary profile still matches the recommended Base Sepolia values from `PARAMETERS.md`
- [ ] Ensure the deployer keystore has Base Sepolia ETH
- [ ] Ensure the verifier keystore has Base Sepolia ETH if it will submit any live transactions
- [ ] Ensure each gameplay wallet has Base Sepolia ETH
- [ ] Run `yarn canary:preflight -- --rpc-url baseSepolia --deployer-keystore <name|path> --out <artifact>/preflight.json`
- [ ] Resolve every preflight warning you do not explicitly accept

## 2. Deploy + inspect

- [ ] Run `yarn deploy -- --network baseSepolia --keystore <deployer-keystore>`
- [ ] Save the deployment console output to `deploy.log`
- [ ] Copy `packages/foundry/deployments/84532.json` into the artifact directory
- [ ] Run `yarn canary:deployment -- --rpc-url baseSepolia --out <artifact>/deployment-summary.json`
- [ ] Confirm `GameChat.game()` matches the deployed game address
- [ ] Confirm `PrisonersDAOlemma.authRegistry()` matches the deployed registry address
- [ ] Confirm onchain owner matches intended `PRISONERS_OWNER`
- [ ] Confirm onchain treasury matches intended `PRISONERS_TREASURY`
- [ ] Confirm onchain verifier matches intended `PRISONERS_AUTH_VERIFIER`
- [ ] Confirm onchain default config matches the recommended canary profile
- [ ] Confirm `currentGameId == 0`
- [ ] Confirm `activeGameId == 0`
- [ ] Confirm `messageCount == 0`
- [ ] Run `yarn verify -- --network baseSepolia`
- [ ] Save the verifier output to `verify.log`
- [ ] Record explorer links or verification status in `operator-notes.md`

## 3. Cause whitelist

- [ ] Choose the live canary causes and recipients in advance
- [ ] Whitelist at least one cause before `createGame()`
- [ ] Prefer whitelisting `2-3` causes for the first game so the join distribution is meaningful
- [ ] Save the whitelist tx hashes in `operator-notes.md`
- [ ] Re-run `yarn canary:deployment -- --rpc-url baseSepolia` if you want the pre-game whitelist state captured independently
- [ ] Confirm active cause count is now greater than zero

## 4. Auth rehearsal

Choose the honest level and write it down.

### Minimal live auth proof

- [ ] For each player wallet, create a finite-lifetime permit with `yarn auth:permit -- ... --ttl-seconds <seconds>`
- [ ] Save each `auth-permit.json`
- [ ] Register each permit on Base Sepolia with `yarn auth:register -- ...`
- [ ] Save each `auth-status.json`
- [ ] Confirm the wallets show as authorized before join

### Full SIWA-backed auth proof

- [ ] Only use this if the agent-registry / wallet-ownership path is actually ready
- [ ] Save every SIWA stage artifact (`challenge`, `signed`, `verified`)
- [ ] Save the resulting permit + register + status artifacts too
- [ ] Record any chain-boundary nuance if SIWA verification and game registration do not happen on the same chain

## 5. First live game

- [ ] Create the game and save `create.json`
- [ ] Record the `gameId`
- [ ] Join `3-6` wallets
- [ ] Confirm the joined wallets span at least `2` causes if possible
- [ ] Advance from join -> commit after the join deadline closes
- [ ] Save prepared commit bundles for every committing player
- [ ] Submit commits for every intended player
- [ ] Submit reveals for every intended player
- [ ] Advance phases as needed until the game reaches a terminal state
- [ ] Record whether the live terminal path was `Winners`, `NoWinners`, or `Cancelled`

## 6. Terminal actions

### If the game ended with winners

- [ ] Claim winner payouts where applicable
- [ ] Withdraw treasury funds where applicable
- [ ] Withdraw cause funds where applicable

### If the game cancelled

- [ ] Claim refunds for every joined player

### If the game ended with no winners

- [ ] Withdraw treasury funds where applicable
- [ ] Withdraw cause funds where applicable

For any path:

- [ ] Save the tx hashes for every claim / refund / withdrawal
- [ ] Record any failed or repeated transaction attempts

## 7. Query / evidence export

- [ ] Run `yarn query:summary -- --rpc-url baseSepolia --game-id <game-id> --json > <artifact>/query/game-summary-live.json`
- [ ] Run `yarn query:export -- --rpc-url baseSepolia --game-id <game-id> --chat <game-chat-address> --out <artifact>/query/export`
- [ ] Run `yarn judge:evidence -- --bundle <artifact>`
- [ ] Confirm `export-manifest.json` exists
- [ ] Confirm `game-summary.json` exists
- [ ] Confirm `roster.json` exists
- [ ] Confirm `causes.json` exists
- [ ] Confirm `rounds.json` exists
- [ ] Confirm `auth.json` exists
- [ ] Confirm `payouts.json` exists
- [ ] Confirm `messages.jsonl` exists if chat was configured and used
- [ ] Confirm `JUDGE_README.md` exists
- [ ] Confirm `judge-evidence-index.json` exists
- [ ] Save any UI / explorer screenshots under `screenshots/`
- [ ] Note any intentionally skipped artifact in `operator-notes.md`

## 8. Required artifact checklist

Minimum files to keep for the run:

- [ ] `operator-notes.md`
- [ ] `preflight.json`
- [ ] `deploy.log`
- [ ] `deployments-84532.json`
- [ ] `deployment-summary.json`
- [ ] `verify.log`
- [ ] cause whitelist tx hashes or saved command outputs
- [ ] auth artifacts for every admitted wallet
  - [ ] `auth-permit.json`
  - [ ] `auth-status.json`
  - [ ] SIWA stage artifacts too, if the full SIWA path was used
- [ ] `create.json`
- [ ] saved commit bundles
- [ ] join / advance / commit / reveal tx hashes
- [ ] claim / refund / withdrawal tx hashes
- [ ] `query/game-summary-live.json`
- [ ] `query/export/export-manifest.json`
- [ ] exported `game-summary.json`
- [ ] exported `roster.json`
- [ ] exported `causes.json`
- [ ] exported `rounds.json`
- [ ] exported `auth.json`
- [ ] exported `payouts.json`
- [ ] exported `messages.jsonl` when used
- [ ] `JUDGE_README.md`
- [ ] `judge-evidence-index.json`
- [ ] `screenshots/` when captured

## 9. Unknowns to close after the run

- [ ] Did Base Sepolia timing make the chosen commit/reveal windows comfortable or too tight?
- [ ] Did explorer verification succeed cleanly?
- [ ] Was the minimal auth proof sufficient, or is a full SIWA-backed Sepolia rehearsal now mandatory?
- [ ] Is a second Sepolia scenario still needed immediately (cancelled or no-winner)?
- [ ] Did any command or helper need refinement before the next readiness slice?
