# BUILD PLAN: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Active implementation plan  
**Purpose:** Give coders and auditors a concrete build order so the repo can be implemented without relying on outside project files.

## 1. Authoritative inputs

Use these files, in order:
1. `CANON.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `TEST_PLAN.md`
5. `PARAMETERS.md`
6. `LAUNCH_PLAN.md`
7. `SKILLS.md`

If a question is not answered here, ask the human instead of inventing product behavior.

---

## 2. What is already done

### Repository state
- repo scaffold exists
- Base-focused Foundry + Next.js setup exists
- local project skills/routing exists
- fresh placeholder contracts exist:
  - `packages/foundry/contracts/AgentAuthRegistry.sol`
  - `packages/foundry/contracts/PrisonersDaollema.sol`
- fresh smoke tests exist

### What is intentionally *not* done yet
- real SIWA verifier flow
- real join / commit / reveal / resolve logic
- real payout accounting
- real chat ingestion
- real replay/indexing

---

## 3. Phase-by-phase build order

## Phase 1 — contract foundation
**Goal:** turn the placeholder contracts into real product contracts.

### 3.1 `AgentAuthRegistry`
Implement:
- wallet -> agent binding
- `agentKey`
- `manifestHash`
- expiry
- nonce / replay protection if permits are used
- events for auth registration and revocation

### 3.2 `PrisonersDaollema`
Implement the full state machine for:
- join
- commit
- reveal
- resolve
- claim
- refund

### 3.3 Rules to encode
- one active game flow at a time
- one cause chosen at join time
- deterministic truth-table resolution
- non-reveal defaults to `SHARE`
- sole survivor wins immediately
- 3x all-`SHARE` streak => sharer win

### 3.4 Tests required in this phase
- constructor/config tests
- phase transition tests
- auth gating smoke tests
- join precondition tests
- commit/reveal timing tests

**Exit condition:** the core state machine exists and compiles, even if payouts are not final.

---

## Phase 2 — canonical gameplay logic
**Goal:** prove the rules, not just the happy path.

### 4.1 Truth-table tests
Create explicit tests for:
- catchers only
- sharers only
- stealers only
- sharers + catchers
- stealers + catchers
- stealers + sharers
- all three

### 4.2 Survival and ending tests
- sole survivor immediate win
- share streak reset cases
- share streak win at 3
- no-winner end states

### 4.3 Auth and duplication tests
- unauthorized join reverts
- duplicate wallet join reverts
- duplicate agent join reverts
- expired auth cannot join

**Exit condition:** the gameplay canon is locked by tests.

---

## Phase 3 — economics and payout logic
**Goal:** encode the ETH + cause payout model safely.

### 5.1 Required accounting
- entry fee pool
- creator fee
- cause cut on winner claim
- no-winner cause distribution
- treasury cut on no-winner end

### 5.2 Tests required
- winner payout split
- cause cut routing
- no-winner cause routing
- treasury routing
- refund on cancelled / unstarted game
- edge cases around odd splits and rounding

### 5.3 Security rules
Use `.agents/skills/solidity-security/SKILL.md` for this phase.

**Exit condition:** all payout and refund flows are implemented and tested.

---

## Phase 4 — required SIWA admission path
**Goal:** make SIWA load-bearing for admission.

### 6.1 Implement offchain/onchain split
- offchain verifier validates SIWA
- verifier issues auth permit or registration approval
- wallet registers auth onchain in `AgentAuthRegistry`
- game contract checks auth registry in `join()`

### 6.2 Important constraints
- SIWA is required for admission
- SIWA is not repeated for every move
- gameplay still uses a normal wallet
- auth must not infect round resolution logic

### 6.3 Deliverables
- auth verifier service or script
- auth registration flow
- auth status script
- end-to-end join demonstration

**Exit condition:** an agent cannot join the official path without SIWA-backed admission.

---

## Phase 5 — agent tooling
**Goal:** make the game usable by agents without manual confusion.

### 7.1 Required CLI or script actions
- auth status
- SIWA challenge/sign-in
- register auth onchain
- join
- commit
- reveal
- claim
- state read
- round summary

### 7.2 Required guidance
- onboarding instructions for gameplay wallet setup
- manifest format for agents
- error handling docs for failed auth / expired auth / missed reveal

### 7.3 Deliverables
- project skill docs updated as needed
- agent-facing commands/scripts work on Base Sepolia first

**Exit condition:** demo agents can complete the core loop with repo-native tooling.

---

## Phase 6 — chat and replay
**Goal:** deliver the differentiator: what agents said vs what they did.

### 8.1 Minimal chat design
Implement a dedicated `GameChat` contract that supports **game-native onchain** public messages with:
- `gameId`
- optional `round`
- optional `causeId`
- `senderWallet`
- content
- timestamp / block context
- tx sender / event provenance

Posting rules:
- global chat: joined participants, including eliminated players
- cause chat: alive joined participants whose selected cause matches the cause channel

### 8.2 Replay/indexing outputs
At minimum produce:
- current state view
- round summaries
- message log
- chat-vs-move correlation artifact
- clear labeling of actual same-cause teammates vs other participants

### 8.3 Questions the replay should answer
- who said what?
- who played what?
- who bluffed?
- did same-cause agents coordinate?
- what payouts followed?

**Exit condition:** judges can inspect both messages and moves in a single coherent story.

---

## Phase 7 — polish and prize-layer integrations
**Goal:** add optional integrations without breaking the core.

### 9.1 ENS
- optional display support
- optional demo subnames if useful
- no requirement that agents own ENS names

### 9.2 MetaMask Delegations
- optional enhanced path only
- must not block normal participation
- good for safety + prize story if time allows

### 9.3 Observer polish
- cleaner replay UI
- better summaries
- screenshots and demo-script readiness

**Exit condition:** the project is easier to judge and stronger for prize targeting, but the core loop still works without these extras.

---

## 4. Immediate next implementation tasks

In order:
1. replace placeholder `PrisonersDaollema` with real game structs/state
2. replace placeholder `AgentAuthRegistry` with permit/expiry/nonce-aware auth model
3. write truth-table tests
4. write payout/refund tests
5. implement SIWA verifier flow
6. build auth/join scripts
7. build minimal replay + chat ingestion

---

## 5. Audit priorities

Auditors should focus on:
- state machine correctness
- auth bypasses
- duplicate-entry paths
- commit/reveal timing bugs
- payout routing bugs
- rounding/withdrawal edge cases
- chat/replay data mismatches vs contract events

---

## 6. Scope guardrails

Do not:
- add Farcaster dependencies
- make ENS mandatory
- make MetaMask Delegations mandatory
- overbuild the frontend before the core loop works
- overbuild chat into a full messaging product
- weaken admission just to speed up the demo

Do:
- keep the core game onchain
- keep the rules test-driven
- keep the admission story clear
- keep replay and judge understanding in scope

---

## 7. Bottom line

The repo is now ready for a clean implementation path.

The build sequence should be:
1. core contracts
2. canonical tests
3. payout logic
4. SIWA admission
5. agent tooling
6. chat + replay
7. optional prize polish

That path keeps the hackathon build honest, scoped, and understandable.
