# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner only automates multiple local harness runs and aggregates their local-dev results; it does not add live-network realism, public mempool contention, or multi-instance parallel deployment stress.

## Aggregate summary

- Status: ok
- Preset: xlarge-local
- Runs completed: 2/2
- Games completed: 4
- Wall clock ms: 134170
- JSON report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md

## Coverage

- Seeds: xlarge-mixed-a, xlarge-seed-19
- Profiles: scale
- Requested scenarios: adversarial-random, mixed
- Largest requested player count: 32
- Max joined players in a single game: 32
- Games hitting requested player target: 3
- Same-block-enabled runs: 0
- Expected-failure-enabled runs: 0
- Total requested games: 4

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 76
- Probe failures as expected: 76
- Probe onchain reverts: 76
- Probe local rejections: 0
- Same-block expected failures: 0

## Transaction summary

- Attempted: 845
- Succeeded: 769
- Failed: 76
- Failed expected: 76
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Cancelled: 1
- NoWinners: 1
- Winners: 2

## Terminal paths

- cancelled-refunds: 1
- no-winner-routing: 1
- winner-claims: 2

## Case summary

### xlarge-adversarial-scale

- Runs: 1
- Seeds: xlarge-seed-19
- Requested scenarios: adversarial-random
- Total games completed: 1
- Max joined players in a single game: 32
- Total joined players across runs: 32
- Tx summary: attempted=389, failedExpected=76, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 76
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=1

### xlarge-mixed-scale

- Runs: 1
- Seeds: xlarge-mixed-a
- Requested scenarios: mixed
- Total games completed: 3
- Max joined players in a single game: 32
- Total joined players across runs: 79
- Tx summary: attempted=456, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1

## Runs

### Run 01 — xlarge-mixed-a
- Case: xlarge-mixed-scale
- Seed: xlarge-mixed-a
- Status: ok
- Profile: scale
- Requested scenario: mixed
- Requested size: 32 players / 3 games / 8 causes / concurrency 16
- Phase budgets: commit=72, reveal=72
- Games completed: 3
- Scenario plan: winner-all-share, cancelled-underfilled, no-winner-all-catch
- Joined players: max single game=32, total across run=79
- Terminal outcomes: Cancelled=1, NoWinners=1, Winners=1
- Tx summary: attempted=456, succeeded=456, failedExpected=0, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z/runs/01-xlarge-mixed-a/report.json
### Run 02 — xlarge-adversarial-a
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
- Report: /root/projects/prisoners-daollema/packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z/runs/02-xlarge-adversarial-a/report.json
