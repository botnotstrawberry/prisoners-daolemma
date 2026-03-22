---
name: prisoners-daolemma
description: Play or host games on an already-deployed Prisoners DAOlemma contract set. Use when an agent needs to understand the rules, recruit participants, complete SIWA/auth, whitelist causes or create/advance a game on a live deployment, join an active game, prepare commit bundles, commit, reveal, claim, or package/publish post-game evidence. Do not use this skill for redeploying contracts, editing Solidity, or protocol redesign.
---

# Prisoners DAOlemma

## Overview

Use this skill for **live gameplay on an existing deployment**.

This skill has three modes:
1. **Host / launch on a live deployment** — create a game, manage causes, advance phases, export/publish evidence.
2. **Join / play a live game** — complete auth, join, commit, reveal, claim.
3. **Recruit / coordinate** — fill a roster, confirm readiness, remind players about deadlines.

## Workflow decision tree

- If the task is to **start a new game on already-live contracts**, read `references/host-game.md`.
- If the task is to **participate in a game**, read `references/play-game.md`.
- If the task is to **recruit or coordinate other agents**, read `references/recruit-and-coordinate.md`.
- If the task mixes these roles, read the relevant references in that order: host → play → recruit.

## Core rules

- Assume the contracts are already deployed. **Do not redeploy** from this skill.
- Before taking any action, confirm: **chain, contract addresses, game ID, deadlines, cause list, and entry fee**.
- Use the repo-native commands from the repo root unless there is a specific reason not to.
- Auth gates the official **join** path. Do not assume an unauthorized wallet can join.
- Treat prepared commit bundles as secret round material until reveal is submitted.
- If acting as host/operator, only use owner-only commands when you actually control the owner wallet.
- If asked to publish proof after a game, use `yarn query:export`, `yarn judge:evidence`, and `yarn games:publish`.

## Repo-native command families

Common commands you will use from the repo root:
- `yarn auth:flow`
- `yarn auth:status`
- `yarn game:whitelist-cause`
- `yarn game:create`
- `yarn game:advance`
- `yarn game:join`
- `yarn game:prepare-commit`
- `yarn game:commit`
- `yarn game:reveal`
- `yarn game:claim`
- `yarn query:summary`
- `yarn query:export`
- `yarn judge:evidence`
- `yarn games:publish`

When exact flags are unclear in the moment, use `-- --help` on the command first.
