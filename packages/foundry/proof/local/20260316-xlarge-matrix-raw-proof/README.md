# Xlarge matrix raw proof bundle

This bundle preserves **full raw in-repo copies** of the latest validated xlarge / multi-seed matrix run set.

The copied raw payload stays reasonably bounded at **3273927 bytes** (~3.27 MB, 3.12 MiB) across **63 copied artifact files**, so this proof is preserved directly in-repo instead of only as a compact summary pack.

For the quickest high-level summary, open the companion compact pack first:

- `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`

## Preserved source runs

### xlarge-local validation (mixed + one adversarial seed)
- Raw source dir: `packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z`
- Copied proof dir: `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/xlarge-local-validation-20260316T021200Z`
- Files copied: **34**
- Copied size: **1598667 bytes** (~1.60 MB, 1.52 MiB)
- Preset: **xlarge-local** (2 / 2 run(s) completed)
- Games completed: **4**; max joined players in a single game: **32**
- Requested scenarios: adversarial-random, mixed
- Seeds: xlarge-mixed-a, xlarge-seed-19
- Tx summary: attempted=845; failedExpected=76; failedUnexpected=0; unexpectedSuccesses=0
- Breakage checks: wedge=0; terminal=0; accounting=0; preview=0; drain=0; replay=0; unexpected=0

### 32-player adversarial multi-seed full-roster validation
- Raw source dir: `packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster`
- Copied proof dir: `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/20260316-xlarge-adversarial-multiseed-fullroster`
- Files copied: **29**
- Copied size: **1675260 bytes** (~1.68 MB, 1.60 MiB)
- Preset: **xlarge-local** (3 / 3 run(s) completed)
- Games completed: **3**; max joined players in a single game: **32**
- Requested scenarios: adversarial-random
- Seeds: xlarge-seed-19, xlarge-seed-211, xlarge-seed-73
- Tx summary: attempted=958; failedExpected=163; failedUnexpected=0; unexpectedSuccesses=0
- Breakage checks: wedge=0; terminal=0; accounting=0; preview=0; drain=0; replay=0; unexpected=0

## Included artifacts

- copied top-level `matrix-report.json` + `MATRIX_SUMMARY.md` for both preserved source runs
- copied per-run raw `report.json` + `txs.jsonl` for all **5** constituent runs
- copied per-game evidence exports for all **7** completed games (`auth.json`, `causes.json`, `export-manifest.json`, `game-summary.json`, `payouts.json`, `roster.json`, `rounds.json`)
- `artifact-manifest.json` — machine-readable copied-file manifest with source-path mapping, byte counts, and SHA-256 hashes

## Combined preserved result

- Preserved source run sets: **2**
- Constituent completed runs: **5**
- Completed games: **7**
- Max joined players in a single preserved game: **32**
- Combined tx summary: attempted=1803; failedExpected=239; failedUnexpected=0; unexpectedSuccesses=0
- Combined breakage checks: wedge=0; terminal=0; accounting=0; preview=0; drain=0; replay=0; unexpected=0

## Boundary note

This remains **local Anvil proof only**. It does **not** claim live mempool realism, distributed-agent behavior, or Sepolia execution. It only preserves the latest validated local xlarge / multi-seed matrix run set in a fuller, auditable in-repo form.
