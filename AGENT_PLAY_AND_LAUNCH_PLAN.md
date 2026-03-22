# Agent Play and Launch Plan — Prisoners DAOlemma

**Date:** 2026-03-22 UTC  
**Status:** planning doc  
**Purpose:** define the agent-facing workflow and documentation/skill surfaces needed for agents to **launch**, **recruit**, **join**, **play**, and **finish** a real Prisoners DAOlemma game.

---

## 1. Why this doc exists

The repo already has strong protocol, test, audit, and run-automation infrastructure.

What is still missing is a clean answer to:
- How does an **operator agent** launch a game?
- How does an agent **recruit** other agents to play?
- How does a **player agent** get authorized and join?
- How does a player know what to do at commit / reveal / claim time?
- What single packet should we hand to an outside agent who wants to participate?

For the final hackathon push, this is now a product/operations/documentation problem, not a protocol-design problem.

---

## 2. Bottom line

Yes — we should create **agent-facing skills or equivalent playbooks**.

But we should **not** jump straight into one vague skill.

We need **three surfaces**, each serving a different user:

### Surface A — Operator / launcher skill
For the agent or human operator who will:
- run preflight
- deploy / verify
- whitelist causes
- create the game
- track join readiness
- advance phases when needed
- export evidence
- publish the run

### Surface B — Player / participant skill
For an agent that wants to:
- understand the game quickly
- complete auth
- join correctly
- prepare a commit bundle
- commit
- reveal
- claim winnings
- understand deadlines and failure modes

### Surface C — Recruitment / invite packet
For outreach to outside agents.
This should be simpler than a skill and readable by any agent/human.
It should answer:
- what this game is
- why they should play
- what wallet/funding/auth they need
- what timeline to expect
- how to confirm participation
- where to get help if they get stuck

For hackathon execution, **Surface C matters immediately**, because it is how we actually recruit the 9-player mainnet roster.

---

## 3. Recommended deliverables

## D1. New planning doc (this file)
- [x] define roles, flows, and required docs/skills

## D2. Operator launch playbook
Recommended path:
- first as plain repo doc
- then optionally as an internal project skill

Suggested target file(s):
- `OPERATOR_GAME_LAUNCH_PLAYBOOK.md`
- later: `.agents/skills/prisoners-launch-game/SKILL.md`

## D3. Player quickstart / participant playbook
Suggested target file(s):
- `PLAYER_GAME_QUICKSTART.md`
- later: `.agents/skills/prisoners-play-game/SKILL.md`

## D4. Recruitment packet
Suggested target file(s):
- `AGENT_RECRUITMENT_PACKET.md`
- optional template companion: `AGENT_INVITE_TEMPLATE.md`

## D5. Optional execution tracker
Suggested target file:
- `MAINNET_9_AGENT_ROSTER_TRACKER.md`

This should track:
- agent name
- wallet
- auth status
- funded status
- cause preference
- join confirmed
- commit confirmed
- reveal confirmed
- claim confirmed

---

## 4. Role model

## 4.1 Operator / launcher
This role owns:
- run parameters
- deployer wallet
- owner / treasury / verifier settings
- cause whitelist
- game creation
- phase advancement
- evidence capture
- publishing

This role uses the repo’s existing operator surfaces, especially:
- `yarn prod:base:preflight`
- `yarn prod:base:deploy`
- `yarn prod:base:verify`
- `yarn game:whitelist-cause`
- `yarn game:create`
- `yarn game:advance`
- `yarn judge:evidence`
- `yarn games:publish`

## 4.2 Player / participant
This role owns:
- wallet control
- SIWA/auth completion
- joining the game
- commit/reveal actions
- claim action if eligible

This role uses the repo’s existing player/auth surfaces, especially:
- `yarn auth:flow`
- `yarn auth:permit`
- `yarn auth:register`
- `yarn auth:status`
- `yarn game:join`
- `yarn game:prepare-commit`
- `yarn game:commit`
- `yarn game:reveal`
- `yarn game:claim`

## 4.3 Recruiter / coordinator
This may be the same entity as the operator, but conceptually it is separate.
This role owns:
- finding 9 agents
- distributing the invite packet
- collecting confirmations
- assigning/recording causes if needed
- reminding agents about join/commit/reveal windows
- escalating when someone is at risk of missing a deadline

For hackathon delivery, this can be done manually.
We do **not** need autonomous open matchmaking first.

---

## 5. Scope for the first version

## In scope
- invited-agent game flow
- manual recruitment
- clear agent onboarding docs
- operator playbook for one full game
- player quickstart for one full game
- proof/evidence packaging after completion

## Out of scope for now
- permissionless public lobby matching
- autonomous agent discovery network
- fully decentralized player coordination UX
- sophisticated in-app matchmaking
- broad social/reputation mechanics

For the hackathon, the job is to make a **9-agent invited mainnet run** easy to execute and easy to understand.

---

## 6. Canonical end-to-end flow

## Step 1 — operator locks the game
Operator decides and records:
- chain
- contract addresses
- join / commit / reveal timings
- entry fee
- cause list
- roster target
- scheduled start time

This belongs in the operator playbook and should reference:
- `FINAL_EXECUTION_CHECKLIST.md`
- `MAINNET_LAUNCH_INPUTS.md`

## Step 2 — recruit agents
Recruiter/operator sends the recruitment packet.
That packet should include:
- what the game is
- why the agent is being invited
- exact chain (`Base mainnet` or `Base Sepolia`)
- stake / entry fee
- rough time commitment
- whether gameplay is expected to be manual or automated
- how to confirm participation
- funding requirements
- auth requirements

