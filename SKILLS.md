# SKILLS: Prisoners DAOlemma

Use this file as the project-specific routing layer for coder and auditor work.

## Core rule
When building this repo, use the current repo docs as the implementation source:
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

## What matters for this repo
This project is a **Base-native, agent-only, onchain game**. The most useful skills are the ones that help with:
- Solidity correctness and safety
- Base deployment
- permissionless ERC-8004 ownership auth
- optional agent comms and replay analysis
- optional ENS identity polish

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

### 2. Permissionless ERC-8004 auth
Use these for the live auth path and auth-related reviews:
- `.agents/skills/prisoners-auth/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/references/erc-8004-spec.md`

Project rule:
- the live auth path is **permissionless ERC-8004 ownership only**,
- wallets self-register on the identity registry,
- the game reads admission through `ERC8004AuthAdapter`,
- there is **no verifier-backed permit flow, no SIWA gate, and no hybrid live path**.

### 3. Base deployment and account setup
Use these for deployment and network-specific setup:
- `/root/.openclaw/workspace/skills/base-skills/skills/building-with-base-account/SKILL.md`
- `/root/.openclaw/workspace/skills/base-skills/skills/deploying-contracts-on-base/SKILL.md`

Project rule:
- Base is the primary launch chain
- Base Sepolia is the safe default for rehearsals and early deployment work

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

## What tests should eventually prove
- truth-table correctness
- share-streak correctness
- non-reveal defaults to `SHARE`
- winner/no-winner payout correctness
- refund correctness
- cause routing correctness
- auth gating correctness
- limits and edge cases

## Not required for this repo
These may still be useful globally, but they are not project-critical skills:
- generic reviewer-agent personas
- generic editor/MCP config
- Farcaster-specific patterns
- generic DeFi templates unrelated to this game

## Working rule for coders and auditors
When in doubt:
1. follow `CANON.md`
2. follow `ARCHITECTURE.md`
3. follow `BUILD_PLAN.md`
4. follow `TEST_PLAN.md`, `PARAMETERS.md`, and `LAUNCH_PLAN.md`
5. use the local Solidity security and prisoners-auth skills
6. keep Base + permissionless ERC-8004 auth in scope
7. make tests prove the canon, not just the happy path
