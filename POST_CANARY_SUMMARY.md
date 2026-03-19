# Base Sepolia Post-Canary Summary

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daollema`
Bundle: `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

## Executive summary

The Base Sepolia canary progressed from a cautious first live deploy into a fuller multi-path proof pack.

What was achieved on Base Sepolia:

- live deployment
- explorer verification
- live auth-gated joins
- live chat messages
- winner-path settlement + claims
- no-winner routing settlement
- cancelled/refund settlement
- fast-follow 5-player smoke under updated timing defaults

The canary also exposed two real deployment/ops findings:

1. **Contract size** — `PrisonersDaollema` is not deployable under the repo's unoptimized default Foundry profile.
2. **Timing / ops ergonomics** — `900s / 20 / 20` is workable for a careful canary, but public-testnet multi-wallet ops are much smoother with shorter joins and roomier commit/reveal windows or with parallelized gameplay automation.

## Contract addresses

- `AgentAuthRegistry`: `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
- `PrisonersDaollema`: `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
- `GameChat`: `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`

## Live outcomes by game

### Game 1 — winner path

- players joined: 3
- terminal path: `winner-claims`
- outcome: `Winners`
- rounds: 3
- claims executed: 3/3
- treasury withdrawal executed: yes
- cause withdrawals executed: 3/3

Settlement snapshot:
- total pot: `3000000000000000`
- treasury accrued/withdrawn: `30000000000000`
- winner count: `3`
- winner share: `990000000000000`

Artifacts:
- `query/game-1-summary-final.json`
- `query/game-1-export-final/`

### Game 2 — no-winner path

- players joined: 3
- terminal path: `no-winner-routing`
- outcome: `NoWinners`
- rounds: 1
- committed/revealed: 3/3
- treasury withdrawal executed: yes
- no-winner cause routing distributed: yes

Settlement snapshot:
- total pot: `3000000000000000`
- treasury accrued/withdrawn: `327000000000000`
- no-winner cause pool distributed: `2673000000000000`

Artifacts:
- `query/game-2-summary-final.json`
- `query/game-2-export-final/`

### Game 3 — cancelled / refund path

- players joined: 2
- terminal path: `cancelled-refunds`
- outcome: `Cancelled`
- refunds executed: 2/2

Settlement snapshot:
- total pot: `2000000000000000`
- refund per player: `1000000000000000`

Artifacts:
- `query/game-3-summary-final.json`
- `query/game-3-export-final/`

### Game 4 — fast-follow timing smoke (5 players)

Purpose:
- validate the follow-on faster testing profile
- prove a larger roster can cleanly complete under the adjusted defaults
- prove 5-player full-roster parallel commit/reveal works on Base Sepolia

Result:
- players joined: 5
- terminal path: `winner-claims`
- outcome: `Winners`
- rounds: 3
- committed/revealed: 5/5
- claims executed: 5/5
- treasury withdrawal executed: yes
- cause withdrawals executed: 5/5

Settlement snapshot:
- total pot: `5000000000000000`
- treasury accrued/withdrawn: `50000000000000`
- winner count: `5`
- winner share: `990000000000000`

Artifacts:
- `query/game-4-summary-final.json`
- `query/game-4-export-final/`
- canonical live snapshot: `query/game-summary-live.json`
- canonical live export: `query/export/`

## Config / timing findings

### Original canary defaults

Used for the early live canary games:
- join: `900s`
- commit: `20` blocks
- reveal: `20` blocks

Finding:
- the long join window slowed iteration significantly
- the short 20-block commit/reveal windows were fragile for sequential multi-wallet CLI operations on public testnet

### Follow-on faster test defaults

Applied once the deployment returned to idle:
- join: `120s`
- commit: `40` blocks
- reveal: `40` blocks

Why this is better for follow-on Sepolia testing:
- much faster loop time between games
- enough block headroom for multi-wallet commit/reveal steps
- especially effective when commits and reveals are submitted in parallel

## Contract-size finding

Measured runtime size for `PrisonersDaollema`:

- default build: **42,136 B** → not deployable
- optimizer only: **25,456 B** → still not deployable
- optimizer + via-IR: **19,809 B** → deployable

Implication:
- the repo's default Foundry profile is not suitable for public deployment of the current contract
- production/public deploys must use the production compile profile

Follow-up work already done:
- added `[profile.production]` to `packages/foundry/foundry.toml`
- wrote `CONTRACT_SIZE_PLAN.md`
- captured `contract-size-audit.txt` in the canary bundle

## Recommended next steps

### Before any more public deployment work

1. Treat `FOUNDRY_PROFILE=production` as mandatory for deploy + verify
2. Re-run key local validation under that exact production profile
3. Add a deploy-readiness size gate
4. Keep using parallelized gameplay automation for public-testnet multi-wallet rounds

### For evidence / submission quality

1. Keep `JUDGE_README.md` and `judge-evidence-index.json` as the entry point for reviewers
2. Use `JUDGE_SUBMISSION_CHECKLIST.md` as the practical artifact checklist
3. Optionally add screenshots if a more judge-friendly visual layer is desired
4. Curate a submission-safe conversation log from the generated draft if needed

## Final state at time of writing

- current deployed `currentGameId`: `4`
- `activeGameId`: `0`
- active causes: `5`
- live deployment is idle and ready for the next test cycle
- default follow-on test profile is now `120s / 40 / 40`
