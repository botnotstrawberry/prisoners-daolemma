# MAINNET 256-PLAYER READINESS

**Date:** 2026-03-21  
**Status:** Active gating document  
**Purpose:** Prevent accidental extrapolation from tiny-canary evidence to the eventual public **256-player** target on Base mainnet.

## Stop rule for future sessions

If you are thinking about any of the following, read this file first:
- raising `maxPlayers`
- tightening or loosening live-chain phase timings
- deciding whether mainnet is ready for a broader public roster
- treating a tiny mainnet canary as evidence for scale

This file exists because the repo now has enough live evidence to learn useful timing lessons — but **not** enough to claim that the `256`-player target is ready.

---

## 1. What this document governs

This document is **not** the tiny mainnet canary checklist.

It governs the much bigger question:

> **When is Prisoners DAOlemma actually ready for a public-facing 256-player Base mainnet game?**

That is a different question from:
- can we deploy to mainnet?
- can we run a tiny canary with 3–5 invited players?
- can we show a live demo?

Those are useful milestones, but they are **not** enough to authorize a public `256`-player launch.

---

## 2. Current evidence baseline

### 2.1 Already proven locally
- Preserved `250`-player local proof bundle exists at:
  - `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- That proof used explicit high timing budgets:
  - `join / commit / reveal = 320 / 320 / 320`
- Local broader/xlarge/multiseed/parallel proofs also exist under `packages/foundry/proof/local/`

### 2.2 Already proven on Base Sepolia
- deploy + verify
- auth-gated join
- winner path with claims + treasury + cause withdrawals
- no-winner path
- cancelled/refund path
- live observer/export bundles
- a real `32`-player design dataset on Base Sepolia with:
  - `32` joined
  - `8` causes
  - `9` onchain coalition/global messages
  - terminal export captured and published to the site

### 2.3 Critical live timing lesson from 2026-03-21
Observed from direct sampling:
- Base Sepolia ≈ **2.0 seconds / block**
- Base mainnet ≈ **2.0 seconds / block**

Practical translation:
- `40` blocks ≈ **80s**
- `60` blocks ≈ **120s**
- `120` blocks ≈ **240s**
- `320` blocks ≈ **640s**

What the live `32`-player Sepolia dataset proved:
- a full `32`-wallet roster can join on a public Base chain
- `40`-block commit/reveal windows are too tight for a full `32`-wallet prepare+commit burst
- the game only reached terminal because missed actions defaulted to `SHARE`

Interpretation:
- the `32`-player Sepolia dataset is valuable evidence
- but it is **not** evidence that tight windows are safe for public scale
- and it is definitely **not** evidence that `256` players are ready on mainnet

---

## 3. Current status

**Public 256-player mainnet target: NOT READY**

Immediate blocker:
- the prepared slower `32`-player Base Sepolia rerun has **not** been executed yet

Why that matters:
- the current `32`-player live evidence proved roster/join viability and timing fragility
- the next question is whether a wider live timing budget can produce a clean `32`-player terminal run **without** relying on missed-action defaults

Until that happens, this repo should assume:
- tiny mainnet canary ≠ public scale readiness
- `60/60` is a tiny-canary timing profile only
- public-scale target should remain on the conservative side

---

## 4. Immediate next gate: slower 32-player Base Sepolia rerun

Prepared script (not yet run):
- `scripts/run-sepolia-32-player-design-dataset-slower.sh`

Prepared profile:
- `joinDurationSeconds = 300`
- `commitDurationBlocks = 120`
- `revealDurationBlocks = 120`
- `maxPlayers = 32`
- `maxCauses = 8`
- `entryFeeWei = 0.001 ETH`
- target player balance `= 0.005 ETH`

### 4.1 This rerun must answer
- Can a full `32`-wallet public-chain roster complete commit/reveal cleanly under a realistic but wider timing budget?
- Are the operator scripts/funding/auth/join/advance/export flows now boringly reliable at that roster size?
- Do we still see timing surprises even at `120 / 120`?

### 4.2 Pass criteria for the slower 32-player rerun
- [ ] fresh deployment used
- [ ] all `32` wallets funded and auth-registered cleanly
- [ ] all `32` players join before the join deadline
- [ ] all rounds complete without relying on missed commits/reveals defaulting gameplay forward
- [ ] no unexpected live revert in normal operator flow
- [ ] game reaches terminal state cleanly
- [ ] final export bundle is readable and publishable
- [ ] published site bundle accurately reflects the run
- [ ] operator notes capture timing observations and any manual interventions

### 4.3 Failure interpretation
If the slower `32`-player rerun fails for timing reasons:
- do **not** tighten timings on vibes
- widen them again
- record the actual bottleneck
- do **not** advance any public-scale mainnet readiness claim

---

## 5. What must be true before a 256-player mainnet launch is even discussable

These are the minimum evidence gates for discussing a public `256`-player Base mainnet launch.

### 5.1 Repo / candidate discipline
- [ ] launch candidate commit frozen
- [ ] launch parameters frozen in repo docs
- [ ] mainnet preflight timing guardrails are green for the intended `maxPlayers`
- [ ] no session is relying on undocumented parameter overrides

### 5.2 Local evidence
- [ ] fresh local scale proof still passes on the launch candidate
- [ ] `250`-player single-game proof remains reproducible at the chosen timing floor
- [ ] local evidence does not require materially tighter windows than the public-scale target profile

### 5.3 Public-chain evidence
- [x] slower `32`-player Sepolia rerun passes
- [x] at least one representative larger-roster live-chain step beyond the tiny canary is reviewed and written down
- [ ] no unresolved live-chain timing surprises remain unexplained

### 5.4 Operational readiness
- [ ] funding plan exists for the intended live roster
- [ ] auth flow is boringly reliable for the expected participant count
- [ ] export/publish flow is boringly reliable
- [ ] pause/rollback operator is identified
- [ ] one-active-game operational discipline is maintained

### 5.5 Parameter realism
- [ ] join window is sized for public participation, not just operator convenience
- [ ] commit/reveal windows are sized for real public-chain latency and wallet throughput
- [ ] parameter floors are based on evidence, not optimism

---

## 6. Current conservative parameter stance for the 256-player target

This is the current **do-not-go-below-without-new-evidence** stance for the public-scale target:
- `joinDurationSeconds`: **600 to 1800**
- `commitDurationBlocks`: **320**
- `revealDurationBlocks`: **320**
- `maxPlayers`: **256**
- `maxCauses`: **16**

Why:
- the preserved local `250`-player proof already used `320 / 320 / 320`
- the live `32`-player Sepolia evidence showed that much smaller block windows become fragile quickly
- there is currently no live-chain evidence that justifies anything tighter for a public `256`-player roster

This does **not** mean `320 / 320 / 320` is permanently optimal.
It means it is the current conservative floor until better live evidence exists.

---

## 7. What a tiny mainnet canary does and does not authorize

A tiny mainnet canary may still be the right next launch step.

If it succeeds, it authorizes statements like:
- the contracts can be deployed to Base mainnet
- the operator flow works in production
- a low-stakes invited game can run safely

It does **not** authorize statements like:
- `256` players are ready
- `60 / 60` is a safe public-scale timing profile
- broad public participation is ready immediately

Keep those separate.

---

## 8. Update policy

This file should be updated immediately when any of these happen:
- the slower `32`-player Sepolia rerun is executed
- the mainnet timing guardrails change
- a larger public-chain rehearsal is added
- the conservative public-scale timing floor changes
- a mainnet canary is run and its lessons affect scale-readiness interpretation

If a future session changes the intended public player cap or live timing assumptions, it should update this file in the same change.

---

## 9. Bottom line

Right now the honest state is:
- tiny mainnet canary readiness is one question
- public `256`-player mainnet readiness is a different question
- the next key evidence step is the **slower `32`-player Sepolia rerun**
- until that is run and written up, the repo should remain conservative about public-scale timing and launch claims
