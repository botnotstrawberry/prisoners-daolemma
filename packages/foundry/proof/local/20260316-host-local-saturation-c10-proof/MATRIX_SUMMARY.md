# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: host-local-saturation-c10-custom
- Runs completed: 10/10
- Games completed: 28
- Wall clock ms: 123372
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/MATRIX_SUMMARY.md

## Execution model

- Mode: parallel-local
- Requested instance concurrency: 10
- Effective instance concurrency limit: 10
- Peak active runs observed: 10
- Runs with any overlap: 10
- Parallel overlap confirmed: yes
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: adversarial-a, adversarial-b, adversarial-c, adversarial-d, scale-winner-a, scale-winner-b, scale-winner-c, scale-winner-d, scale-winner-e, scale-winner-f
- Profiles: scale, smoke
- Requested scenarios: adversarial-random, winner-all-share
- Largest requested player count: 20
- Max joined players in a single game: 20
- Games hitting requested player target: 13
- Same-block-enabled runs: 4
- Expected-failure-enabled runs: 0
- Total requested games: 28

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

- Attempted: 3234
- Succeeded: 2764
- Failed: 470
- Failed expected: 470
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 3
- Winners: 25

## Terminal paths

- cancelled-refunds: 3
- winner-claims: 25

## Case summary

### scale-winner-soak

- Runs: 6
- Seeds: scale-winner-a, scale-winner-b, scale-winner-c, scale-winner-d, scale-winner-e, scale-winner-f
- Requested scenarios: winner-all-share
- Total games completed: 12
- Max joined players in a single game: 20
- Total joined players across runs: 240
- Tx summary: attempted=2041, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=12

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

- adversarial-c ↔ adversarial-d: 108032 ms overlap
- adversarial-c ↔ scale-winner-a: 90225 ms overlap
- adversarial-d ↔ scale-winner-a: 90225 ms overlap
- adversarial-b ↔ adversarial-c: 88709 ms overlap
- adversarial-b ↔ adversarial-d: 88705 ms overlap
- adversarial-b ↔ scale-winner-a: 88699 ms overlap
- adversarial-b ↔ scale-winner-f: 88303 ms overlap
- adversarial-c ↔ scale-winner-f: 88303 ms overlap
- adversarial-d ↔ scale-winner-f: 88303 ms overlap
- scale-winner-a ↔ scale-winner-f: 88303 ms overlap
- adversarial-b ↔ scale-winner-c: 88022 ms overlap
- adversarial-c ↔ scale-winner-c: 88022 ms overlap
- adversarial-d ↔ scale-winner-c: 88022 ms overlap
- scale-winner-a ↔ scale-winner-c: 88022 ms overlap
- scale-winner-c ↔ scale-winner-f: 87964 ms overlap
- adversarial-b ↔ scale-winner-e: 87854 ms overlap
- adversarial-c ↔ scale-winner-e: 87854 ms overlap
- adversarial-d ↔ scale-winner-e: 87854 ms overlap
- scale-winner-a ↔ scale-winner-e: 87854 ms overlap
- scale-winner-c ↔ scale-winner-e: 87854 ms overlap
- scale-winner-e ↔ scale-winner-f: 87830 ms overlap
- adversarial-b ↔ scale-winner-b: 87635 ms overlap
- adversarial-c ↔ scale-winner-b: 87635 ms overlap
- adversarial-d ↔ scale-winner-b: 87635 ms overlap
- scale-winner-a ↔ scale-winner-b: 87635 ms overlap
- scale-winner-b ↔ scale-winner-c: 87616 ms overlap
- scale-winner-b ↔ scale-winner-e: 87582 ms overlap
- scale-winner-b ↔ scale-winner-f: 87558 ms overlap
- adversarial-b ↔ scale-winner-d: 86714 ms overlap
- adversarial-c ↔ scale-winner-d: 86714 ms overlap
- adversarial-d ↔ scale-winner-d: 86714 ms overlap
- scale-winner-a ↔ scale-winner-d: 86714 ms overlap
- scale-winner-b ↔ scale-winner-d: 86714 ms overlap
- scale-winner-c ↔ scale-winner-d: 86714 ms overlap
- scale-winner-d ↔ scale-winner-e: 86694 ms overlap
- scale-winner-d ↔ scale-winner-f: 86670 ms overlap
- adversarial-a ↔ adversarial-b: 82744 ms overlap
- adversarial-a ↔ adversarial-c: 82740 ms overlap
- adversarial-a ↔ adversarial-d: 82736 ms overlap
- adversarial-a ↔ scale-winner-a: 82730 ms overlap
- adversarial-a ↔ scale-winner-b: 82719 ms overlap
- adversarial-a ↔ scale-winner-c: 82700 ms overlap
- adversarial-a ↔ scale-winner-d: 82686 ms overlap
- adversarial-a ↔ scale-winner-e: 82666 ms overlap
- adversarial-a ↔ scale-winner-f: 82642 ms overlap

## Runs

