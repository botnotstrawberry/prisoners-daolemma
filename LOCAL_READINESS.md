# LOCAL READINESS

**Date:** 2026-03-16  
**Status:** Current local validation snapshot  
**Purpose:** Keep repo status honest by separating what is already exercised locally from what still needs more local work and what is blocked on live wallet/testnet execution.

## Done locally now

- The current contract slice is load-bearing on a local dev chain:
  - `AgentAuthRegistry` supports verifier-signed wallet/agent binding with expiry + nonce replay protection.
  - `PrisonersDaollema` supports create/join/commit/reveal/resolve/claim/refund/withdraw flows, winner/no-winner/cancelled terminal paths, and per-game settlement snapshots.
  - `GameChat` supports global and cause-scoped message posting gated by game truth.
- Automated local test layers exist in-repo:
  - Foundry unit tests
  - Foundry fuzz + invariant suites
  - JS tooling tests for auth/query/load-harness/canary/evidence helpers
  - broader integration smoke for auth -> gameplay -> query/export end to end
- Local load-harness coverage now includes:
  - deterministic `winner-all-share`, `cancelled-underfilled`, and `no-winner-all-catch` families
  - seeded `adversarial-random` breakage hunting
  - phase-edge burst probes around late commit/reveal, `advancePhase`, and settlement actions
  - optional same-block no-automine ordering probes for underfilled transition, per-round last action vs `advancePhase`, and duplicate `claim` / `refund` / `withdraw` contention
- Local soak presets now reach beyond smoke:
  - `broader-local`, `medium-local`, `large-local`, and `xlarge-local`
  - deterministic 32-player mixed-family coverage
  - started full-roster 32-player adversarial sweeps across multiple seeds
  - explicit longer 72/80-block phase budgets so larger local rounds do not fake-timeout
- Harness artifacts are machine-readable:
  - per-run `report.json` / `txs.jsonl`
  - per-game export directories
  - matrix `matrix-report.json` / `MATRIX_SUMMARY.md`
- Current status tracking now includes xlarge adversarial multi-seed local coverage, but the repo does **not** currently ship a preserved artifact bundle from that latest run set.

## Still not proven locally

- No automated 250-player single-game proof yet.
- No multi-instance parallel local stress harness yet.
- No broad auth-expiry chaos coverage inside the load harness yet.
- Same-block probes are deterministic local no-automine batches; they add useful ordering coverage, but they are not public mempool realism.
- The repo does not currently check in a fresh artifact bundle for the latest xlarge / multi-seed runs; if operator-facing proof is needed, it still has to be captured deliberately.

## Blocked on external execution

- First Base Sepolia canary deployment and preserved live artifact bundle
- Live wallet-funded auth / game / query / verify rehearsal on Base Sepolia
- Explorer verification and timing comfort on a real network
- Any Base mainnet canary or pilot

## Recommended operator order

1. `yarn test`
2. `yarn smoke:integration`
3. `yarn load:harness:matrix:broader`
4. `yarn load:harness:matrix:xlarge`
5. once a real local or Sepolia artifact directory exists, run `yarn judge:evidence -- --bundle <actual-bundle-dir>`

## Bottom line

Locally, the repo has moved past simple smoke testing: the current proof envelope includes deterministic scenario families, seeded adversarial breakage hunting, same-block ordering probes, and bounded soak presets up through 32-player multi-seed xlarge runs. The biggest remaining local-only gaps are the still-unmet 250-player single-game target, missing multi-instance stress, and preserving a fresh artifact bundle from the latest larger runs.
