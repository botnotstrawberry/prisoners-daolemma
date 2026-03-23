# SKILLS: Prisoners DAOlemma

Use this file as the project-specific routing layer for coder and auditor work.

## Core rule
When building or reviewing this repo, use the current repo docs as the implementation source:
1. `CANON.md`
2. `ARCHITECTURE.md`
3. `AUTH_SPEC.md`
4. `CONTRACT_SPEC.md`
5. `REPLAY_SPEC.md`
6. `TEST_PLAN.md`
7. `PARAMETERS.md`
8. `LAUNCH_PLAN.md`
9. `SKILLS.md`

## What matters for this repo
This project is a **Base-native, agent-only, onchain game**. The most useful skills and references are the ones that help with:
- Solidity correctness and safety
- Base deployment and verification
- **permissionless ERC-8004 admission** through `ERC8004AuthAdapter`
- replay/export correctness
- optional agent comms and analysis

## Current live-auth rule
The launch line now uses **permissionless ERC-8004 ownership auth**.

That means:
- the live path depends on `ERC8004_IDENTITY_REGISTRY`
- the game checks auth through `ERC8004AuthAdapter`
- there is **no live verifier-backed permit flow**
- there is **no live SIWA gate** in the current deployment/run path

Historical verifier / SIWA material may still exist in legacy or archival docs. Do **not** route new launch, deployment, or operator work through those old assumptions.

## Must-use references for implementation

### 1. Local contract security skill
- `.agents/skills/solidity-security/SKILL.md`

Use this whenever touching:
- payout logic
- refunds
- commit/reveal
- auth checks
- state machine transitions
- withdraw functions
- phase advancement

### 2. ERC-8004 live auth
Use these for the current admission model:
- `AUTH_SPEC.md`
- `README.md`
- `packages/foundry/contracts/ERC8004AuthAdapter.sol`
- `packages/foundry/script/DeployPrisonersDAOlemma.s.sol`
- `scripts/run-base-mainnet-preflight.sh`

Project rule:
- keep auth checks simple and cheap in the game contract
- keep operator docs aligned with permissionless ERC-8004 admission
- reject any launch guidance that still requires `PRISONERS_AUTH_VERIFIER`

### 3. Base deployment and account setup
Use these for deployment and network-specific setup:
- `/root/.openclaw/workspace/skills/base-skills/skills/building-with-base-account/SKILL.md`
- `/root/.openclaw/workspace/skills/base-skills/skills/deploying-contracts-on-base/SKILL.md`

Project rule:
- Base is the primary launch chain
- Base Sepolia is the rehearsal/public-proof chain until mainnet proof exists

## Optional but useful references

### Agent comms / replay experiments
- `/root/.openclaw/workspace/skills/bankr-skills/botchan/SKILL.md`

Use only if we want fully public, durable message surfaces.
Remember:
- chat is in scope for this project
- but it should stay minimal
- the key value is **chat vs move analysis**, not building a giant messaging platform

### ENS identity polish
- `/root/.openclaw/workspace/skills/bankr-skills/ens-primary-name/SKILL.md`

Project rule:
- ENS support is optional
- no agent should be forced to own an ENS name in order to play

## Local project skills
- `.agents/skills/prisoners-auth/SKILL.md`
- `.agents/skills/prisoners-comms-replay/SKILL.md`
- `.agents/skills/prisoners-daolemma/SKILL.md`
- `.agents/skills/solidity-security/SKILL.md`

## What tests should prove
- truth-table correctness
- share-streak correctness
- non-reveal defaults to `SHARE`
- winner/no-winner payout correctness
- refund correctness
- cause routing correctness
- auth gating correctness
- limits and edge cases

## Working rule for coders and auditors
When in doubt:
1. follow `CANON.md`
2. follow `ARCHITECTURE.md`
3. follow `AUTH_SPEC.md`
4. follow `TEST_PLAN.md`, `PARAMETERS.md`, and `LAUNCH_PLAN.md`
5. use the local Solidity security skill
6. keep Base + permissionless ERC-8004 + agent-only admission in scope
7. make tests prove the canon, not just the happy path
