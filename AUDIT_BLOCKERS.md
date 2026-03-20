# Prisoners DAOllema Audit Blockers and Action Plan

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daollema`
Status: post-deep-audit consolidation

## Purpose

Turn the current deep-audit results into an actionable blocker list for getting the bounded v1 candidate into a clean audit-freeze / launch-candidate state.

This file is intentionally practical.
It is not the full audit report.

---

## Executive summary

### Good news
- No critical or high-severity bug has been identified in the audited core contract slice.
- The current bounded v1 architecture (`maxPlayers <= 256`) still looks operationally credible.
- The repo already has meaningful unit/fuzz/invariant coverage plus real preserved proof bundles.

### Main problems still in front of us
1. **Contract liveness/economic issue:** winner-path funds can be stranded forever if winners never claim, and their cause cuts never accrue.
2. **Deploy/ops/evidence issues:** preflight, verification, and artifact provenance are not yet strict enough.
3. **Coverage/evidence gaps:** current proof posture is good, but not yet strong enough to honestly claim the full bounded-v1 envelope is fully proven.
4. **Freeze hygiene:** the audit candidate commit, scope, and evidence provenance still need to be pinned cleanly.

---

## P0 blockers

These are the most important items to resolve or explicitly sign off before calling the repo audit-ready / launch-candidate-ready.

### Progress snapshot (2026-03-19 UTC evening)
- preflight has been tightened to mirror core `GameConfig` bounds and now records launch config + git provenance artifacts
- verify flow has been tightened to use an explicit broadcast artifact and fail hard on nonzero verification command exit
- production gates now record git provenance
- the shipped mainnet env example was corrected so the conservative example is no longer internally invalid on `maxCauses > maxPlayers`
- `.mainnet-readiness/` is now treated as operational artifact space in `.gitignore` to reduce accidental future check-ins of ephemeral launch material
- winner claims now support `claimTo(...)` and third-party `claimFor(...)`, materially reducing the stranded-winner / delayed-cause-routing issue
- targeted bounded-v1 tests were added for:
  - exact `256` join acceptance with `257th` rejection
  - explicit post-join auth semantics
  - high-cardinality (`128` player) no-winner multi-cause settlement routing
- production gates have passed on the updated tree (`.mainnet-readiness/20260320T001239Z-production-gates/`)
- a dedicated bounded-v1 targeted evidence bundle has been captured at `.mainnet-readiness/20260320T002341Z-bounded-v1-audit-targets/`

These improvements reduce the ops/evidence risk materially and close several of the earlier proof gaps. A local audit-freeze candidate commit has now been created: `2267ce521548cae9cce7cfb5ad001d936470c627`. The main remaining work is to keep future audit discussion tied to that commit, explicitly sign off on the remaining edge cases around winner payout recovery for v1, and finalize operator-owned mainnet inputs separately from the code freeze.

### P0.1 — Winner-payout liveness / recovery path

**Severity:** reduced from the original audit concern, but still worth explicit sign-off.

### Current state
The original audit concern was that winner-path funds and their cause cuts could remain stranded if winners did not or could not claim.

That concern has now been **materially reduced** by adding:
- `claimFor(gameId, winner)` so any caller can finalize payout to the winner’s own address
- `claimTo(gameId, recipient)` so a winner can redirect payout to a receiver that can accept ETH

### Remaining edge cases
There is still no universal recovery path for every imaginable failure mode (for example, a permanently inaccessible winner wallet that is also unable to accept ETH at its own address).

### Required outcome
Before freeze, do one of:
- **accept the current recovery posture for v1** and document it clearly, or
- add an additional recovery/sweep design if you want stronger eventual-drain guarantees

### Current recommendation
For bounded v1, the new `claimFor` + `claimTo` paths are probably a reasonable stopping point **if** the remaining edge case is explicitly documented rather than ignored.

---

### P0.2 — Tighten preflight to validate real contract bounds

**Severity:** High on the ops side.

### Problem
Current preflight checks env presence and buildability, but does not fully mirror the real constructor/config constraints.

### Why this matters
It can still produce a misleading “ready” signal while the config is actually invalid for deployment.

### Required outcome
- preflight must fail early on impossible numeric configs
- preflight output should make the effective config explicit

---

### P0.3 — Make verification provenance trustworthy

**Severity:** High on the ops/evidence side.

### Problem
Verification currently appears too dependent on mutable “latest” artifacts and may not fail hard enough on verification errors.

### Why this matters
You do not want a launch/audit packet that says “verified” when it is stale, partial, or wrong.

### Required outcome
- verify against an explicit pinned broadcast artifact
- fail hard on nonzero verification failure
- record what exact artifact was verified

---

### P0.4 — Pin the audit candidate and evidence provenance

**Severity:** High process blocker.

### Status
**Closed at local freeze-candidate level.**

A local audit-freeze candidate commit has been chosen:
- `2267ce521548cae9cce7cfb5ad001d936470c627`

### Follow-through still needed
- keep audit notes/evidence references tied to that exact commit
- decide whether/when to push/share that candidate as the canonical review target
- finalize operator-owned mainnet inputs separately from the code freeze

---

## P1 blockers / strong pre-audit improvements

### P1.1 — Exact 256/257 boundary proof

### Status
**Partially closed.**

A deterministic Forge test now proves:
- 256 players can join cleanly
- the 257th is rejected

### Remaining improvement
- preserve this as a raw/proof artifact bundle as well if you want stronger audit-packet evidence than unit-test coverage alone

---

### P1.2 — Large no-winner routing proof

### Status
**Improved, but not maximally closed.**

A deterministic Forge test now covers:
- 128-player no-winner settlement
- multi-cause routing across 3 causes
- treasury/cause accounting expectations

### Remaining improvement
- add a preserved artifact bundle and/or push the no-winner evidence closer to the 256 ceiling if time and compute allow

---

### P1.3 — Explicit post-join auth semantics test

### Status
**Closed at unit-test level.**

A direct test now proves the intended v1 policy:
- auth gates admission
- after join, later revocation/expiry does not block gameplay or claims

### Remaining improvement
- make sure launch/audit docs say this explicitly so auditors do not have to infer policy from tests

---

### P1.4 — Artifact hygiene cleanup

### Problem
Operational/readiness trees currently mix reusable evidence with material that can include commit/reveal-sensitive artifacts.

### Desired outcome
- separate secret operational artifacts from long-lived checked-in evidence
- make it harder to accidentally ship sensitive round material inside readiness bundles

---

### P1.5 — Longer same-deployment soak evidence

### Problem
The code has decent sequential-game logic coverage, but preserved long sequential same-deployment evidence is still thinner than some docs imply.

### Desired outcome
- stronger same-deployment mixed-outcome soak evidence
- especially if you want to make strong operational readiness claims

---

## Non-blockers / things that looked good

These are areas that currently look healthy and should not be accidentally destabilized.

- config snapshotting per game
- cause recipient snapshotting per game
- admin write blocking while active
- commit/reveal binding logic
- accounting invariants and payout exclusivity
- auth registry design for admission gating
- current `256` cap as a bounded v1 operating assumption
- Base mainnet strict deploy hardening in the deploy script
- chain-id pinning and production-profile enforcement in prelaunch scripts

---

## Current recommended priority order

1. freeze exact audit candidate commit + evidence provenance
2. finish broader validation on the updated tree (production gates / affected suites)
3. document the v1 winner-payout recovery posture explicitly (`claim`, `claimTo`, `claimFor`)
4. preserve stronger artifact-grade evidence for the new bounded-v1 tests if time allows
5. clean stale docs / audit packet wording

---

## v1 framing to keep consistent

The repo should now present the product honestly as:
- bounded v1
- hard max-player ceiling remains `256`
- no large-N redesign before audit freeze
- fixed no-winner routing for v1
- future large-scale research belongs in a later branch / v2 track

---

## Immediate next execution focus

The best next technical moves are:
- convert the audit findings into an exact freeze checklist
- tighten launch evidence provenance
- inspect whether the stranded-winner issue is acceptable as-is or needs a fix before audit handoff
- add targeted tests/evidence for the current bounded v1 model rather than broadening scope
