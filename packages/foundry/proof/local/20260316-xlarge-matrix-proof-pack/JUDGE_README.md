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
3. `xlarge-local-validation-20260316T021200Z/matrix-report.json` — xlarge-local validation (mixed + one adversarial seed) copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.
4. `xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md` — xlarge-local validation (mixed + one adversarial seed) compact human summary for the same preserved local run set.
5. `20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json` — 32-player adversarial multi-seed full-roster validation copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.
6. `20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md` — 32-player adversarial multi-seed full-roster validation compact human summary for the same preserved local run set.

## What this bundle proves

### Local proof
- This compact local proof pack preserves 2 copied matrix artifact set(s) rooted in validated current local runs.
- xlarge-local validation (mixed + one adversarial seed) records 4 completed game(s), max joined players 32, and 0 unexpected failed tx(s).
- 32-player adversarial multi-seed full-roster validation records 3 completed game(s), max joined players 32, and 0 unexpected failed tx(s).
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
- Generated at: 2026-03-16T03:08:41.528Z
- xlarge-local validation (mixed + one adversarial seed): 4 game(s), max joined players 32, unexpected failed txs 0
  - matrix report: `xlarge-local-validation-20260316T021200Z/matrix-report.json`
  - summary: `xlarge-local-validation-20260316T021200Z/MATRIX_SUMMARY.md`
  - scenarios: adversarial-random, mixed
  - seeds: xlarge-mixed-a, xlarge-seed-19
- 32-player adversarial multi-seed full-roster validation: 3 game(s), max joined players 32, unexpected failed txs 0
  - matrix report: `20260316-xlarge-adversarial-multiseed-fullroster/matrix-report.json`
  - summary: `20260316-xlarge-adversarial-multiseed-fullroster/MATRIX_SUMMARY.md`
  - scenarios: adversarial-random
  - seeds: xlarge-seed-19, xlarge-seed-211, xlarge-seed-73
- Not preserved here: Raw tx logs, per-run report.json files, and per-game exports from the source matrix directories are intentionally omitted here to keep the checked-in bundle compact.
- Not preserved here: The copied matrix-report.json files are preserved as captured, including path references back to the original source directories on the capture machine.
- Remaining local gap: Host-local parallel coverage is now real and preserved through 6 overlapping harness instances on one machine; heavier 7-10 deployment saturation remains unproven.
- Remaining local gap: Broad auth-expiry chaos inside the load harness is still thin.
- Remaining local gap: The repo still does not preserve the full raw tx/export bundle from the latest xlarge / multi-seed matrix runs in-repo.
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
