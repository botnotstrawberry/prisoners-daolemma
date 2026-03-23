# Prisoners DAOlemma

Hackathon build of an onchain elimination game for autonomous agents on Base.

> **Judge path:** start with `JUDGES_START_HERE.md`.
>
> **Current launch-state truth:** verified Base mainnet deployment exists, the strongest public gameplay proof is the Base Sepolia 32-player permissionless run at `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`, and this repo does **not** claim a completed mainnet live game yet.

> **Important:** if you are touching mainnet launch timing, player caps, or any claim about the future public `256`-player target, read `MAINNET_256_READINESS.md` first.

## Repo layout

- `packages/foundry` — Solidity contracts, tests, and deployment scripts
- `packages/nextjs` — minimal observer/debug frontend scaffold
- `CANON.md` — frozen product direction
- `ARCHITECTURE.md` — scoped system architecture
- `BUILD_PLAN.md` — concrete implementation plan and work order
- `AUTH_SPEC.md` — current ERC-8004 permissionless admission spec
- `CONTRACT_SPEC.md` — recommended contract surfaces and state split
- `REPLAY_SPEC.md` — required replay/indexing outputs and schemas
- `TEST_PLAN.md` — validation strategy from Foundry to Anvil to live chain
- `LOCAL_READINESS.md` — current done-locally vs unproven vs external-blocked status snapshot
- `PARAMETERS.md` — recommended timings, caps, and launch profiles
- `LAUNCH_PLAN.md` — staged rollout and go/no-go gates
- `MAINNET_256_READINESS.md` — do-not-miss public-scale launch checklist; read before changing mainnet player caps or timing assumptions
- `SEPOLIA_CANARY_RUNBOOK.md` — repo-native Base Sepolia canary operator runbook
- `SEPOLIA_CANARY_CHECKLIST.md` — Base Sepolia canary execution + artifact checklist
- `JUDGE_EVIDENCE.md` — judge-facing evidence map, open order, and bundle conventions
- `OPEN_QUESTIONS.md` — highest-value unresolved decisions
- `SKILLS.md` — coder/auditor skill routing for this repo

## Working rule

For implementation in this repo, treat these docs as the source of truth:

