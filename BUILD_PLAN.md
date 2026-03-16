# BUILD PLAN: Prisoners DAOllema v1

**Date:** 2026-03-16  
**Status:** Implementation order + phase tracker  
**Purpose:** Give coders and auditors a truthful build/status map rooted in the current repo. For the current local proof boundary, also read `LOCAL_READINESS.md`.

## 1. Authoritative inputs

Use these files, in order:
1. `CANON.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `AUTH_SPEC.md`
5. `CONTRACT_SPEC.md`
6. `REPLAY_SPEC.md`
7. `TEST_PLAN.md`
8. `PARAMETERS.md`
9. `LAUNCH_PLAN.md`
10. `SKILLS.md`

If a question is not answered here, ask the human instead of inventing product behavior.

---

## 2. Current implementation status

### Already done in the current repo
- real Foundry contracts exist for `AgentAuthRegistry`, `PrisonersDaollema`, and `GameChat`
- local Foundry unit/fuzz/invariant coverage exists for the contract surface
- local JS tooling tests exist for auth, query/export, load harness, matrix runner, canary helpers, and judge-evidence packaging
- a broader local integration smoke exists for auth -> gameplay -> query/export end to end
- the local SIWA -> verify -> permit -> register path exists as CLI-first tooling
- gameplay/operator tooling exists for create/advance/join/commit/reveal/claim/refund/withdraw/chat actions
- query/export tooling exists for game/auth/chat evidence export
- local load/chaos harness tooling exists, including adversarial and same-block ordering probes
- broader local soak presets now extend through `xlarge-local`
- Base Sepolia preflight/deployment inspection helpers and judge-evidence packaging helpers exist
- a full repo-shipped 250-player single-game local proof bundle now exists at `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- a compact repo-shipped local proof pack now captures the latest xlarge / multi-seed matrix summaries at `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`

### Still incomplete or unproven
- the repo still does not preserve the full raw tx/export bundle from those latest xlarge / multi-seed matrix runs
- multi-instance parallel local stress is still not implemented
- the first real Base Sepolia canary has not been executed and preserved in-repo
- mainnet canary/pilot work has not started
- richer replay/judge polish is still secondary to preserving truthful JSON/export evidence

---

## 3. Phase-by-phase status

## Phase 1 — contract foundation
**Status:** done locally.

Implemented locally now:
- `AgentAuthRegistry` wallet -> agent binding with expiry + nonce replay protection
- `PrisonersDaollema` game lifecycle, auth-gated join, commit/reveal, resolution, terminal outcomes, claim/refund/withdraw paths, and per-game snapshots
- cause whitelist handling and snapshot-aware settlement routing

Remaining caveat:
- local implementation exists, but live-chain execution still needs Sepolia proof

## Phase 2 — canonical gameplay logic
**Status:** done locally.

Locked locally through:
- deterministic unit coverage
- fuzz coverage
- invariant coverage
- load-harness deterministic families for winner / cancelled / no-winner paths

Remaining caveat:
- this does not waive live-chain timing validation

## Phase 3 — economics and payout logic
**Status:** done locally.

Implemented locally now:
- winner claims
- cancelled refunds
- no-winner treasury/cause routing
- pull-based treasury/cause withdrawals
- query/export coverage for settlement-aware evidence

Remaining caveat:
- live payout behavior still needs Sepolia observation

## Phase 4 — required SIWA admission path
**Status:** local CLI-first path done.

Implemented locally now:
- `siwa-nonce`
- `siwa-sign`
- `siwa-verify`
- verifier-signed permit generation
- onchain auth registration/status inspection
- thin explicit auth-flow wrapper that keeps every stage auditable

Remaining caveat:
- the proof today is local-first; live funded rehearsal still needs Sepolia execution

## Phase 5 — agent tooling
**Status:** done for local/operator CLI scope.

Implemented locally now:
- auth status / auth flow helpers
- gameplay/operator commands for create/advance/join/commit/reveal/claim/refund/withdraw
- query/export helpers for summary, auth, messages, and bundle export
- judge-evidence packaging helper for an already-captured bundle

Remaining caveat:
- the next meaningful step is real operator rehearsal on Base Sepolia, not inventing another local abstraction

## Phase 6 — chat and replay
**Status:** partial but usable.

Implemented locally now:
- `GameChat` global + cause-scoped posting rules
- query/export JSON for summaries, rounds, roster, auth, payouts, and messages when available
- machine-readable evidence export suitable for audit-first inspection

Still open:
- richer chat-vs-move presentation and judge-facing polish
- live replay/export capture from a real Base Sepolia run

## Phase 7 — polish and prize-layer integrations
**Status:** optional and mostly open.

Still optional/not prioritized yet:
- ENS display polish
- MetaMask Delegations path
- richer observer UI and replay visualization
- additional prize-story integrations beyond the local-first truthful core

---

## 4. Immediate remaining tasks

In order:
1. keep `LOCAL_READINESS.md`, `TEST_PLAN.md`, `README.md`, and `JUDGE_EVIDENCE.md` honest as local coverage changes
2. if more local-only time is available, close the biggest remaining local gaps:
   - multi-instance local stress
   - broader auth-expiry chaos in the harness
   - preserve a full raw in-repo tx/export bundle for the latest xlarge / multi-seed matrix run set
3. when wallet/operator availability exists, execute the Base Sepolia canary and preserve the full artifact bundle
4. only after live proof exists, spend more time on replay/judge polish

---

## 5. Audit priorities

Auditors should focus on:
- state machine correctness
- auth bypasses
- duplicate-entry paths
- commit/reveal timing bugs
- payout routing bugs
- rounding/withdrawal edge cases
- export/replay mismatches vs contract truth
- local harness overclaim risk (for example, confusing deterministic same-block probes with live mempool realism)

---

## 6. Scope guardrails

Do not:
- claim Sepolia execution happened before a real bundle exists
- pretend local xlarge coverage is the same thing as live-network proof
- overbuild the frontend before preserved live artifacts exist
- weaken admission just to speed up the demo
- add optional prize integrations that obscure the core game/evidence path

Do:
- keep the core game onchain
- keep the rules test-driven and auditable
- keep the admission story explicit
- keep replay/export JSON truthful even when a field is unavailable
- preserve artifact bundles when meaningful local or Sepolia runs happen

---

## 7. Bottom line

The repo is no longer at the placeholder stage. The honest next steps are:
1. maintain truthful local-readiness tracking,
2. optionally push the remaining local-only stress gaps,
3. execute and preserve the first Base Sepolia canary,
4. then spend polish effort on judge presentation.
