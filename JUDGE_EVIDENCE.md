# Judge Evidence Guide

This is the repo-native map for the **evidence / replay / export story**.

It is intentionally conservative:

- it separates proof that already exists in the repo from proof that is only packaging-ready
- it does not claim a live canary has happened until a real `canary/base-sepolia/<run-id>/` bundle exists
- it does not claim a local bundle exists until a real `load-harness/<run-id>/` or equivalent artifact directory exists
- it treats screenshots and tx hashes as supporting artifacts, not as replacements for query/export data

## Current honest status

Right now this repo has seven evidence layers:

1. **Code + tests**
   - contracts, Foundry tests, JS tooling tests, and the broader integration smoke prove the implemented auth / game / query surface is wired together locally
2. **Preserved full 250-player local proof bundle**
   - `packages/foundry/proof/local/20260316-250-player-single-game-proof/` is checked in now
   - it preserves the raw `report.json`, `txs.jsonl`, and per-game evidence export from a clean 250-player single-game winner-path run
3. **Preserved compact local matrix proof pack**
   - `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/` is checked in now
   - it preserves copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the latest validated xlarge-local and 32-player adversarial multi-seed runs
   - it is intentionally compact and does **not** pretend to be a full raw tx/export replay bundle for those matrix runs
4. **Preserved compact parallel-local proof pack**
   - `packages/foundry/proof/local/20260316-parallel-local-proof-pack/` is checked in now
   - it preserves copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the original bounded 3-instance `parallel-local` validation plus stronger bounded 5-instance and 6-instance host-local saturation runs
   - it is intentionally compact and does **not** pretend to be a full raw tx/export replay bundle for those matrix runs
5. **Preserved raw 10-instance host-local saturation proof bundle**
   - `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/` is checked in now
   - it preserves the raw `matrix-report.json`, `MATRIX_SUMMARY.md`, per-run `report.json` / `txs.jsonl`, and copied hash manifest from a clean bounded 10-instance host-local saturation attempt
6. **Operator-ready broader local artifact tooling**
   - the repo can still generate fuller local harness and matrix artifacts plus judge-facing indexes for an existing bundle
   - the latest status tracking says local validation now extends through the preserved 250-player proof, bounded xlarge / multi-seed coverage, the compact parallel-local pack, and the raw 10-instance host-local saturation bundle
7. **Sepolia packaging readiness**
   - `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md` define the live artifact contract
   - they do **not** by themselves prove that the live run already happened

What is still honestly pending until fuller bundles exist:

- a full raw local tx/export bundle from the latest xlarge / multi-seed matrix run set if we want deeper in-repo replay/audit depth beyond the compact matrix pack
- the first Base Sepolia canary bundle
- explorer verification evidence from the real deployment
- live replay/export artifacts from an actual Sepolia game

## What judges should open first right now

If a judge only has a few minutes, use this order.

### 1. `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`

What it proves:

- the repo now ships a real preserved **full raw** local load-harness bundle, not just compact matrix summaries
- the recommended open order for the 250-player proof is already generated beside the preserved files

### 2. `packages/foundry/proof/local/20260316-250-player-single-game-proof/report.json`

What it proves:

- one clean single-game local winner-path run reached 250 joined players, 250 claims, 0 unexpected failures, 1/1 replay-consistent games, and 1/1 fully drained games
- the exact explicit larger local budgets used for that proof (`joinDurationSeconds=320`, `commitDurationBlocks=320`, `revealDurationBlocks=320`)

### 3. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/JUDGE_README.md`

What it proves:

- the repo also ships a compact preserved matrix proof pack for broader xlarge / multi-seed local coverage
- the compact bundle stays honest about being local-only and matrix-level

### 4. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/local-proof-pack.json`

What it proves:

- which source matrix directories the preserved files came from
- byte counts and SHA-256 hashes for every copied artifact
- which local gaps remain open after this compact preservation step

### 5. The copied matrix artifacts inside that bundle

Open in this order:

1. `xlarge-local-validation-20260316T021200Z/matrix-report.json`
2. `xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md`
3. `20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json`
4. `20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md`

What they prove:

