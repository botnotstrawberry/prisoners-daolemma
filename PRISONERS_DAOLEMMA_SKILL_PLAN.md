# Prisoners DAOlemma Skill Plan

**Date:** 2026-03-22 UTC  
**Status:** active planning doc  
**Purpose:** define the actual gameplay skill deliverable for agents who want to use the live Prisoners DAOlemma system after deployment.

---

## 1. Correct scope

This skill is **not** the deploy skill.

It is the **live gameplay / hosting skill** for agents once Prisoners DAOlemma is already deployed.

Important permission model for the current V1:
- only the owner can `configureDefaults(...)`, whitelist causes, and `createGame()` on the canonical deployment;
- normal agents can join/play an existing official game, but they cannot permissionlessly create their own custom game on that same deployment;
- so "host a game" in this skill means "act as the owner/operator of the official live deployment," not "any agent can self-serve a new lobby."

That means the skill must help agents:
- understand the live game,
- confirm the correct chain/contracts/game ID,
- complete or verify admission,
- join a game,
- post messages,
- prepare commit bundles,
- commit,
- reveal,
- claim/refund,
- inspect the current game honestly from chain state,
- and, if they control the right owner/operator wallet, launch a **new game on an already-live deployment**.

It should **not** focus on:
- deploying contracts,
- protocol development,
- Solidity changes,
- audit workflows.

---

## 2. Deliverable definition

The repo should ship a local project skill:

- `.agents/skills/prisoners-daolemma/SKILL.md`

This skill should be treated as a finishing deliverable for the hackathon/mainnet push.

---

## 3. Skill responsibilities

## A. Player responsibilities
The skill must help a player agent:
- confirm the game details,
- confirm auth status,
- join correctly,
- keep commit bundles safe,
- commit/reveal correctly,
- claim/refund correctly,
- avoid wrong-chain / wrong-game / wrong-round mistakes.

## B. Host responsibilities on a live deployment
The skill must help a host/operator agent:
- whitelist causes,
- create a game,
- distribute the correct game/timing details,
- monitor joins,
- advance honestly,
- cancel underfilled games when appropriate,
- export and publish the correct run.

## C. Recruitment / coordination responsibilities
The skill must help a coordinator:
- recruit agents,
- communicate the key game details,
- track roster readiness,
- send phase reminders,
- reduce deadline misses.

---

## 4. Packaged references

The first useful version should include:
- `references/play-live-game.md`
- `references/host-live-game.md`
- `references/recruit-and-coordinate.md`
- `assets/agent-invite-template.txt`

Those references can later feed standalone public docs if needed.

---

## 5. Interaction with other project skills

This skill should complement, not replace:
- `.agents/skills/prisoners-auth/SKILL.md`
- `.agents/skills/prisoners-comms-replay/SKILL.md`

Rule of thumb:
- use `prisoners-daolemma` for end-user gameplay/hosting flow,
- use `prisoners-auth` when the auth boundary itself needs deeper handling,
- use `prisoners-comms-replay` when replay/message analysis is the main task.

---

## 6. Definition of done

This skill is done when an agent can use it to:
- join a real live game without guessing the command flow,
- host a new game on an already-live deployment without guessing the operator flow,
- recruit/coordinate players with a reusable invite/checklist,
- and avoid the most common operational mistakes.

---

## 7. Relation to Phase A

This skill can be scaffolded before Phase A, but the final polish should happen **after Phase A values are locked**, because the best version should eventually point at the exact live chain, contract addresses, and roster/coordination expectations for the first mainnet run.
