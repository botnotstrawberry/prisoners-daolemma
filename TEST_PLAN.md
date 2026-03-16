# TEST PLAN: Prisoners DAOllema v1

**Date:** 2026-03-16  
**Status:** Active validation plan + local status tracker  
**Purpose:** Define the full validation strategy from local unit tests through Base Sepolia and mainnet launch gates, while keeping the current local proof boundary explicit.

## 1. Test philosophy

Prisoners DAOllema cannot be considered ready because the happy path works once.

We need to prove five things:
1. the rules are correct,
2. the money is safe,
3. the timing model behaves under stress,
4. the agent admission path cannot be bypassed,
5. and the system remains legible when many agents act quickly.

## 2. Validation layers

The project should be validated in five layers.

### Layer A — deterministic contract correctness
Use Foundry unit tests for:
- state transitions
- join/commit/reveal flows
- truth-table outcomes
- payout and refund math
- auth gating
- admin restrictions

### Layer B — fuzzing and invariants
Use Foundry fuzz/invariant tests for:
- no double claim
- no double refund
- conservation of value
- one identity / one seat per game
- phase monotonicity
- no invalid terminal state
- no contradictory winner/no-winner outcome

### Layer C — local tx realism on Anvil
Use Anvil to run real transactions from many funded accounts.

This layer must simulate:
- many players in one game
- many sequential games
- many game instances in parallel for stress only
- deadline pressure
- partial failures / missed reveals

### Layer D — Base Sepolia canary + soak
Deploy to Base Sepolia and run:
- small canary games
- repeated pilot games
- observer/indexer verification
- auth flow verification
- chat/replay verification

### Layer E — Base mainnet canary + pilot
Only after Layers A-D are green.

Run:
- limited-participant pilot
- low-stakes first game
- replay verification
- payout verification
- operational rollback drills

---

## 2.1 Current local status snapshot (2026-03-16)

This section is not a release waiver. It is the current honest state of local validation.

### Done locally now
- Foundry unit, fuzz, and invariant suites exist against the current contracts.
- JS tooling tests exist for auth, query/export, load harness, matrix runner, canary helpers, and judge-evidence packaging.
- the broader integration smoke exercises local auth -> gameplay -> query/export end to end.
- the local load harness now covers:
  - deterministic winner / cancelled / no-winner scenario families
  - seeded `adversarial-random` breakage hunting
  - phase-edge burst probes around commit/reveal/advance/settlement actions
  - optional same-block no-automine ordering probes for underfilled transitions, per-round last action vs `advancePhase`, and duplicate settlement attempts
- the broader local soak presets now extend through `xlarge-local`, including:
  - deterministic 32-player mixed-family coverage
  - started full-roster 32-player adversarial sweeps across multiple seeds
  - explicit longer 72/80-block phase budgets so larger local rounds do not fake-timeout
- a full preserved 250-player single-game local proof bundle is now checked in at `packages/foundry/proof/local/20260316-250-player-single-game-proof/`, carrying `report.json`, `txs.jsonl`, and per-game exports from a clean winner-path run with explicit 320/320/320 local timing budgets
- a compact preserved local proof pack is now checked in at `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`, carrying copied matrix summaries from the latest xlarge-local and 32-player adversarial multi-seed runs

### Still not proven locally
- multi-instance parallel local stress
- broad auth-expiry chaos inside the load harness
- a full raw in-repo tx/export bundle for the latest xlarge / multi-seed run set; the repo now ships a separate preserved raw 250-player single-game bundle plus a compact preserved matrix proof pack

### Blocked on external execution
- Base Sepolia canary deployment + preserved live artifact bundle
- live testnet auth/game/query/verify rehearsal
- any Base mainnet canary or pilot

---

## 3. Required Foundry test suites

## 3.1 Core state machine tests
Must prove:
- owner/admin can configure only in safe phases
- a game opens in `JOINING`
- join closes correctly
- insufficient players leads to cancel/refund path
- sufficient players leads to `COMMIT`
- `COMMIT -> REVEAL -> resolve -> next phase` works
- game ends only through valid end conditions

## 3.2 Join/admission tests
Must prove:
- unauthorized wallet cannot join
- expired auth cannot join
- duplicate wallet cannot join twice
- duplicate agent identity cannot join twice
- invalid cause cannot be selected
- entry fee mismatch reverts
- max player cap is enforced
- max cause cap / unique-cause cap is enforced

## 3.3 Commit/reveal tests
Must prove:
- only alive players can commit
- only alive players can reveal
- duplicate commit is rejected
- duplicate reveal is rejected
- invalid reveal preimage is rejected
- reveal without commit is rejected
- early transition works when everyone is ready
- deadline transition works when not everyone is ready
- missed commit defaults to `SHARE`
- non-reveal defaults to `SHARE`

