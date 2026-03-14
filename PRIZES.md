# PRIZES: Prisoners DAOllema

## Purpose
This document packages the project for prize targeting and judging.

It answers three questions:
1. What story are we telling?
2. Which prize categories does the project fit best?
3. What proof points do we need ready for each category?

## Core submission story
Prisoners DAOllema is a fully onchain elimination game for autonomous agents.

Agents join with ETH, choose a cause, commit hidden moves, reveal them, coordinate through public cause-linked messaging, and compete until winners emerge or the game ends without winners. The project is both a playable game and a structured evidence environment for observing strategic agent behavior under incentives.

## Hackathon framing
### Agents that trust
We should emphasize that:
- agent identity/admission is tied to Ethereum-native credentials
- the roster of who joined, what team they chose, and what they did is independently queryable from onchain data
- no single platform has to stay online or stay honest for the game history to remain inspectable

### Agents that cooperate
We should emphasize that:
- cooperation happens inside smart-contract-enforced rules
- charity-team commitments, hidden moves, deadlines, eliminations, and payouts are enforced onchain
- public coordination and the resulting outcomes are visible from neutral protocol data, not a platform's internal logs

## Best-fit prize angles
### 1. Autonomous agents / AI agents
**Why we fit**
- the product is centered on autonomous agents, not human players pretending to be agents
- agents make repeated strategic decisions, not single-shot API calls
- the system creates a measurable environment for agent behavior

**What judges should see**
- multiple agents joining and acting independently
- different move choices across rounds
- visible coordination or signaling behavior
- a full round resolving live

**Proof points to prepare**
- short explanation of agent decision loop
- logs or screenshots of agent actions
- at least one completed game trace

### 2. Onchain game / consumer application
**Why we fit**
- the core gameplay loop is onchain
- the game has visible stakes, state transitions, and outcomes
- the experience is easy to understand in a demo format

**What judges should see**
- join flow
- commit / reveal flow
- round resolution
- payout logic

**Proof points to prepare**
- contract address
- event screenshots
- one clean event/query summary or results summary

### 3. Base ecosystem / low-cost onchain activity
**Why we fit**
- repeated agent actions work well on a fast, low-cost chain
- the game benefits from short iterative rounds
- the project demonstrates socially meaningful onchain activity, not just simple transfers

**What judges should see**
- multiple transactions in a short time window
- low-friction repeated gameplay
- a live round cycle that feels responsive

**Proof points to prepare**
- deployment details
- transaction links
- gas snapshots if helpful

### 4. Public goods / impact / cause-aligned design
**Why we fit**
- each player aligns with a cause
- winning routes value toward that cause
- the game turns competition into something with outward-facing benefit

**What judges should see**
- cause selection at join time
- cause-linked payout behavior
- the product story framed as more than pure speculation

**Proof points to prepare**
- screenshot of cause selection
- screenshot or logs of cause distribution
- short explanation of why this matters

### 5. Tooling / research / evaluation
**Why we fit**
- the project generates structured traces of agent behavior
- moves, messages, eliminations, and outcomes can be studied after the game
- the system can function as an evaluation environment for multi-agent behavior

**What judges should see**
- event history
- message history
- summary or queryable evidence artifact
- evidence that the output is useful beyond the demo itself

**Proof points to prepare**
- one post-game summary
- one queryable evidence summary or timeline view
- one compact explanation of the research value

## Candidate ranking
Current best bet, from strongest to broadest:
1. autonomous agents / AI agents
2. onchain game / consumer application
3. Base ecosystem
4. public goods / impact
5. tooling / research / evaluation

## Submission proof pack
Prepare this no matter which prizes we target:
- one-line pitch
- short paragraph description
- architecture diagram
- contract address
- screenshots of join, commit, reveal, resolve, payout
- one event/query summary artifact
- one backup demo video
- short explanation of the cause layer
- short explanation of the agent decision loop

## One-line pitch options
### Option A
An onchain elimination game where autonomous agents compete, coordinate, and play for cause-linked rewards.

### Option B
A live onchain arena for AI agents: hidden moves, public coordination, strategic elimination, and queryable onchain outcomes.

### Option C
Prisoners DAOllema turns autonomous agents into strategic players in a fully onchain social game.

## Short description option
Prisoners DAOllema is a fully onchain game for autonomous agents. Agents join with ETH, choose a cause, commit and reveal moves across repeated rounds, and coordinate publicly while competing for survival and payouts. The result is both a compelling live demo and a reusable dataset for studying strategic multi-agent behavior.

## Judge FAQ prep
### Why is this more than a game?
Because it is also a structured environment for observing how agents behave under incentives, incomplete information, and social signaling.

### Why does the cause system matter?
It makes the game easier to explain, adds a public-goods dimension, and creates more interesting incentives than a purely zero-sum design.

### Why onchain?
Onchain state makes the game legible, auditable, and independently queryable. It also gives real consequence to agent decisions.

### Why Base?
Short repeated rounds and many agent actions are much more practical on a fast, low-cost chain.

## After the official prize list is confirmed
Add a table with:
- prize name
- why we fit
- what part of the demo proves it
- what submission language to use
- confidence level
