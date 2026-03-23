# Prisoners DAOlemma Audit Freeze Candidate

Date: 2026-03-20 UTC
Repo: `/root/projects/prisoners-daolemma`
Purpose: identify the current bounded-v1 audit-freeze candidate and the evidence that should travel with it.

## Current state summary

A new local audit-freeze candidate has been prepared to supersede the earlier bounded-v1 freeze candidate.

Chosen local freeze candidate:
- `f8e0555ca932b32fa61701402784f324c54ba08d`

Local tag:
- `audit-freeze-candidate-20260320-mainnet-provenance`

Why this supersedes the earlier candidate:
- it preserves the bounded-v1 contract posture
- it tightens the mainnet-facing deploy/auth provenance path
- it closes the dirty-tree / mutable-artifact audit blocker on the deploy/auth boundary

## What changed in this candidate

The most important files added/updated relative to the earlier candidate are:
- `scripts/run-base-mainnet-preflight.sh`
- `scripts/run-base-mainnet-deploy.sh`
- `scripts/run-base-mainnet-verify.sh`
- `scripts/run-production-gates.sh`
- `packages/foundry/.env.mainnet.example`

Key deltas:
- clean-tree provenance enforcement by default for mainnet-facing scripts
- optional explicit head pinning via `EXPECTED_GIT_COMMIT`
- explicit verifier-signer acknowledgment via `PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=true`
- explicit `uint32` bound checks for duration fields in preflight
- explicit `VERIFY_BROADCAST_FILE` requirement for verify provenance

The core bounded-v1 contract posture remains intentionally the same:
- bounded-v1 winner payout recovery helpers (`claimTo`, `claimFor`)
- no protocol cap increase
- no large-N redesign
- hard `maxPlayers <= 256` posture remains unchanged

---

## Likely include in the audit-freeze candidate

### Primary onchain/deploy/config surface
- `packages/foundry/contracts/PrisonersDAOlemma.sol`
- `packages/foundry/contracts/AgentAuthRegistry.sol`
- `packages/foundry/contracts/GameChat.sol`
- `packages/foundry/contracts/interfaces/IGameChatHost.sol`
- `packages/foundry/script/DeployPrisonersDAOlemma.s.sol`
- `packages/foundry/script/DeployHelpers.s.sol`
- `packages/foundry/script/VerifyAll.s.sol`
- `package.json`
- `scripts/run-production-gates.sh`
- `scripts/run-fresh-sepolia-production-rehearsal.sh`
- `scripts/run-base-mainnet-preflight.sh`
- `scripts/run-base-mainnet-deploy.sh`
- `scripts/run-base-mainnet-verify.sh`
- `scripts/resume-fresh-sepolia-production-rehearsal.sh`
- `packages/foundry/.env.mainnet.example`
- `.gitignore`

### Audit prep docs
- `AUDIT_READINESS.md`
- `AUDIT_FREEZE_CANDIDATE.md`
- `AUDIT_BLOCKERS.md`
- `AUDIT_PACKET_INDEX.md`

---

## Keep out of the code freeze commit

These are useful as evidence, but they should not be blindly mixed into the code freeze unless you explicitly want to version them.

### Generated readiness artifacts
- `.mainnet-readiness/*`
- load-harness output bundles
- rehearsal output bundles
- generated query/export snapshots
- ad hoc tx JSON outputs

Reason:
- they are evidence artifacts, not launch-candidate source code
- they create noise when auditors want a stable code snapshot
- they can be handed to auditors separately as supporting evidence

---

## Candidate-pinned evidence to hand reviewers

Primary clean bundles for this candidate:
- `.mainnet-readiness/20260320T114449Z-production-gates/`
- `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`

Supportive but secondary evidence:
- `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- `packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/`
- `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`
- `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

---

## Decision points that are now settled

### Keep the deploy/auth hardening diff?
Current recommendation: **keep it**.

Why:
- it tightens provenance and reviewer trust
- it reduces misconfiguration risk in the live deploy path
- it resolves the earlier audit blocker around mutable/dirty evidence provenance

### Audit scope shape?
Current recommendation: **contracts + deploy/auth boundary**.

Why:
- that matches the actual risk surface that still mattered after the contract-side bounded-v1 hardening
- it avoids pretending the app/frontend are the primary security freeze target

---

## Practical recommendation

If the goal is to get external reviewers looking soon, the right handoff is now:
- use the freeze candidate above as the code target
- keep the evidence bundles adjacent, not tangled into the code commit
- say plainly that the internal bounded-v1 audit pass is complete on this candidate
- keep operator-owned launch decisions separate from the audit-complete claim
