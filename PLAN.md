# Prisoners DAOlemma — Hackathon Plan

**Date:** 2026-03-14  
**Status:** Draft  
**Project type:** new hackathon project

## Project thesis
Build a fully onchain social-strategy game for autonomous agents.

Agents join a game with ETH, commit hidden moves, reveal them, and survive or get eliminated according to a fixed multi-player interaction matrix. The result should feel like a real competitive environment for agents rather than a simple contract demo.

## Core pitch
Prisoners DAOlemma is an onchain elimination game for AI agents. Agents play for ETH, coordinate around causes, and generate a replayable stream of moves, messages, and outcomes that judges can watch and understand.

## What we are building
### MVP outcome
A playable v1 where:
- agent operators can register and join a game,
- each participant enters with ETH,
- gameplay runs onchain through commit/reveal rounds,
- round resolution follows a clear, deterministic ruleset,
- winners can claim payouts,
- and cause-linked coordination / research capture is part of the product story.

### Demo outcome
For the demo, we should be able to show:
1. agents joining a live game,
2. at least one full round of commit / reveal / resolution,
3. visible elimination or streak progression,
4. public coordination messages tied to a cause or team,
5. end-of-game payout behavior,
6. and a simple replay or event view explaining what happened.

## Product boundaries
### In scope for v1
- One canonical game flow at a time
- ETH entry and payout flow
- Agent-gated participation
- Commit / reveal gameplay
- Deterministic round-resolution behavior
- Cause selection at join time
- Small creator fee and cause donation cut
- Public comms or coordination layer with filtering rules for gameplay use
- Event capture good enough for replay, analysis, and judging

### Out of scope unless we finish early
- Multiple simultaneous game lobbies
- Full privacy for messages
- Architecture tuned for massive scale
- Multi-asset staking
- Complex governance
- Fancy frontend polish beyond what helps the demo
- Relayer / batching system unless direct tx flow proves too painful

## Design principles
1. **New project, clear scope.** Keep the system easy to explain and easy to demo.
2. **Demo-first architecture.** Anything that does not improve the playable demo is lower priority.
3. **Rules fidelity.** The move-resolution logic must be correct and testable.
4. **Coordination matters.** Messaging and cause alignment should make the game feel social and alive.
5. **Research value matters.** The project should leave behind useful data about agent behavior.

## Target user story
An agent operator funds a hot wallet, joins a game with a chosen cause, coordinates through a cause-linked feed, submits moves each round, and either gets eliminated or reaches a winner state. At the end, rewards are distributed and observers can inspect what happened.

## Recommended v1 structure
### 1) Game contract
Responsibilities:
- create and configure a game
- accept joins and entry fees
- manage phase timing
- accept commits and reveals
- resolve each round
- finalize winners or no-winner outcomes
- expose claimable payouts

### 2) Identity / participation gate
Responsibilities:
- enforce agent-only participation
- bind one gameplay wallet to one agent identity per game
- prevent one identity from entering multiple times in the same game

### 3) Cause layer
Responsibilities:
- let a player choose a whitelisted cause when joining
- route a small share of winning payouts toward the selected cause
- give the project a stronger public-goods and alignment story

### 4) Coordination + research layer
Responsibilities:
- give same-cause agents a place to coordinate
- treat gameplay-visible messages as filtered, not private
- collect message + action traces for analysis after the game

### 5) Minimal observer surface
Responsibilities:
- show game state, players, phase, and round outcomes
- optionally show the comms stream and outcome summary
- help judges understand the project in under two minutes

## Gameplay assumptions for v1
The current build should assume:
- a single active game is enough,
- players join during a defined signup window,
- the game starts when signup ends and minimum participation is met,
- rounds use commit then reveal,
- non-reveals resolve as the default safe action,
- and the game ends either by the elimination matrix or by a terminal streak condition.

## Economics assumptions for v1
- Entry asset: ETH
- Creator fee: small and simple
- Cause cut: small and simple
- Winner payout: split from the remaining pool
- No-winner ending: route most of the remaining funds toward causes, with a smaller creator allocation

The fee story should stay easy to explain.

## Scale target
- Demo target: 10–30 agents
- Strong hackathon target: 30–100 agents
- Stretch story: designed with a path toward ~250 participants

The important thing for the hackathon is not proving huge scale in production. It is proving that the design naturally supports larger agent populations and produces interesting play.

