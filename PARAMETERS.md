# PARAMETERS: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Recommended defaults and launch profiles  
**Purpose:** Freeze the parameter model and recommended values for local testing, Base Sepolia, and Base mainnet.

## 1. Parameter design principles

1. **One active game at a time in production.**
2. **Join window should be generous enough for real agent participation.**
3. **Commit/reveal windows should be block-based and fast, but not brittle.**
4. **Parameters affecting settlement must be snapshotted per game.**
5. **Safety caps are mandatory to limit worst-case loops.**
6. **Anvil profiles can be much faster than live-chain profiles.**

---

## 2. Parameter model

## 2.1 Core game parameters
These should exist per game or be snapshotted per game when the game becomes active:
- `joinDurationSeconds`
- `commitDurationBlocks`
- `revealDurationBlocks`
- `entryFeeWei`
- `creatorFeeBps`
- `causeFeeBps`
- `minPlayers`
- `maxPlayers`
- `maxCauses`

## 2.2 Global safety/config parameters
These may exist globally but must not mutate settlement for an already-started game:
- cause whitelist
- treasury address
- auth registry address
- admin/owner address
- allowed fee bounds

## 2.3 Settlement snapshots required
Per started game, snapshot at minimum:
- entry fee
- creator fee bps
- cause fee bps
- cause recipient routing as used by that game
- max player / cause assumptions if they affect safety

---

## 3. Recommended hard safety bounds for v1

These are recommended **v1 safety caps**, not promises for future versions.

- `maxPlayers`: **256**
  - rationale: supports the required 250-player stress target with a little headroom
- `maxCauses`: **16**
  - rationale: enough variety without allowing unbounded settlement loops
- `creatorFeeBps` upper bound: **<= 500**
- `causeFeeBps` upper bound: **<= 500**

Recommended defaults:
- `creatorFeeBps`: **100** (1%)
- `causeFeeBps`: **100** (1%)
- no-winner post-creator routing: **90% causes / 10% treasury**

---

## 4. Phase timing model

## 4.1 Join window
Recommended unit: **seconds**

Reason:
- easier to set to minutes/hours for real agents
- easier to reason about for demos and production
- easier to fast-forward in Anvil

## 4.2 Commit / reveal windows
Recommended unit: **blocks**

Reason:
- aligns gameplay tightly to chain progression
- easier to test exact boundary behavior
- makes early transitions and deadline logic explicit

## 4.3 Early transition behavior
Recommended: **enabled**

If all alive players have committed or revealed, the game may advance before the full timeout.

This is important because:
- it keeps demos fast
- it reduces user frustration in live play
- it still preserves a safe upper bound if not everyone is ready

---

## 5. Recommended environment profiles

## 5.1 Anvil smoke profile
Use for quick local correctness and demo rehearsal.

- `joinDurationSeconds`: **60**
- `commitDurationBlocks`: **10**
- `revealDurationBlocks`: **10**
- `minPlayers`: **3**
- `maxPlayers`: **32**
- `maxCauses`: **8**
- `entryFeeWei`: **0.01 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- fast enough for developer loops
- still exercises canonical timing behavior

## 5.2 Anvil scale profile
Use for the serious local stress harness.

- `joinDurationSeconds`: **60** (then fast-forward)
- `commitDurationBlocks`: **10**
- `revealDurationBlocks`: **10**
- `minPlayers`: **16**
- `maxPlayers`: **256**
- `maxCauses`: **16**
- `entryFeeWei`: **0.01 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- supports the required 250-player single-game stress case, but full-roster local proofs should raise join / commit / reveal budgets high enough to avoid fake auto-mined deadline failures (the preserved 250-player proof bundle used 320 / 320 / 320)
- can be reused for sequential and multi-instance stress

## 5.3 Base Sepolia canary profile
Use for first live-chain end-to-end validation.

- `joinDurationSeconds`: **900** (15 min)
- `commitDurationBlocks`: **20**
- `revealDurationBlocks`: **20**
- `minPlayers`: **3**
- `maxPlayers`: **32**
- `maxCauses`: **8**
- `entryFeeWei`: **0.001 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- generous enough for initial live debugging
- low-stakes enough to reduce operator friction

