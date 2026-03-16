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
  - optional bounded auth-expiry chaos that locally rehearses stale permit/register rejection, expired-auth join rejection, and fresh-auth recovery before the main join batch
- Local soak presets now reach beyond smoke:
  - `broader-local`, `medium-local`, `large-local`, `xlarge-local`, and `parallel-local`
  - deterministic 32-player mixed-family coverage
  - started full-roster 32-player adversarial sweeps across multiple seeds
  - bounded host-local multi-instance overlap via isolated harness + Anvil instances on one machine
  - explicit longer 72/80-block phase budgets so larger local rounds do not fake-timeout
- Harness artifacts are machine-readable:
  - per-run `report.json` / `txs.jsonl`
  - per-game export directories
  - matrix `matrix-report.json` / `MATRIX_SUMMARY.md`
- A full preserved 250-player single-game local proof bundle is now checked in at `packages/foundry/proof/local/20260316-250-player-single-game-proof/`, rooted in a clean winner-path run with explicit 320/320/320 local timing budgets and preserving `report.json`, `txs.jsonl`, and per-game evidence export.
- A compact preserved local proof pack is now checked in at `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`, rooted in the latest validated xlarge-local and 32-player adversarial multi-seed matrix runs.
- A compact preserved parallel-local proof pack is now checked in at `packages/foundry/proof/local/20260316-parallel-local-proof-pack/`, rooted in a real 3-instance overlapping host-local matrix run (`parallel-local`, requested instance concurrency 3, peak active runs observed 3).

## Still not proven locally

- Host-local parallel coverage is now real but still bounded: the checked-in proof reaches 3 overlapping isolated harness + Anvil instances on one machine, not the full 5-10 deployment saturation envelope sketched in `TEST_PLAN.md`.
- Auth-expiry coverage is now bounded pre-join only: the harness can rehearse stale permit/register rejection plus expired-auth join rejection and recovery once per run, but it does **not** yet prove broader mass-expiry, mid-game expiry, or full-SIWA-wrapper expiry behavior.
- Same-block probes are deterministic local no-automine batches; they add useful ordering coverage, but they are not public mempool realism.
- The repo still does **not** preserve the full raw tx/export bundle from the latest xlarge / multi-seed matrix runs in-repo; that preservation gap is narrowed by the separate checked-in 250-player single-game raw bundle, but it is not yet closed for the latest matrix run set.

## Blocked on external execution

- First Base Sepolia canary deployment and preserved live artifact bundle
- Live wallet-funded auth / game / query / verify rehearsal on Base Sepolia
- Explorer verification and timing comfort on a real network
- Any Base mainnet canary or pilot

## Recommended operator order

1. `yarn test`
2. `yarn next:check-types`
3. `yarn smoke:integration`
4. `yarn workspace @prisoners-daollema/foundry load:harness:auth-expiry`
5. `yarn load:harness:matrix:broader`
6. `yarn load:harness:matrix:parallel -- --instance-concurrency 3`
7. `yarn load:harness:matrix:xlarge`
8. inspect `packages/foundry/proof/local/20260316-250-player-single-game-proof/` for the preserved full 250-player single-game local proof bundle, and regenerate its judge-facing guide with `yarn judge:evidence -- --bundle proof/local/20260316-250-player-single-game-proof` if needed
9. inspect `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/` for the preserved compact local matrix proof pack, and regenerate its judge-facing guide with `yarn judge:evidence -- --bundle proof/local/20260316-xlarge-matrix-proof-pack` if needed
10. inspect `packages/foundry/proof/local/20260316-parallel-local-proof-pack/` for the preserved compact parallel-local proof pack, and regenerate its judge-facing guide with `yarn judge:evidence -- --bundle proof/local/20260316-parallel-local-proof-pack` if needed

## Bottom line

Locally, the repo has moved past simple smoke testing: the current proof envelope includes deterministic scenario families, seeded adversarial breakage hunting, same-block ordering probes, bounded pre-join auth-expiry chaos rehearsal, bounded host-local parallel overlap across isolated harness instances, a checked-in full 250-player single-game proof bundle, and checked-in compact proof packs rooted in the latest xlarge / multi-seed and parallel-local artifacts. The biggest remaining local-only gaps are heavier multi-instance saturation beyond the current 3-instance host-local proof, broader auth-expiry coverage beyond today’s bounded pre-join rehearsal, and the absence of a full raw tx/export bundle for the latest xlarge / multi-seed matrix run set.
