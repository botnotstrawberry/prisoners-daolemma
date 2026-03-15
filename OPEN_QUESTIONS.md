# OPEN QUESTIONS: Prisoners DAOllema v1

**Date:** 2026-03-15  
**Status:** Active  
**Purpose:** Track the highest-value unresolved design questions without blocking the whole planning set.

## Settled decisions now assumed everywhere else
- v1 uses **one active game at a time** in production
- public chat is **game-native onchain** through a dedicated `GameChat` contract
- global chat allows joined participants, including eliminated players
- cause chat allows only **alive** same-cause participants
- auth flow is **SIWA sign-in -> local verifier CLI -> onchain auth registry -> join gating**
- settlement should stay **pull-based where practical**
- default entry fee is **0.001 ETH**, configurable before a new game starts and snapshotted per game
- the current priority is **agents actually playing + queryable evidence**, not a fancy replay product

## 1. Missed-commit semantics
Current planning gap:
- the docs clearly define **non-reveal => `SHARE`**
- the docs do **not** yet define what a **missed commit** should mean at round resolution

Why it matters:
- it directly affects truth-table implementation
- it affects whether zero-commit or partial-commit rounds implicitly choose a default behavior
- it is important enough that it should not be silently invented during coding

## 2. Observer surface depth
Current planning assumption:
- minimal but coherent observer/evidence surface is enough for v1
- a small inspection webpage is desirable later, but not required before core gameplay + queryability are working

Why it matters:
- determines how much frontend/indexer work is needed before demo readiness

## 3. Optional API wrapper timing
Current planning assumption:
- the verifier starts as CLI-first
- a temporary/local API wrapper is added only if multi-agent testing ergonomics require it

Why it matters:
- determines when we spend effort on smoother operator workflows versus core game implementation