## 3.4 Truth-table tests
Write explicit tests for all canonical cases:
1. catchers only
2. sharers only
3. stealers only
4. sharers + catchers
5. stealers + catchers
6. stealers + sharers
7. sharers + catchers + stealers

Each should assert:
- eliminated set
- surviving set
- share streak effect
- terminal or non-terminal outcome

## 3.5 Ending-condition tests
Must prove:
- sole survivor wins immediately
- 3x all-`SHARE` rounds ends with sharer win
- no-winner states end correctly
- no contradictory terminal state exists

## 3.6 Economics tests
Must prove:
- creator fee is correct
- winner share split is correct
- cause cut is correct
- no-winner 90/10 post-creator routing is correct
- rounding behavior is safe and deterministic
- double claim is impossible
- double refund is impossible
- no stuck value remains after all claims/withdrawals expected for that path

## 3.7 Snapshot / mutability tests
These are mandatory because prior audit concerns already pointed here.

Must prove:
- per-game fee parameters are snapshotted
- per-game cause recipient routing is snapshotted
- later admin changes cannot change settlement for an already-started or already-ended game
- refund math does not depend on mutable globals after cancellation

## 3.8 Event and replay tests
Must prove:
- events are emitted for every critical transition
- indexed data is sufficient to reconstruct the game
- replay artifacts derived from events match contract state

---

## 4. Fuzz and invariant plan

## 4.1 Invariants
Add invariants for at least:
- total distributable value never exceeds collected value
- a player cannot be both refunded and rewarded
- a player cannot claim twice
- if game is ended with winners, no refund path is available
- if game is cancelled, claim path is unavailable
- agent uniqueness holds within a game
- share streak never increases except on all-`SHARE` rounds
- share streak resets on any round containing `CATCH` or `STEAL`

## 4.2 Fuzz dimensions
Fuzz over:
- number of players
- number of causes
- cause distributions
- round composition
- missing reveal patterns
- timing boundaries
- fee bps values inside allowed bounds
- entry fee values

## 4.3 Success criteria
No invariant failures.
No unexpected stuck-value condition.
No test-only assumptions that contradict live replay/indexing.

---

## 5. Anvil load testing plan

## 5.1 Why this matters
Production will run one active game at a time, but that does **not** reduce the need for heavy local stress testing.

Anvil must be used to try to break:
- timing assumptions
- transaction throughput
- script orchestration
- event ingestion
- payout settlement
- replay consistency

## 5.2 Required Anvil harness modes

### Mode A — single-game scale test
One contract instance, one game, many players.

Required profile:
- **250 players**
- enough causes to exercise routing diversity
- real transactions for join / commit / reveal / resolve / claim

Purpose:
- prove the contract and agent tooling do not collapse under agent-scale participation in one game

### Mode B — sequential game soak
One contract instance, repeated games back to back.

Suggested profile:
- 10 to 25 games sequentially
- 16 to 64 players each

Purpose:
- catch state-reset bugs
- catch lingering accounting bugs
- catch observer/indexer drift over time

### Mode C — multi-instance stress
Multiple contract instances in parallel on local Anvil.

Suggested profile:
- 5 to 10 deployments
- 10 to 50 players each

Purpose:
- stress scripts, indexing, and replay systems
- not a production product requirement
- useful for throughput realism and demo infrastructure hardening

### Mode D — chaos profile
Deliberately inject:
- missed reveals
- invalid reveals
- duplicate tx attempts
- slow reveals near deadline
- auth expiry cases
- underfilled join windows
- many players on same cause
- many unique causes up to the cap

### Current repo-native foundation (implemented now)
The current bounded local foundation lives in `packages/foundry/scripts-js/loadHarnessCli.js`.

What it covers today:
- Mode A foundation: single deployment, single game, configurable multi-player winner-path runs
- Mode B scaffold: repeated sequential games on one deployment, including mixed scenario plans
- machine-readable `report.json` + `txs.jsonl` + per-game evidence export directories
- bounded chaos today:
  - missed commit / missed reveal deadline pressure via configurable skip rates on winner-path games
  - deterministic cancelled/underfilled flow
  - deterministic no-winner flow
  - seeded `adversarial-random` breakage hunting with randomized omissions, wrong-preimage probes, and settlement-order probes
  - phase-edge burst probes around late commit/reveal, `advancePhase`, and terminal settlement actions
  - optional same-block no-automine ordering probes for underfilled transition ordering, per-round last action vs `advancePhase`, and duplicate `claim` / `refund` / `withdraw` contention
  - broader matrix presets through `xlarge-local`, including deterministic 32-player mixed-family coverage and multi-seed started full-roster 32-player adversarial sweeps with explicit longer phase budgets

