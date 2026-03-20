# CANON: Prisoners DAOlemma v1

**Date:** 2026-03-14  
**Status:** Frozen for review  
**Purpose:** This file freezes the canonical product direction for the hackathon build. If another project document conflicts with this file, this file wins.

## 1. Product statement

Prisoners DAOlemma is a fully onchain elimination game for autonomous agents on Base.

Agents authenticate as agents, fund gameplay wallets with ETH, join a single canonical game, choose a cause, join that cause's public charity-aligned team for the duration of the game, commit and reveal moves across repeated rounds, survive or are eliminated under deterministic rules, and claim payouts if they win. Judges should be able to inspect the state transitions, outcomes, team-aligned messages, and payout destinations from a minimal observer surface.

## 2. Hard scope for hackathon v1

### In scope
- Base as the target chain
- Solidity + Foundry for the core game contract
- One canonical active game flow at a time
- ETH entry fees and ETH payouts
- Agent-only participation
- Join -> commit -> reveal -> resolve loop
- Deterministic elimination rules
- Cause selection at join time
- Public charity-team coordination tied to causes
- Creator fee + cause-linked payout behavior
- Winner claims
- Cancel / refund path if the game does not start
- Minimal observer / replay surface for judges
- Thin agent scripts or adapters for joining, committing, revealing, and reading state
- At least one prize-oriented differentiator beyond the bare game loop

### Out of scope unless explicitly re-added
- Human-first gameplay UX
- Multiple concurrent lobbies/games
- Rich offchain messaging as a requirement for the demo
- Complex governance
- Multi-asset staking
- Heavy frontend polish beyond what helps the demo

## 3. Design principles

1. **Keep the loop tight.** Joining, playing, resolving, and claiming should be easy to demonstrate.
2. **Make strategy visible.** The game should show meaningful agent behavior, not random button pressing.
3. **Prefer clarity over complexity.** If a feature is hard to explain, it is probably not v1 material.
4. **Keep it natively onchain.** Core state transitions, outcomes, and payouts should happen onchain.
5. **Support judging well.** The project should leave behind a clear record of what happened.

## 4. Frozen gameplay rules

### Choices
- `SHARE`
- `CATCH`
- `STEAL`

### Non-participation defaults
- A player who does not commit in time is treated as choosing `SHARE` for round resolution.
- A player who does not reveal in time is treated as choosing `SHARE`.

### Round-resolution truth table
1. **Catchers only**
   - All catchers are eliminated.
   - Game ends with no winners.

2. **Sharers only**
   - No one is eliminated.
   - Share streak increments.
   - If the share streak reaches 3, sharers win and the game ends.

3. **Stealers only**
   - All stealers are eliminated.
   - Game ends with no winners.

4. **Sharers + Catchers**
   - Catchers are eliminated.
   - If only one sharer remains alive, that player wins immediately.
   - Otherwise continue.

5. **Stealers + Catchers**
   - Stealers are eliminated.
   - If only one catcher remains alive, that player wins immediately.
   - Otherwise continue.

6. **Stealers + Sharers**
   - Sharers are eliminated.
   - Stealers win and the game ends.

7. **Sharers + Catchers + Stealers**
   - Stealers are eliminated.
   - Continue with sharers and catchers.

### Invariants
- Only an all-sharer round increments the share streak.
- Any round containing `CATCH` or `STEAL` resets the share streak to 0.
- If exactly one player remains alive at any point, that player wins immediately.

## 5. Frozen economics

### Asset
- Entry asset is ETH.

### Payout model
- Take creator fee first.
- If winners exist:
  - Split the post-creator pot evenly across winners.
  - On each winner claim, route a small cause cut to that winner's chosen cause.
  - Send the remaining net payout to the winner.
- If no winners exist:
  - After creator fee, route 90% of the remaining amount to causes.
  - Route 10% of the remaining amount to treasury.
  - Cause distribution is pro-rata by entrant count across selected causes.

### Cause model
- Each player chooses one whitelisted cause at join time.
- A player's chosen cause defines that player's public team/alignment for that game.
- A player's chosen cause matters for payout routing.
- The cause layer stays in scope because it strengthens both product identity and prize positioning.

## 6. Frozen participation model

The game is for **agents only**.

Minimum properties we must preserve:
- one agent identity per entry
- one authorized gameplay wallet per agent per game
- no duplicate participation by the same agent in the same game
- auth simple enough for live demo use

### Auth direction
- The hackathon build should use **SIWA or a comparable agent-auth path**.
- If the auth path requires an additional attestation, registry, session, delegation, or sign-in artifact, that can be layered into the join authorization path.
- The auth system should support a clear judge story: this is an onchain game for agents, not humans clicking buttons.

## 7. Frozen demo expectations

A successful demo should show:
- multiple agents joining a live game
- at least one full commit / reveal / resolve cycle
- a visible elimination or streak outcome
- a clear end-state with winners or no-winner outcome
- payout destinations, including cause behavior
- a minimal replay / event summary that lets judges understand what happened quickly

A rich social feed is not required for v1.

## 8. Prize-oriented direction

V1 should add features that improve hackathon competitiveness without bloating the scope.

Priority prize-aligned additions are expected to come from some combination of:
- stronger agent-auth / sign-in story
- better observer / replay / indexing story
- cleaner agent participation tooling
- clearer cause / impact story
- stronger evidence that autonomous agents, not humans, are actually participating

These additions should sit on top of the onchain core, not replace it.

## 9. Canonical source order inside this repo

Use documents in this order:
1. `CANON.md`
2. `SPEC.md`
3. `PROJECT.md`
4. `TASKS.md`
5. `DEMO.md`
6. `PRIZES.md`

## 10. Current doc drift to fix after review

After approval, the rest of the repo docs should be updated to align with this canon.

---

**Bottom line:** Prisoners DAOlemma v1 is a fully onchain, agent-only elimination game on Base with deterministic round resolution, ETH-backed incentives, cause-linked payout behavior, and a clear replayable judge story.
