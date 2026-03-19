# Prisoners DAOllema Judge Evidence Pack

> This helper does not create new proof. It only indexes artifacts that already exist in a local load-harness run, a compact local proof pack, or a Base Sepolia canary bundle, then writes a compact judge-facing guide plus a machine-readable inventory.

## Quick verdict

- Bundle type: base-sepolia-canary
- Local proof: missing
- Live Base Sepolia proof: present
- Generated artifacts: `JUDGE_README.md`, `judge-evidence-index.json`

## Open these first

1. `preflight.json` — Expected Base Sepolia deploy inputs before the live run.
2. `deployment-summary.json` — Onchain wiring, default config, and deployment freshness after deploy.
3. `operator-notes.md` — Operator-written tx hashes, explorer links, auth flavor, and notable manual observations.
4. `auth/player-1/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
5. `auth/player-2/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
6. `auth/player-3/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
7. `auth/player-4/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
8. `auth/player-5/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
9. `auth/refresh-player-1/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
10. `auth/refresh-player-2/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
11. `auth/refresh-player-3/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
12. `query/game-summary-live.json` — Live game summary exported directly from the deployed contracts.
13. `query/export/game-summary.json` — Live export snapshot for the final game state and terminal outcome.
14. `query/export/rounds.json` — Live round-by-round replay context.
15. `query/export/payouts.json` — Live settlement and payout routing.
16. `query/export/export-manifest.json` — Live export manifest, including anything intentionally skipped.

## What this bundle proves

### Local proof
- No recognizable local proof artifacts are packaged here.

### Live Base Sepolia proof
- Preflight inputs were captured for chain 84532 before deployment.
- An onchain deployment summary is present, so owner/treasury/verifier wiring and default config can be inspected after deployment.
- A live query export bundle is present, so judges can inspect the deployed contracts through the same repo-native export surface used locally.
- 8 saved auth status artifact(s) are present for admitted gameplay wallets.

## Important missing or still pending

- No screenshots were found under screenshots/, so there is no bundled visual companion to the JSON evidence yet.

## Still-unknowns to keep honest

- No additional unknowns were inferred from this bundle.

## Artifact inventory

### Local proof
- Not present in this bundle.

### Base Sepolia canary proof
- Status: present
- preflight.json: `preflight.json`
- deployment-summary.json: `deployment-summary.json`
- deployments-84532.json: `deployments-84532.json`
- verify.log: `verify.log`
- operator-notes.md: `operator-notes.md`
- game/create.json: missing
- query/game-summary-live.json: `query/game-summary-live.json`
- Preflight chain id: 84532
- Preflight profile match: true
- Deployment chain id: 84532
- Active causes: 5
- currentGameId / activeGameId / messageCount: 4 / 0 / 2
- Live outcome: Winners / winner-claims
- Live export manifest: `query/export/export-manifest.json`
  - export summary: `query/export/game-summary.json`
  - export rounds: `query/export/rounds.json`
  - export payouts: `query/export/payouts.json`
  - export messages: `query/export/messages.jsonl`
- Auth status artifacts: 8
- Auth permit artifacts: 8
- Tx hashes referenced in operator notes: 0
- Screenshots bundled: 0

## Next capture priorities

- Add screenshots/ if you want a more judge-friendly visual companion to the live JSON bundle.