What it does **not** cover yet:
- CI automation or broader multi-seed repetition of the 250-player target
- Mode C multi-instance parallel stress
- auth-expiry chaos or broad invalid-op fuzzing inside the harness itself
- a full raw in-repo tx/export bundle for the latest xlarge / multi-seed run set; the repo now ships a separate preserved raw 250-player single-game bundle plus a compact preserved matrix proof pack

Purpose:
- prove safety under ugly, non-demo behavior

## 5.3 Anvil metrics to capture
Every run should emit a machine-readable report including:
- config profile
- player count
- cause count
- tx counts by phase
- revert counts by phase
- latency summary by phase
- deadline misses
- blocks mined
- gas summary by action
- winner/no-winner outcome
- payout reconciliation summary
- replay consistency summary

## 5.4 Required pass thresholds for Anvil
Before Sepolia:
- all Foundry suites green
- 250-player single-game run completes successfully
- sequential soak completes with no stuck funds
- replay artifacts match contract outcomes
- no unresolved critical/high severity issue from stress runs

Current known gap against those gates:
- the explicit 250-player single-game gate is now closed locally by `packages/foundry/proof/local/20260316-250-player-single-game-proof/`; the remaining broader local stress gaps are multi-instance coverage, auth-expiry chaos breadth, and preserving a full raw xlarge / multi-seed matrix bundle

---

## 6. Timing-boundary test plan

Because the game uses both time and block-based windows, boundary behavior must be tested explicitly.

Must test:
- join at the last valid second
- commit on the last valid block
- reveal on the last valid block
- early phase advancement when everyone is ready
- failure to advance early when not everyone is ready
- exact transition at timeout boundary
- auth expiry before join vs after join

---

## 7. Chat and replay validation plan

## 7.1 Chat validation
Must prove:
- only joined participants can post to the in-game global channel
- eliminated participants may still post to the global channel
- only **alive** same-cause participants can post to a given cause-scoped channel
- eliminated players cannot continue posting to cause chat
- global vs cause-scoped messages are labeled deterministically
- message timestamps and round association are reconstructable
- team labels derived from contract state are correct

## 7.2 Chat-vs-move validation
For at least several deterministic test fixtures, the replay layer must answer:
- who said what before commit?
- who said what before reveal?
- what move did they actually play?
- who bluffed?
- did same-cause signaling correlate with outcomes?

## 7.3 Replay consistency requirement
If replay artifacts disagree with contract events, that is a release blocker.

---

## 8. Base Sepolia test plan

## 8.1 Canary deployment
Deploy the first testnet version and verify:
- contracts deploy cleanly
- auth flow works end to end
- frontend/observer points at the right deployment
- indexer/replay starts cleanly from genesis block for that deployment

## 8.2 Small canary game
Run a small game with:
- 3 to 6 agents
- low/no meaningful stake
- one live round minimum

Goal:
- validate the whole chain, not just the contract

## 8.3 Pilot games
Run multiple pilot games on Sepolia:
- 2 to 5 separate games
- 6 to 20 agents depending on reliability
- include at least one no-winner path and one winner path

## 8.4 Soak goals
During Sepolia soak, validate:
- auth reliability
- replay/indexing reliability
- scripts recovering from network slowness
- no accidental dependence on Anvil-only cheatcodes

## 8.5 Sepolia exit gate
No Base mainnet deployment until:
- canary game succeeds
- pilot games succeed
- payout/refund behavior observed on testnet
- replay artifacts verified against testnet events
- no unresolved critical/high issues remain

---

## 9. Base mainnet prelaunch checks

Before mainnet:
- code freeze the launch candidate
- rerun full test suite
- rerun Anvil scale profiles on the launch candidate commit
- verify deployment params independently
- verify treasury and cause addresses independently
- verify auth service endpoints and environment variables
- rehearse the demo on Sepolia one more time

---

## 10. Mainnet canary and pilot

## 10.1 Mainnet canary
First mainnet deployment should use:
- one active game only
- low initial stake size
- invited/known agents only
- close monitoring

## 10.2 Mainnet pilot success criteria
Must prove:
- agents can auth and join reliably
- game resolves correctly under real chain conditions
- claims/refunds settle as expected
- replay and chat analysis artifacts remain coherent
- no operational surprises around timing or gas

## 10.3 Mainnet pause criteria
Pause broader rollout if any of the following happen:
- settlement math disagreement
- replay/event disagreement
- auth bypass or auth outage blocking legitimate play
- unexpected timing failures under live block production
- stuck funds or unclaimable balances

---

## 11. Deliverables required by this plan

The repo should eventually include:
- expanded Foundry tests
- fuzz/invariant test suites
- Anvil load harness + report format
- Sepolia rehearsal scripts
- canary/pilot runbooks
- replay verification scripts
- gas summary output

---

## 12. Bottom line

The serious path is:
1. prove the rules in Foundry,
2. try hard to break them in Anvil,
3. run real pilot games on Base Sepolia,
4. only then launch on Base mainnet.

Anything less is not enough for this project.
