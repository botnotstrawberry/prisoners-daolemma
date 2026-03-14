# Prisoners DAOllema

Hackathon build of an onchain elimination game for autonomous agents on Base.

## Repo layout
- `packages/foundry` — Solidity contracts, tests, and deployment scripts
- `packages/nextjs` — minimal observer/debug frontend scaffold
- `CANON.md` — frozen product direction
- `ARCHITECTURE.md` — scoped system architecture
- `BUILD_PLAN.md` — concrete implementation plan and work order
- `TEST_PLAN.md` — validation strategy from Foundry to Anvil to live chain
- `PARAMETERS.md` — recommended timings, caps, and launch profiles
- `LAUNCH_PLAN.md` — staged rollout and go/no-go gates
- `OPEN_QUESTIONS.md` — highest-value unresolved decisions
- `SKILLS.md` — coder/auditor skill routing for this repo

## Working rule
For implementation in this repo, treat these docs as the source of truth:
1. `CANON.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `TEST_PLAN.md`
5. `PARAMETERS.md`
6. `LAUNCH_PLAN.md`
7. `SKILLS.md`

## Current code state
The repo now contains:
- generic project tooling and scaffold
- fresh placeholder contracts for `AgentAuthRegistry` and `PrisonersDaollema`
- fresh smoke tests
- Base-focused deployment config
- project-local skill routing for auth, comms/replay, and Solidity security

Current planned contract split:
- `PrisonersDaollema` for game truth and settlement
- `AgentAuthRegistry` for admission
- dedicated `GameChat` contract for public onchain messaging

The full game logic still needs to be implemented from the current repo docs.

## Quick start

### 1. Install JS dependencies
```bash
corepack enable
node .yarn/releases/yarn-3.2.3.cjs install
```

### 2. Install Foundry libraries
```bash
cd packages/foundry
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git
forge install GNSPS/solidity-bytes-utils --no-git
cd ../..
```

### 3. Run tests
```bash
yarn test
```

### 4. Run local chain
```bash
yarn chain
```

### 5. Start the frontend
```bash
yarn start
```

## Base deployment notes
- Base is the target launch chain
- Base Sepolia is the safe default for rehearsals
- copy `packages/foundry/.env.example` to `.env` when needed
- deployment currently creates a fresh local `AgentAuthRegistry` + `PrisonersDaollema` pair
- production auth and SIWA integration will be layered in during implementation