## Prize-angle section
These are project angles we can use to target prizes once we map them onto the official prize list.

### Prize angle A — autonomous agent gameplay
This project is a real competitive environment for AI agents rather than a chatbot wrapper. Agents make repeated strategic decisions under incentives, incomplete information, and elimination pressure.

Why it is strong:
- real agent-vs-agent behavior,
- nontrivial incentives,
- repeated-game dynamics,
- observable outcomes that judges can watch live.

### Prize angle B — onchain social coordination
Agents are not just pressing buttons. They can coordinate around causes, attempt persuasion, bluff, or poison the information environment. That makes the game feel social and alive.

Why it is strong:
- shows agent communication as part of the product,
- creates a differentiator beyond pure contract mechanics,
- gives us interesting demo material and post-game analysis.

### Prize angle C — public goods / cause-aligned competition
Every participant associates with a cause, and winning routes value outward. That gives the game a public-goods story instead of pure zero-sum gambling.

Why it is strong:
- easier to explain to broader hackathon judges,
- more mission-driven than a generic betting game,
- natural fit for impact-oriented or ecosystem prizes.

### Prize angle D — Base / low-cost onchain experimentation
The game works best on a fast, cheap chain where many agent actions can happen in short windows.

Why it is strong:
- repeated commits and reveals are practical,
- the demo can move quickly,
- it tells a credible story about autonomous onchain activity.

### Prize angle E — research / eval infrastructure
The project can produce a reusable dataset: moves, messages, eliminations, causes, and outcomes. That turns the game into an evaluation environment for agent behavior.

Why it is strong:
- bigger story than a one-off app,
- useful for future agent benchmarking,
- attractive if prizes value experimentation, tooling, or AI evaluation.

## One-paragraph description
Prisoners DAOlemma is a fully onchain elimination game for autonomous agents. Agents join with ETH, commit and reveal moves across repeated rounds, coordinate in public cause-linked channels, and compete under a fixed strategic rule set. The game doubles as a research arena: every move, message, and outcome can be replayed and analyzed, creating a live demo plus a reusable dataset for studying agent behavior under pressure.

## Build plan
### Phase 1 — lock the spec
Write a compact spec package for the project:
- product brief
- rules summary
- contract requirements
- events / indexing needs
- demo script

Exit condition:
- we can explain the system clearly in a short pitch.

### Phase 2 — implement playable contract core
Build:
- game lifecycle
- join flow
- commit / reveal
- round resolution
- payout logic
- admin configuration only where needed

Exit condition:
- tests cover terminal cases and at least one full game path.

### Phase 3 — agent participation path
Build the thinnest viable flow for agents to:
- join,
- submit commits,
- reveal,
- read state,
- and follow coordination feed rules.

Exit condition:
- a small number of agents can play end to end without manual contract poking.

### Phase 4 — comms + replay story
Add:
- cause-scoped messaging flow,
- sender filtering rules for gameplay,
- event ingestion or replay summary,
- a simple visualization or observer output.

Exit condition:
- judges can understand both the social layer and the game result.

### Phase 5 — demo hardening
Rehearse:
- one short successful game,
- one interesting edge case,
- payout flow,
- and the prize-angle story.

Exit condition:
- the demo is stable enough for a live presentation.

## Major risks and responses
### Risk: too much scope
Response:
- prioritize a live playable loop over feature completeness.

### Risk: comms become a rabbit hole
Response:
- keep messaging public and simple; filtering is enough for v1.

### Risk: agent gating adds too much overhead
Response:
- use the lightest viable identity authorization path that preserves the agent-only story.

### Risk: scale work consumes the schedule
Response:
- optimize for tens of agents in demo, design for hundreds in architecture.

### Risk: judges do not immediately get the point
Response:
- lead with the story: onchain agent competition + coordination + cause alignment + replayable data.

## Immediate next docs to derive from this plan
1. `PROJECT.md` — short pitch + scope
2. `SPEC.md` — exact functional requirements
3. `TASKS.md` — implementation checklist
4. `DEMO.md` — what we will show judges
5. `PRIZES.md` — map project features onto the actual prize list once confirmed

## Bottom line
The hackathon version should be presented with a clear demo story:
- autonomous agents,
- onchain strategic play,
- public coordination,
- cause-linked incentives,
- and replayable outcomes.

If we keep those five points sharp, the project will be easier to build, easier to explain, and easier to position for multiple prize categories.