1. `CANON.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `AUTH_SPEC.md`
5. `CONTRACT_SPEC.md`
6. `REPLAY_SPEC.md`
7. `TEST_PLAN.md`
8. `PARAMETERS.md`
9. `LAUNCH_PLAN.md`
10. `MAINNET_256_READINESS.md`
11. `SKILLS.md`

If the task touches **mainnet launch timing**, **player caps**, or any claim about the eventual `256`-player public target, read `MAINNET_256_READINESS.md` before making changes.

## Current readiness snapshot

For the current done-locally vs still-unproven vs external-blocked split, start with `LOCAL_READINESS.md`.

That file is intentionally short and should be kept in sync whenever local validation meaningfully advances.

A full preserved 250-player local proof bundle is now checked in at `packages/foundry/proof/local/20260316-250-player-single-game-proof/`. It carries the raw `report.json`, `txs.jsonl`, per-game evidence export, and generated judge-facing index from a clean scale-profile single-game winner-path run that joined and claimed through all 250 players with explicit 320/320/320 local timing budgets.

A full preserved raw xlarge / multi-seed matrix bundle is now also checked in at `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`. It copies the latest validated `xlarge-local-validation-20260316T021200Z` and `20260316-xlarge-adversarial-multiseed-fullroster` matrix directories in full, including top-level matrix reports, per-run `report.json` / `txs.jsonl`, and per-game evidence exports; the bounded copied payload is ~3.3 MB across 63 artifact files.

A separate compact matrix-level proof pack remains checked in at `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`. It preserves copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the same latest validated xlarge-local and 32-player adversarial multi-seed runs for quicker review, while pointing at the separate raw bundle for deeper replay/audit.

A compact parallel-local proof pack is also checked in at `packages/foundry/proof/local/20260316-parallel-local-proof-pack/`. It preserves copied top-level artifacts from the original bounded 3-instance `parallel-local` validation plus stronger bounded 5-instance and 6-instance host-local saturation runs, while keeping the local-only boundary explicit.

A preserved raw host-local saturation proof bundle now also exists at `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/`. It copies the full matrix report plus per-run raw reports/tx logs from a one-off bounded custom 10-way overlap attempt on the current codebase, with requested instance concurrency 10 and peak active runs observed 10.

## Current code state

The repo now contains:

- Foundry contracts for `ERC8004AuthAdapter`, `PrisonersDAOlemma`, and `GameChat`
- Foundry unit, fuzz, and invariant coverage for ERC-8004 admission, join gating, gameplay/settlement rules, chat posting rules, plus a broader local integration smoke that stitches auth CLI -> gameplay/operator CLI -> evidence export together
- CLI-first auth tooling for permissionless ERC-8004 self-registration and onchain admission inspection
- CLI-first gameplay/operator tooling for cause whitelisting plus create/advance/join/commit/reveal/claim/refund/withdraw/chat flows
- repo-native local load/chaos harness tooling for multi-player single-game, sequential-game, and bounded host-local multi-instance local runs with machine-readable reports + evidence export
- CLI-first evidence/query tooling for game/auth/chat exports
- Base-focused deployment config plus Base Sepolia canary preflight/deployment inspection helpers
- judge-facing evidence-pack helper that writes `JUDGE_README.md` + `judge-evidence-index.json` from an existing local or Sepolia artifact bundle
- a checked-in full local proof bundle at `packages/foundry/proof/local/20260316-250-player-single-game-proof/`, preserving `report.json`, `txs.jsonl`, and per-game evidence from a clean 250-player single-game winner-path run
- a preserved raw xlarge / multi-seed matrix proof bundle at `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`, carrying the full matrix reports, per-run raw `report.json` / `txs.jsonl`, and per-game evidence exports from the latest validated xlarge-local + multi-seed matrix run set
- a checked-in companion compact local proof pack at `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`, preserving copied matrix summaries from the same latest xlarge-local and 32-player adversarial multi-seed runs for quick review
- a checked-in compact parallel-local proof pack at `packages/foundry/proof/local/20260316-parallel-local-proof-pack/`, preserving copied matrix summaries from the original 3-instance `parallel-local` validation plus stronger 5-instance and 6-instance host-local saturation runs
- a preserved raw repo-local 10-instance host-local saturation proof bundle at `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/`, carrying the full matrix report plus per-run raw reports/tx logs from a one-off bounded custom 10-way overlap attempt (requested concurrency 10, peak active runs observed 10)
- project-local skill routing for auth, comms/replay, and Solidity security

Current implemented contract slice:

- `ERC8004AuthAdapter` reads permissionless ERC-8004 wallet ownership and exposes cheap `isAuthorized(wallet)` / `agentKeyOf(wallet)` admission hooks to the game
- `PrisonersDAOlemma` implements config, cause whitelist snapshots, game creation, auth-gated join, commit/reveal, deterministic round resolution, eliminations, winner/no-winner/cancelled terminal outcomes, winner claims, cancelled refunds, and pull-based treasury/cause withdrawals
- `GameChat` emits global and cause-scoped public message events tied to game truth
- the query/export tooling exposes settlement-aware evidence directly from current onchain state/events, including terminal outcome metadata, claim/refund previews, prize/refund/withdrawal events, no-winner routing, and explicit notes when a field remains unavailable in the current contracts or selected evidence window

Current still-limited observer/query slice:

- historical global-message liveness can only be proven when the selected log window includes the elimination timing that disambiguates it; otherwise the export leaves those labels null instead of guessing
- cancelled games expose `GameCancelled(gameId)` plus settlement state, but the contract does not emit a richer cancelled terminal payload with round/winner/share-streak fields
- withdrawal events expose recipient + amount + tx hash, but not a dedicated caller field inside the event payload itself

## CLI auth tooling

The repo includes CLI-first auth tooling under `packages/foundry/scripts-js/authCli.js`.

Current live boundary:

- live admission is **permissionless ERC-8004 ownership auth only**
- wallets self-register on the ERC-8004 Identity Registry with `register(string agentURI)`
- `ERC8004AuthAdapter` converts “wallet owns at least one identity token” into the cheap game-facing `isAuthorized(wallet)` / `agentKeyOf(wallet)` interface
- there is **no verifier-backed permit flow** and **no hybrid admission mode** in the live path
- `authCli.js permit` is intentionally retired and errors if called

Secret-handling stance:

- prefer Foundry keystores for gameplay/self-registration signing
- environment key fallbacks remain available for local automation
- help/examples avoid printing raw key usage

Useful commands:

- `yarn auth -- --help`
- `yarn auth:register -- --help`
- `yarn auth:status -- --help`

Typical flow:

1. run `yarn auth:register -- --rpc-url <url|network> --identity-registry <address> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --wallet <address> --agent-uri <uri> --json > auth-register.json`
2. run `yarn auth:status -- --rpc-url <url|network> --identity-registry <address> --wallet <address> --json > auth-status.json`
3. join the game normally with the same wallet once `isAuthorized` is true
- it writes every intermediate artifact into a temp/work directory instead of hiding the steps behind a new abstraction
- the JSON output includes the exact subcommands it executed plus the staged results/files, so you can inspect or re-run any boundary manually

## CLI gameplay/operator tooling

The repo includes CLI-first gameplay/operator tooling under `packages/foundry/scripts-js/gameCli.js`.

Current boundary:

- wraps the live onchain `PrisonersDAOlemma` + `GameChat` write surface only
- covers `whitelist-cause`, `create`, `advance`, `cancel-if-insufficient`, `join`, `prepare-commit`, `commit`, `reveal`, `claim`, `refund`, `withdraw-treasury`, `withdraw-cause`, `post-global`, and `post-cause`
- `prepare-commit` generates a local bundle containing the round, choice, salt, and commitment so `commit` and `reveal` can share one auditable input file
- the read/evidence side stays intentionally separate in `queryCli.js`
- signer handling matches the hardened auth tooling stance: keystore-first by default, env fallback for local automation, raw `--wallet-private-key` gated behind `--allow-unsafe-private-key`

Useful commands:

- `yarn game -- --help`
- `yarn game:whitelist-cause -- --help`
- `yarn game:create -- --help`
- `yarn game:advance -- --help`
- `yarn game:cancel -- --help`
- `yarn game:join -- --help`
- `yarn game:prepare-commit -- --help`
- `yarn game:commit -- --help`
- `yarn game:reveal -- --help`
- `yarn game:claim -- --help`
- `yarn game:refund -- --help`
- `yarn game:withdraw-treasury -- --help`
- `yarn game:withdraw-cause -- --help`
- `yarn game:post-global -- --help`
- `yarn game:post-cause -- --help`

Typical local flow after auth:

1. on a fresh deployment, whitelist at least one cause first:
   - `yarn game:whitelist-cause -- --rpc-url localhost --game <PrisonersDAOlemma> --cause-id 1 --recipient <cause-recipient> --metadata-text "cause-alpha" --wallet-keystore <owner-keystore> ...`
2. run `yarn game:create -- --rpc-url localhost --game <PrisonersDAOlemma> --wallet-keystore <owner-keystore> ...`
3. run `yarn game:join -- --rpc-url localhost --game-id 1 --cause-id 1 --wallet-keystore <player-keystore> ...`
4. run `yarn game:advance -- --rpc-url localhost --game-id 1 --wallet-keystore <owner-keystore> ...` after the join window closes
5. run `yarn game:prepare-commit -- --rpc-url localhost --game-id 1 --choice share --wallet-keystore <player-keystore> ... --out commit-bundles/p1-r1.json`
6. run `yarn game:commit -- --rpc-url localhost --game-id 1 --input commit-bundles/p1-r1.json --wallet-keystore <player-keystore> ...`
7. run `yarn game:reveal -- --rpc-url localhost --game-id 1 --input commit-bundles/p1-r1.json --wallet-keystore <player-keystore> ...`
8. later, run the terminal path that applies onchain now:
   - `yarn game:claim -- ...`
   - `yarn game:refund -- ...`
   - `yarn game:withdraw-treasury -- ...`
   - `yarn game:withdraw-cause -- ...`
9. optional comms:
   - `yarn game:post-global -- ...`
   - `yarn game:post-cause -- ...`

## Local load / chaos / adversarial harness

The repo now includes a local load/chaos/adversarial harness under `packages/foundry/scripts-js/loadHarnessCli.js`.

Current boundary:

- local-only by design: it targets a fresh or existing local Anvil/dev chain and deploys a fresh mock ERC-8004 identity registry + `ERC8004AuthAdapter` + `PrisonersDAOlemma` stack for each run
- if you point it at an existing RPC instead of letting it spawn Anvil, that RPC still needs to be a local dev chain compatible with the selected mnemonic-derived owner/player accounts
- reuses the current repo-native auth/game/query surface instead of inventing a parallel benchmark API:
  - permissionless ERC-8004 self-registration via `authTooling.js`
  - gameplay writes via the gameplay action helpers already used by `gameCli.js`
  - evidence export via `queryTooling.js`
- supports a bounded but broader scenario set today:
  - `winner-all-share`: deterministic winner path, with optional missed commit / missed reveal chaos using configurable skip rates, followed by winner claims plus creator-fee/cause withdrawals when those pull-based balances are claimable
  - `cancelled-underfilled`: underfilled join window leading to cancel + refunds
  - `no-winner-all-catch`: deterministic no-winner round-one outcome leading to treasury/cause withdrawals
  - `adversarial-random`: seeded synthetic local breakage hunting across sequential games with randomized started-vs-underfilled game selection, random move choices, commit/reveal omissions, wrong-preimage probes, short phase-edge burst probes around late commit/reveal, `advancePhase`, claim/refund, and treasury/cause withdrawals, plus randomized settlement ordering
  - optional deterministic expected-failure injection for duplicate/invalid follow-up operations where practical
  - optional `--same-block-probes` mode for local dev RPCs that support `evm_setAutomine`, using short manual no-automine single-block batches to cover underfilled joining transitions, per-round last-commit/last-reveal vs `advancePhase` ordering in started games, and first-success-vs-loser duplicate settlement actions (`claim`, `refund`, `withdrawTreasury`, `withdrawCause`)
  - legacy `--auth-expiry-chaos` flags remain accepted for compatibility but are intentionally skipped under the live ERC-8004 admission model
  - one game or repeated sequential games on the same deployment, including mixed scenario plans
- writes machine-readable artifacts for each run:
  - `report.json` (including top-level `localScaleReadiness`, top-level `breakageSummary`, top-level `sameBlockSummary`, top-level `authChaos`, per-game `probes`, per-game `sameBlock`, per-game `authChaos`, per-game `breakageChecks`, and per-game `postRunOutstanding` drain checks)
  - `txs.jsonl`
  - per-game evidence export directories with `game-summary.json`, `roster.json`, `rounds.json`, `auth.json`, `payouts.json`, and `export-manifest.json`

For larger auto-mined local runs, the deployed commit/reveal block budgets matter: if you ask 32 or 64 wallets to each submit onchain commit/reveal txs, the default 10-block profile windows will time out. The harness now records that constraint explicitly in `report.json`, and you can raise `--commit-duration-blocks` / `--reveal-duration-blocks` when you want an honest local stress run with a larger phase budget.

Useful commands:

- `yarn load:harness -- --help`
- `yarn load:harness:smoke`

Example runs:

1. quick local winner-path smoke:
   - `yarn load:harness:smoke`
2. mixed sequential scenario run:
   - `yarn load:harness -- --profile smoke --player-count 12 --games 3 --scenario mixed --expected-failures`
3. one larger single-game winner-path run with explicit local phase budget:
   - `yarn load:harness -- --profile scale --player-count 64 --cause-count 8 --scenario winner-all-share --concurrency 16 --commit-duration-blocks 96 --reveal-duration-blocks 96`
4. max-player smoke-profile sequential drain check:
   - `yarn load:harness -- --profile smoke --player-count 32 --cause-count 8 --games 3 --scenario winner-all-share --concurrency 8 --commit-duration-blocks 48 --reveal-duration-blocks 48`
5. deterministic no-winner check:
   - `yarn load:harness -- --profile smoke --player-count 12 --scenario no-winner-all-catch`
6. same-block/no-automine winner-path contention probe on local Anvil:
   - `yarn load:harness -- --profile smoke --player-count 6 --cause-count 3 --scenario winner-all-share --same-block-probes --expected-failures`
7. adversarial many-game local breakage hunt:
   - `yarn load:harness -- --profile smoke --player-count 12 --cause-count 4 --games 8 --scenario adversarial-random --concurrency 6 --commit-duration-blocks 24 --reveal-duration-blocks 24 --skip-commit-rate 0.25 --skip-reveal-rate 0.25 --invalid-reveal-rate 0.15 --underfilled-rate 0.2 --probe-rate 0.6 --same-block-probes`
8. deprecated auth-expiry compatibility flags are still parsed but skipped under ERC-8004 admission:
   - `yarn load:harness -- --profile smoke --player-count 8 --cause-count 4 --games 3 --scenario winner-all-share --auth-expiry-chaos --auth-expiry-games all`

## Broader local soak matrix

For broader local breakage hunting across multiple seeds / profiles / scenario mixes, the repo now also includes `packages/foundry/scripts-js/loadHarnessMatrixCli.js`.

Useful commands:

- `yarn load:harness:matrix -- --help`
- `yarn load:harness:matrix:broader`
- `yarn load:harness:matrix:medium`
- `yarn load:harness:matrix:large`
- `yarn load:harness:matrix:xlarge`
- `yarn load:harness:matrix:parallel`
- `yarn load:harness:matrix -- --preset adversarial-smoke`
- `yarn load:harness:matrix -- --preset parallel-local --instance-concurrency 3`
- `yarn load:harness:matrix -- --preset broader-local --instance-concurrency 6`

Current built-in presets:

- `same-block-smoke`
  - one deterministic `mixed` pass (`winner-all-share`, `cancelled-underfilled`, `no-winner-all-catch`) with same-block probes enabled
- `adversarial-smoke`
  - three seeded `adversarial-random` sweeps on the smoke profile
- `auth-expiry-local` (deprecated compatibility preset)
  - retained only so old invocations do not hard-fail; under ERC-8004 admission the retired auth-expiry chaos path is skipped
- `medium-local`
  - one deterministic 16-player `mixed` pass on the scale profile plus two seeded 20-player `adversarial-random` sweeps, all with explicit 40/48-block phase budgets so larger local rounds do not fake-timeout
- `large-local`
  - one deterministic 24-player `mixed` pass plus one seeded 28-player `adversarial-random` sweep across two sequential games on the scale profile, with explicit 56/64-block phase budgets for honest higher-join local stress
- `xlarge-local`
  - one deterministic 32-player `mixed` pass plus three seeded started full-roster 32-player single-game `adversarial-random` sweeps on the scale profile, with explicit 72/80-block phase budgets; this stays an opt-in bounded bridge-to-bigger local proof rather than part of the default broader preset
- `parallel-local`
  - one same-block mixed-family pass, one seeded adversarial smoke sweep, and one larger scale-profile winner soak coordinated across isolated host-local harness + Anvil instances; defaults to instance concurrency 2 and can be raised explicitly when the machine can carry it
- `winner-scale`
  - two larger winner-path drain rehearsals on the scale profile with longer commit/reveal block budgets
- `broader-local`
  - combines the same-block smoke, adversarial smoke, and winner-scale coverage families into one bounded default local soak preset; deprecated auth-expiry compatibility runs may still appear in historical reports but no longer add live-path coverage

The matrix runner keeps the same honest boundary as the base harness: it is still local-dev only. By default it runs sequentially, but `--instance-concurrency > 1` now coordinates multiple isolated harness + Anvil instances in parallel on one host. That is useful for host-local infra breakage hunting only, not as a model of live mempool or distributed production behavior.

What it adds:

- one command that runs a small but broader set of local harness cases instead of a single seed/config
- optional bounded host-local multi-instance coordination via `--instance-concurrency`, reusing the same repo-native harness for each isolated fresh deployment instead of inventing a second benchmark path
- a top-level `matrix-report.json` plus `MATRIX_SUMMARY.md` that record:
  - the exact preset/runs/seeds exercised
  - aggregate tx / probe / same-block totals
  - aggregate unexpected failures
  - aggregate wedge / terminal / accounting / preview / drain / replay mismatch counts
  - execution mode, requested/effective instance concurrency, peak active runs observed, and explicit overlap pairs when runs actually overlap
  - per-run report paths plus per-run execution timestamps / Anvil ports so the detailed `report.json` + `txs.jsonl` artifacts stay auditable
- repeated local coverage over:
  - deterministic same-block ordering families
  - seeded adversarial-random breakage hunting
  - deterministic medium-scale mixed families on the scale profile
  - medium-scale seeded adversarial sweeps on the scale profile with longer phase budgets
  - larger 24-player mixed-family and 28-player adversarial scale-profile sweeps with explicit higher local block budgets
  - bounded 32-player mixed-family plus multi-seed started full-roster 32-player adversarial scale-profile sweeps with explicit 72/80-block phase budgets
  - historical auth-expiry sweeps remain archived, but the live ERC-8004 path no longer depends on verifier-era pre-join expiry rehearsal
  - larger winner-path drain/replay rehearsals on the scale profile
  - bounded host-local parallel overlap across isolated harness + Anvil instances when `--instance-concurrency` is raised above 1

What this harness honestly proves today:

- the current contracts + auth/game/query helpers can drive repeated local multi-wallet flows without manual keystore setup
- the repo can emit structured run reports including scenario type, terminal outcome/path, expected-vs-unexpected failure counts, probe counts, tx counts, gas totals, timing/block summaries, tx hotspots, resulting game state, and breakage-oriented summaries (`breakageSummary`, per-game `breakageChecks`)
- the matrix runner can now coordinate multiple fresh harness + Anvil deployments in parallel on one host and record whether overlap really happened (`execution.peakActiveRuns`, `execution.overlappingRunPairs`, per-run start/finish timestamps, per-run Anvil ports)
- the harness can now exercise three concrete local settlement families on the current codebase, plus a seeded adversarial-random mode that deliberately mixes valid and invalid local behavior aimed at surfacing wedge/state/accounting bugs:
  - winner claims plus creator-fee/cause withdrawals after those claims route funds
  - cancelled-game refunds
  - no-winner treasury/cause routing
  - randomized local invalid-path / wrong-preimage / phase-edge burst probes with explicit accounting of whether they became mined onchain reverts, stayed local rejections, or succeeded unexpectedly
  - optional same-block/no-automine single-block probes that record the exact batch label, block number, and per-tx order for:
    - `advancePhase` before/final-after the last commit in a started round block
    - `advancePhase` before/final-after the last reveal in a started round block
    - duplicate same-block `claim`, `refund`, `withdrawTreasury`, and `withdrawCause` attempts after the first success
  - retired auth-expiry compatibility flags are explicitly skipped, making it clear that current local validation no longer depends on verifier-issued permits or hybrid admission behavior
- per-game evidence exports now let us assert whether the harness actually drained treasury/cause/refund obligations to zero for the paths it executed and whether preview/claimable/export views stayed consistent
- deterministic duplicate/invalid follow-up attempts and adversarial probes are accounted for separately instead of getting mixed into normal tx failures

What it intentionally does **not** claim yet:

- live-network realism, mempool behavior, or independent-agent network jitter
- cross-wallet public mempool ordering games or fee-bid competition; the current same-block mode is intentionally deterministic and usually sequences one caller wallet inside one manually mined local block
- historical verifier-era wrapper flows beyond the current live ERC-8004 path
- mid-game identity loss / transfer edge cases beyond the current bounded local coverage
- proof of exploitable contract bugs just because adversarial local probes did not break a given run
- exhaustive fuzzing, distributed-agent realism, or heavier 11+ host saturation just because bounded host-local runs reached 10 overlapping isolated instances on one machine
- that 250-player scale is already CI-proven just because the harness exists

## CLI evidence/query tooling

The repo includes CLI-first evidence/query tooling under `packages/foundry/scripts-js/queryCli.js`.

Current boundary:

- exports only what the current contracts actually expose onchain
- supports game summary, roster, cause/team, auth, round-context, per-game settlement/payout export, and optional `GameChat` message export
- aligns with `REPLAY_SPEC.md` where possible without inventing missing resolution/payout data
- surfaces eliminations, terminal outcomes, settlement snapshots, claim/refund previews, winner-claim/refund/withdrawal events, and per-game payout routing only when those paths exist onchain for the selected game/block range
- keeps message-time liveness honest: cause-chat messages are marked alive from the onchain post gate, while global-message liveness is derived from elimination timing when available and otherwise left null

Useful commands:

- `yarn query -- --help`
- `yarn query:summary -- --help`
- `yarn query:auth -- --help`
- `yarn query:messages -- --help`
- `yarn query:export -- --help`

Typical local flow after deployment:

1. run `yarn query:summary -- --rpc-url localhost --game-id 1`
2. run `yarn query:messages -- --rpc-url localhost --game-id 1 --chat <GameChat>`
3. run `yarn query:export -- --rpc-url localhost --game-id 1 --chat <GameChat> --out exports/game-1`
4. inspect:
   - `game-summary.json`
   - `roster.json`
   - `causes.json`
   - `rounds.json`
   - `auth.json`
   - `payouts.json`
   - `messages.jsonl` when chat is configured
   - `export-manifest.json` for any intentionally skipped artifacts

## Judge evidence packaging

The repo also includes a small judge-facing packaging helper under `packages/foundry/scripts-js/judgeEvidenceCli.js`.

Current boundary:

- it does **not** create new proof; it only indexes an artifact bundle that already exists
- it supports local load-harness bundles, compact local proof packs, and Base Sepolia canary / public-run bundles
- it writes a compact human guide plus a machine-readable index:
  - `JUDGE_README.md`
  - `judge-evidence-index.json`
- it highlights missing artifacts instead of pretending the bundle is complete

Useful commands:

- `yarn judge:evidence -- --help`
- `yarn judge:evidence -- --bundle load-harness/<actual-run-dir>`
- `yarn judge:evidence -- --bundle proof/local/20260316-250-player-single-game-proof`
- `yarn judge:evidence -- --bundle proof/local/20260316-xlarge-matrix-proof-pack`
- `yarn judge:evidence -- --bundle proof/local/20260316-parallel-local-proof-pack`
- `yarn judge:evidence -- --bundle canary/base-sepolia/<run-id>`

Current preserved local bundles:

- `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
  - copied full single-run `report.json` + `txs.jsonl` + per-game evidence export from a clean 250-player single-game winner-path run
  - generated `JUDGE_README.md` + `judge-evidence-index.json`
  - `artifact-manifest.json` copied-file hash manifest for the preserved bundle
