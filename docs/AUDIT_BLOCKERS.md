# Prisoners DAOlemma Audit Blockers and Resolution Status

Date: 2026-03-20 UTC
Repo: `/root/projects/prisoners-daolemma`
Status: **No open internal audit blockers on the current bounded-v1 candidate**

## Purpose

Track the audit blockers that previously stood between the bounded-v1 candidate and a clean internal audit-complete claim, and record their current resolution status.

This file is intentionally practical.
It is not the full audit report.

---

## Executive summary

### Current bottom line
- No critical or high-severity bug is currently known in the audited core contract slice.
- No remaining deploy/auth provenance blocker is currently open on the active audit candidate.
- The current internal audit-complete claim should be anchored to:
  - **commit:** `f8e0555ca932b32fa61701402784f324c54ba08d`
  - **tag:** `audit-freeze-candidate-20260320-mainnet-provenance`

### What changed to get here
- clean-tree provenance enforcement was added to the mainnet-facing preflight/deploy/verify/gates scripts by default
- explicit commit pinning support (`EXPECTED_GIT_COMMIT`) was added to those scripts
- preflight now enforces `uint32` bounds for durations to match the onchain config shape
- preflight now requires explicit operator acknowledgment that the verifier is an EOA with an available signing key (`PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=true`)
- verify now requires an explicit `VERIFY_BROADCAST_FILE` instead of relying on mutable fallback provenance
- clean candidate-pinned evidence bundles were regenerated:
  - `.mainnet-readiness/20260320T114449Z-production-gates/`
  - `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`
- audit docs were reconciled to the new candidate/evidence set

### What remains after blocker closure
Remaining work is now operator/handoff work, not an internal audit blocker:
- choose final mainnet live values for owner / treasury / verifier / causes / first-game parameters
- fund the deployer wallet for live Base mainnet execution
- decide whether/when to publish/share the current candidate externally

---

## Closed blocker ledger

### Closed — winner-payout liveness / recovery path

**Current status:** resolved as an accepted bounded-v1 limitation, not a blocker.

What changed:
- `claimFor(gameId, winner)` lets any caller finalize payout to the winner’s own address
- `claimTo(gameId, recipient)` lets a winner redirect payout to a receiver that can accept ETH

Current ruling:
- this materially reduced the original stranded-winner concern
- there is still no universal rescue path for every hypothetical broken recipient setup
- that residual edge case is now treated as an explicit bounded-v1 limitation, not a blocker

### Closed — preflight bounds parity

**Current status:** closed.

What changed:
- preflight already mirrored most logical config bounds
- it now also enforces `uint32` maxima on join / commit / reveal durations so deploy-time config cannot silently narrow at cast time

Impact:
- oversized duration envs now fail preflight instead of passing through to a wrapped smaller value

### Closed — verifier signer ambiguity

**Current status:** closed for the current deploy/auth boundary.

What changed:
- `.env.mainnet.example` now states the verifier must be an EOA with an available signing key
- preflight now requires explicit operator acknowledgment via `PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=true`
- preflight also rejects verifier addresses that already have contract code on the target network

Impact:
- the launch path no longer silently treats “any address” as acceptable for a verifier that must participate in an ECDSA signer flow

### Closed — verification provenance trustworthiness

**Current status:** closed.

What changed:
- verify now requires an explicit `VERIFY_BROADCAST_FILE`
- verify no longer quietly falls back to mutable “latest” provenance when no explicit artifact is supplied
- mainnet-facing scripts now enforce clean-tree provenance by default and can optionally pin an expected head commit

Impact:
- audit/deploy evidence can now be tied to an explicit artifact and a clean candidate state

### Closed — candidate/evidence provenance mismatch

**Current status:** closed.

What changed:
- the earlier dirty-tree bundles were superseded by clean candidate-pinned bundles on the current candidate:
  - `.mainnet-readiness/20260320T114449Z-production-gates/`
  - `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`

Impact:
- the repo can now honestly point at clean local evidence for the current audit candidate instead of relying on “close-enough” dirty-tree provenance

---

## Non-blockers to keep saying plainly

These are important caveats, but they do **not** currently block the internal audit-complete claim:

- **hard bounded-v1 ceiling:** `maxPlayers <= 256` remains a real safety boundary; do not raise it without redesign + re-audit
- **auth policy:** auth gates admission, not ongoing participation after join
- **payout recovery limit:** `claimTo` / `claimFor` improve recovery materially, but do not create a universal rescue path
- **cause-whitelist launch dependency:** deploy preflight does not itself prove at least one cause has already been whitelisted onchain before `createGame()`
- **older proof bundles:** older local proofs and Sepolia rehearsals remain supportive evidence, but they are not the new primary clean candidate-pinned bundles

---

## Current recommended use of this file

Use this as the quick answer to:
- “Are there any remaining internal audit blockers?” → **No, not on the current bounded-v1 candidate**
- “What commit are we talking about?” → `f8e0555ca932b32fa61701402784f324c54ba08d`
- “What evidence should we point reviewers at?” → the two clean bundles listed above plus the scope docs in `AUDIT_PACKET_INDEX.md`
