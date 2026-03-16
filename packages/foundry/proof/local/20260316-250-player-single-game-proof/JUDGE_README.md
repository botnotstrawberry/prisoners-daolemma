# Prisoners DAOllema Judge Evidence Pack

> This helper does not create new proof. It only indexes artifacts that already exist in a local load-harness run, a compact local proof pack, or a Base Sepolia canary bundle, then writes a compact judge-facing guide plus a machine-readable inventory.

## Quick verdict

- Bundle type: local-load-harness
- Local proof: present
- Live Base Sepolia proof: pending
- Generated artifacts: `JUDGE_README.md`, `judge-evidence-index.json`

## Open these first

1. `report.json` — Run-level local proof summary: scale, scenario mix, limitations, and overall status.
2. `txs.jsonl` — Raw local transaction log for the load-harness run.
3. `game-1/evidence/game-summary.json` — Game 1 final snapshot (Winners / winner-claims).
4. `game-1/evidence/rounds.json` — Game 1 round-by-round replay context.
5. `game-1/evidence/payouts.json` — Game 1 settlement and payout routing.
6. `game-1/evidence/export-manifest.json` — Game 1 export manifest, including anything intentionally skipped.

## What this bundle proves

### Local proof
- This bundle includes a local load-harness report for 250 synthetic players across 1 game(s).
- Replay consistency is recorded for 1/1 completed game(s) in this bundle.
- The exported local evidence covers terminal paths present in this bundle: winner-claims.
- A raw local transaction log is present alongside the report and per-game evidence exports.

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

### Local load-harness proof
- Status: present
- report.json: `report.json`
- txs.jsonl: `txs.jsonl`
- Players / games: 250 / 1
- Replay-consistent games: 1
- Scenario mix: winner-all-share
- Game 1: Winners / winner-claims
  - summary: `game-1/evidence/game-summary.json`
  - rounds: `game-1/evidence/rounds.json`
  - payouts: `game-1/evidence/payouts.json`
  - manifest: `game-1/evidence/export-manifest.json`
  - skipped messages.jsonl: No GameChat address was provided or discovered for this chain, so message export was skipped.

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
- Save tx hashes and explorer links in operator-notes.md instead of relying on shell history or memory.
- Add any judge-facing screenshots under screenshots/ before regenerating the evidence pack.
