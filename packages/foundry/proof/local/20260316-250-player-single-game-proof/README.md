# 250-player single-game local proof

This bundle preserves a **real local load-harness run** that hit the repo's 250-player single-game target on the current codebase.

## Source run

- Raw run dir: `packages/foundry/load-harness/250-player-single-game-attempt-20260316T032159Z/`
- Harness: `packages/foundry/scripts-js/loadHarnessCli.js`
- Command:

```bash
node scripts-js/loadHarnessCli.js \
  --profile scale \
  --player-count 250 \
  --cause-count 16 \
  --games 1 \
  --scenario winner-all-share \
  --concurrency 16 \
  --join-duration-seconds 320 \
  --commit-duration-blocks 320 \
  --reveal-duration-blocks 320 \
  --out load-harness/250-player-single-game-attempt-20260316T032159Z
```

## Result

- Status: **ok**
- Joined players in the single game: **250**
- Scenario / outcome: **winner-all-share / Winners**
- Terminal path: **winner-claims**
- Rounds: **3**
- Share streak: **3**
- Claims executed: **250**
- Treasury withdrawals executed: **1**
- Cause withdrawals executed: **16**
- Unexpected failures: **0**
- Breakage mismatches: **0 wedge / 0 terminal / 0 accounting / 0 preview / 0 drain / 0 replay**
- Transactions: **2293 attempted / 2293 succeeded / 0 failed**
- Last observed block: **1867**
- Game blocks mined: **1656**
- Wall clock: **505222 ms**

## Why the bigger budgets matter

This run intentionally overrides the scale-profile defaults so the local result measures actual current harness/contract capacity instead of fake auto-mined deadline failures:

- `joinDurationSeconds = 320`
- `commitDurationBlocks = 320`
- `revealDurationBlocks = 320`

## Included files

- `report.json` — full machine-readable harness report
- `txs.jsonl` — raw tx log for the run
- `game-1/evidence/*` — exported per-game evidence bundle
- `artifact-manifest.json` — copied-file hash manifest + compact summary

## Boundary note

This is still **local Anvil proof only**. It does **not** claim live mempool realism, independent-agent network jitter, or Sepolia execution.
