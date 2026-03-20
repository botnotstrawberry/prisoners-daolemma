# Prisoners DAOllema Audit Freeze Candidate

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daollema`
Purpose: identify what should likely be part of the next **audit-freeze candidate** versus what should stay out as generated evidence or secondary changes.

## Current state summary

A local audit-freeze candidate has now been prepared and committed.

Chosen local freeze candidate:
- `2267ce521548cae9cce7cfb5ad001d936470c627`

### Important observation
The working tree is no longer just deploy-script movement.

The most important onchain/deploy deltas now appear to be:
- `packages/foundry/contracts/PrisonersDaollema.sol`
- `packages/foundry/script/DeployPrisonersDaollema.s.sol`
- `packages/foundry/script/VerifyAll.s.sol`

The new contract-side delta is targeted rather than architectural:
- bounded-v1 winner payout recovery helpers (`claimTo`, `claimFor`)
- no protocol cap increase
- no large-N redesign

---

## Likely include in the audit-freeze candidate

These files are the strongest candidates to include in the next launch/audit freeze commit.

### Primary onchain/deploy/config surface
- `packages/foundry/contracts/PrisonersDaollema.sol`
- `packages/foundry/script/DeployPrisonersDaollema.s.sol`
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

---

## Probably keep out of the audit-freeze commit

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
- they can still be handed to auditors separately as supporting evidence

---

## Secondary / not primary for the first contract-focused audit freeze

These changes matter for launch readiness, but they are not the first thing I would optimize for in a contract-security freeze.

### Frontend / app-layer changes
- `packages/nextjs/app/page.tsx`
- `packages/nextjs/hooks/scaffold-eth/useScaffoldWatchContractEvent.ts`
- `packages/nextjs/hooks/scaffold-eth/useTransactor.tsx`
- `packages/nextjs/scaffold.config.ts`
- `packages/nextjs/utils/scaffold-eth/contract.ts`
- `packages/nextjs/.env.mainnet.example`

Current read:
- these look **launch-relevant** because they support explicit Base mainnet cutover and a few frontend type/runtime fixes
- they are still **audit-secondary** relative to the contracts + deploy/auth boundary

If the immediate goal is **smart contract security review**, these can be staged after or adjacent to the onchain freeze rather than blocking it.

---

## Decision points before freezing

### 1) Keep or revert deploy-script hardening?
The current deploy script appears to add:
- strict env enforcement on Base mainnet
- required explicit role/config addresses
- required explicit numeric game config values

Current recommendation after diff review:
- **keep this change**
- it is good deployment safety hardening
- it reduces the chance of silently deploying with unsafe defaults on Base mainnet

### 2) Reconcile parameter guidance
Current docs/templates are closer to aligned now, but final launch values still remain an operator decision.

Current state:
- `packages/foundry/.env.mainnet.example` now uses a conservative example first-canary `PRISONERS_MAX_PLAYERS=5`
- separately, the **hard v1 protocol cap remains `256`** and is intended to stay unchanged for v1
- final first-game values should still be chosen deliberately at launch time

This is mostly a **launch-parameter/template** issue rather than a contract-logic blocker.

### 3) Decide audit scope shape
Choose one:
- **contracts-first audit freeze**
- **contracts + deploy/auth system audit freeze**

My recommendation:
- use **contracts + deploy/auth boundary** as the first serious audit scope

### 4) Decide how to handle frontend mainnet-cutover changes
Current frontend diffs appear to do two things:
- support explicit Base mainnet targeting in the app config/UI
- fix a few type/runtime sharp edges

Current recommendation after diff review:
- treat these as **launch-adjacent but audit-secondary**
- they do not need to block a contract/deploy/auth freeze
- they can be merged alongside the freeze or immediately after, but should not be confused with core contract-review scope

---

## Proposed next freeze sequence

1. Decide whether the current deploy-script hardening stays.
2. Reconcile `.env.mainnet.example` and mainnet parameter guidance.
3. Separate code/config files from generated evidence artifacts.
4. Pick the exact audit candidate commit.
5. Re-run production gates on that exact commit if anything changed.
6. Hand auditors:
   - the frozen commit hash
   - `AUDIT_READINESS.md`
   - core design/testing docs
   - latest passing production-gates bundle
   - latest fresh Sepolia rehearsal bundle

---

## Practical recommendation

If the goal is to get auditors looking soon, the best path is:
- **do not wait for every frontend/detail to be perfect**
- freeze the **contracts + deploy/auth boundary** first
- keep evidence bundles adjacent, but not tangled into the audit commit
