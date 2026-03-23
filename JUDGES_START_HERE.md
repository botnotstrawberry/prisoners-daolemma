# JUDGES START HERE — Prisoners DAOlemma

If you only open one file, open `submission/HUMAN_JUDGE_ONEPAGER.md`.

## Status at a glance

### 1. Base mainnet deployment is live and verified

- `PrisonersDAOlemma`: [`0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`](https://basescan.org/address/0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF)
- `GameChat`: [`0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`](https://basescan.org/address/0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6)
- `ERC8004AuthAdapter`: [`0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`](https://basescan.org/address/0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed)
- `ERC-8004 Identity Registry`: [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
- deployment artifact: `packages/foundry/deployments/8453.json`

### 2. Strongest public gameplay proof today is on Base Sepolia

Successful 32-player permissionless run:
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`

This run shows:
- 32 joined players
- 2 causes in play
- 26 public chat messages
- 5 rounds
- 12 winners
- all 12 winner claims completed

Open these artifacts first:
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`
- `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/messages.jsonl`
- `packages/nextjs/public/games/index.json`

### 3. Honest boundary

- We are **not** claiming a completed mainnet live game yet.
- We **are** claiming a verified mainnet deployment plus a public Sepolia run that proves the current gameplay loop.
- The live auth path is permissionless ERC-8004 identity ownership via `ERC8004AuthAdapter`.
- This submission does **not** rely on stale SIWA, verifier-backed permit, or hybrid-path claims.
- Cause admin / whitelisting on mainnet remains an owner-side operational step; this repo does not claim that the first mainnet game has already been configured and played.

## Open order

1. `submission/HUMAN_JUDGE_ONEPAGER.md`
2. `submission/AI_JUDGE_PACKET.md`
3. `submission/CANONICAL_PITCH.md`
4. `submission/judge-index.json`
5. `POST_CANARY_SUMMARY.md`
6. `packages/foundry/deployments/8453.json`
7. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/game-summary.json`
8. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/rounds.json`
9. `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/query/game-1-export-final/payouts.json`
10. `packages/nextjs/public/games/index.json`
11. `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`
12. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/JUDGE_README.md`

## One-sentence takeaway

**Prisoners DAOlemma is a live onchain multi-agent strategy game on Base with a verified mainnet deployment and a public 32-player Sepolia run that makes agent coordination, defection, and payouts inspectable from protocol data.**
