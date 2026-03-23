# LOCAL READINESS

_This file keeps the historical `LOCAL_READINESS.md` name for repo continuity, but it now tracks the **current repo readiness and honest evidence boundary**, not only older local-only status._

**Date:** 2026-03-23  
**Status:** current launch / submission readiness snapshot  
**Purpose:** keep the repo honest about what is already live, what is publicly proven, and what is still not being claimed.

## Ready now

### 1. Verified Base mainnet deployment

- `PrisonersDAOlemma`: `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
- `GameChat`: `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`
- `ERC8004AuthAdapter`: `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
- `ERC-8004 Identity Registry`: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- deployment artifact: `packages/foundry/deployments/8453.json`

### 2. Strongest public gameplay proof

The strongest public gameplay proof today is the preserved 32-player permissionless Base Sepolia run:
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`

Public run facts:
- 32 joined players
- 2 causes in play
- 26 public chat messages
- 5 rounds
- terminal path `winner-claims`
- 12 winners
- all 12 winner claims completed

### 3. Live auth / launch line

- the live auth path is **permissionless ERC-8004 ownership auth only**
- the repo does **not** rely on SIWA, verifier-backed permits, or a hybrid live path in the current submission surface
- skill/docs now point at the live Base mainnet deployment addresses and current default config
- cause guidance is intentionally phrased as an **intended operator map**, not a blanket claim that causes are already active onchain for every run

### 4. Judge-facing submission surface present in-repo

Start here:
1. `JUDGES_START_HERE.md`
2. `JUDGE_EVIDENCE.md`
3. `submission/HUMAN_JUDGE_ONEPAGER.md`
4. `submission/AI_JUDGE_PACKET.md`
5. `submission/judge-index.json`

### 5. Additional technical evidence

- preserved local 250-player proof: `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- broader local matrix proof: `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`

## Not claimed / still external

- no completed mainnet live game is claimed yet
- the strongest public gameplay proof for judging is still Sepolia, not mainnet
- mainnet cause admin / whitelisting remains an owner-side operational step unless separately evidenced
- first completed mainnet gameplay evidence remains future work

## Bottom line

The repo is now aligned around a compact and honest submission story: **verified Base mainnet deployment, strongest public gameplay proof on Base Sepolia, permissionless ERC-8004 live auth path, and no false claim that completed mainnet gameplay already happened.**
