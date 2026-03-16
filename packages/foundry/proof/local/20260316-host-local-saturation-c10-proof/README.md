# Host-local saturation c10 proof bundle

This bundle preserves a **real local matrix run** that coordinated **10 overlapping isolated harness + Anvil instances on one machine** on the current codebase.

## Preserved source

- Raw source run dir: `packages/foundry/load-harness-matrix/20260316-host-local-saturation-c10-attempt`
- Copied proof dir: `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof`
- Adjacent console log copied as: `ATTEMPT.console.log`

## Measured result

- Matrix status: `ok`
- Requested instance concurrency: `10`
- Effective instance concurrency limit: `10`
- Peak active runs observed: `10`
- Parallel overlap confirmed: `true`
- Total runs: `10` / `10`
- Run status summary: `ok=10`
- Total completed games: `28`
- Unexpected failed txs: `0`
- Unexpected successes: `0`
- Wedged active slots: `0`

## Included artifacts

- `matrix-report.json` — top-level machine-readable matrix report
- `MATRIX_SUMMARY.md` — human-readable matrix summary
- `custom-plan.json` — exact custom 10-run plan used for this bounded attempt
- `runs/*/report.json` — per-run machine-readable harness reports
- `runs/*/txs.jsonl` — per-run raw local transaction logs
- `ATTEMPT.console.log` — captured orchestration console output
- `artifact-manifest.json` — copied-file manifest with byte counts and SHA-256 hashes

## Boundary note

This remains **local synthetic stress only**. It proves bounded host-local overlap through 10 isolated harness + Anvil instances on one machine. It does **not** prove live mempool realism, distributed-agent behavior, or heavier 11+ deployment saturation.