## 5.4 Base Sepolia pilot/soak profile
Use for repeated rehearsals and demo hardening.

- `joinDurationSeconds`: **1800** (30 min)
- `commitDurationBlocks`: **30**
- `revealDurationBlocks`: **30**
- `minPlayers`: **6**
- `maxPlayers`: **64**
- `maxCauses`: **8**
- `entryFeeWei`: **0.001 ETH** to **0.002 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- slower and safer than local tests
- better for real network conditions and multi-agent coordination

## 5.5 Base mainnet pilot profile
Use for the first real-money production game.

- `joinDurationSeconds`: **7200** (2 hours)
- `commitDurationBlocks`: **30**
- `revealDurationBlocks`: **30**
- `minPlayers`: **8**
- `maxPlayers`: **64**
- `maxCauses`: **8**
- `entryFeeWei`: **0.001 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- one active game only
- use invited/known agents first
- do not increase maxPlayers until stress + Sepolia results justify it

---

## 6. Recommended administrative rules

## 6.1 What can change only in IDLE / before a game starts
- fee bps defaults
- entry fee defaults
- max player / cause caps
- auth registry address
- treasury address
- cause whitelist additions/removals

Recommended default entry fee:
- **0.001 ETH**
- keep it admin-configurable for future games
- snapshot the chosen entry fee into each game so active/ended game settlement cannot change retroactively

## 6.2 What must not affect an already-started game
- entry fee
- creator fee
- cause fee
- cause payout routing used by that game
- anything that changes settlement math retroactively

## 6.3 Cancellation rule
If join window ends and `minPlayers` is not met:
- game transitions to cancellation/refund path
- no gameplay starts
- refunds become claimable

---

## 7. Cause-layer parameter guidance

## 7.1 Cause count
Recommended v1 live value:
- **4 to 8 causes**

This is enough to feel meaningful without making settlement and analytics noisy.

## 7.2 Cause routing
Recommended:
- cause recipient addresses are explicit
- cause recipient for a given game/cause pair is snapshotted the first time that cause is used in that game

## 7.3 No-winner distribution
Recommended:
- post-creator remainder split 90/10 between causes and treasury
- cause portion distributed pro-rata by entrant count across selected causes

---

## 8. Admission/auth parameters

## 8.1 Required properties
- one agent identity per seat
- one gameplay wallet per agent per game
- expiry-aware authorization
- easy enough for live demo use

## 8.2 Auth record recommended fields
- `agentKey`
- `wallet`
- `manifestHash`
- `issuedAt`
- `expiresAt`
- verifier/issuer provenance
- nonce or replay protection if permit-based

## 8.3 Recommended expiry policy
- local/anvil: long/disabled expiry acceptable for test convenience
- Sepolia/mainnet: finite expiry preferred
- auth should need renewal only for **joining**, not every move

---

## 9. Replay/chat parameter guidance

## 9.1 Minimum chat scopes
- `global`
- `cause:<causeId>`

Recommended posting permissions:
- `global`: joined participants, including eliminated players
- `cause:<causeId>`: **alive** joined participants whose selected cause matches `causeId`

## 9.2 Suggested message size bound
Recommended v1 cap:
- **280 to 500 bytes per message**

Keep the feed compact and replay-friendly.

## 9.3 Replay artifact requirements
For every live profile, retain:
- round timing
- player identity labels
- messages
- revealed moves
- eliminations
- payouts

---

## 10. Parameter freeze policy

Before Base mainnet launch:
- freeze the launch candidate parameters in the repo
- review them against Sepolia observations
- do not improvise fee/timing changes during launch without updating the docs and runbook

---

## 11. Bottom line

Recommended starting point:
- production supports **one active game at a time**
- join uses **seconds**
- commit/reveal use **blocks**
- fees default to **1% creator / 1% cause**
- v1 live caps are conservative
- Anvil stress is much harsher than the first mainnet pilot

This gives us speed in local testing and caution in real deployment.
