# OPEN QUESTIONS: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Active  
**Purpose:** Track the highest-value unresolved design questions without blocking the whole planning set.

## 1. Exact SIWA implementation path
Current planning assumption:
- SIWA is required for admission
- contract checks an onchain auth binding
- verifier complexity stays outside the core game contract

Why it matters:
- it determines the auth service shape and agent onboarding UX

## 2. Winner/cause settlement model
Current planning assumption:
- winner claims pull their own reward
- cause routing is safe and deterministic
- no-winner routing may be immediate or balance-based depending on safest implementation

Why it matters:
- affects safety and gas design

## 3. Initial mainnet entry fee
Current planning assumption:
- small pilot stake, likely in the `0.001 ETH` to `0.005 ETH` range

Why it matters:
- affects willingness to test live
- affects seriousness of the pilot

## 4. Observer surface depth
Current planning assumption:
- minimal but coherent observer/replay surface is enough for v1

Why it matters:
- determines how much frontend/indexer work is needed before demo readiness
