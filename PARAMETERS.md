# PARAMETERS: Prisoners DAOlemma v1

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

## 4.4 Live-chain timing calibration (Base / Base Sepolia)
Observed on 2026-03-21 from direct chain sampling:
- Base Sepolia: **~2.0 seconds / block**
- Base mainnet: **~2.0 seconds / block**

Practical translation:
- `40` blocks ≈ **80s**
- `60` blocks ≈ **120s**
- `120` blocks ≈ **240s**
- `320` blocks ≈ **640s** (~10.7 min)

Live lesson from the 32-player Base Sepolia design dataset:
- all `32` players successfully joined a live game
- `40`-block commit/reveal windows were too tight for a full 32-wallet prepare+commit burst
- the game only reached terminal because missed commits/reveals defaulted to `SHARE`

Interpretation:
- tiny-canary timings must **not** be reused for larger public rosters
- Sepolia timing is useful for calibrating Base mainnet because the observed block cadence is materially similar
- for any intended live cap above the tiny-canary range, widen timing first and only tighten after evidence

---

## 5. Recommended environment profiles

If you are using these profiles to reason about the eventual public `256`-player target, also read `MAINNET_256_READINESS.md`. The tiny-canary and public-scale questions are intentionally separated.

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
Use for the **first small honest live-chain validation**, not for scale rehearsal.

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
- good for initial live debugging with `3-6` agents
- low-stakes enough to reduce operator friction
- do **not** reuse `20/20` timings for larger public rehearsals

## 5.4 Base Sepolia 32-player rehearsal profile
Use for the first serious live-chain rehearsal above the tiny-canary range.

- `joinDurationSeconds`: **300** (5 min)
- `commitDurationBlocks`: **120**
- `revealDurationBlocks`: **120**
- `minPlayers`: **3**
- `maxPlayers`: **32**
- `maxCauses`: **8**
- `entryFeeWei`: **0.001 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- prepared from the 2026-03-21 live Sepolia lesson that `40/40` was too tight for a 32-wallet burst
- intended to prove a clean terminal path for a full 32-player public-chain roster
- this is the current floor before attempting any larger public roster on Base

## 5.5 Base mainnet canary profile
Use for the **first real-money production canary**, not for the eventual public 256-player target.

- `joinDurationSeconds`: **300** to **600**
- `commitDurationBlocks`: **60**
- `revealDurationBlocks`: **60**
- `minPlayers`: **3**
- `maxPlayers`: **8**
- `maxCauses`: **8**
- `entryFeeWei`: **0.001 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- one active game only
- low-stakes only
- direct monitoring throughout
- these timings are only for a tiny mainnet canary and must not be treated as authorization for a broader public roster

## 5.6 Base mainnet public-scale target profile (**not launch-authorized yet**)
Use only after additional live-chain evidence at representative roster sizes.

- `joinDurationSeconds`: **600** to **1800**
- `commitDurationBlocks`: **320**
- `revealDurationBlocks`: **320**
- `minPlayers`: **16**
- `maxPlayers`: **256**
- `maxCauses`: **16**
- `entryFeeWei`: **0.001 ETH**
- `creatorFeeBps`: **100**
- `causeFeeBps`: **100**

Notes:
- this matches the preserved 250-player local proof's `320 / 320 / 320` timing budget
- current repo evidence does **not** justify using anything tighter for a public 256-player mainnet target
- before using this profile, step up live evidence gradually (for example: clean `32` -> `64` -> higher-roster rehearsals)

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
- if `maxPlayers` changes materially, re-evaluate timing floors instead of reusing the old canary windows
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
