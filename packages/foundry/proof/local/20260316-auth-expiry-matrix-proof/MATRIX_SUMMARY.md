# Prisoners DAOllema local soak matrix

This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation. This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.

## Aggregate summary

- Status: ok
- Preset: auth-expiry-local
- Runs completed: 2/2
- Games completed: 6
- Wall clock ms: 31892
- JSON report: /root/projects/prisoners-daollema/packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/matrix-report.json
- Summary markdown: /root/projects/prisoners-daollema/packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/MATRIX_SUMMARY.md

## Execution model

- Mode: sequential
- Requested instance concurrency: 1
- Effective instance concurrency limit: 1
- Peak active runs observed: 1
- Runs with any overlap: 0
- Parallel overlap confirmed: no
- stopOnError: false
- Dispatch stopped early: no

## Coverage

- Seeds: auth-expiry-a, auth-expiry-b
- Profiles: smoke
- Requested scenarios: winner-all-share
- Largest requested player count: 6
- Max joined players in a single game: 6
- Games hitting requested player target: 6
- Same-block-enabled runs: 0
- Expected-failure-enabled runs: 0
- Auth-chaos-enabled runs: 2
- Total requested games: 6

## Auth-expiry chaos summary

- Enabled runs: 2
- Selected games: 6
- Applied games: 6
- Stale bundles failed as expected: 12/12
- Expired joins failed as expected: 12/12
- Refreshed registrations: 12
- Manual blocks mined for auth chaos: 6

## Aggregate breakage signals

- Unexpected failures: 0
- Wedged active slots: 0
- Terminal mismatches: 0
- Accounting mismatches: 0
- Preview mismatches: 0
- Drain mismatches: 0
- Replay inconsistencies: 0
- Expected failed txs: 24
- Probe failures as expected: 0
- Probe onchain reverts: 0
- Probe local rejections: 0
- Same-block expected failures: 0

## Transaction summary

- Attempted: 430
- Succeeded: 406
- Failed: 24
- Failed expected: 24
- Failed unexpected: 0
- Unexpected successes: 0

## Terminal outcomes

- Winners: 6

## Terminal paths

- winner-claims: 6

## Case summary

### smoke-auth-expiry-sweep

- Runs: 2
- Seeds: auth-expiry-a, auth-expiry-b
- Requested scenarios: winner-all-share
- Total games completed: 6
- Max joined players in a single game: 6
- Total joined players across runs: 36
- Tx summary: attempted=430, failedExpected=24, failedUnexpected=0, unexpectedSuccesses=0
- Probe failures as expected: 0
- Same-block expected failures: 0
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Terminal outcomes: Winners=6

## Parallel overlap pairs

- (none)

## Runs

### Run 01 — auth-expiry-a
- Case: smoke-auth-expiry-sweep
- Seed: auth-expiry-a
- Status: ok
- Profile: smoke
- Requested scenario: winner-all-share
- Requested size: 6 players / 3 games / 3 causes / concurrency 3
- Execution: mode=sequential, workerSlot=1, wallClockMs=13197
- Started / finished: 2026-03-16T07:12:56.667Z -> 2026-03-16T07:13:09.864Z
- Local instance: spawnedAnvil=yes, anvilPort=38803
- Phase budgets: commit=profile-default, reveal=profile-default
- Games completed: 3
- Scenario plan: winner-all-share, winner-all-share, winner-all-share
- Joined players: max single game=6, total across run=18
- Terminal outcomes: Winners=3
- Tx summary: attempted=215, succeeded=203, failedExpected=12, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Auth chaos: selectedGames=3, appliedGames=3, stale=6/6, expiredJoin=6/6, refresh=6
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/runs/01-auth-expiry-a/report.json
### Run 02 — auth-expiry-b
- Case: smoke-auth-expiry-sweep
- Seed: auth-expiry-b
- Status: ok
- Profile: smoke
- Requested scenario: winner-all-share
- Requested size: 6 players / 3 games / 3 causes / concurrency 3
- Execution: mode=sequential, workerSlot=1, wallClockMs=18683
- Started / finished: 2026-03-16T07:13:09.866Z -> 2026-03-16T07:13:28.549Z
- Local instance: spawnedAnvil=yes, anvilPort=41621
- Phase budgets: commit=profile-default, reveal=profile-default
- Games completed: 3
- Scenario plan: winner-all-share, winner-all-share, winner-all-share
- Joined players: max single game=6, total across run=18
- Terminal outcomes: Winners=3
- Tx summary: attempted=215, succeeded=203, failedExpected=12, failedUnexpected=0, unexpectedSuccesses=0
- Probe summary: expected=0/0, unexpectedSuccesses=0, onchainReverts=0, localRejections=0
- Same-block summary: batches=0, tx=0, expectedFailures=0, unexpectedFailures=0
- Auth chaos: selectedGames=3, appliedGames=3, stale=6/6, expiredJoin=6/6, refresh=6
- Breakage: wedge=0, terminal=0, accounting=0, preview=0, drain=0, replay=0, unexpected=0
- Report: /root/projects/prisoners-daollema/packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/runs/02-auth-expiry-b/report.json
