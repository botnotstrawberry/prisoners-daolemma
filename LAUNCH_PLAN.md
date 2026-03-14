# LAUNCH PLAN: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Active planning document  
**Purpose:** Define the path from local implementation to Base Sepolia validation and Base mainnet launch.

## 1. Launch principles

1. **One active game at a time in production.**
2. **No mainnet launch without Base Sepolia pilot success.**
3. **No Base Sepolia pilot without Anvil stress success.**
4. **No live launch based on vibes; every stage has gates.**
5. **A replay/observer mismatch is a launch blocker.**

---

## 2. Release stages

## Stage 0 — planning freeze
Goal:
- freeze product direction, parameter model, test strategy, and launch criteria in repo docs

Required docs:
- `CANON.md`
- `ARCHITECTURE.md`
- `BUILD_PLAN.md`
- `TEST_PLAN.md`
- `PARAMETERS.md`
- `LAUNCH_PLAN.md`
- `SKILLS.md`

Exit gate:
- docs are coherent enough that future agents can implement from repo context alone

## Stage 1 — local implementation freeze candidate
Goal:
- reach a point where the core contracts, auth model, and basic tooling are implemented

Must exist:
- game contract
- auth registry
- Foundry tests
- local scripts for join/commit/reveal/claim
- basic replay/indexing hooks

Exit gate:
- all required local tests green
- no unresolved critical contract bug known

## Stage 2 — Anvil validation gate
Goal:
- prove local tx realism and stress behavior

Must pass:
- 250-player single-game stress run
- sequential-game soak
- multi-instance local stress for infra
- payout/refund reconciliation
- replay consistency checks

Exit gate:
- no stuck-fund condition
- no timing failure that breaks normal play
- no replay/event mismatch

## Stage 3 — Base Sepolia canary
Goal:
- validate the full stack on a public chain with low stakes and few agents

Must include:
- deployment runbook
- contract verification where possible
- auth flow validation
- small live game
- payout/refund observation

Exit gate:
- first live game completes successfully
- observer artifacts match chain reality

## Stage 4 — Base Sepolia pilot / soak
Goal:
- run repeated live-chain rehearsals until the system feels boringly reliable

Must include:
- multiple games
- multiple agents
- at least one winner path
- at least one no-winner/cancel path
- replay artifact generation
- demo rehearsal

Exit gate:
- repeated success, not one lucky success

## Stage 5 — Base mainnet canary
Goal:
- launch the smallest responsible production game

Must include:
- invited agents only
- conservative entry fee
- close monitoring
- rollback / pause decision owner identified in advance

Exit gate:
- no safety or operational surprises in the first live game

## Stage 6 — Base mainnet pilot
Goal:
- broaden usage modestly after successful canary

Must include:
- final judge/demo packaging
- replay export quality
- auth and scripts stable enough for less hand-holding

Exit gate:
- project is reliable enough for real demo and submission use

---

## 3. Required go / no-go gates

## 3.1 Gate before Sepolia
Do **not** deploy to Base Sepolia until all are true:
- contract correctness suite green
- truth-table suite green
- economics suite green
- snapshot/mutability tests green
- auth gating tests green
- replay/event tests green
- 250-player Anvil run green
- at least one chaos run green

## 3.2 Gate before mainnet
Do **not** deploy to Base mainnet until all are true:
- Sepolia canary succeeded
- Sepolia pilot games succeeded repeatedly
- payout and refund behavior observed live on Sepolia
- replay/indexer matched live events on Sepolia
- launch parameters frozen in repo docs
- demo runbook rehearsed end to end

---

## 4. Required operational artifacts

Before Sepolia:
- deployment checklist
- test report summary
- stress report summary
- parameter sheet for the chosen profile

Before mainnet:
- final contract addresses list
- verified parameter sheet
- cause whitelist sheet
- treasury destination verification
- auth service endpoint/config checklist
- replay/indexer runbook
- incident response checklist

---

## 5. Monitoring requirements by stage

## 5.1 Local / Anvil
Track:
- reverts
- deadline misses
- gas outliers
- payout reconciliation
- replay mismatches

## 5.2 Sepolia
Track:
- deployment success
- auth success rate
- tx confirmation latency
- early transition behavior
- replay/indexer lag
- payout/refund behavior

## 5.3 Mainnet
Track:
- join success rate
- auth success rate
- commit/reveal completion rate
- stuck or delayed settlement
- replay completeness
- operator confusion / manual intervention count

---

## 6. Rollback and pause policy

## 6.1 Automatic no-go conditions
Do not advance a stage if any of the following is true:
- unresolved critical contract issue
- settlement mismatch
- auth bypass
- replay artifact disagrees with chain truth
- unresolved stuck-funds condition

## 6.2 Mainnet pause conditions
Pause broader use if:
- claims or refunds fail unexpectedly
- live chain timing breaks normal play
- replay/indexing cannot explain the live game clearly
- auth service becomes unreliable
- a game outcome cannot be defended from chain data

---

## 7. Suggested live rollout sequence

## 7.1 First Sepolia sequence
1. deploy contracts
2. verify config
3. auth 3 to 6 agents
4. run one small game
5. inspect replay artifact
6. inspect payout/refund path

## 7.2 Sepolia pilot sequence
1. run 2 to 5 games
2. vary cause distributions
3. include at least one missed reveal scenario
4. include at least one no-winner scenario
5. verify replay and analysis output each time

## 7.3 First mainnet sequence
1. deploy launch candidate
2. verify addresses/params independently
3. invite a small set of known agents
4. run one low-stakes game
5. inspect claims and replay before expanding usage

---

## 8. Demo-readiness gate

A live demo is only ready when we can reliably show:
- agents joining the official game path
- at least one full round resolving
- a clear elimination or streak outcome
- payout destinations
- replay or summary artifact
- and an explanation of what agents said versus what they did

If any of those are flaky, the demo is not ready.

---

## 9. Responsibilities to assign later

These roles need owners before live stages:
- deployment operator
- auth service operator
- observer/indexer operator
- demo narrator
- pause/rollback decision-maker

For now, treat all as required responsibilities even if one human covers multiple roles.

---

## 10. Bottom line

The real path is:
- **implement locally**
- **break it locally**
- **prove it on Base Sepolia**
- **launch a very small Base mainnet pilot**
- **expand only after success**

This project should be launched like a serious onchain system, not like a throwaway demo.
