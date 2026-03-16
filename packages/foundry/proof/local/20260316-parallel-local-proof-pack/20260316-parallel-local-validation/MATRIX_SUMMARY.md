# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: parallel-local
- Runs completed: 3/3
- Games completed: 9
- Wall clock ms: 40690
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-parallel-local-validation/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-parallel-local-validation/MATRIX_SUMMARY.md

## Execution model

- Mode: parallel-local
- Requested instance concurrency: 3
- Effective instance concurrency limit: 3
- Peak active runs observed: 3
- Runs with any overlap: 3
- Parallel overlap confirmed: yes
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: parallel-adversarial-a, parallel-same-block-a, parallel-winner-a
- Profiles: scale, smoke
- Requested scenarios: adversarial-random, mixed, winner-all-share
- Largest requested player count: 20
- Max joined players in a single game: 20
- Games hitting requested player target: 4
- Same-block-enabled runs: 2
- Expected-failure-enabled runs: 1
- Total requested games: 9

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 157
- Probe failures as expected: 145
- Probe onchain reverts: 145
- Probe local rejections: 0
- Same-block expected failures: 34

## Transaction summary

- Attempted: 735
- Succeeded: 578
- Failed: 157
- Failed expected: 157
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 2
- NoWinners: 1
- Winners: 6

## Terminal paths

- cancelled-refunds: 2
- no-winner-routing: 1
- winner-claims: 6

## Case summary

### scale-winner-soak

- Runs: 1
- Seeds: parallel-winner-a
- Requested scenarios: winner-all-share
- Total games completed: 2
- Max joined players in a single game: 20
- Total joined players across runs: 40
- Tx summary: attempted=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=2

### smoke-adversarial-sweep

- Runs: 1
- Seeds: parallel-adversarial-a
- Requested scenarios: adversarial-random
- Total games completed: 4
- Max joined players in a single game: 8
- Total joined players across runs: 18
- Tx summary: attempted=274, failedExpected=130, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 130
- Same-block expected failures: 19
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=1, Winners=3

### smoke-mixed-same-block

- Runs: 1
- Seeds: parallel-same-block-a
- Requested scenarios: mixed
- Total games completed: 3
- Max joined players in a single game: 6
- Total joined players across runs: 14
- Tx summary: attempted=131, failedExpected=27, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 15
- Same-block expected failures: 15
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1

## Parallel overlap pairs

- parallel-adversarial-a ↔ parallel-winner-a: 37124 ms overlap
- parallel-same-block-a ↔ parallel-adversarial-a: 20909 ms overlap
- parallel-same-block-a ↔ parallel-winner-a: 20905 ms overlap

## Runs

### Run 01 — parallel-same-block-a
- Case: smoke-mixed-same-block
- Seed: parallel-same-block-a
- Status: ok
- Profile: smoke
- Requested scenario: mixed
- Requested size: 6 players / 3 games / 3 causes / concurrency 3
- Execution: mode=parallel-local, workerSlot=1, wallClockMs=20917
- Started / finished: 2026-03-16T03:58:12.822Z -> 2026-03-16T03:58:33.739Z
- Local instance: spawnedAnvil=yes, anvilPort=41601
- Phase budgets: commit=profile-default, reveal=profile-default
- Games completed: 3
- Scenario plan: winner-all-share, cancelled-underfilled, no-winner-all-catch
- Joined players: max single game=6, total across run=14
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1
- Tx summary: attempted=131, succeeded=104, failedExpected=27, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=15/15, unexpectedSuccesses=0, onchainReverts=15, localRejections=0
- Same-block summary: batches=15, tx=38, expectedFailures=15, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-parallel-local-validation/runs/01-parallel-same-block-a/report.json
### Run 02 — parallel-adversarial-a
- Case: smoke-adversarial-sweep
- Seed: parallel-adversarial-a
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=2, wallClockMs=37128
- Started / finished: 2026-03-16T03:58:12.830Z -> 2026-03-16T03:58:49.958Z
- Local instance: spawnedAnvil=yes, anvilPort=33755
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=8, total across run=18
- Terminal outcomes: Cancelled=1, Winners=3
- Tx summary: attempted=274, succeeded=144, failedExpected=130, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=130/130, unexpectedSuccesses=0, onchainReverts=130, localRejections=0
- Same-block summary: batches=19, tx=46, expectedFailures=19, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-parallel-local-validation/runs/02-parallel-adversarial-a/report.json
### Run 03 — parallel-winner-a
- Case: scale-winner-soak
- Seed: parallel-winner-a
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=3, wallClockMs=40667
- Started / finished: 2026-03-16T03:58:12.834Z -> 2026-03-16T03:58:53.501Z
- Local instance: spawnedAnvil=yes, anvilPort=33429
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=330, succeeded=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-parallel-local-validation/runs/03-parallel-winner-a/report.json
