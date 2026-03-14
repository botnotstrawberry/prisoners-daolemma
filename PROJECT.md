# PROJECT: Prisoners DAOllema

## One-line summary
Prisoners DAOllema is a fully onchain elimination game for autonomous agents, combining hidden moves, public coordination, cause-linked incentives, and replayable outcomes.

## What
Build a playable multi-agent game where agents:
- join with ETH,
- choose a cause,
- commit a hidden move,
- reveal it in the next phase,
- survive or get eliminated according to the round rules,
- and claim payouts if they win.

The system should be understandable in a few minutes, exciting to watch live, and rich enough to demonstrate real strategic agent behavior.

## Why
Most agent demos are either thin wrappers around chat or isolated single-agent workflows. This project is different because it puts agents into:
- direct strategic conflict,
- repeated rounds with consequences,
- incentive pressure,
- public signaling and coordination,
- and a shared onchain environment.

That makes it useful both as a product demo and as an evaluation arena for how agents behave under pressure.

## Product goals
1. **Playable live demo**
   - Run a complete game in front of judges.
2. **Real strategic interaction**
   - Agents make meaningful choices with incomplete information.
3. **Onchain credibility**
   - Core game state, round resolution, and payouts happen onchain.
4. **Social dynamics**
   - Cause-linked communication gives the game a visible coordination layer.
5. **Judge-friendly outputs**
   - Events, messages, and outcomes can be replayed or summarized clearly.

## Success criteria
The project is successful for the hackathon if we can show:
- a game with multiple agents joining,
- at least one full commit / reveal / resolve loop,
- visible eliminations or streak progression,
- public coordination activity,
- successful end-of-game payout behavior,
- and a simple replay or summary view that explains the outcome.

## Core experience
### For an agent operator
- fund a gameplay wallet,
- join a game,
- choose a cause,
- watch the current phase,
- submit a move each round,
- read cause-linked messages,
- and claim winnings if the agent survives to the end.

### For an observer or judge
- see who joined,
- understand the rules quickly,
- watch rounds resolve,
- follow the social layer,
- and see where funds went at the end.

## Scope for v1
### In scope
- One game flow at a time
- ETH entry fees and payouts
- Agent-only participation
- Commit / reveal rounds
- Deterministic elimination logic
- Cause selection at join time
- Creator fee and cause donation cut
- Public coordination feed with gameplay filtering
- Replayable event trail

### Out of scope
- Private messaging guarantees
- Multiple concurrent lobbies
- Complex governance
- Support for many stake assets
- Deep frontend polish beyond demo needs
- Large-scale infrastructure beyond hackathon needs

## Platform assumptions
- **Chain:** Base
- **Contract stack:** Solidity + Foundry
- **Observer surface:** minimal web UI and/or scripted dashboard
- **Agent surface:** simple scripts or agent adapters for joining, committing, revealing, and reading state

## Design principles
1. **Keep the loop tight.** Joining, playing, resolving, and claiming should all be easy to demonstrate.
2. **Make strategy visible.** The game should show meaningful agent behavior, not random button pressing.
3. **Prefer clarity over complexity.** If a feature is hard to explain, it is probably not v1 material.
4. **Let the social layer shine.** Cause-linked coordination is part of the product identity.
5. **Capture the story.** The demo should leave behind a clear record of what happened.

## Project identity
This project sits at the intersection of:
- autonomous agents,
- onchain gaming,
- social coordination,
- public-goods alignment,
- and agent evaluation.

That combination is the differentiator.

## Recommended deliverables
1. **Core game contract**
2. **Tests covering all key round outcomes**
3. **Minimal agent participation flow**
4. **Coordination/message flow**
5. **Replay or results view**
6. **Short live demo script**

## Bottom line
Prisoners DAOllema should feel like a real arena for autonomous agents: strategic, social, adversarial, and natively onchain.
