# Prisoners DAOllema Judge Evidence Pack

> This helper does not create new proof. It only indexes artifacts that already exist in a local load-harness run, a compact local proof pack, or a Base Sepolia canary bundle, then writes a compact judge-facing guide plus a machine-readable inventory.

## Quick verdict

- Bundle type: local-proof-pack
- Local proof: present
- Live Base Sepolia proof: pending
- Generated artifacts: `JUDGE_README.md`, `judge-evidence-index.json`

## Open these first

1. `README.md` — Compact human summary of what this preserved local proof pack includes and intentionally omits.
2. `local-proof-pack.json` — Machine-readable manifest tying each preserved file back to the original local matrix artifact directory.
3. `20260316-parallel-local-validation/matrix-report.json` — parallel-local validation (3 overlapping isolated local harness instances) copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.
4. `20260316-parallel-local-validation/MATRIX_SUMMARY.md` — parallel-local validation (3 overlapping isolated local harness instances) compact human summary for the same preserved local run set.
5. `20260316-host-local-saturation-c5/matrix-report.json` — broader-local host saturation (5 overlapping isolated local harness instances) copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.
6. `20260316-host-local-saturation-c5/MATRIX_SUMMARY.md` — broader-local host saturation (5 overlapping isolated local harness instances) compact human summary for the same preserved local run set.
7. `20260316-host-local-saturation-c6/matrix-report.json` — broader-local host saturation (6 overlapping isolated local harness instances) copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.
8. `20260316-host-local-saturation-c6/MATRIX_SUMMARY.md` — broader-local host saturation (6 overlapping isolated local harness instances) compact human summary for the same preserved local run set.

## What this bundle proves

### Local proof
- This compact local proof pack preserves 3 copied matrix artifact set(s) rooted in validated current local runs.
- parallel-local validation (3 overlapping isolated local harness instances) records 9 completed game(s), max joined players 20, and 0 unexpected failed tx(s).
- broader-local host saturation (5 overlapping isolated local harness instances) records 16 completed game(s), max joined players 20, and 0 unexpected failed tx(s).
- broader-local host saturation (6 overlapping isolated local harness instances) records 19 completed game(s), max joined players 20, and 0 unexpected failed tx(s).
- This pack stays compact on purpose: Raw tx logs, per-run report.json files, and per-game exports from the source matrix directories are intentionally omitted here to keep the checked-in bundle compact.

### Live Base Sepolia proof
- No recognizable live Base Sepolia canary artifacts are packaged here yet.

## Important missing or still pending

- No Base Sepolia canary artifact bundle is present here yet, so this bundle does not prove live network behavior.

## Still-unknowns to keep honest

- Actual Base Sepolia timing and operator comfort for the selected join/commit/reveal windows remain unproven until a live canary bundle is captured.
- Explorer verification is still open until verify.log and/or explorer links are packaged from a real Sepolia deployment.
- The honest live auth flavor is still open until a canary bundle records whether the run used minimal permit/register or the full SIWA-backed path.
- Whether a second Sepolia scenario (cancelled or no-winner) is immediately required stays open until after the first live canary result is reviewed.

## Artifact inventory

### Local proof pack
- Status: present
- local-proof-pack.json: `local-proof-pack.json`
- README.md: `README.md`
- Schema: prisoners-daollema/local-proof-pack-v1
- Generated at: 2026-03-16T06:44:37Z
- parallel-local validation (3 overlapping isolated local harness instances): 9 game(s), max joined players 20, unexpected failed txs 0
  - matrix report: `20260316-parallel-local-validation/matrix-report.json`
  - summary: `20260316-parallel-local-validation/MATRIX_SUMMARY.md`
  - scenarios: adversarial-random, mixed, winner-all-share
  - seeds: parallel-adversarial-a, parallel-same-block-a, parallel-winner-a
- broader-local host saturation (5 overlapping isolated local harness instances): 16 game(s), max joined players 20, unexpected failed txs 0
  - matrix report: `20260316-host-local-saturation-c5/matrix-report.json`
  - summary: `20260316-host-local-saturation-c5/MATRIX_SUMMARY.md`
  - scenarios: adversarial-random, winner-all-share
  - seeds: adversarial-a, adversarial-b, adversarial-c, scale-winner-a, scale-winner-b
- broader-local host saturation (6 overlapping isolated local harness instances): 19 game(s), max joined players 20, unexpected failed txs 0
  - matrix report: `20260316-host-local-saturation-c6/matrix-report.json`
  - summary: `20260316-host-local-saturation-c6/MATRIX_SUMMARY.md`
  - scenarios: adversarial-random, mixed, winner-all-share
  - seeds: adversarial-a, adversarial-b, adversarial-c, same-block-family-a, scale-winner-a, scale-winner-b
- Not preserved here: Raw tx logs, per-run report.json files, and per-game exports from the source matrix directories are intentionally omitted here to keep the checked-in bundle compact.
- Not preserved here: The copied matrix-report.json files are preserved as captured, including path references back to the original source directories on the capture machine.
- Remaining local gap: Broad auth-expiry chaos inside the load harness is still thin.
- Remaining local gap: No Base Sepolia canary artifact bundle is preserved yet.

### Base Sepolia canary proof
- Status: pending
- preflight.json: missing
- deployment-summary.json: missing
- deployments-84532.json: missing
- verify.log: missing
- operator-notes.md: missing
- game/create.json: missing
- query/game-summary-live.json: missing
- Auth status artifacts: 0
- Auth permit artifacts: 0
- Tx hashes referenced in operator notes: 0
- Screenshots bundled: 0

## Next capture priorities

- Run the first Base Sepolia canary and capture preflight.json, deployment-summary.json, operator-notes.md, query/game-summary-live.json, and query/export/export-manifest.json under packages/foundry/canary/base-sepolia/<run-id>/.
- If deeper local auditability is needed beyond this compact pack, preserve a full load-harness or matrix bundle with raw tx logs and per-run exports beside the copied summaries.
- Save tx hashes and explorer links in operator-notes.md instead of relying on shell history or memory.
- Add any judge-facing screenshots under screenshots/ before regenerating the evidence pack.
