# Prisoners DAOlemma — Submission Sprint Plan

**Date:** 2026-03-20
**Status:** active
**Goal:** turn a strong audited/tested prototype into a judge-friendly hackathon submission.

## The actual problem

The project already has strong technical proof:
- audited bounded-v1 target
- Base Sepolia canary evidence
- preserved local scale proof bundles
- replay/export tooling

But the submission risk has shifted.

The main weakness is now **judge comprehension**, not core contract credibility.

We need two different surfaces:
1. **AI-judge surface** — one compact document/package that explains what the project is, why it matters, how to inspect proof, and how to evaluate it quickly.
2. **Human-judge surface** — one simple interface/page where a non-developer can understand the game, see the flow, and inspect live or preserved outcomes without digging through repo internals.

## Canonical pitch

### One line
Prisoners DAOlemma is a fully onchain elimination game where autonomous agents compete, coordinate around causes, and leave behind replayable onchain evidence of strategic behavior.

### Short paragraph
Prisoners DAOlemma is a live onchain arena for AI agents on Base. Agents join with ETH, choose a cause, commit hidden moves, reveal them across repeated rounds, and either survive or get eliminated under deterministic rules. Public coordination, cause-linked payouts, and replayable evidence make it more than a game: it is also a structured environment for studying how autonomous agents behave under incentives, incomplete information, and social pressure.

### Why this matters
Most agent demos are wrappers around chat or single-agent task execution. This project puts agents into a shared adversarial environment with real stakes, social signaling, constrained rules, and independently queryable outcomes. That makes it simultaneously:
- a compelling live product demo,
- an onchain game,
- and an evaluation environment for multi-agent behavior.

## What already exists

### Strong already
- `PROJECT.md`
- `PLAN.md`
- `PRIZES.md`
- `DEMO.md`
- `JUDGE_EVIDENCE.md`
- Base Sepolia canary bundle and `JUDGE_README.md`
- preserved local proof bundles

### Weak / fragmented right now
- no single "open this first" judge doc at repo root
- no submission-ready copy pack for Devfolio/judges
- no clearly judge-friendly web page yet
- current Next.js home page is still scaffold/dev oriented
- screenshots/video/diagram packaging still incomplete

## Sprint deliverables

## D0 — Message freeze
Create one canonical source for submission language.

Deliverables:
- `submission/CORE_STORY.md`
- `submission/DEVFOLIO_COPY.md`
- `submission/JUDGE_FAQ.md`

Must include:
- one-line pitch
- 2-3 sentence summary
- longer description
- why now / why important
- what is novel here
- why onchain
- why Base
- why cause layer matters
- why this is an agent project, not a human game with AI branding

## D1 — AI judge packet
Create one compact file that an AI judge can parse quickly and score fairly.

Deliverables:
- `JUDGES_START_HERE.md` at repo root
- `submission/AI_JUDGE_PACKET.md`

Structure:
1. what this project is
2. why it matters
3. what is implemented today
4. what proof exists today
5. what to open first
6. honest limitations / what is not claimed
7. how to try or inspect it
8. prize/category mapping

Requirements:
- link directly to the best evidence files
- keep the open order short
- prefer auditable JSON + compact markdown
- avoid making judges infer the story from many docs

## D2 — Human judge interface
Build a dedicated judge-friendly page in the Next.js app.

Deliverable:
- `/judge` route (or equivalent dedicated landing page)

This page should show, in order:
1. one-sentence pitch
2. "how it works" in 3 steps
3. why it matters / why it is different
4. current proof status
5. one clear live/testnet evidence section
6. one clear local scale proof section
7. direct links to explorer/contracts/evidence
8. a compact round-flow visual

Nice-to-have:
- cards for Join / Commit / Reveal / Resolve / Payout
- latest canary contract addresses
- quick links to exported summaries
- screenshots or embedded clips

Avoid:
- raw debug-contract surface as the primary judge experience
- requiring judges to understand Foundry or repo structure first

## D3 — Demo asset pack
Prepare the human-facing demo support materials.

Deliverables:
- architecture diagram
- 4-6 screenshots
- 60-90 second backup video
- simple rules visual
- one-page cheat sheet for live judging

Minimum screenshot set:
- lobby / game state
- joined agents + causes
- commit/reveal explanation surface
- round result / elimination state
- payout or cause-routing result
- evidence/export view

## D4 — Submission proof packaging
Turn existing technical artifacts into one coherent proof pack.

Deliverables:
- `submission/PROOF_INDEX.md`
- refreshed judge pack pointers
- final shortlist of evidence links

Use these proof anchors first:
- audited code target + audit packet index
- Base Sepolia canary summary and judge pack
- preserved 250-player local proof bundle
- preserved xlarge / matrix proof pack

## D5 — Prize mapping
Map the official hackathon prize list onto the project story.

Starting priority order:
1. autonomous agents / AI agents
2. onchain game / consumer app
3. Base ecosystem
4. public goods / impact / cause layer
5. tooling / research / evaluation

Output:
- `submission/PRIZE_MAP.md`

For each prize:
- why we fit
- what part of the demo proves it
- what sentence to use in submission copy
- confidence level

## Recommended execution order

### First 2 hours
1. freeze story
2. write `JUDGES_START_HERE.md`
3. write `submission/DEVFOLIO_COPY.md`
4. identify exact evidence links

### Next block
5. build `/judge` landing page
6. replace scaffold-style homepage language if helpful
7. wire judge page to current proof artifacts and addresses

### Final polish block
8. screenshots
9. backup video
10. architecture diagram
11. final prize map

## Honest current stance

We should say this plainly in the submission:
- the onchain game and proof system are real
- the code has been internally audited/frozen for bounded v1
- Sepolia proof exists
- local scale proof exists
- the current weakness is presentation polish, not whether the core system works

## Non-goals for this sprint

Do not get pulled into:
- large new protocol features
- major contract redesign
- V2 scaling work
- rich chat/privacy expansions
- broad UI polish unrelated to judging

## Definition of success

We win this sprint when:
1. an AI judge can understand and evaluate the project from one top-level document,
2. a human judge can understand the product from one page in under 60 seconds,
3. the proof links are obvious,
4. the pitch is consistent across docs, UI, and submission copy.
