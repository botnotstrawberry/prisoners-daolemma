# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner only automates multiple local harness runs and aggregates their local-dev results; it does not add live-network realism, public mempool contention, or multi-instance parallel deployment stress.

## Aggregate summary

- Status: ok
- Preset: xlarge-local
- Runs completed: 3/3
- Games completed: 3
- Wall clock ms: 145844
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md

## Coverage

- Seeds: xlarge-seed-19, xlarge-seed-211, xlarge-seed-73
- Profiles: scale
- Requested scenarios: adversarial-random
- Largest requested player count: 32
- Max joined players in a single game: 32
- Games hitting requested player target: 3
- Same-block-enabled runs: 0
- Expected-failure-enabled runs: 0
- Total requested games: 3

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 163
- Probe failures as expected: 163
- Probe onchain reverts: 163
- Probe local rejections: 0
- Same-block expected failures: 0

## Transaction summary

- Attempted: 958
- Succeeded: 795
- Failed: 163
- Failed expected: 163
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Winners: 3

## Terminal paths

- winner-claims: 3

## Case summary

### xlarge-adversarial-scale

- Runs: 3
- Seeds: xlarge-seed-19, xlarge-seed-211, xlarge-seed-73
- Requested scenarios: adversarial-random
- Total games completed: 3
- Max joined players in a single game: 32
- Total joined players across runs: 96
- Tx summary: attempted=958, failedExpected=163, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 163
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=3

## Runs

### Run 01 — xlarge-adversarial-a
- Case: xlarge-adversarial-scale
- Seed: xlarge-seed-19
- Status: ok
- Profile: scale
- Requested scenario: adversarial-random
- Requested size: 32 players / 1 games / 8 causes / concurrency 16
- Phase budgets: commit=80, reveal=80
- Games completed: 1
- Scenario plan: adversarial-random
- Joined players: max single game=32, total across run=32
- Terminal outcomes: Winners=1
- Tx summary: attempted=389, succeeded=313, failedExpected=76, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=76/76, unexpectedSuccesses=0, onchainReverts=76, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster/runs/01-xlarge-adversarial-a/report.json
### Run 02 — xlarge-adversarial-b
- Case: xlarge-adversarial-scale
- Seed: xlarge-seed-73
- Status: ok
- Profile: scale
- Requested scenario: adversarial-random
- Requested size: 32 players / 1 games / 8 causes / concurrency 16
- Phase budgets: commit=80, reveal=80
- Games completed: 1
- Scenario plan: adversarial-random
- Joined players: max single game=32, total across run=32
- Terminal outcomes: Winners=1
- Tx summary: attempted=299, succeeded=260, failedExpected=39, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=39/39, unexpectedSuccesses=0, onchainReverts=39, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster/runs/02-xlarge-adversarial-b/report.json
### Run 03 — xlarge-adversarial-c
- Case: xlarge-adversarial-scale
- Seed: xlarge-seed-211
- Status: ok
- Profile: scale
- Requested scenario: adversarial-random
- Requested size: 32 players / 1 games / 8 causes / concurrency 16
- Phase budgets: commit=80, reveal=80
- Games completed: 1
- Scenario plan: adversarial-random
- Joined players: max single game=32, total across run=32
- Terminal outcomes: Winners=1
- Tx summary: attempted=270, succeeded=222, failedExpected=48, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=48/48, unexpectedSuccesses=0, onchainReverts=48, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster/runs/03-xlarge-adversarial-c/report.json
