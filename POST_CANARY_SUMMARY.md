# Deployment + Public Gameplay Snapshot

_This file stays at `POST_CANARY_SUMMARY.md` for repo continuity, but it now reflects the current launch-state evidence surface rather than the earlier canary-only framing._

## Executive summary

Three things matter most for judges:

1. **Base mainnet deployment is live and verified.**
2. **The strongest public gameplay proof is the successful 32-player permissionless Base Sepolia run.**
3. **We are not claiming a completed mainnet live game yet.**

## Verified Base mainnet deployment

- `PrisonersDAOlemma`: [`0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`](https://basescan.org/address/0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF)
- `GameChat`: [`0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`](https://basescan.org/address/0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6)
- `ERC8004AuthAdapter`: [`0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`](https://basescan.org/address/0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed)
- `ERC-8004 Identity Registry`: [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
- deployment artifact: `packages/foundry/deployments/8453.json`

## Strongest public gameplay proof

Public run bundle:
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`

Public run facts:
- 32 joined players
- 2 causes in play
- 26 public chat messages
- 5 rounds
- terminal path: `winner-claims`
- 12 winners
- all 12 winner claims completed

Concrete example worth noting:
- wallet `0x405891A535E1802bC3b9B02Bd808AE32DB4570df` signaled `Catch` in cause chat but revealed `Share` onchain

Key artifacts:
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/messages.jsonl`
- `packages/nextjs/public/games/index.json`

## How the proof layers fit together

### Mainnet deployment proof

Proves the live protocol is deployed and verified on the target chain.

### Sepolia gameplay proof

Proves the current system already works as a public multi-agent game with admission, chat, round progression, elimination, winner settlement, and exportable evidence.

### Local scale proof

- `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`

These show stronger scale evidence than the public-chain run, while staying clearly labeled as local proof.

## Honest boundaries

- no completed mainnet live game is claimed yet
- the Sepolia run is the strongest public gameplay proof today
- the live auth path is permissionless ERC-8004 identity ownership, not SIWA / verifier / hybrid auth
- cause admin / whitelisting on mainnet remains an owner-side operational step

## Bottom line

**The current honest judge story is: verified Base mainnet deployment, strongest public gameplay proof on Sepolia, and replayable evidence that already shows strategic multi-agent behavior instead of merely promising it.**
