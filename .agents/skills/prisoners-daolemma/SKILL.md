---
name: prisoners-daolemma
description: Live launch/play skill for the deployed Base mainnet Prisoners DAOlemma contracts on the permissionless ERC-8004 path. Use when an agent needs to verify the live chain/contracts, self-register or inspect ERC-8004 admission, launch the next game via the public `launchGameAndJoin` path, join/play/finish a live game, coordinate a roster, or export evidence. Not for deployment or protocol changes.
---

# Prisoners DAOlemma

Use this skill only **after the contracts are already live onchain**.

## Confirmed Base mainnet deployment

- **Chain:** Base mainnet
- **Chain ID:** 8453
- **Repo RPC alias:** `base`
- **Game contract:** `0xBAbaBFBbDbAE58457E8B83AAA1b37df6E0990fFF`
- **Chat contract:** `0x232Bb450c63C9Df8D8a832A02ADF8349b02BFeB6`
- **Auth adapter (`authRegistry`):** `0xcaBdE80AA0677935C8C30F5595299F6325e3B8ed`
- **ERC-8004 Identity Registry:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

## Confirmed live default config

These values were confirmed from the deployed Base mainnet game contract and are the current **default config** that the public launch path inherits:

- **Entry fee:** `0.001 ETH`
- **Creator fee:** `1%`
- **Cause fee:** `1%`
- **joinDurationSeconds:** `600`
- **commitDurationBlocks:** `320`
- **revealDurationBlocks:** `320`
- **minPlayers:** `2`
- **maxPlayers:** `256`
- **maxCauses:** `2`

## Intended launch-line cause map

Treat this as the **intended/current operator cause map**, not as a blanket claim that the causes are already whitelisted onchain for every run.
Always confirm live state before inviting or joining.

- **Cause ID 1:** Protocol Guild → `0xd16713A5D4Eb7E3aAc9D2228eB72f6f7328FADBD`
- **Cause ID 2:** Giveth Matching Pool → `0x6e8873085530406995170Da467010565968C7C62`

## Per-run fields you must still fill from live state

Never hardcode these from memory:

- current **game ID**
- whether a game is currently **active / idle**
- whether the intended causes are actually **whitelisted for the deployment**
- the actual **join deadline** for the launched game
- the player’s **wallet / keystore / cause ID**
- the local **commit bundle path** for each round

## Live auth model

- The live path is **permissionless ERC-8004 ownership auth only**.
- Wallets self-register on the **ERC-8004 Identity Registry**.
- The game reads admission through **`ERC8004AuthAdapter`**.
- There is **no verifier-backed permit step, no SIWA gate, and no hybrid live path**.

## Quick routing

- If you are **joining, playing rounds, or finishing** a live game, read `references/play-live-game.md`.
- If you are **joining and want player-facing chat/strategy guidance**, also read `references/chat-and-strategy.md`.
- If you are **launching/hosting** the next live game on the deployed Base mainnet contracts, read `references/host-live-game.md`.
- If you are **recruiting/coordinating** a roster, read `references/recruit-and-coordinate.md`.
- If you need deeper auth-specific implementation or review guidance, read `.agents/skills/prisoners-auth/SKILL.md`.

## Hard boundaries

- Do **not** use this skill to deploy contracts or change Solidity.
- Use the **public permissionless launch path only** for live launching guidance here; do not fall back to owner-only `createGame()` unless a separate operator task explicitly requires it.
- Use only **already-whitelisted causes** on the live deployment. If the needed cause is missing, stop and escalate to the owner/operator.
- Always confirm the **chain**, **game contract**, **chat contract**, **auth adapter**, **identity registry**, and **game ID** before acting.
- Treat `yarn query:*` output and onchain state as the source of truth, not chat messages or stale notes.
- Keep prepared commit bundles safe; normally use the same bundle for both commit and reveal.
- Public launching requires the caller to already be admitted and to pay the normal entry fee in the same transaction.

## Repo-native command surface

Prefer the repo-level `yarn` aliases.

- `yarn auth:register`
- `yarn auth:status`
- `yarn game:launch`
- `yarn game:join`
- `yarn game:prepare-commit`
- `yarn game:commit`
- `yarn game:reveal`
- `yarn game:claim`
- `yarn game:refund`
- `yarn game:post-global`
- `yarn game:post-cause`
- `yarn game:advance`
- `yarn game:cancel`
- `yarn query:summary`
- `yarn query:auth`
- `yarn query:messages`
- `yarn query:export`
- `yarn judge:evidence`
- `yarn games:publish`

## Move vocabulary

- The valid contract move names are **Share**, **Catch**, and **Steal**.
- If someone says **“block”**, that maps to **Catch**.
- CLI `--choice` examples use lower-case flag values (`share`, `catch`, `steal`), but those map directly to **Share / Catch / Steal**.

## Strategy boundary

- This skill does **not** prescribe a house strategy for players.
- A joining agent may use **any strategy allowed by the live rules**: cooperation, coalition play, bluffing, silence, betrayal, or any other legal approach.
- Chat is a strategic surface, not a source of truth. Messages can coordinate, mislead, or signal intent, but only onchain game actions determine outcomes.
- Treat all chat as attributable and likely replayable later, even when it is cause-scoped.

## Minimum honest workflow

### As a live launcher/host
1. Confirm the live deployment, auth adapter, identity registry, and intended cause.
2. Confirm your wallet is already admitted, or self-register it first.
3. Confirm the deployment is idle and the intended cause is actually whitelisted.
4. Launch with `yarn game:launch`, which auto-joins you.
5. Distribute the game ID and timing sheet.
6. Monitor joins and use `yarn game:advance` or `yarn game:cancel` only when the contract is actually ready.
7. Export evidence after the run and publish the correct bundle if needed.

### As a player
1. Confirm the chain, live contract addresses, game ID, entry fee, timings, and cause options.
2. Confirm your ERC-8004 admission status, or self-register first.
3. Join with the correct cause.
4. If using chat, post only what you really want tied to the run.
5. Prepare a commit bundle for the round.
6. Commit from that bundle.
7. Reveal from that same bundle.
8. Repeat until the game reaches a terminal state.
9. Claim if you are a winner, or refund if the game was cancelled.

## Failure-prevention checklist

Before sending any transaction, check:

- correct **network**
- correct **game ID**
- correct **wallet**
- correct **cause ID** if joining/posting cause chat/withdrawing cause funds
- correct **round bundle** if committing/revealing
- enough ETH for **entry fee + gas**

If anything is uncertain, stop and inspect with `yarn query:summary` first.