# Judge Evidence Guide

This is the repo-native map for the current judge-facing evidence story.

It is intentionally conservative:
- it separates verified deployment proof from public gameplay proof
- it separates public-chain proof from local scale proof
- it does not claim a completed mainnet live game yet
- it does not revive stale SIWA / verifier / hybrid-path language

## Current honest status

Right now the repo has four judge-relevant evidence layers:

1. **Verified Base mainnet deployment**
   - `packages/foundry/deployments/8453.json`
   - addresses:
     - `PrisonersDAOlemma`: `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
     - `GameChat`: `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`
     - `ERC8004AuthAdapter`: `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
     - `ERC-8004 Identity Registry`: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
2. **Strongest public gameplay proof**
   - successful 32-player permissionless Base Sepolia run at `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`
   - 32 joined players, 26 public messages, 5 rounds, 12 winners, all 12 claims completed
3. **Preserved local scale proof**
   - full 250-player local proof bundle
   - broader xlarge / matrix proof packs for more scale and adversarial coverage
4. **Code / audit / readiness boundary**
   - contracts, tests, audit packet, and readiness docs remain available for deeper technical review

## What judges should open first

If a judge only has a few minutes, use this order:

1. `JUDGES_START_HERE.md`
2. `submission/HUMAN_JUDGE_ONEPAGER.md`
3. `POST_CANARY_SUMMARY.md`
4. `packages/foundry/deployments/8453.json`
5. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
6. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
7. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`
8. `packages/nextjs/public/games/index.json`
9. `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`
10. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/JUDGE_README.md`

## What each layer proves

### Verified Base mainnet deployment

Proves the live protocol is actually deployed on the target chain and not merely described in prose.

### Base Sepolia 32-player public run

Proves the current live gameplay loop works publicly: admission, chat, repeated rounds, elimination, winner settlement, and exportable evidence.

### Local proof bundles

Prove stronger scale / stress coverage than the public-chain run, while staying honestly labeled as local evidence rather than public-chain evidence.

## Honest boundaries

- the strongest public gameplay proof today is Sepolia, not mainnet
- no completed mainnet live game is claimed yet
- the live auth path is ERC-8004 based, not SIWA / verifier / hybrid
- cause admin / whitelisting on mainnet remains an owner-side operational step

## Bottom line

The honest judge path today is:
- confirm the verified Base mainnet deployment
- inspect the 32-player Sepolia public run
- use local proof bundles only as additional scale evidence
- score the project on what is already real, not on promises about later mainnet gameplay
