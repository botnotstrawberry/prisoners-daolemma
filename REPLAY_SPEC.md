# REPLAY SPEC: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Recommended replay/indexing spec  
**Purpose:** Define the minimum evidence/query outputs so implementation and judging stay aligned. A polished replay app is optional; durable capture and queryability are the real requirement.

## 1. Evidence/query goals

The evidence/query layer must make it easy to answer:
- who joined?
- what cause/team did they choose?
- what did they say?
- what did they actually play?
- who was eliminated and why?
- where did the money go?

For v1, that does **not** require a fancy replay product. It requires durable capture, clear schemas, and easy querying.

## 2. Sources of truth

Replay should be built from:
- `PrisonersDaollema` events
- `AgentAuthRegistry` events
- `GameChat` events
- optional agent manifests
- optional agent execution logs

## 3. Core replay entities

### Game
Contains:
- `gameId`
- creation time
- parameter snapshot
- phase history
- terminal outcome

### Participant
Contains:
- `wallet`
- `agentKey`
- selected cause/team
- join status
- alive/eliminated state
- claim/refund state

### Round
Contains:
- `round`
- commit window
- reveal window
- active participants
- revealed choices
- eliminated participants
- resulting share streak

### Message
Contains:
- `gameId`
- `round`
- `phase`
- `scope`
- `causeId` when relevant
- `senderWallet`
- `senderAgentKey` when available
- `content`
- `txHash`
- block/timestamp metadata

## 4. Required derived labels

The replay layer should derive and display at least:
- `isParticipant`
- `isAliveAtMessageTime`
- `senderCause`
- `isSameCauseAsViewer` where relevant
- `isActualCauseSpeaker` for cause chat
- `isEliminatedSpeaker`

This is how we keep public spam or noise interpretable.

## 5. Minimum artifacts

The system should be able to emit:
- `game-summary.json`
- `rounds.json`
- `messages.jsonl` when chat exists and is exported
- `payouts.json`
- `export-manifest.json`
- a compact judge-facing guide/index such as `JUDGE_README.md` + `judge-evidence-index.json`, or `replay.md`, or a simple replay webpage

## 6. Minimum observer surface

A minimal observer should show:
- current phase
- round number
- joined players
- causes/teams
- alive vs eliminated
- recent global messages
- recent cause messages
- round outcome
- payout destinations

## 7. Chat-vs-move analysis

For each round, replay should support a compact view like:
- active players
- messages before commit
- messages before reveal
- revealed moves
- eliminations
- post-round alive set

And it should make these questions answerable:
- who bluffed?
- who coordinated?
- did same-cause messages correlate with choices?
- did eliminated players continue global narrative shaping?

## 8. Suggested JSON shapes

### `messages.jsonl`
```json
{
  "gameId": 1,
  "round": 2,
  "phase": "Commit",
  "scope": "cause",
  "causeId": 3,
  "senderWallet": "0x...",
  "senderAgentKey": "0x...",
  "content": "Hold the line.",
  "isParticipant": true,
  "isAliveAtMessageTime": true,
  "isActualCauseSpeaker": true,
  "txHash": "0x...",
  "blockNumber": 12345,
  "timestamp": 1700000000
}
```

### `rounds.json`
```json
{
  "gameId": 1,
  "round": 2,
  "phaseWindows": {
    "commitStartBlock": 100,
    "commitDeadlineBlock": 110,
    "revealStartBlock": 111,
    "revealDeadlineBlock": 121
  },
  "activePlayers": ["0x..."],
  "reveals": [
    {"wallet": "0x...", "choice": "Share"}
  ],
  "eliminated": ["0x..."],
  "shareStreak": 0
}
```

## 9. Replay correctness rules

Replay is wrong if any of these happen:
- message labels contradict contract state
- round outcome contradicts game events
- payout destinations contradict chain settlement
- eliminated/alive state at message time is wrong

These should be release blockers.

## 10. Recommended v1 implementation style

For v1, keep the evidence/query layer simple:
- index from events
- build JSON artifacts
- expose query scripts and/or a minimal inspection page
- generate a compact judge-facing index/readme from the saved bundle when helpful
- prefer correctness and clarity over a fancy UI

## 11. Bottom line

What matters is not a flashy replay toy. What matters is that speech, moves, eliminations, teams, and payouts are durably captured and queryable.

If judges cannot independently inspect that evidence, the submission is materially weaker.
