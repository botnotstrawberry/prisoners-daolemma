# Judge Evidence Guide

This is the repo-native map for the **evidence / replay / export story**.

It is intentionally conservative:

- it separates proof that already exists in the repo from proof that is only packaging-ready
- it does not claim a live canary has happened until a real `canary/base-sepolia/<run-id>/` bundle exists
- it does not claim a local bundle exists until a real `load-harness/<run-id>/` or equivalent artifact directory exists
- it treats screenshots and tx hashes as supporting artifacts, not as replacements for query/export data

## Current honest status

Right now this repo has three evidence layers:

1. **Code + tests**
   - contracts, Foundry tests, JS tooling tests, and the broader integration smoke prove the implemented auth / game / query surface is wired together locally
2. **Operator-ready local artifact tooling**
   - the repo can generate local harness and matrix artifacts plus judge-facing indexes for an existing bundle
   - the latest status tracking says local validation now extends through bounded xlarge / multi-seed runs
   - however, the repo does **not** currently check in a preserved artifact bundle from that latest run set
3. **Sepolia packaging readiness**
   - `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md` define the live artifact contract
   - they do **not** by themselves prove that the live run already happened

What is still honestly pending until real bundles exist:

- a preserved local bundle from a meaningful current run if we want repo-shipped local proof artifacts
- the first Base Sepolia canary bundle
- explorer verification evidence from the real deployment
- live replay/export artifacts from an actual Sepolia game

## What judges should open first right now

If a judge only has a few minutes and no bundle directory was shipped alongside the repo, use this order.

### 1. `README.md`

What it proves:

- what is implemented now
- where auth, gameplay, query/export, load harness, and canary tooling live
- what the repo currently does **not** claim yet

### 2. `LOCAL_READINESS.md`

What it proves:

- the current done-locally vs not-yet-proven vs externally-blocked split
- that the repo tracks the latest local validation envelope explicitly instead of implying every planned layer is complete
- that xlarge / multi-seed local status is acknowledged without pretending a matching artifact bundle is already checked in

### 3. `TEST_PLAN.md`

What it proves:

- the required validation ladder from deterministic tests through Anvil stress and live-chain gates
- which local gates are already covered in practice and which still remain open

### 4. `SEPOLIA_CANARY_RUNBOOK.md` and `SEPOLIA_CANARY_CHECKLIST.md`

What they prove:

- the live proof path is already packaged as a repeatable operator workflow
- the remaining gap is **execution and artifact capture**, not “figure out what proof should look like later”

## If a real local bundle exists

Once a real local bundle has been captured, the fastest useful open order is:

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
# local proof bundle

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

- open `README.md`, `LOCAL_READINESS.md`, and `TEST_PLAN.md` for the current status boundary
- use the canary runbook/checklist for the live proof contract
- generate `JUDGE_README.md` + `judge-evidence-index.json` beside any **real** local or Sepolia bundle so judges know exactly what to inspect first