- deterministic 32-player mixed-family coverage plus a seeded 32-player adversarial sweep in the xlarge-local preset
- three started full-roster 32-player adversarial sweeps across multiple seeds
- zero unexpected failures and zero recorded wedge/terminal/accounting/preview/drain/replay mismatches in those preserved matrix summaries

### 6. `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/README.md`

What it proves:

- the repo now also ships a preserved **raw** host-local saturation bundle, not just compact copied parallel-local summaries
- the strongest preserved clean host-local overlap proof now reaches 10 isolated harness + Anvil instances on one machine

### 7. `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/matrix-report.json`

What it proves:

- requested instance concurrency 10, peak active runs observed 10, and overlap confirmed yes
- 10/10 completed runs, 28 total games, 0 unexpected failures, and 0 recorded wedge/terminal/accounting/preview/drain/replay mismatches in the preserved raw matrix report

### 8. `packages/foundry/proof/local/20260316-parallel-local-proof-pack/JUDGE_README.md`

What it proves:

- the repo now also ships a compact preserved proof pack for bounded host-local multi-instance overlap
- the compact bundle stays honest about being local-only and explicitly records copied overlap evidence through 6 isolated harness + Anvil instances on one machine

### 9. `packages/foundry/proof/local/20260316-parallel-local-proof-pack/local-proof-pack.json`

What it proves:

- which copied matrix artifacts back the preserved parallel-local proof pack
- byte counts and SHA-256 hashes for every copied artifact
- the requested instance concurrency, peak active runs, and overlap pairs preserved from those real local runs

### 10. `LOCAL_READINESS.md` and `TEST_PLAN.md`

What they prove:

- the current done-locally vs not-yet-proven vs externally-blocked split
- that the repo tracks the remaining local-only gaps explicitly instead of overselling the compact packs

### 11. `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md`

What they prove:

- the live proof path is already packaged as a repeatable operator workflow
- the remaining live gap is **execution and artifact capture**, not “figure out what proof should look like later”

## If a fuller local bundle exists

For a fuller local replay bundle with per-game exports and/or tx logs, the fastest useful open order is:

1. `<bundle>/report.json` or `<bundle>/matrix-report.json`
   - top-level scale, scenario mix, limitations, and overall status
2. `<bundle>/MATRIX_SUMMARY.md` when present
   - compact human summary of the run matrix
3. `<bundle>/game-*/evidence/game-summary.json`
   - compact per-game outcome and settlement status
4. `<bundle>/game-*/evidence/rounds.json`
   - round-by-round replay context
5. `<bundle>/game-*/evidence/payouts.json`
   - payout routing and remaining claimables
6. `<bundle>/game-*/evidence/export-manifest.json`
   - what the exporter produced or intentionally skipped
7. `<bundle>/txs.jsonl`
   - raw transaction log for the run

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

The repo includes a helper that turns an existing artifact directory into a judge-facing mini-pack:

```bash
# checked-in full 250-player local proof bundle

yarn judge:evidence -- --bundle proof/local/20260316-250-player-single-game-proof

# checked-in compact local matrix proof pack

yarn judge:evidence -- --bundle proof/local/20260316-xlarge-matrix-proof-pack

# checked-in compact parallel-local proof pack

yarn judge:evidence -- --bundle proof/local/20260316-parallel-local-proof-pack

# fuller ad hoc local proof bundle

yarn judge:evidence -- --bundle load-harness/<actual-run-dir>

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
- it does not claim local or Sepolia execution happened if the bundle is absent or partial

## Bottom line

The honest judge path today is:

- open `packages/foundry/proof/local/20260316-250-player-single-game-proof/` first for the preserved full 250-player current local proof
- then open `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/` for the preserved broader xlarge / multi-seed matrix coverage
- then open `packages/foundry/proof/local/20260316-parallel-local-proof-pack/` for the preserved bounded host-local multi-instance coverage
- use `README.md`, `LOCAL_READINESS.md`, and `TEST_PLAN.md` to understand the surrounding status boundary and remaining local-only gaps
- use the canary runbook/checklist for the live proof contract
- regenerate `JUDGE_README.md` + `judge-evidence-index.json` beside any **real** local or Sepolia bundle so judges know exactly what to inspect first
