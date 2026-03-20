# Prisoners DAOlemma Audit Readiness

Date: 2026-03-20 UTC
Repo: `/root/projects/prisoners-daolemma`
Status: **Internal audit-complete candidate prepared**

## Purpose

This document is the practical handoff/checklist for getting Prisoners DAOlemma into a state where smart contract security researchers and auditors can review it efficiently.

This is **not** a launch authorization.
It is a readiness and packaging note.

---

## Current verdict

As of 2026-03-20, the bounded-v1 **contracts + deploy/auth boundary** have completed the intended internal audit pass on the current freeze candidate:

- **audit candidate commit:** `f8e0555ca932b32fa61701402784f324c54ba08d`
- **local tag:** `audit-freeze-candidate-20260320-mainnet-provenance`

Current read:
- no remaining code-security blocker is known in the bounded-v1 contract set
- no remaining deploy/auth provenance blocker is known on the candidate above
- the repo now has clean candidate-pinned local validation bundles for the current candidate

What this means:
- the project is ready to hand to external auditors/reviewers if desired
- the current internal audit-complete claim should be anchored to the candidate above
- launch still requires separate operator confirmation, funding, and final mainnet inputs

---

## Primary audit scope

These are the contracts/files I would hand to smart contract auditors as the primary review set.

### Core contracts
- `packages/foundry/contracts/PrisonersDAOlemma.sol`
- `packages/foundry/contracts/AgentAuthRegistry.sol`
- `packages/foundry/contracts/GameChat.sol`

### Interface / supporting onchain surface
- `packages/foundry/contracts/interfaces/IGameChatHost.sol`

### Deployment/config surface to review alongside contracts
- `packages/foundry/script/DeployPrisonersDAOlemma.s.sol`
- `packages/foundry/script/DeployHelpers.s.sol`
- `packages/foundry/script/VerifyAll.s.sol`
- `packages/foundry/.env.mainnet.example`
- `scripts/run-base-mainnet-preflight.sh`
- `scripts/run-base-mainnet-deploy.sh`
- `scripts/run-base-mainnet-verify.sh`
- `scripts/run-production-gates.sh`

### High-value test coverage for auditors to inspect
- `packages/foundry/test/PrisonersDAOlemma.t.sol`
- `packages/foundry/test/PrisonersDAOlemmaFuzz.t.sol`
- `packages/foundry/test/PrisonersDAOlemmaInvariant.t.sol`
- `packages/foundry/test/AgentAuthRegistry.t.sol`
- `packages/foundry/test/GameChat.t.sol`
- `packages/foundry/scripts-js/integrationSmoke.test.js`
- `packages/foundry/scripts-js/loadHarness.test.js`

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
   - `PrisonersDAOlemma` ↔ `AgentAuthRegistry`
   - `PrisonersDAOlemma` ↔ `GameChat`
   - read-only assumptions in chat
   - settlement-critical state snapshot behavior

6. **Deployment/config risk**
   - required env enforcement
   - verifier signer assumptions
   - clean-tree provenance / commit pinning
   - explicit verification artifact provenance
   - production compile profile enforcement

---

## Evidence currently available

### Clean candidate-pinned local validation
Primary current evidence:
- `.mainnet-readiness/20260320T114449Z-production-gates/`
- `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`

The production-gates bundle passed:
- `yarn test`
- `yarn next:check-types`
- `yarn smoke:integration`
- `yarn workspace @prisoners-daolemma/foundry load:harness:auth-expiry`
- production size check

### Sepolia / live-path evidence
Still useful as operational evidence:
- deploy + verify
- auth-gated joins
- global + cause chat
- winner-path settlement + claims
- no-winner routing settlement
- cancelled/refund settlement
- 5-player fast-follow smoke

Useful doc/path:
- `POST_CANARY_SUMMARY.md`
- `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

### Earlier preserved local proof of interest
Supportive, not primary freeze-pinned evidence:
- `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- `packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/`
- `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`

### Current production size result
- `PrisonersDAOlemma` runtime size: **19,939 B**
- EIP-170 limit: **24,576 B**
- margin: **4,637 B**

---

## Audit-complete checklist for the current candidate

For the current internal bounded-v1 audit pass, these items are now satisfied:

- [x] exact audit commit hash selected
- [x] working tree cleaned for candidate-pinned validation
- [x] deploy/auth hardening diff accepted into the candidate
- [x] production gates green on the frozen candidate
- [x] audit scope and out-of-scope components written down
- [x] sensitive non-repo submission/chat-log archives kept out of the audit bundle unless explicitly sanitized
- [x] candidate-pinned local validation evidence captured cleanly

Items that remain important but are **launch/operator** work rather than internal audit blockers:
- [ ] final mainnet owner / treasury / verifier values chosen for live deployment
- [ ] actual first-game cause whitelist populated onchain before `createGame()`
- [ ] deployer wallet funded on Base mainnet
- [ ] decision made on whether/when to publish/share the current candidate externally

---

## Recommended audit packet

When handing the current candidate to reviewers, include:

### Code scope
- the frozen candidate commit hash: `f8e0555ca932b32fa61701402784f324c54ba08d`
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
- `AUDIT_PACKET_INDEX.md`

### Evidence
- `.mainnet-readiness/20260320T114449Z-production-gates/`
- `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`
- supportive Sepolia/local proof bundles as needed

### Review prompts / focus areas
Ask reviewers to pay special attention to:
- settlement conservation / stuck-fund risk
- no-winner routing correctness
- auth expiry / stale authorization behavior
- duplicate wallet / duplicate agent protections
- commit/reveal griefing and liveness edge cases
- cause withdrawal accounting
- phase advancement correctness
- deployment misconfiguration risk
- verifier signer assumptions

---

## Current bounded-v1 semantics to state explicitly

These are important to say plainly in the audit / launch packet:
- **auth gates admission, not ongoing participation** — after a player has joined, later expiry/revocation does not block commit / reveal / claim / refund in v1
- **winner payout recovery is improved but still bounded by recipient behavior** — winners can use `claimTo(...)`, and third parties can use `claimFor(...)`, but there is still no universal rescue path for every hypothetical broken recipient setup
- **hard safety boundary remains `maxPlayers <= 256`** — do not raise this ceiling without redesign + re-audit
- **verifier must be an EOA signer** — contract/EIP-1271 verifier patterns are not supported by the current `AgentAuthRegistry` ECDSA flow
- **preflight is deploy-time validation, not full launch completion** — at least one cause still must be whitelisted onchain before `createGame()`

---

## Notes

### Sensitive archive warning
Do **not** blindly include submission-prep/chat-log archives in the audit package.
Treat those as sensitive until explicitly sanitized.

### Mainnet warning
Do **not** treat audit readiness as permission to deploy.
Mainnet execution still requires separate operator confirmation and launch inputs.
