# Prisoners DAOllema Scaling Strategy

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daollema`

## Purpose

Capture the agreed near-term and future scaling direction so the project can:

1. get the current architecture frozen and audit-ready quickly, and
2. preserve the more ambitious large-N research path for a later branch.

This document deliberately avoids overloaded "option 1 / option 2" numbering and instead names the two tracks directly.

---

# Track A — v1 / audit / hackathon path

## Decision

For the current hackathon timeline, keep the **existing architecture** and get it locked in as soon as possible.

That means:
- keep the current one-active-game model
- keep the current round-resolution architecture
- avoid a large redesign before the audit freeze
- make only targeted changes that improve configurability or safe operational headroom

## Deferred optional improvement: configurable no-winner cause routing

### v1 decision
For the current v1 / audit / hackathon path, keep the existing fixed no-winner routing behavior:
- `NO_WINNER_CAUSE_BPS = 9_000`

Reason:
- the current value is acceptable for v1
- this change is **not essential** to finish and test the current architecture
- adding another economic/config surface now would widen the freeze/audit scope

### Optional future nice-to-have
A later iteration may add `noWinnerCauseBps` to `GameConfig`, then:
- validate it as a basis-points value
- snapshot it per game
- use it instead of the current fixed `NO_WINNER_CAUSE_BPS = 9_000`

### Suggested future validation rule
- `0 <= noWinnerCauseBps <= 10_000`

Why this rule:
- this value represents a share of the post-fee no-winner pot
- unlike creator/cause winner-path fee bps, it should plausibly support the full `0%..100%` range

### Future audit implication
If/when this lands, auditors do **not** need one final mainnet value chosen ahead of time.
They do need:
- the parameter to exist
- the allowed range to be clear
- the no-winner settlement formula to be audited using that parameter

---

## Player scaling decision for v1

### Product decision
Do **not** attempt a large architecture redesign before the audit freeze.

Also, for v1:
- keep the current player-list / whole-roster resolution architecture
- keep the current hard upper bound at **`256`**
- do **not** raise the cap for this version

### Important behavior note
The current join model already behaves like:
- first `maxPlayers` who successfully join are in
- later joins revert individually with `MaxPlayersReached`

That means:
- the system does **not** kick existing players if too many try to join
- the behavior is already compatible with a bounded first-come roster under the current architecture

### v1 practical rule
For the current architecture:
- keep a per-game `maxPlayers`
- keep the hard upper bound at `256`
- do **not** represent the system as unbounded or 10,000-player-ready under the current whole-roster design

---

## Why the current architecture has a scaling wall

The current contract performs full-roster iteration during round transitions and resolution.

Key loop families include:
- materializing effective choices for all alive players
- eliminating all matching players for a losing choice
- resetting round state across the alive roster

This means the current round engine has O(n) work tied to roster size, with storage reads/writes across the player set.

Practical implication:
- raising the configured cap is possible
- removing the cap entirely is **not** an honest large-scale solution
- the real limit is gas/liveness, not just one constant

---

## v1 acceptance goal

The near-term goal is to prove something like the following:
- the current architecture is stable and auditable
- the existing `256` cap remains the locked v1 boundary
- extra joiners beyond the cap fail individually rather than destabilizing the game

## Recommended validation sequence before freezing v1

1. **Reconfirm bounded local readiness at the current cap**
   - keep the preserved 250-player proof as the main scale evidence
   - rerun any launch-candidate checks needed on the frozen commit

2. **Adversarial “overfill” validation at the current cap**
   - attempt more joins than `maxPlayers`
   - confirm the first successful joiners remain in place
   - confirm later join attempts revert cleanly and do not corrupt state

3. **Gas / liveness review of round transitions**
   - measure the expensive transition points specifically
   - identify safety margin rather than only “it passed once"

4. **Optional fresh Sepolia smoke on the unchanged bounded model**
   - only if practical within time and compute limits

---

# Track B — future large-N research branch

## Goal

Preserve a credible path toward much larger games without pretending the current eager whole-roster architecture can scale there.

This is the branch to explore **after** the current codebase is frozen, audited, and reasonably stable.

## The design problem to solve

The current architecture ties round resolution to whole-roster iteration. That makes very large synchronous games hard because:
- per-round gas cost grows with player count
- several transitions require storage writes across many players
- a single “resolve round” or “reset round” transaction becomes the bottleneck

## Design direction

The future large-N branch should aim for:
- **no full-roster reset on each round**
- **no full-roster scan to determine round tallies**
- **no full-roster scan to mark eliminations synchronously**

Instead, the branch should explore an **aggregate-state + lazy-evaluation** model.

---

## Future branch design sketch

### 1) Round-tagged player state instead of reset loops
Instead of resetting booleans across all players each round, store round-specific markers such as:
- `lastCommittedRound`
- `lastRevealedRound`
- `lastResolvedRound` or equivalent

Interpretation then becomes:
- if `lastCommittedRound != currentRound`, player did not commit this round
- if `lastRevealedRound != currentRound`, player did not reveal this round

This removes the need for a global reset loop.

### 2) Aggregate tallies updated incrementally
As players commit/reveal, maintain round-level counts such as:
- reveal/share count
- reveal/catch count
- reveal/steal count
- commit count
- reveal count
- maybe default-share counters derived from alive/commit/reveal totals

Then round resolution can use aggregate counts instead of recomputing them from the full roster.

### 3) Resolve a round by publishing the round result, not by touching everyone
Instead of iterating over every player to mark elimination, store a compact round result such as:
- round outcome type
- eliminated choice (if any)
- whether the game ended or advances

Then each player’s effective elimination status can be evaluated lazily from:
- their latest choice for that round
- whether they defaulted
- the stored round result

### 4) Lazy elimination / lazy activity checks
A player does not necessarily need to be eagerly marked dead inside one giant resolution transaction.
Instead:
- when a player next acts, validate whether prior round results already eliminated them
- when they claim, validate eligibility against stored round outcomes
- optionally provide a helper to materialize/mark status for convenience, but not as a mandatory global loop

### 5) Settlement from aggregate end-state data
Final settlement should ideally depend on data already maintained incrementally:
- joined count
- alive count / winner count
- per-cause entrant counts
- treasury/cause accounting counters

This minimizes finalization work even at large N.

---

## Why this branch is promising

This path attacks the real bottleneck directly.

It preserves:
- onchain game identity
- commit/reveal structure
- deterministic rules

While improving:
- gas scalability
- liveness at larger player counts
- honesty of the project’s “push the boundary” story

---

## Risks / tradeoffs in the future branch

This redesign is not free.

### Complexity risk
A lazy/aggregate model is harder to reason about than the current straightforward roster loop.

### Audit surface risk
The branch will introduce new correctness questions around:
- defaulted choices
- lazy elimination consistency
- round result interpretation
- claim-time eligibility validation
- replay/query tooling consistency

### Tooling / indexing changes
Existing query/export/replay tooling will likely need updates because the source of truth for player state will be less eagerly materialized.

### Potential UX changes
Some read paths may become more expensive or more derived because “is this player alive?” may require interpretation of round history rather than one eagerly updated boolean.

---

## Suggested success criteria for the future branch

The future large-N branch should not be considered successful just because the hard cap disappears.

It should be able to demonstrate at least these properties:
- no mandatory full-roster reset loop per round
- no mandatory full-roster elimination loop per round
- round resolution cost grows much more slowly than roster size
- replay/export tooling can still explain outcomes clearly
- claim/refund/withdrawal invariants remain easy to audit

---

## Explicit non-goal for the current hackathon freeze

Do **not** try to land the future large-N branch before the audit freeze unless the schedule changes materially.

That would mix:
- feature freeze
- security review
- protocol redesign

and likely harm all three.

---

## Summary

### What we do now
- freeze the current architecture
- keep the current no-winner routing fixed for v1
- keep the current `256` player cap for v1
- audit the bounded v1 system honestly

### What we preserve for later
- a separate research branch aimed at aggregate-state / lazy-resolution scaling
- the possibility of much larger games without pretending the current eager-loop model already supports them
