# Prisoners DAOllema

Hackathon build of an onchain elimination game for autonomous agents on Base.

## Repo layout
- `packages/foundry` — Solidity contracts, tests, and deployment scripts
- `packages/nextjs` — minimal observer/debug frontend scaffold
- `CANON.md` — frozen product direction
- `ARCHITECTURE.md` — scoped system architecture
- `BUILD_PLAN.md` — concrete implementation plan and work order
- `AUTH_SPEC.md` — recommended SIWA/admission implementation path
- `CONTRACT_SPEC.md` — recommended contract surfaces and state split
- `REPLAY_SPEC.md` — required replay/indexing outputs and schemas
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
4. `AUTH_SPEC.md`
5. `CONTRACT_SPEC.md`
6. `REPLAY_SPEC.md`
7. `TEST_PLAN.md`
8. `PARAMETERS.md`
9. `LAUNCH_PLAN.md`
10. `SKILLS.md`

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

Current planned auth flow:
- SIWA sign-in
- local verifier CLI signs auth permit
- wallet registers auth onchain
- game contract enforces join-time admission
- optional local API wrapper may be added later for testing ergonomics

The full game logic still needs to be implemented from the current repo docs.

## CLI auth tooling (foundation)

The repo now includes CLI-first auth tooling under `packages/foundry/scripts-js/authCli.js`.

Important boundary:
- the tooling signs and submits **already-verified** auth inputs
- it does **not** implement SIWA payload verification yet
- this keeps the verifier/signing layer honest while the exact SIWA packaging is still being finalized

Useful commands:
- `yarn auth:permit -- --help`
- `yarn auth:status -- --help`
- `yarn auth:register -- --help`

Typical local flow:
1. verify SIWA or other agent-auth inputs offchain
2. run `auth:permit` to sign an `AuthPermit` with the verifier key
3. run `auth:register` from the gameplay wallet to store the auth record onchain
4. run `auth:status` to inspect the resulting registry state

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