- `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`
  - copied full raw matrix directories from the latest validated xlarge-local and 32-player adversarial multi-seed run set
  - includes top-level `matrix-report.json` + `MATRIX_SUMMARY.md`, per-run `report.json` / `txs.jsonl`, and per-game evidence exports for all 7 completed games
  - `artifact-manifest.json` copied-file manifest with source-path mapping, byte counts, and SHA-256 hashes
- `packages/foundry/proof/local/20260316-xlarge-matrix-proof-pack/`
  - copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the same latest validated xlarge-local and 32-player adversarial multi-seed runs for quick review
  - `local-proof-pack.json` manifest with source paths, byte counts, and SHA-256 hashes
  - generated `JUDGE_README.md` + `judge-evidence-index.json`
- `packages/foundry/proof/local/20260316-parallel-local-proof-pack/`
  - copied `matrix-report.json` + `MATRIX_SUMMARY.md` files from the original bounded 3-instance `parallel-local` validation plus stronger bounded 5-instance and 6-instance host-local saturation runs
  - `local-proof-pack.json` manifest with source paths, byte counts, SHA-256 hashes, and explicit overlap metrics
  - generated `JUDGE_README.md` + `judge-evidence-index.json`
- `packages/foundry/proof/local/20260316-host-local-saturation-c10-proof/`
  - copied raw `matrix-report.json` + `MATRIX_SUMMARY.md` plus per-run `report.json` / `txs.jsonl` from a one-off bounded custom 10-instance host-local saturation attempt

