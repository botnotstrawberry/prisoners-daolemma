# Preserved local matrix proof pack

This bundle preserves compact copies of the latest validated local matrix summaries that matter most for the current honest local proof boundary.

> This is preserved **local Anvil proof only**. It is not a live-chain bundle. This compact pack intentionally does not copy the full raw tx/export payload from the source runs, but the repo now preserves that full raw companion bundle separately at `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`.

## Included proof sets

### xlarge-local validation (mixed + one adversarial seed)
- Source directory: `packages/foundry/load-harness-matrix/xlarge-local-validation-20260316T021200Z`
- Preset: xlarge-local (2 / 2 run(s) completed)
- Games completed: 4; max joined players in a single game: 32
- Requested scenarios: adversarial-random, mixed
- Seeds: xlarge-mixed-a, xlarge-seed-19
- Tx summary: attempted=845; failedExpected=76; failedUnexpected=0; unexpectedSuccesses=0
- Breakage checks: wedge=0; terminal=0; accounting=0; preview=0; drain=0; replay=0; unexpected=0
- Preserved files:
  - `xlarge-local-validation-20260316T021200Z/matrix-report.json`
  - `xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md`

### 32-player adversarial multi-seed full-roster validation
- Source directory: `packages/foundry/load-harness-matrix/20260316-xlarge-adversarial-multiseed-fullroster`
- Preset: xlarge-local (3 / 3 run(s) completed)
- Games completed: 3; max joined players in a single game: 32
- Requested scenarios: adversarial-random
- Seeds: xlarge-seed-19, xlarge-seed-211, xlarge-seed-73
- Tx summary: attempted=958; failedExpected=163; failedUnexpected=0; unexpectedSuccesses=0
- Breakage checks: wedge=0; terminal=0; accounting=0; preview=0; drain=0; replay=0; unexpected=0
- Preserved files:
  - `20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json`
  - `20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md`

## Intentionally not preserved here

- Raw tx logs, per-run report.json files, and per-game exports from the source matrix directories are intentionally omitted here to keep the checked-in bundle compact; the repo now preserves the full raw in-repo copy separately at `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`.
- The copied matrix-report.json files are preserved as captured, including path references back to the original source directories on the capture machine.

## Remaining repo-level gaps after this pack

- Broad auth-expiry chaos inside the load harness is still thin.
- No Base Sepolia canary artifact bundle is preserved yet.

## Judge helper

Regenerate the judge-facing guide and machine index with:

```bash
yarn judge:evidence -- --bundle proof/local/20260316-xlarge-matrix-proof-pack
```

The generated files live beside this README: `JUDGE_README.md` and `judge-evidence-index.json`.

## File integrity

See `local-proof-pack.json` for per-file byte counts and SHA-256 hashes.
