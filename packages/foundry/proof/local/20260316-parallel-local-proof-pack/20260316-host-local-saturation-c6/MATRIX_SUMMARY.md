# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: broader-local
- Runs completed: 6/6
- Games completed: 19
- Wall clock ms: 55721
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/MATRIX_SUMMARY.md

## Execution model

- Mode: parallel-local
- Requested instance concurrency: 6
- Effective instance concurrency limit: 6
- Peak active runs observed: 6
- Runs with any overlap: 6
- Parallel overlap confirmed: yes
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: adversarial-a, adversarial-b, adversarial-c, same-block-family-a, scale-winner-a, scale-winner-b
- Profiles: scale, smoke
- Requested scenarios: adversarial-random, mixed, winner-all-share
- Largest requested player count: 20
- Max joined players in a single game: 20
- Games hitting requested player target: 7
- Same-block-enabled runs: 4
- Expected-failure-enabled runs: 1
- Total requested games: 19

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 350
- Probe failures as expected: 338
- Probe onchain reverts: 338
- Probe local rejections: 0
- Same-block expected failures: 72

## Transaction summary

- Attempted: 1643
- Succeeded: 1293
- Failed: 350
- Failed expected: 350
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 4
- NoWinners: 1
- Winners: 14

## Terminal paths

- cancelled-refunds: 4
- no-winner-routing: 1
- winner-claims: 14

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

### smoke-mixed-same-block

- Runs: 1
- Seeds: same-block-family-a
- Requested scenarios: mixed
- Total games completed: 3
- Max joined players in a single game: 6
- Total joined players across runs: 14
- Tx summary: attempted=133, failedExpected=27, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 15
- Same-block expected failures: 15
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1

## Parallel overlap pairs

- adversarial-c ↔ scale-winner-a: 53139 ms overlap
- adversarial-c ↔ scale-winner-b: 50794 ms overlap
- scale-winner-a ↔ scale-winner-b: 50794 ms overlap
- adversarial-b ↔ adversarial-c: 43915 ms overlap
- adversarial-b ↔ scale-winner-a: 43910 ms overlap
- adversarial-b ↔ scale-winner-b: 43902 ms overlap
- adversarial-a ↔ adversarial-b: 37792 ms overlap
- adversarial-a ↔ adversarial-c: 37788 ms overlap
- adversarial-a ↔ scale-winner-a: 37783 ms overlap
- adversarial-a ↔ scale-winner-b: 37775 ms overlap
- same-block-family-a ↔ adversarial-a: 32166 ms overlap
- same-block-family-a ↔ adversarial-b: 32162 ms overlap
- same-block-family-a ↔ adversarial-c: 32158 ms overlap
- same-block-family-a ↔ scale-winner-a: 32153 ms overlap
- same-block-family-a ↔ scale-winner-b: 32145 ms overlap

## Runs

### Run 01 — same-block-family-a
- Case: smoke-mixed-same-block
- Seed: same-block-family-a
- Status: ok
- Profile: smoke
- Requested scenario: mixed
- Requested size: 6 players / 3 games / 3 causes / concurrency 3
- Execution: mode=parallel-local, workerSlot=1, wallClockMs=32175
- Started / finished: 2026-03-16T05:31:29.724Z -> 2026-03-16T05:32:01.899Z
- Local instance: spawnedAnvil=yes, anvilPort=43359
- Phase budgets: commit=profile-default, reveal=profile-default
- Games completed: 3
- Scenario plan: winner-all-share, cancelled-underfilled, no-winner-all-catch
- Joined players: max single game=6, total across run=14
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1
- Tx summary: attempted=133, succeeded=106, failedExpected=27, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=15/15, unexpectedSuccesses=0, onchainReverts=15, localRejections=0
- Same-block summary: batches=15, tx=38, expectedFailures=15, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/01-same-block-family-a/report.json
### Run 02 — adversarial-a
- Case: smoke-adversarial-sweep
- Seed: adversarial-a
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=2, wallClockMs=37796
- Started / finished: 2026-03-16T05:31:29.733Z -> 2026-03-16T05:32:07.529Z
- Local instance: spawnedAnvil=yes, anvilPort=40463
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=8, total across run=19
- Terminal outcomes: Cancelled=2, Winners=2
- Tx summary: attempted=210, succeeded=135, failedExpected=75, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=75/75, unexpectedSuccesses=0, onchainReverts=75, localRejections=0
- Same-block summary: batches=17, tx=41, expectedFailures=17, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/02-adversarial-a/report.json
### Run 03 — adversarial-b
- Case: smoke-adversarial-sweep
- Seed: adversarial-b
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=3, wallClockMs=43919
- Started / finished: 2026-03-16T05:31:29.737Z -> 2026-03-16T05:32:13.656Z
- Local instance: spawnedAnvil=yes, anvilPort=36085
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=12, total across run=29
- Terminal outcomes: Cancelled=1, Winners=3
- Tx summary: attempted=275, succeeded=170, failedExpected=105, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=105/105, unexpectedSuccesses=0, onchainReverts=105, localRejections=0
- Same-block summary: batches=16, tx=37, expectedFailures=16, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/03-adversarial-b/report.json
### Run 04 — adversarial-c
- Case: smoke-adversarial-sweep
- Seed: adversarial-c
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=4, wallClockMs=55692
- Started / finished: 2026-03-16T05:31:29.741Z -> 2026-03-16T05:32:25.433Z
- Local instance: spawnedAnvil=yes, anvilPort=41721
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=10, total across run=31
- Terminal outcomes: Winners=4
- Tx summary: attempted=352, succeeded=209, failedExpected=143, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=143/143, unexpectedSuccesses=0, onchainReverts=143, localRejections=0
- Same-block summary: batches=24, tx=60, expectedFailures=24, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/04-adversarial-c/report.json
### Run 05 — scale-winner-a
- Case: scale-winner-soak
- Seed: scale-winner-a
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=5, wallClockMs=53139
- Started / finished: 2026-03-16T05:31:29.746Z -> 2026-03-16T05:32:22.885Z
- Local instance: spawnedAnvil=yes, anvilPort=46237
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=343, succeeded=343, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/05-scale-winner-a/report.json
### Run 06 — scale-winner-b
- Case: scale-winner-soak
- Seed: scale-winner-b
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=6, wallClockMs=50794
- Started / finished: 2026-03-16T05:31:29.754Z -> 2026-03-16T05:32:20.548Z
- Local instance: spawnedAnvil=yes, anvilPort=39147
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=330, succeeded=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c6-attempt/runs/06-scale-winner-b/report.json
