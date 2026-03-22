# Prisoners DAOlemma Skill Plan

**Date:** 2026-03-22 UTC  
**Status:** active planning doc  
**Purpose:** define the single agent-facing skill required for live Prisoners DAOlemma participation after the contracts are deployed.

---

## 1. Correction / scope

This skill is **not** for protocol implementation, contract deployment, or Solidity work.

This skill is for agents operating **against an already-live Prisoners DAOlemma deployment**.

It should help an agent:
- understand the live game flow
- determine whether it is acting as a **host/operator** or **player/participant**
- recruit and coordinate other agents
- complete auth
- find / confirm the active game
- join the game
- prepare commits, commit, reveal, and claim
- optionally host/launch a new game on the live deployment by using the existing deployed contracts

It should **not** teach agents to:
- redeploy contracts
- modify Solidity
- rerun audits
- change protocol parameters without operator approval

---

## 2. Required deliverable

Add one new local project skill:

- `.agents/skills/prisoners-daolemma/SKILL.md`

This should be treated as a finishing deliverable for the project.

---

## 3. What the skill must cover

## Mode A — Host / launch a game on a live deployment
This mode is for an owner/operator agent using the already-deployed contract set.

It must cover:
- verifying chain + contract addresses
- confirming causes are whitelisted
- whitelisting/updating causes if authorized
- creating a game on the existing deployment
- monitoring join readiness
- advancing phases when ready
- exporting and publishing evidence after the game

## Mode B — Join and play a game
This mode is for normal participant agents.

It must cover:
- understanding the rules and incentives
- auth / admission
- confirming chain + game ID + cause choice + deadlines
- joining successfully
- preparing commit bundle safely
- committing
- revealing from the saved bundle
- claiming if eligible

## Mode C — Recruit and coordinate players
This mode is for agents helping fill a roster.

It must cover:
- how to explain the game simply
- what to tell invited agents to prepare
- how to collect confirmations
- how to track who is funded/auth-ready/joined
- how to remind agents about join / commit / reveal windows

---

## 4. Recommended structure

Use a single skill with a routing layer and reference files:

- `SKILL.md`
- `references/host-game.md`
- `references/play-game.md`
- `references/recruit-and-coordinate.md`

The top-level skill should tell the agent which reference to read based on the task.

---

## 5. Inputs this skill depends on

Before this skill can be fully finalized, we should pin:
- live mainnet addresses
- final first-game parameter sheet
- roster target / cause list
- preferred gameplay cadence / reminder cadence
- where the active game ID and current live deployment metadata will live

So the skill can be built now, but Phase A will let us tighten it from placeholders into live instructions.

---

## 6. Definition of done

This deliverable is done when:
- an outside agent can read the skill and understand how to participate
- a host/operator agent can use it to launch a game on the live deployment without redeploying contracts
- a player agent can use it to auth, join, commit, reveal, and claim
- a coordinator can use it to help recruit/fill a roster for a live game

---

## 7. Next step after this plan

After this plan is accepted:
1. finalize Phase A parameters and live operator inputs
2. tighten the skill references with those live values
3. add any missing player/host quickstart docs the skill should reference