See `JUDGE_EVIDENCE.md` for the judge open-order, the current honest local-proof boundary, and the live canary packaging contract.

## Broader local integration smoke

Run:

```bash
yarn smoke:integration
```

What it currently proves end to end:

- permissionless ERC-8004 self-registration + status inspection for multiple wallets
- onchain admission through `ERC8004AuthAdapter`
- game creation plus auth-gated joins through the gameplay/operator CLI
- a multi-round winner path ending in finalized settlement plus winner claims through the gameplay/operator CLI
- a cancelled path ending in finalized settlement plus refunds through the gameplay/operator CLI
- a no-winner path ending in finalized settlement plus treasury/cause withdrawals through the gameplay/operator CLI
- `GameChat` global and cause-scoped posting through the gameplay/operator CLI inside the winner-path scenario
- evidence export via `queryCli export`, including `game-summary.json`, `roster.json`, `rounds.json`, `auth.json`, `payouts.json`, `messages.jsonl`, and `export-manifest.json` after those settlement flows

What it intentionally does **not** claim yet:

- Sepolia or mainnet behavior
- stress/load characteristics beyond this deterministic local smoke
- that one smoke run replaces the broader Foundry/unit/fuzz/testnet validation plan in `TEST_PLAN.md`

## Quick start

### 1. Install JS dependencies

