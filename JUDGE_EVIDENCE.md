# Judge Evidence Guide

This is the repo-native map for the **evidence / replay / export story**.

It is intentionally conservative:

- it separates proof that already exists in the repo from proof that is only packaging-ready
- it does not claim a live canary has happened until a real `canary/base-sepolia/<run-id>/` bundle exists
- it does not claim a local bundle exists until a real `load-harness/<run-id>/` or equivalent artifact directory exists
- it treats screenshots and tx hashes as supporting artifacts, not as replacements for query/export data

## Current honest status

Right now this repo has four evidence layers:

1. **Code + tests**
   - contracts, Foundry tests, JS tooling tests, and the broader integration smoke prove the implemented auth / game / query surface is wired together locally
2. **Preserved compact local proof pack**
   - `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/` is checked in now
   - it preserves copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the latest validated xlarge-local and 32-player adversarial multi-seed runs
   - it is intentionally compact and does **not** pretend to be a full raw tx/export replay bundle
3. **Operator-ready broader local artifact tooling**
   - the repo can still generate fuller local harness and matrix artifacts plus judge-facing indexes for an existing bundle
   - the latest status tracking says local validation now extends through bounded xlarge / multi-seed runs
4. **Sepolia packaging readiness**
   - `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md` define the live artifact contract
   - they do **not** by themselves prove that the live run already happened

What is still honestly pending until fuller bundles exist:

- a full raw local tx/export bundle from a meaningful current run if we want deeper in-repo replay/audit depth beyond the compact matrix pack
- the first Base Sepolia canary bundle
- explorer verification evidence from the real deployment
- live replay/export artifacts from an actual Sepolia game

## What judges should open first right now

If a judge only has a few minutes, use this order.

### 1. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/JUDGE_README.md`

What it proves:

- the repo now ships a real preserved local proof bundle, not just packaging-ready tooling
- the compact bundle stays honest about being local-only and matrix-level
- the recommended open order is already generated beside the preserved files

### 2. `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/local-proof-pack.json`

What it proves:

- which source matrix directories the preserved files came from
- byte counts and SHA-256 hashes for every copied artifact
- which local gaps remain open after this compact preservation step

### 3. The copied matrix artifacts inside that bundle

Open in this order:

1. `xlarge-local-validation-20260316T021200Z/matrix-report.json`
2. `xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md`
3. `20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json`
4. `20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md`

What they prove:

- deterministic 32-player mixed-family coverage plus a seeded 32-player adversarial sweep in the xlarge-local preset
- three started full-roster 32-player adversarial sweeps across multiple seeds
- zero unexpected failures and zero recorded wedge/terminal/accounting/preview/drain/replay mismatches in those preserved matrix summaries

### 4. `LOCAL_READINESS.md` and `TEST_PLAN.md`

What they prove:

- the current done-locally vs not-yet-proven vs externally-blocked split
- that the repo tracks the remaining local-only gaps explicitly instead of overselling the compact pack

### 5. `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md`

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
# checked-in compact local proof pack

yarn judge:evidence -- --bundle proof/local/20260316-xlarge-matrix-proof-pack

# fuller local proof bundle

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

- open `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/` first for the preserved compact current local proof
- use `README.md`, `LOCAL_READINESS.md`, and `TEST_PLAN.md` to understand the surrounding status boundary and remaining local-only gaps
- use the canary runbook/checklist for the live proof contract
- regenerate `JUDGE_README.md` + `judge-evidence-index.json` beside any **real** local or Sepolia bundle so judges know exactly what to inspect first