## Step 3 — prepare wallets + auth
Each player agent must:
- have a compatible wallet
- have enough ETH for entry + gas
- complete SIWA/auth flow
- confirm onchain auth status before join

The player playbook should make this explicit:
- auth gates **admission to the official game path**
- auth is required before join
- auth expiry/revocation handling should be explained simply

## Step 4 — whitelist causes + create game
Operator must:
- whitelist at least one cause before `createGame()`
- create the game
- distribute game ID + addresses + deadlines to players

## Step 5 — join window
Player agents must:
- know the game ID
- know which cause to choose
- run join successfully before the deadline

The player playbook should explain:
- exact join command shape
- how to confirm the join succeeded
- what happens if they miss join

## Step 6 — commit/reveal rounds
Player agents must:
- prepare commit bundle
- submit commit
- later reveal from that bundle
- repeat until terminal outcome

The player playbook should explain clearly:
- keep the commit bundle safe
- missing reveal has consequences
- deadlines matter
- the operator may announce phase transitions, but the player remains responsible for acting on time

## Step 7 — settlement / claims
If eligible, players claim.
Operator also captures:
- treasury/cause withdrawals if applicable
- final summary
- tx hashes
- evidence bundle

## Step 8 — publish proof
Operator packages the run and updates the site/judge path.

---

## 7. What the operator playbook must contain

This should be procedural and explicit.
It should answer:

### A. Before launch
- how to verify the target commit
- how to run preflight
- how to fund the deployer
- how to confirm owner/treasury/verifier values
- how to lock first-game causes

### B. Deployment
- how to deploy
- how to verify
- where artifacts are stored
- how to record final addresses

### C. Game setup
- how to whitelist causes
- how to create the game
- how to share the game ID with players
- how to monitor joins

### D. Live operations
- how/when to advance phases
- how to spot that a game is advance-ready
- how to communicate deadlines to players
- what to do if a player misses a step

### E. Finish + publish
- how to export bundle
- how to run `judge:evidence`
- how to run `games:publish`
- how to make the correct run the featured proof

---

## 8. What the player playbook must contain

This should be concise, readable, and agent-friendly.
It should answer:

### A. What this game is
- one-paragraph rules summary
- what the agent is trying to do
- what a cause choice means

### B. What the player needs
- wallet
- ETH for gas + entry
- auth approval path
- schedule awareness

### C. How to join
- how to confirm the correct chain and game ID
- how to auth
- how to join
- how to verify success

### D. How to play
- how to choose a move
- how to prepare commit
- how to commit
- how to reveal
- how to repeat for later rounds

### E. How to finish
- how to know if the game ended
- how to claim if eligible
- what to do if they are eliminated

### F. Failure modes
- missed join
- missed commit
- missed reveal
- wrong chain / wrong game
- insufficient balance
- expired auth / failed auth registration

---

## 9. What the recruitment packet must contain

This is the most important surface for outside participants.
It should be short enough to send directly.

Minimum contents:
- project name + one-line pitch
- why the agent is invited
- what chain and stake are involved
- expected start time and duration
- exact ask: “confirm if you want to participate”
- what they need ready
- where they will receive detailed join instructions

Optional but helpful:
- link to judge/site page
- link to a short rules explainer
- note that the game is fully onchain and recorded
- note that cause selection is part of play

---

## 10. Skill vs plain-doc recommendation

For the hackathon push, do this in order:

### First
Write plain docs:
1. `OPERATOR_GAME_LAUNCH_PLAYBOOK.md`
2. `PLAYER_GAME_QUICKSTART.md`
3. `AGENT_RECRUITMENT_PACKET.md`
4. `MAINNET_9_AGENT_ROSTER_TRACKER.md`

### Then, if useful
Convert the operator and player docs into project skills:
- `.agents/skills/prisoners-launch-game/SKILL.md`
- `.agents/skills/prisoners-play-game/SKILL.md`

Why this order:
- plain docs are faster to write and easier to share externally
- outside agents may not consume an internal skill package
- the operator/player skills can later point at the same docs or references

---

## 11. Proposed future skill split

## Skill 1 — `prisoners-launch-game`
Use when an agent needs to run or assist with:
- preflight
- deploy/verify
- whitelist/create/advance
- roster coordination
- export/publish

Potential bundled references:
- operator runbook
- mainnet preflight checklist
- deployment artifact checklist

## Skill 2 — `prisoners-play-game`
Use when an agent needs to:
- understand the game
- complete auth
- join
- commit/reveal
- claim

Potential bundled references:
- player quickstart
- auth troubleshooting
- commit/reveal bundle handling

---

## 12. Immediate doc-writing order

Write these next, in order:

1. `OPERATOR_GAME_LAUNCH_PLAYBOOK.md`
2. `PLAYER_GAME_QUICKSTART.md`
3. `AGENT_RECRUITMENT_PACKET.md`
4. `MAINNET_9_AGENT_ROSTER_TRACKER.md`

Only after those exist should we decide whether to package them as skills immediately.

---

## 13. Definition of done for this doc stream

This planning stream is done when:
- an operator can launch a game by following one playbook
- a player agent can join and play by following one quickstart
- a recruiter can send one compact invite packet
- we can recruit and coordinate 9 mainnet players without ad hoc explanation every time

---

## 14. Next action after this doc

After this planning doc is accepted, the next concrete step should be:

### Phase A parameter + operator input sheet
That should lock:
- owner
- treasury
- verifier
- causes
- join/commit/reveal timings
- entry fee
- target roster of 9
- funding status

Then we can write the operator/player/recruitment docs against those actual mainnet values instead of placeholders.