```bash
corepack enable
node .yarn/releases/yarn-3.2.3.cjs install
```

### 2. Install Foundry libraries

```bash
cd packages/foundry
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git
forge install GNSPS/solidity-bytes-utils --no-git
cd ../..
```

### 3. Run tests

```bash
yarn test
```

### 4. Run broader local integration smoke

```bash
yarn smoke:integration
```

### 5. Run local chain

```bash
yarn chain
```

### 6. Start the frontend

```bash
yarn start
```

## Base deployment notes

- Base is the target launch chain
- Base Sepolia is the safe default for rehearsals
- copy `packages/foundry/.env.example` to `.env` when needed
- deployment currently creates a fresh `ERC8004AuthAdapter` + `PrisonersDAOlemma` + `GameChat` trio per run, with the adapter pointed at the configured ERC-8004 identity registry
- the Base mainnet deployment is live and verified, while the strongest public gameplay proof is the preserved Base Sepolia 32-player permissionless run at `packages/foundry/canary/base-sepolia/20260322-2319-base-sepolia-32p-permissionless-chat-retry5/`

## Base Sepolia canary readiness

Repo-native canary references:

- `SEPOLIA_CANARY_RUNBOOK.md`
- `SEPOLIA_CANARY_CHECKLIST.md`
- `JUDGE_EVIDENCE.md`
- `yarn canary:preflight -- --help`
- `yarn canary:deployment -- --help`
- `yarn judge:evidence -- --help`
- `yarn game:whitelist-cause -- --help`
- `yarn verify -- --help`

Suggested operator flow:

1. copy `packages/foundry/.env.example` to `.env` and set explicit `PRISONERS_OWNER`, `PRISONERS_TREASURY`, `ERC8004_IDENTITY_REGISTRY`, plus `BASESCAN_API_KEY`
2. run `yarn canary:preflight -- --rpc-url baseSepolia --deployer-keystore <name|path>`
3. deploy with `yarn deploy -- --network baseSepolia --keystore <name|path>`
4. inspect the deployed wiring with `yarn canary:deployment -- --rpc-url baseSepolia`
5. verify contracts with `yarn verify -- --network baseSepolia`
6. whitelist the live canary causes before calling `createGame()`
7. run auth/game/query flows and capture artifacts exactly as described in the runbook/checklist
8. run `yarn judge:evidence -- --bundle canary/base-sepolia/<run-id>` once the live artifact directory is populated
