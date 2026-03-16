# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: host-local-saturation-c7-custom
- Runs completed: 7/7
- Games completed: 22
- Wall clock ms: 80594
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/MATRIX_SUMMARY.md

## Execution model

- Mode: parallel-local
- Requested instance concurrency: 7
- Effective instance concurrency limit: 7
- Peak active runs observed: 7
- Runs with any overlap: 7
- Parallel overlap confirmed: yes
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: adversarial-a, adversarial-b, adversarial-c, adversarial-d, scale-winner-a, scale-winner-b, scale-winner-c
- Profiles: scale, smoke
- Requested scenarios: adversarial-random, winner-all-share
- Largest requested player count: 20
- Max joined players in a single game: 20
- Games hitting requested player target: 7
- Same-block-enabled runs: 4
- Expected-failure-enabled runs: 0
- Total requested games: 22

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 470
- Probe failures as expected: 470
- Probe onchain reverts: 470
- Probe local rejections: 0
- Same-block expected failures: 79

## Transaction summary

- Attempted: 2204
- Succeeded: 1734
- Failed: 470
- Failed expected: 470
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 3
- Winners: 19

## Terminal paths

- cancelled-refunds: 3
- winner-claims: 19

## Case summary

### scale-winner-soak

- Runs: 3
- Seeds: scale-winner-a, scale-winner-b, scale-winner-c
- Requested scenarios: winner-all-share
- Total games completed: 6
- Max joined players in a single game: 20
- Total joined players across runs: 120
- Tx summary: attempted=1011, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=6

### smoke-adversarial-sweep

- Runs: 4
- Seeds: adversarial-a, adversarial-b, adversarial-c, adversarial-d
- Requested scenarios: adversarial-random
- Total games completed: 16
- Max joined players in a single game: 12
- Total joined players across runs: 112
- Tx summary: attempted=1193, failedExpected=470, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 470
- Same-block expected failures: 79
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=3, Winners=13

## Parallel overlap pairs

- adversarial-c ↔ adversarial-d: 80348 ms overlap
- adversarial-c ↔ scale-winner-a: 68819 ms overlap
- adversarial-d ↔ scale-winner-a: 68819 ms overlap
- adversarial-b ↔ adversarial-c: 61245 ms overlap
- adversarial-b ↔ adversarial-d: 61238 ms overlap
- adversarial-b ↔ scale-winner-a: 61231 ms overlap
- adversarial-b ↔ scale-winner-b: 55498 ms overlap
- adversarial-c ↔ scale-winner-b: 55498 ms overlap
- adversarial-d ↔ scale-winner-b: 55498 ms overlap
- scale-winner-a ↔ scale-winner-b: 55498 ms overlap
- adversarial-b ↔ scale-winner-c: 55236 ms overlap
- adversarial-c ↔ scale-winner-c: 55236 ms overlap
- adversarial-d ↔ scale-winner-c: 55236 ms overlap
- scale-winner-a ↔ scale-winner-c: 55236 ms overlap
- scale-winner-b ↔ scale-winner-c: 55236 ms overlap
- adversarial-a ↔ adversarial-b: 53702 ms overlap
- adversarial-a ↔ adversarial-c: 53696 ms overlap
- adversarial-a ↔ adversarial-d: 53689 ms overlap
- adversarial-a ↔ scale-winner-a: 53682 ms overlap
- adversarial-a ↔ scale-winner-b: 53668 ms overlap
- adversarial-a ↔ scale-winner-c: 53653 ms overlap

## Runs

### Run 01 — adversarial-a
- Case: smoke-adversarial-sweep
- Seed: adversarial-a
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=1, wallClockMs=53712
- Started / finished: 2026-03-16T05:47:15.820Z -> 2026-03-16T05:48:09.532Z
- Local instance: spawnedAnvil=yes, anvilPort=35841
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=8, total across run=19
- Terminal outcomes: Cancelled=2, Winners=2
- Tx summary: attempted=210, succeeded=135, failedExpected=75, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=75/75, unexpectedSuccesses=0, onchainReverts=75, localRejections=0
- Same-block summary: batches=17, tx=41, expectedFailures=17, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/01-adversarial-a/report.json
### Run 02 — adversarial-b
- Case: smoke-adversarial-sweep
- Seed: adversarial-b
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=2, wallClockMs=61251
- Started / finished: 2026-03-16T05:47:15.830Z -> 2026-03-16T05:48:17.081Z
- Local instance: spawnedAnvil=yes, anvilPort=37159
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=12, total across run=29
- Terminal outcomes: Cancelled=1, Winners=3
- Tx summary: attempted=275, succeeded=170, failedExpected=105, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=105/105, unexpectedSuccesses=0, onchainReverts=105, localRejections=0
- Same-block summary: batches=16, tx=37, expectedFailures=16, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/02-adversarial-b/report.json
### Run 03 — adversarial-c
- Case: smoke-adversarial-sweep
- Seed: adversarial-c
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=3, wallClockMs=80577
- Started / finished: 2026-03-16T05:47:15.836Z -> 2026-03-16T05:48:36.413Z
- Local instance: spawnedAnvil=yes, anvilPort=45535
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=10, total across run=31
- Terminal outcomes: Winners=4
- Tx summary: attempted=352, succeeded=209, failedExpected=143, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=143/143, unexpectedSuccesses=0, onchainReverts=143, localRejections=0
- Same-block summary: batches=24, tx=60, expectedFailures=24, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/03-adversarial-c/report.json
### Run 04 — adversarial-d
- Case: smoke-adversarial-sweep
- Seed: adversarial-d
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=4, wallClockMs=80348
- Started / finished: 2026-03-16T05:47:15.843Z -> 2026-03-16T05:48:36.191Z
- Local instance: spawnedAnvil=yes, anvilPort=36305
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=11, total across run=33
- Terminal outcomes: Winners=4
- Tx summary: attempted=356, succeeded=209, failedExpected=147, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=147/147, unexpectedSuccesses=0, onchainReverts=147, localRejections=0
- Same-block summary: batches=22, tx=54, expectedFailures=22, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/04-adversarial-d/report.json
### Run 05 — scale-winner-a
- Case: scale-winner-soak
- Seed: scale-winner-a
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=5, wallClockMs=68819
- Started / finished: 2026-03-16T05:47:15.850Z -> 2026-03-16T05:48:24.669Z
- Local instance: spawnedAnvil=yes, anvilPort=43863
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=343, succeeded=343, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/05-scale-winner-a/report.json
### Run 06 — scale-winner-b
- Case: scale-winner-soak
- Seed: scale-winner-b
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=6, wallClockMs=55498
- Started / finished: 2026-03-16T05:47:15.864Z -> 2026-03-16T05:48:11.362Z
- Local instance: spawnedAnvil=yes, anvilPort=43239
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=330, succeeded=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/06-scale-winner-b/report.json
### Run 07 — scale-winner-c
- Case: scale-winner-soak
- Seed: scale-winner-c
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=7, wallClockMs=55236
- Started / finished: 2026-03-16T05:47:15.879Z -> 2026-03-16T05:48:11.115Z
- Local instance: spawnedAnvil=yes, anvilPort=42991
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=338, succeeded=338, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/runs/07-scale-winner-c/report.json
