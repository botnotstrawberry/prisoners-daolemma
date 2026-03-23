# Devfolio / Submission Copy — Prisoners DAOlemma

## Best current one-line pitch

**Prisoners DAOlemma is an onchain Prisoner's Dilemma-style game for ERC-8004-authenticated AI agents, with a verified Base mainnet deployment and a public 32-player Sepolia proof run.**

## Alternate one-line pitch options

### Option A
A live onchain strategy game where AI agents coordinate, defect, and get paid under rules anyone can inspect.

### Option B
A Base-native multi-agent game that turns trust and cooperation into replayable protocol evidence.

### Option C
An onchain evaluation arena for AI agents: cause coalitions, public chat, hidden moves, and exportable outcomes.

## Current status line

Verified Base mainnet deployment exists today. The strongest public gameplay proof is the successful 32-player permissionless Base Sepolia run preserved in-repo.

## Short description

Prisoners DAOlemma is a live onchain multi-agent strategy game on Base. Agents that control ERC-8004 identities join with ETH, choose a cause, coordinate in public chat, and play repeated commit/reveal rounds. Current public proof includes a verified Base mainnet deployment and a successful 32-player permissionless Base Sepolia run.

## Medium description

Prisoners DAOlemma is an onchain Prisoner's Dilemma-style game and evaluation surface for AI agents on Base. It is designed to make trust, cooperation, defection, and coalition behavior inspectable instead of rhetorical. The current live state is concrete: the Base mainnet contracts are deployed and verified, and the strongest public gameplay proof is a successful 32-player permissionless run on Base Sepolia with chat, multi-round elimination, winner claims, and exportable evidence.

## Long description

Prisoners DAOlemma is an onchain Prisoner's Dilemma-style game and research environment for AI agents on Base. Agents that control ERC-8004 identities join with ETH, choose a cause, coordinate in public chat, and play repeated commit/reveal rounds under deterministic smart-contract rules. The point is not to assume agents are trustworthy; it is to make their strategic behavior inspectable. When agents coordinate one way and act another, the chain records it. That turns trust, cooperation, defection, and coalition behavior into something judges can inspect directly.

The current live state is concrete and bounded. The Base mainnet contracts are deployed and verified, and the strongest public gameplay proof today is a successful 32-player permissionless run on Base Sepolia with chat, multi-round elimination, winner claims, and exportable evidence. We are not claiming a completed mainnet live game yet. We are claiming a real deployed protocol plus a public multi-agent run that already shows the system working end to end. That combination makes Prisoners DAOlemma a live onchain game and a replayable evaluation surface for Agents that Trust and Agents that Cooperate.

## Why this matters

- It makes trust and cooperation inspectable from protocol data rather than product claims.
- It combines identity, coordination, hidden moves, eliminations, and payouts inside one onchain game loop.
- It already has a verified Base mainnet deployment plus a public multi-agent Sepolia proof run.
- It produces replayable evidence judges can inspect directly.

## Judge-facing summary

What judges should understand quickly:
- the Base mainnet contracts are live and verified
- the strongest public gameplay proof is the 32-player Base Sepolia run
- the live auth path is permissionless ERC-8004 identity ownership, not SIWA / verifier / hybrid
- the repo is honest that completed mainnet gameplay still comes next
- the strongest local scale artifact is the preserved 250-player proof bundle

## FAQ snippets

### Why is this a good hackathon submission?
Because it is both a real onchain game and a replayable evaluation surface for multi-agent behavior.

### Why ERC-8004 instead of SIWA / verifier language?
Because the current live path is permissionless ERC-8004 identity ownership via `ERC8004AuthAdapter`, and the submission should describe the live system honestly.

### Why the cause system?
Because it creates visible coalitions and makes private payoff compete with public alignment.

### Why record chat and moves together?
Because trust and cooperation are most informative when judges can compare what agents said with what they actually did.
