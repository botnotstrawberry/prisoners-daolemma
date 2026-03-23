# Prisoners DAOlemma Judge Evidence Pack

> This helper does not create new proof. It only indexes artifacts that already exist in a local load-harness run, a compact local proof pack, or a Base Sepolia canary bundle, then writes a compact judge-facing guide plus a machine-readable inventory.

## Quick verdict

- Bundle type: base-sepolia-canary
- Local proof: missing
- Live Base Sepolia proof: partial
- Generated artifacts: `JUDGE_README.md`, `judge-evidence-index.json`

## Open these first

1. `preflight.json` — Expected Base Sepolia deploy inputs before the live run.
2. `deployment-summary.json` — Onchain wiring, default config, and deployment freshness after deploy.
3. `auth/player-1/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
4. `auth/player-10/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
5. `auth/player-11/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
6. `auth/player-12/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
7. `auth/player-13/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
8. `auth/player-14/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
9. `auth/player-15/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
10. `auth/player-16/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
11. `auth/player-17/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
12. `auth/player-18/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
13. `auth/player-19/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
14. `auth/player-2/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
15. `auth/player-20/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
16. `auth/player-21/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
17. `auth/player-22/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
18. `auth/player-23/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
19. `auth/player-24/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
20. `auth/player-25/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
21. `auth/player-26/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
22. `auth/player-27/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
23. `auth/player-28/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
24. `auth/player-29/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
25. `auth/player-3/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
26. `auth/player-30/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
27. `auth/player-31/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
28. `auth/player-32/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
29. `auth/player-4/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
30. `auth/player-5/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
31. `auth/player-6/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
32. `auth/player-7/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
33. `auth/player-8/auth-status.json` — Saved auth status for a wallet admitted to the live canary.
34. `auth/player-9/auth-status.json` — Saved auth status for a wallet admitted to the live canary.

## What this bundle proves

### Local proof
- No recognizable local proof artifacts are packaged here.

### Live Base Sepolia proof
- Preflight inputs were captured for chain ? before deployment.
- An onchain deployment summary is present, so owner/treasury/ERC-8004 identity-registry wiring and default config can be inspected after deployment.
- 32 saved auth status artifact(s) are present for admitted gameplay wallets.

## Important missing or still pending

- Live bundle is missing query/game-summary-live.json, so the quick post-game snapshot is incomplete.
- Live bundle is missing query/export/export-manifest.json, so the full repo-native evidence export is incomplete.
- Live bundle is missing operator-notes.md, so tx hashes and manual run notes are not packaged yet.
- No screenshots were found under screenshots/, so there is no bundled visual companion to the JSON evidence yet.

## Still-unknowns to keep honest

- No additional unknowns were inferred from this bundle.

## Artifact inventory

### Local proof
- Not present in this bundle.

### Base Sepolia canary proof
- Status: partial
- preflight.json: `preflight.json`
- deployment-summary.json: `deployment-summary.json`
- deployments-84532.json: `deployments-84532.json`
- verify.log: `verify.log`
- operator-notes.md: missing
- game/create.json: missing
- query/game-summary-live.json: missing
- Preflight chain id: ?
- Preflight profile match: null
- Deployment chain id: ?
- Active causes: ?
- currentGameId / activeGameId / messageCount: ? / ? / ?
- Auth status artifacts: 32
- Auth permit artifacts: 0
- Tx hashes referenced in operator notes: 0
- Screenshots bundled: 0

## Next capture priorities

- Add operator-notes.md with commit hash, auth flavor, tx hashes, explorer links, and any timing surprises.
- Run yarn query:export for the live game so the canary bundle includes the full repo-native export directory.
- Capture screenshots into screenshots/ so judges have a visual anchor alongside the JSON artifacts.