### Run 01 — adversarial-a
- Case: smoke-adversarial-sweep
- Seed: adversarial-a
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=1, wallClockMs=82752
- Started / finished: 2026-03-16T06:27:19.854Z -> 2026-03-16T06:28:42.606Z
- Local instance: spawnedAnvil=yes, anvilPort=42619
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=8, total across run=19
- Terminal outcomes: Cancelled=2, Winners=2
- Tx summary: attempted=210, succeeded=135, failedExpected=75, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=75/75, unexpectedSuccesses=0, onchainReverts=75, localRejections=0
- Same-block summary: batches=17, tx=41, expectedFailures=17, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/01-adversarial-a/report.json
### Run 02 — adversarial-b
- Case: smoke-adversarial-sweep
- Seed: adversarial-b
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=2, wallClockMs=88713
- Started / finished: 2026-03-16T06:27:19.862Z -> 2026-03-16T06:28:48.575Z
- Local instance: spawnedAnvil=yes, anvilPort=44979
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=12, total across run=29
- Terminal outcomes: Cancelled=1, Winners=3
- Tx summary: attempted=275, succeeded=170, failedExpected=105, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=105/105, unexpectedSuccesses=0, onchainReverts=105, localRejections=0
- Same-block summary: batches=16, tx=37, expectedFailures=16, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/02-adversarial-b/report.json
### Run 03 — adversarial-c
- Case: smoke-adversarial-sweep
- Seed: adversarial-c
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=3, wallClockMs=108036
- Started / finished: 2026-03-16T06:27:19.866Z -> 2026-03-16T06:29:07.902Z
- Local instance: spawnedAnvil=yes, anvilPort=40941
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=10, total across run=31
- Terminal outcomes: Winners=4
- Tx summary: attempted=352, succeeded=209, failedExpected=143, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=143/143, unexpectedSuccesses=0, onchainReverts=143, localRejections=0
- Same-block summary: batches=24, tx=60, expectedFailures=24, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/03-adversarial-c/report.json
### Run 04 — adversarial-d
- Case: smoke-adversarial-sweep
- Seed: adversarial-d
- Status: ok
- Profile: smoke
- Requested scenario: adversarial-random
- Requested size: 12 players / 4 games / 4 causes / concurrency 6
- Execution: mode=parallel-local, workerSlot=4, wallClockMs=123356
- Started / finished: 2026-03-16T06:27:19.870Z -> 2026-03-16T06:29:23.226Z
- Local instance: spawnedAnvil=yes, anvilPort=42055
- Phase budgets: commit=24, reveal=24
- Games completed: 4
- Scenario plan: adversarial-random, adversarial-random, adversarial-random, adversarial-random
- Joined players: max single game=11, total across run=33
- Terminal outcomes: Winners=4
- Tx summary: attempted=356, succeeded=209, failedExpected=147, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=147/147, unexpectedSuccesses=0, onchainReverts=147, localRejections=0
- Same-block summary: batches=22, tx=54, expectedFailures=22, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/04-adversarial-d/report.json
### Run 05 — scale-winner-a
- Case: scale-winner-soak
- Seed: scale-winner-a
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=5, wallClockMs=90225
- Started / finished: 2026-03-16T06:27:19.876Z -> 2026-03-16T06:28:50.101Z
- Local instance: spawnedAnvil=yes, anvilPort=43275
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=343, succeeded=343, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/05-scale-winner-a/report.json
### Run 06 — scale-winner-b
- Case: scale-winner-soak
- Seed: scale-winner-b
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=6, wallClockMs=87635
- Started / finished: 2026-03-16T06:27:19.887Z -> 2026-03-16T06:28:47.522Z
- Local instance: spawnedAnvil=yes, anvilPort=34299
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=330, succeeded=330, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/06-scale-winner-b/report.json
### Run 07 — scale-winner-c
- Case: scale-winner-soak
- Seed: scale-winner-c
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=7, wallClockMs=88022
- Started / finished: 2026-03-16T06:27:19.906Z -> 2026-03-16T06:28:47.928Z
- Local instance: spawnedAnvil=yes, anvilPort=33543
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=338, succeeded=338, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/07-scale-winner-c/report.json
### Run 08 — scale-winner-d
- Case: scale-winner-soak
- Seed: scale-winner-d
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=8, wallClockMs=86714
- Started / finished: 2026-03-16T06:27:19.920Z -> 2026-03-16T06:28:46.634Z
- Local instance: spawnedAnvil=yes, anvilPort=38737
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=342, succeeded=342, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/08-scale-winner-d/report.json
### Run 09 — scale-winner-e
- Case: scale-winner-soak
- Seed: scale-winner-e
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=9, wallClockMs=87854
- Started / finished: 2026-03-16T06:27:19.940Z -> 2026-03-16T06:28:47.794Z
- Local instance: spawnedAnvil=yes, anvilPort=46233
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=352, succeeded=352, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/09-scale-winner-e/report.json
### Run 10 — scale-winner-f
- Case: scale-winner-soak
- Seed: scale-winner-f
- Status: ok
- Profile: scale
- Requested scenario: winner-all-share
- Requested size: 20 players / 2 games / 6 causes / concurrency 8
- Execution: mode=parallel-local, workerSlot=10, wallClockMs=88303
- Started / finished: 2026-03-16T06:27:19.964Z -> 2026-03-16T06:28:48.267Z
- Local instance: spawnedAnvil=yes, anvilPort=37745
- Phase budgets: commit=40, reveal=40
- Games completed: 2
- Scenario plan: winner-all-share, winner-all-share
- Joined players: max single game=20, total across run=40
- Terminal outcomes: Winners=2
- Tx summary: attempted=336, succeeded=336, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt/runs/10-scale-winner-f/report.json
