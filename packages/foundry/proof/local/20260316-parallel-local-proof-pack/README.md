# Parallel local multi-instance proof pack

This bundle preserves compact copies of the repo's first checked-in **bounded host-local parallel stress** result on the current codebase.

## Included preserved run

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

## What this adds

- proves the repo-native matrix runner can now coordinate **multiple fresh harness + Anvil deployments in parallel on one host** instead of only sequentially
- records actual overlap in machine-readable form (`execution.peakActiveRuns`, `execution.overlappingRunPairs`, per-run start/finish timestamps, and per-run Anvil ports)
- preserves a compact auditable copy of the top-level matrix artifacts from that real run

## Honest boundary

This is still **local synthetic stress only**:

- it does **not** claim public mempool realism, fee-bid competition, or distributed independent agents
- it does **not** prove broader 5-10 deployment host saturation; this preserved run reached 3 overlapping isolated instances on one machine
- it does **not** close the separate auth-expiry chaos gap
- it does **not** preserve the full raw tx/export bundle from the latest xlarge / multi-seed matrix run set

## Files here

- `local-proof-pack.json` — machine-readable manifest for the preserved copied artifacts
- `20260316-parallel-local-validation/matrix-report.json` — copied machine-readable matrix report from the source run
- `20260316-parallel-local-validation/MATRIX_SUMMARY.md` — copied human summary from the source run
