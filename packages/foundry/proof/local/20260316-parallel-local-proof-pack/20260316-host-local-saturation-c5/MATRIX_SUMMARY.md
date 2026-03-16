# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: broader-local
- Runs completed: 5/5
- Games completed: 16
- Wall clock ms: 82665
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/MATRIX_SUMMARY.md

## Execution model

- Mode: parallel-local
- Requested instance concurrency: 5
- Effective instance concurrency limit: 5
- Peak active runs observed: 5
- Runs with any overlap: 5
- Parallel overlap confirmed: yes
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: adversarial-a, adversarial-b, adversarial-c, scale-winner-a, scale-winner-b
- Profiles: scale, smoke
- Requested scenarios: adversarial-random, winner-all-share
- Largest requested player count: 20
- Max joined players in a single game: 20
- Games hitting requested player target: 5
- Same-block-enabled runs: 3
- Expected-failure-enabled runs: 0
- Total requested games: 16

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 323
- Probe failures as expected: 323
- Probe onchain reverts: 323
- Probe local rejections: 0
- Same-block expected failures: 57

## Transaction summary

- Attempted: 1510
- Succeeded: 1187
- Failed: 323
- Failed expected: 323
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 3
- Winners: 13

## Terminal paths

- cancelled-refunds: 3
- winner-claims: 13

## Case summary

### scale-winner-soak

- Runs: 2
- Seeds: scale-winner-a, scale-winner-b
- Requested scenarios: winner-all-share
- Total games completed: 4
- Max joined players in a single game: 20
- Total joined players across runs: 80
- Tx summary: attempted=673, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=4

### smoke-adversarial-sweep

- Runs: 3
- Seeds: adversarial-a, adversarial-b, adversarial-c
- Requested scenarios: adversarial-random
- Total games completed: 12
- Max joined players in a single game: 12
- Total joined players across runs: 79
- Tx summary: attempted=837, failedExpected=323, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 323
- Same-block expected failures: 57
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=3, Winners=9

## Parallel overlap pairs

- adversarial-c ↔ scale-winner-b: 59346 ms overlap
- adversarial-c ↔ scale-winner-a: 57654 ms overlap
- scale-winner-a ↔ scale-winner-b: 57641 ms overlap
- adversarial-b ↔ adversarial-c: 53418 ms overlap
- adversarial-b ↔ scale-winner-a: 53410 ms overlap
- adversarial-b ↔ scale-winner-b: 53397 ms overlap
- adversarial-a ↔ adversarial-b: 50874 ms overlap
- adversarial-a ↔ adversarial-c: 50870 ms overlap
- adversarial-a ↔ scale-winner-a: 50862 ms overlap
- adversarial-a ↔ scale-winner-b: 50849 ms overlap

## Runs

### Run 01 — adversarial-a
- Case: smoke-adversarial-sweep
- Seed: adversarial-a
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=1, wallClockMs=50886
- Started / finished: 2026-03-16T05:21:06.438Z -> 2026-03-16T05:21:57.324Z
- Local instance: spawnedAnvil=yes, anvilPort=39369
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=8, total across run=19
- Terminal outcomes: Cancelled=2, Winners=2
- Tx summary: attempted=210, succeeded=135, failedExpected=75, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=75/75, unexpectedSuccesses=0, onchainReverts=75, localRejections=0
- Same-block summary: batches=17, tx=41, expectedFailures=17, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/runs/01-adversarial-a/report.json
### Run 02 — adversarial-b
- Case: smoke-adversarial-sweep
- Seed: adversarial-b
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=2, wallClockMs=53422
- Started / finished: 2026-03-16T05:21:06.450Z -> 2026-03-16T05:21:59.872Z
- Local instance: spawnedAnvil=yes, anvilPort=34853
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=12, total across run=29
- Terminal outcomes: Cancelled=1, Winners=3
- Tx summary: attempted=275, succeeded=170, failedExpected=105, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=105/105, unexpectedSuccesses=0, onchainReverts=105, localRejections=0
- Same-block summary: batches=16, tx=37, expectedFailures=16, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/runs/02-adversarial-b/report.json
### Run 03 — adversarial-c
- Case: smoke-adversarial-sweep
- Seed: adversarial-c
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=3, wallClockMs=82633
- Started / finished: 2026-03-16T05:21:06.454Z -> 2026-03-16T05:22:29.087Z
- Local instance: spawnedAnvil=yes, anvilPort=36961
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=10, total across run=31
- Terminal outcomes: Winners=4
- Tx summary: attempted=352, succeeded=209, failedExpected=143, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=143/143, unexpectedSuccesses=0, onchainReverts=143, localRejections=0
- Same-block summary: batches=24, tx=60, expectedFailures=24, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/runs/03-adversarial-c/report.json
### Run 04 — scale-winner-a
- Case: scale-winner-soak
- Seed: scale-winner-a
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=4, wallClockMs=57654
- Started / finished: 2026-03-16T05:21:06.462Z -> 2026-03-16T05:22:04.116Z
- Local instance: spawnedAnvil=yes, anvilPort=43013
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=343, succeeded=343, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/runs/04-scale-winner-a/report.json
### Run 05 — scale-winner-b
- Case: scale-winner-soak
- Seed: scale-winner-b
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=5, wallClockMs=59346
- Started / finished: 2026-03-16T05:21:06.475Z -> 2026-03-16T05:22:05.821Z
- Local instance: spawnedAnvil=yes, anvilPort=44029
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=330, succeeded=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c5/runs/05-scale-winner-b/report.json
