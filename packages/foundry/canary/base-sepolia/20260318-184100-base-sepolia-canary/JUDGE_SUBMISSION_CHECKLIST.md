# Judge / Submission Evidence Checklist

Run bundle:
`packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

Last updated: 2026-03-19 UTC

## Core live-deploy evidence

- [x] Preflight captured
  - `preflight.json`
- [x] Deployment summary captured
  - `deployment-summary.json`
- [x] Deployment address map captured
  - `deployments-84532.json`
- [x] Explorer verification log captured
  - `verify.log`
- [x] Operator notes captured
  - `operator-notes.md`

## Onchain contracts (Base Sepolia)

- [x] `AgentAuthRegistry`
  - `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
- [x] `PrisonersDaollema`
  - `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
- [x] `GameChat`
  - `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`

## Live gameplay/auth evidence

- [x] Saved auth status artifacts for admitted wallets
  - `auth/player-1/auth-status.json`
  - `auth/player-2/auth-status.json`
  - `auth/player-3/auth-status.json`
  - `auth/player-4/auth-status.json`
  - `auth/player-5/auth-status.json`
  - `auth/refresh-player-1/auth-status.json`
  - `auth/refresh-player-2/auth-status.json`
  - `auth/refresh-player-3/auth-status.json`
- [x] Canonical live game summary present
  - `query/game-summary-live.json`
- [x] Canonical live export manifest present
  - `query/export/export-manifest.json`
- [x] Canonical live export details present
  - `query/export/game-summary.json`
  - `query/export/rounds.json`
  - `query/export/payouts.json`
  - `query/export/roster.json`
  - `query/export/auth.json`
  - `query/export/causes.json`
  - `query/export/messages.jsonl`

## Terminal-path coverage achieved on Base Sepolia

- [x] Winner path
  - Game 1: 3-player winner game, all claims executed
  - `query/game-1-summary-final.json`
  - `query/game-1-export-final/export-manifest.json`
- [x] No-winner routing path
  - Game 2: 3-player no-winner game, cause routing distributed
  - `query/game-2-summary-final.json`
  - `query/game-2-export-final/export-manifest.json`
- [x] Cancelled / refund path
  - Game 3: 2-player underfilled game, both refunds executed
  - `query/game-3-summary-final.json`
  - `query/game-3-export-final/export-manifest.json`
- [x] Fast-follow timing smoke with expanded roster
  - Game 4: 5-player winner game under 120s / 40 / 40 defaults
  - `query/game-4-summary-final.json`
  - `query/game-4-export-final/export-manifest.json`

## Parameter / config evidence

- [x] Original canary-style defaults captured in earlier artifacts
  - 900s join / 20 block commit / 20 block reveal
- [x] Follow-on faster testing defaults captured onchain
  - 120s join / 40 block commit / 40 block reveal
  - visible in `deployment-summary.json`

## Contract-size / deployability evidence

- [x] Contract size audit captured
  - `contract-size-audit.txt`
- [x] Deployability plan captured
  - `/root/projects/prisoners-daollema/CONTRACT_SIZE_PLAN.md`
- [x] Production Foundry profile added
  - `/root/projects/prisoners-daollema/packages/foundry/foundry.toml`

## Submission-adjacent support artifacts

- [x] Human↔agent conversation log draft exists
  - `/root/projects/prisoners-daollema-local-archive/20260318-submission-prep/conversation-log-draft.md`
- [x] Selected raw session bundle exists
  - `/root/projects/prisoners-daollema-local-archive/20260318-submission-prep/prisoners-daollema-selected-raw-session-jsonl.zip`
- [x] Raw + draft bundle exists
  - `/root/projects/prisoners-daollema-local-archive/20260318-submission-prep/prisoners-daollema-hackathon-chatlogs-raw-and-draft.zip`

## Remaining optional improvements

- [ ] Add screenshots under `screenshots/` for a more judge-friendly visual companion
- [ ] Curate a submission-safe conversation log if you want a cleaner human-readable build log than the raw selected sessions
- [ ] Add a short operator-written narrative tying specific tx hashes to the game outcomes inside `operator-notes.md`

## Recommended order for a reviewer

1. `JUDGE_README.md`
2. `deployment-summary.json`
3. `query/game-summary-live.json`
4. `query/export/export-manifest.json`
5. `query/game-1-summary-final.json`
6. `query/game-2-summary-final.json`
7. `query/game-3-summary-final.json`
8. `query/game-4-summary-final.json`
9. `contract-size-audit.txt`
10. `/root/projects/prisoners-daollema/CONTRACT_SIZE_PLAN.md`
