# Judge Evidence Guide

This is the repo-native map for the **evidence/replay/export story**.

It is intentionally conservative:

- it separates **local proof already in the repo** from **future Base Sepolia proof**
- it points judges to files they can open directly
- it does not claim a live canary has happened until a real `canary/base-sepolia/<run-id>/` bundle exists
- it treats screenshots and tx hashes as supporting artifacts, not as replacements for query/export data

## Current honest status

Right now this repo has three different evidence layers:

1. **Code + tests**
   - contracts, Foundry tests, JS tooling tests, and the broader integration smoke prove the implemented auth/game/query surface is wired together locally
2. **Committed local artifact proof**
   - the strongest checked-in bundle today is:
     - `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/`
   - that bundle is local-only, but it contains a real machine-readable report plus per-game evidence exports
   - it currently showcases winner-path and no-winner-path exports; the cancelled path is still most directly evidenced by the broader integration smoke/test surface rather than a checked-in standalone judge bundle
3. **Sepolia packaging readiness**
   - `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md` define the live artifact contract
   - they do **not** by themselves prove that the live run already happened

What is still honestly **pending** until the first live canary bundle exists:

- real Base Sepolia timing comfort for the chosen block/second windows
- explorer verification evidence from the actual deployment
- whether the first honest Sepolia run uses minimal permit/register or the full SIWA-backed path
- whether a second Sepolia scenario is immediately needed after the first live game

## What judges should open first

If a judge only has a few minutes, use this order.

### 1. `README.md`

What it proves:

- what is implemented now
- where auth, gameplay, query/export, and canary tooling live
- what the repo currently does **not** claim yet

### 2. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/report.json`

What it proves:

- this repo already has a checked-in local artifact bundle, not just code claims
- the local proof bundle records a `64`-player, `3`-game sequential run
- the bundle includes explicit limitations and boundary notes instead of overselling local results as live-network proof
- the bundle records replay-consistency counts and points to per-game evidence export directories

### 3. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-1/evidence/game-summary.json`

What it proves:

- the repo can export a compact per-game summary from onchain state/events
- terminal outcome, round count, counts, and settlement state are queryable
- export notes stay explicit about bounded log windows and skipped chat artifacts

### 4. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-1/evidence/rounds.json`

What it proves:

- round-by-round replay context exists in machine-readable form
- replay does not require a flashy UI to be inspectable

### 5. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-1/evidence/payouts.json`

What it proves:

- payout routing is exported directly from contract settlement counters/events
- money flow can be audited without guessing from wallet balances alone

### 6. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-2/evidence/game-summary.json`

What it proves:

- the current committed local artifact set is not only a winner-path story
- it also includes a `NoWinners` / `no-winner-routing` example

### 7. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-2/evidence/payouts.json`

What it proves:

- the no-winner payout path is exported explicitly too
- cause/treasury routing can be inspected independently from the happy-path winner flow

### 8. `packages/foundry/load-harness/manual-scale-proof-2026-03-15-64x3/game-1/evidence/export-manifest.json`

What it proves:

- the export surface records which artifacts were produced
- the export surface also records what was intentionally skipped and why
- this keeps missing chat/message files honest instead of silently omitting them

### 9. `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md`

What they prove:

- the live proof path is already packaged as a repeatable operator workflow
- the repo already defines which live artifacts must be preserved
- the remaining gap is **execution**, not “figure out what proof should look like later”

## Replay/export interpretation guide

When judges inspect an export bundle, the fastest useful file-to-question mapping is:

- `game-summary.json`
  - what happened overall?
  - what was the terminal outcome?
  - what chain/game is this about?
- `rounds.json`
  - what happened round by round?
  - which replay windows and eliminations are visible?
- `roster.json`
  - who joined and what cause/team did they choose?
- `auth.json`
  - which wallets had auth records relevant to the game?
- `payouts.json`
  - where did the money go?
  - what remained claimable vs already withdrawn?
- `messages.jsonl`
  - what did participants say, when chat was configured and exported?
- `export-manifest.json`
  - what did the exporter intentionally produce or skip?

That is the current repo-native replay story: **auditable JSON first, fancy UI optional**.

## Live canary packaging contract

When the first Sepolia run happens, the evidence bundle should live under:

- `packages/foundry/canary/base-sepolia/<run-id>/`

Minimum files to preserve there:

- `preflight.json`
- `deployment-summary.json`
- `deployments-84532.json`
- `verify.log`
- `operator-notes.md`
- `game/create.json`
- `auth/...` per-player auth artifacts
- `query/game-summary-live.json`
- `query/export/export-manifest.json`
- exported `game-summary.json`, `rounds.json`, `payouts.json`, and sibling export files
- `screenshots/` for any judge-facing UI or explorer captures

Packaging rule of thumb:

- put **tx hashes and explorer links** in `operator-notes.md`
- put **screenshots** under `screenshots/`
- keep **query/export JSON** under `query/export/`
- do not rely on memory, shell scrollback, or explorer tabs staying open

## Helper CLI for bundle generation

The repo now includes a small helper that turns an existing artifact directory into a judge-facing mini-pack:

```bash
# local proof bundle

yarn judge:evidence -- --bundle load-harness/manual-scale-proof-2026-03-15-64x3

# future Sepolia bundle

yarn judge:evidence -- --bundle canary/base-sepolia/<run-id>
```

It writes:

- `JUDGE_README.md`
- `judge-evidence-index.json`

What it does:

- indexes the files already present in the bundle
- writes a compact “what to open / what this proves” guide
- highlights missing artifacts instead of pretending they exist
- counts bundled auth artifacts, screenshots, and tx-hash references when available

What it does **not** do:

- it does not fabricate proof
- it does not replace the actual query export
- it does not claim Sepolia execution happened if the bundle only contains local artifacts

## Bottom line

The repo now has a clearer judge path:

- **open the committed local evidence bundle today** for honest local proof
- **use the canary runbook/checklist** for the live proof contract
- **generate `JUDGE_README.md` + `judge-evidence-index.json`** beside any real bundle so judges know exactly what to inspect first
