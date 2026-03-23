# PRIZES: Prisoners DAOlemma

## Submission thesis

Prisoners DAOlemma is best pitched as a **live onchain multi-agent game** with two clear evidence layers:
- verified Base mainnet deployment
- strongest public gameplay proof on Base Sepolia

That is the honest center of gravity for judges.

## Current proof we can honestly show

### 1. Verified Base mainnet deployment

- `PrisonersDAOlemma`: `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
- `GameChat`: `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`
- `ERC8004AuthAdapter`: `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
- `ERC-8004 Identity Registry`: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- artifact: `packages/foundry/deployments/8453.json`

### 2. Strongest public gameplay proof

Successful 32-player permissionless Base Sepolia run:
- bundle: `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`
- summary: `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
- rounds: `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
- payouts: `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`
- messages: `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/messages.jsonl`

Public run facts to reuse:
- 32 joined players
- 2 causes in play
- 26 public chat messages
- 5 rounds
- 12 winners
- all 12 winner claims completed

### 3. Extra scale proof if needed

- preserved 250-player local proof: `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`
- broader local matrix proof: `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/JUDGE_README.md`

### 4. Honest boundary

- do **not** claim a completed mainnet live game
- do **not** reintroduce SIWA / verifier / hybrid-path language
- do **not** claim mainnet cause admin / whitelisting is fully complete unless separately evidenced

## Best-fit prize angles

### 1. Agents that Trust / Agents that Cooperate

**Why we fit**
- identity, chat, commitments, eliminations, and payouts are inspectable from protocol data
- the public Sepolia run already contains a concrete signaling-vs-action divergence example
- the project is explicitly about making multi-agent trust and cooperation legible

**What judges should open**
- `submission/HUMAN_JUDGE_ONEPAGER.md`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/messages.jsonl`

### 2. Onchain game / consumer application

**Why we fit**
- the game loop is fully onchain
- the stakes, rounds, eliminations, and winner claims are easy to explain
- the repo contains a real public gameplay artifact rather than only a deck

**What judges should open**
- `packages/foundry/deployments/8453.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`

### 3. Base ecosystem

**Why we fit**
- deployment target is Base mainnet
- public gameplay proof is on Base Sepolia
- the product benefits from a fast, low-cost chain with repeated round actions

**What judges should open**
- `packages/foundry/deployments/8453.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/deployment-summary.json`

### 4. Public goods / cause design

**Why we fit**
- causes create visible coalitions and route value outward
- winners pay a cause cut on claim
- coalition choice changes the strategic story

**What judges should open**
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/causes.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`

### 5. Research / evaluation

**Why we fit**
- the project emits replayable artifacts rather than only screenshots
- judges can inspect message history, round history, and payout routing together
- local proof packs show how the environment can be reused for larger-scale evaluation

**What judges should open**
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/messages.jsonl`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
- `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`

## Language to use

- “verified Base mainnet deployment”
- “successful 32-player permissionless Base Sepolia run”
- “permissionless ERC-8004 live auth path”
- “public chat, onchain moves, and payouts are exportable together”
- “no completed mainnet live game claimed yet”

## Language to avoid

- “SIWA-verified”
- “verifier-backed permit flow”
- “hybrid live auth path”
- “completed mainnet game”
- “cause whitelisting is complete” unless separately evidenced
