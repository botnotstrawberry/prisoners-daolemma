# Prisoners DAOllema Audit Readiness

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daollema`
Status: **Local audit-freeze candidate prepared**

## Purpose

This document is the practical handoff/checklist for getting Prisoners DAOllema into a state where smart contract security researchers and auditors can review it efficiently.

This is **not** a launch authorization.
It is a readiness and packaging note.

---

## Current verdict

The project is now **far enough along to name a concrete local audit-freeze candidate** and hand that candidate to smart contract auditors.

### What looks done enough for audit prep
- Core onchain game flow exists and has been exercised live on Base Sepolia.
- The primary contract set is stable enough to start framing audit scope.
- The repo now includes additional bounded-v1 hardening and proof coverage for:
  - exact `256` join acceptance with `257th` rejection
  - explicit post-join auth semantics
  - winner payout recovery helpers (`claimTo`, `claimFor`)
  - high-cardinality (`128` player) no-winner multi-cause settlement routing
- Latest local production-profile gates passed on the current tree before the latest round of hardening, and broader revalidation is in progress.
- Production compile profile is defined and contract size is within EIP-170 limits.

### What is still not fully frozen
- The local audit-freeze candidate commit is now chosen: `2267ce521548cae9cce7cfb5ad001d936470c627`.
- Final mainnet operator inputs (owner / treasury / verifier / final parameter sheet) are still not fully locked.
- The freeze candidate still needs whatever human decision you want on distribution/push/review workflow, but the code-side bounded-v1 candidate is now pinned locally.

---

## Primary audit scope

These are the contracts I would hand to smart contract auditors as the primary review set.

### Core contracts
- `packages/foundry/contracts/PrisonersDaollema.sol`
- `packages/foundry/contracts/AgentAuthRegistry.sol`
- `packages/foundry/contracts/GameChat.sol`

### Interface / supporting onchain surface
- `packages/foundry/contracts/interfaces/IGameChatHost.sol`

### Deployment/config surface to review alongside contracts
- `packages/foundry/script/DeployPrisonersDaollema.s.sol`
- `packages/foundry/script/DeployHelpers.s.sol`
- `packages/foundry/.env.mainnet.example`

### High-value test coverage for auditors to inspect
- `packages/foundry/test/PrisonersDaollema.t.sol`
- `packages/foundry/test/PrisonersDaollemaFuzz.t.sol`
- `packages/foundry/test/PrisonersDaollemaInvariant.t.sol`
- `packages/foundry/test/AgentAuthRegistry.t.sol`
- `packages/foundry/test/GameChat.t.sol`

---

## System areas auditors should think about explicitly

This repo should be reviewed as more than “just a game contract.” The most important audit lenses are:

1. **Game-state correctness**
   - join / commit / reveal / resolve transitions
   - defaulted SHARE handling
   - elimination logic
   - end-state settlement

2. **Economic correctness**
   - winner payouts
   - no-winner routing
   - refund behavior
   - treasury and cause accounting
   - pull-based withdrawals

3. **Authorization / identity model**
   - verifier-signed permit model
   - wallet ↔ agentKey uniqueness assumptions
   - expiry and replay protections
   - revoked / expired auth behavior during gameplay

4. **Timing / liveness assumptions**
   - join windows
   - commit/reveal block windows
   - phase advancement safety
   - default / no-reveal / no-commit behavior

5. **Cross-contract assumptions**
   - `PrisonersDaollema` ↔ `AgentAuthRegistry`
   - `PrisonersDaollema` ↔ `GameChat`
   - read-only assumptions in chat
   - settlement-critical state snapshot behavior

6. **Deployment/config risk**
   - required env enforcement
   - safe defaults vs strict deploy mode
   - production compile profile enforcement

---

## Evidence already available

### Sepolia / live-path evidence
Already proven on Base Sepolia:
- deploy + verify
- auth-gated joins
- global + cause chat
- winner-path settlement + claims
- no-winner routing settlement
- cancelled/refund settlement
- 5-player fast-follow smoke

Useful doc:
- `POST_CANARY_SUMMARY.md`

### Fresh production-profile rehearsal
A fresh production-profile Sepolia rehearsal has already been recorded as passed end-to-end.

Useful path:
- `.mainnet-readiness/20260319T0120Z-fresh-sepolia-production-rehearsal/`

### Latest local production gates
Latest confirmed passing run:
- `.mainnet-readiness/20260319T174036Z-production-gates/`

That run passed:
- `yarn test`
- `yarn next:check-types`
- `yarn smoke:integration`
- `yarn workspace @prisoners-daollema/foundry load:harness:auth-expiry`
- production size check

### Current production size result
- `PrisonersDaollema` runtime size: **19,809 B**
- EIP-170 limit: **24,576 B**
- margin: **4,767 B**

---

## Current freeze blockers

These are the items I would finish before saying “auditors can review the frozen candidate.”

### 1) Freeze an exact audit commit
Pick one commit hash and treat it as the audit candidate.

Why it matters:
- auditors need immutable scope
- test evidence and findings need to map to one code state

### 2) Clean the working tree
Current repo state still contains:
- modified code/config files
- generated readiness artifacts
- newly added scripts and examples

At the moment, the dirty tree appears to break down roughly as:
- **primary audit-relevant code/config:** `packages/foundry/script/DeployPrisonersDaollema.s.sol`, `package.json`, mainnet/deploy helper scripts
- **secondary / non-primary for contract audit:** current `packages/nextjs/*` changes
- **generated evidence/artifacts:** `.mainnet-readiness/*`, load-harness outputs, rehearsal bundles

Before audit kickoff, separate:
- real code changes
- deployment/config changes
- generated artifacts / evidence bundles

### 3) Decide the deploy-script hardening diff
Current Solidity-adjacent code change still present:
- `packages/foundry/script/DeployPrisonersDaollema.s.sol`

This looks like **deployment hardening**, not gameplay redesign, but it still affects the reviewed launch surface and should be either:
- accepted and frozen, or
- reverted before audit freeze

### 4) Lock the operator-owned deploy parameters
Still needs final decisions / explicit operator confirmation:
- `PRISONERS_OWNER`
- `PRISONERS_TREASURY`
- `PRISONERS_AUTH_VERIFIER`
- cause recipient whitelist
- first-mainnet parameter profile
- keep the mainnet env/template values treated as examples until the actual first-game values are chosen at launch time

### 5) Confirm audit scope boundaries
Decide whether the audit is:
- **contracts-only**, or
- **contracts + auth/deploy/replay system review**

My recommendation: start with **contracts + deploy/auth boundary review**, even if frontend/indexer stay secondary.

---

## Definition of “audit freeze” for this repo

I would call the project ready for a serious external/internal audit when all of the following are true:

- [ ] exact audit commit hash selected
- [ ] working tree cleaned or deliberately organized
- [ ] deploy-script hardening diff accepted or reverted
- [ ] production gates green on the frozen commit
- [ ] fresh Sepolia rehearsal mapped to the frozen candidate (or explicitly documented as the closest evidence)
- [ ] audit scope and out-of-scope components written down
- [ ] parameter sheet written down
- [ ] sensitive non-repo submission/chat-log archives kept out of git and out of the audit bundle unless explicitly sanitized

---

## Recommended audit packet

When the freeze is ready, the handoff to auditors should include:

### Code scope
- the frozen commit hash
- the contract list above
- deployment scripts and env example

### Core docs
- `CANON.md`
- `ARCHITECTURE.md`
- `PARAMETERS.md`
- `TEST_PLAN.md`
- `LAUNCH_PLAN.md`
- `MAINNET_LAUNCH_INPUTS.md`
- `POST_CANARY_SUMMARY.md`
- this file: `AUDIT_READINESS.md`

### Evidence
- latest passing production gates bundle
- fresh Sepolia production-profile rehearsal bundle
- any size audit output
- relevant replay/export artifacts if auditors want end-state proof

### Review prompts / focus areas
Ask auditors to pay special attention to:
- settlement conservation / stuck-fund risk
- no-winner routing correctness
- auth expiry / stale authorization behavior
- duplicate wallet / duplicate agent protections
- commit/reveal griefing and liveness edge cases
- cause withdrawal accounting
- phase advancement correctness
- deployment misconfiguration risk

---

## Planned internal audit sequence after freeze

Once the audit commit is frozen, use the workspace skill stack in this order:

1. `entry-point-analyzer`
2. `audit-context-building`
3. `scv-scan`
4. `building-secure-contracts` (`secure-workflow-guide` first)
5. `spec-to-code-compliance` (if using repo docs as source-of-truth)
6. `differential-review`
7. `fp-check` for candidate findings

Reference note:
- `/root/.openclaw/workspace/PRISONERS_DAOLLEMMA_AUDIT_SKILLS.md`

---

## Immediate next actions

The most valuable next steps are now:

1. choose the exact audit / freeze candidate commit hash
2. finish broader validation on the updated tree (including production gates and any affected suites)
3. document the bounded-v1 winner payout recovery posture clearly (`claim`, `claimTo`, `claimFor`)
4. tie the strongest evidence bundles and readiness notes to the frozen candidate
5. clean stale docs / wording before handing the packet to auditors

## Current product direction on scaling

As of 2026-03-19, the intended near-term path is:
- **v1 / audit path:** keep the current architecture, keep the current fixed no-winner routing for v1, keep per-game `maxPlayers`, and keep the current hard upper bound at `256` rather than raising it before audit freeze
- **future research branch:** preserve a later path toward a large-N aggregate/lazy-resolution redesign rather than pretending the current eager whole-roster loops are already a 10,000-player solution
- **future nice-to-have:** configurable `noWinnerCauseBps` can be revisited later if the team wants more tuning flexibility after v1 is finished and tested

Reference note:
- `SCALING_STRATEGY.md`

## Current bounded-v1 semantics to state explicitly

These are important to say plainly in the audit / launch packet:
- **auth gates admission, not ongoing participation** — after a player has joined, later expiry/revocation does not block commit / reveal / claim / refund in v1
- **winner payout recovery is improved but still bounded by recipient behavior** — winners can now use `claimTo(...)`, and third parties can use `claimFor(...)` to push payout to the winner address, but there is still no universal rescue path for every hypothetical broken recipient setup

---

## Notes

### Sensitive archive warning
Do **not** blindly include submission-prep/chat-log archives in the audit package.
Treat those as sensitive until explicitly sanitized.

### Mainnet warning
Do **not** treat audit readiness as permission to deploy.
Mainnet execution still requires separate operator confirmation and launch inputs.
