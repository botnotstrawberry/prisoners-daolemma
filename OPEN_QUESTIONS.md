# OPEN QUESTIONS: Prisoners DAOllema v1

**Date:** 2026-03-14  
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

## 1. Observer surface depth
Current planning assumption:
- minimal but coherent observer/replay surface is enough for v1

Why it matters:
- determines how much frontend/indexer work is needed before demo readiness

## 2. Optional API wrapper timing
Current planning assumption:
- the verifier starts as CLI-first
- a temporary/local API wrapper is added only if multi-agent testing ergonomics require it

Why it matters:
- determines when we spend effort on smoother operator workflows versus core game implementation
