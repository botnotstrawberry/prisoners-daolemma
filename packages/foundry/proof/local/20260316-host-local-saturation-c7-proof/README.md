# Host-local saturation c7 proof bundle

This bundle preserves a **real local matrix run** that coordinated **7 overlapping isolated harness + Anvil instances on one machine** on the current codebase.

## Preserved source

- Raw source run dir: `packages/foundry/load-harness-matrix/20260316-host-local-saturation-c7-attempt/`
- Copied proof dir: `packages/foundry/proof/local/20260316-host-local-saturation-c7-proof/`
- Adjacent console log copied as: `ATTEMPT.console.log`

## Measured result

- Matrix status: `ok`
- Requested instance concurrency: `7`
- Effective instance concurrency limit: `7`
- Peak active runs observed: `7`
- Parallel overlap confirmed: `true`
- Total runs: `7` / `7`
- Total completed games: `22`
- Unexpected failed txs: `0`
- Unexpected successes: `0`
- Wedged active slots: `0`

## Included artifacts

- `matrix-report.json` — top-level machine-readable matrix report
- `MATRIX_SUMMARY.md` — human-readable matrix summary
- `custom-plan.json` — exact custom 7-run plan used for this bounded attempt
- `runs/*/report.json` — per-run machine-readable harness reports
- `runs/*/txs.jsonl` — per-run raw local transaction logs
- `ATTEMPT.console.log` — captured orchestration console output
- `artifact-manifest.json` — copied-file manifest with byte counts and SHA-256 hashes

## Boundary note

This remains **local synthetic stress only**. It proves bounded host-local overlap through 7 isolated harness + Anvil instances on one machine. It does **not** prove live mempool realism, distributed-agent behavior, or heavier 8-10 deployment saturation.
