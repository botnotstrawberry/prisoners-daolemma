# Parallel local multi-instance proof pack

This bundle preserves compact copies of the repo's checked-in **bounded host-local parallel stress** results on the current codebase.

## Included preserved runs

### 1. `parallel-local` validation

- Source directory: `packages/foundry/load-harness-matrix/20260316-parallel-local-validation`
- Preset: `parallel-local`
- Requested instance concurrency: 3
- Peak active runs observed: 3
- Runs with overlap: 3
- Total completed games: 9
- Largest requested player count: 20
- Max joined players in a single game: 20
- Total joined players across run: 72
- Tx summary: attempted=735, failedExpected=157, failedUnexpected=0, unexpectedSuccesses=0
- Same-block summary: batches=34, expectedFailures=34
- Probe summary: attempted=145, failedAsExpected=145, unexpectedSuccesses=0
- Breakage summary: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=2, NoWinners=1, Winners=6
- Terminal paths: cancelled-refunds=2, no-winner-routing=1, winner-claims=6

### 2. `broader-local` host saturation at concurrency 5

- Source directory: `packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5`
- Preset: `broader-local`
- Selected runs: `adversarial-a`, `adversarial-b`, `adversarial-c`, `scale-winner-a`, `scale-winner-b`
- Requested instance concurrency: 5
- Peak active runs observed: 5
- Runs with overlap: 5
- Total completed games: 16
- Largest requested player count: 20
- Max joined players in a single game: 20
- Total joined players across run: 159
- Tx summary: attempted=1510, failedExpected=323, failedUnexpected=0, unexpectedSuccesses=0
- Same-block summary: batches=57, expectedFailures=57
- Probe summary: attempted=323, failedAsExpected=323, unexpectedSuccesses=0
- Breakage summary: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=3, Winners=13
- Terminal paths: cancelled-refunds=3, winner-claims=13

### 3. `broader-local` host saturation at concurrency 6

- Source directory: `packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt`
- Preset: `broader-local`
- Selected runs: `same-block-family-a`, `adversarial-a`, `adversarial-b`, `adversarial-c`, `scale-winner-a`, `scale-winner-b`
- Requested instance concurrency: 6
- Peak active runs observed: 6
- Runs with overlap: 6
- Total completed games: 19
- Largest requested player count: 20
- Max joined players in a single game: 20
- Total joined players across run: 173
- Tx summary: attempted=1643, failedExpected=350, failedUnexpected=0, unexpectedSuccesses=0
- Same-block summary: batches=72, expectedFailures=72
- Probe summary: attempted=338, failedAsExpected=338, unexpectedSuccesses=0
- Breakage summary: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=4, NoWinners=1, Winners=14
- Terminal paths: cancelled-refunds=4, no-winner-routing=1, winner-claims=14

## What this adds

- preserves the original 3-instance `parallel-local` proof plus stronger 5-instance and 6-instance host-local saturation results
- proves the repo-native matrix runner can coordinate **at least six fresh harness + Anvil deployments in parallel on one host** instead of only sequentially, only three at a time, or only five at a time
- records actual overlap in machine-readable form (`execution.peakActiveRuns`, `execution.overlappingRunPairs`, per-run start/finish timestamps, and per-run Anvil ports)
- preserves compact auditable copies of the top-level matrix artifacts from those real runs

## Honest boundary

This is still **local synthetic stress only**:

- it does **not** claim public mempool realism, fee-bid competition, or distributed independent agents
- it proves bounded host-local overlap through 6 isolated instances on one machine, but it does **not** prove heavier 7-10 deployment saturation
- it does **not** close the separate auth-expiry chaos gap
- it does **not** preserve the full raw tx/export bundle from the latest xlarge / multi-seed matrix run set

## Files here

- `local-proof-pack.json` — machine-readable manifest for the preserved copied artifacts
- `20260316-parallel-local-validation/matrix-report.json` — copied machine-readable matrix report from the original 3-instance source run
- `20260316-parallel-local-validation/MATRIX_SUMMARY.md` — copied human summary from the original 3-instance source run
- `20260316-host-local-saturation-c5/matrix-report.json` — copied machine-readable matrix report from the stronger 5-instance source run
- `20260316-host-local-saturation-c5/MATRIX_SUMMARY.md` — copied human summary from the stronger 5-instance source run
- `20260316-host-local-saturation-c6/matrix-report.json` — copied machine-readable matrix report from the stronger 6-instance source run
- `20260316-host-local-saturation-c6/MATRIX_SUMMARY.md` — copied human summary from the stronger 6-instance source run
