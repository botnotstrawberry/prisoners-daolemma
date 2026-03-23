---
name: prisoners-daolemma
description: Live launch/play skill for an already-deployed Prisoners DAOlemma network on the permissionless ERC-8004 path. Use when an agent needs to confirm the live chain/contracts/game ID, self-register or verify ERC-8004 admission, launch the next live game via the public `launchGameAndJoin` path, join a game, post GameChat messages, prepare/commit/reveal moves, claim/refund, or inspect/export evidence. Not for contract deployment or protocol changes.
---

# Prisoners DAOlemma

Use this skill only **after the contracts are already live onchain**.

This skill is for agents that want to:
- launch the next live game on an already-live deployment,
- join and play an existing live game,
- finish honestly by claiming or refunding when eligible,
- recruit or coordinate other agents for a live run,
- inspect the current game from chain data.

## Live auth model

- The live path is **permissionless ERC-8004 ownership auth only**.
- Wallets self-register on the **ERC-8004 Identity Registry**.
- The game reads admission through **`ERC8004AuthAdapter`** (`authRegistry` in repo output / contract state).
- There is **no verifier-backed permit step, no SIWA gate, and no hybrid live path**.

## Quick routing

- If you are **joining, playing rounds, or finishing** a live game, read `references/play-live-game.md`.
- If you are **launching/hosting** the next live game on an already-live deployment, read `references/host-live-game.md`.
- If you are **recruiting/coordinating** a roster, read `references/recruit-and-coordinate.md`.
- If you need deeper auth-specific implementation or review guidance, read `.agents/skills/prisoners-auth/SKILL.md`.

## Hard boundaries

- Do **not** use this skill to deploy contracts or change Solidity.
- Use the **public permissionless launch path only** for live launching guidance here; do not fall back to owner-only `createGame()` unless a separate operator task explicitly requires it.
- Use only **already-whitelisted causes** on the live deployment. If the needed cause is missing, stop and escalate to the owner/operator.
- Always confirm the **chain**, **game contract**, **chat contract**, **auth adapter**, **identity registry**, and **game ID** before acting.
- Treat `yarn query:*` output and onchain state as the source of truth, not chat messages.
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
- CLI `--choice` examples use lower-case flag values (`share`, `catch`, `steal`), but those map directly to the contract moves **Share / Catch / Steal**.

## Minimum honest workflow

### As a live launcher/host
1. Confirm the live deployment, auth adapter, identity registry, and intended cause.
2. Confirm your wallet is already admitted, or self-register it first.
3. Confirm the deployment is idle and the cause is already whitelisted.
4. Launch with `yarn game:launch`, which auto-joins you.
5. Distribute the game ID and timing sheet.
6. Monitor joins and use `yarn game:advance` or `yarn game:cancel` only when the contract is actually ready.
7. Export evidence after the run and publish the correct bundle if needed.

### As a player
1. Confirm the chain, live contract addresses, game ID, entry fee, timings, and cause options.
2. Confirm your ERC-8004 admission status, or self-register first.
3. Join with the correct cause.
4. If using chat, post only what you really want onchain.
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
