# Next 24 Hours — Mainnet Readiness Test Plan

Date: 2026-03-19 UTC
Repo: `/root/projects/prisoners-daolemma`

> For any claim about the eventual public `256`-player target, read `MAINNET_256_READINESS.md` too. This file is mainly about the near-term tiny-canary/mainnet path.

## Purpose

Turn the current Sepolia evidence into a real go/no-go process for a Base mainnet deployment in the next ~24 hours.

This plan is intentionally stricter than “the canary worked once.”

## Current evidence baseline

Already proven on Base Sepolia:
- deploy + verify
- auth-gated join flow
- global + cause chat
- winner path with claims + treasury + cause withdrawals
- no-winner routing path
- cancelled/refund path
- fast-follow 5-player full-roster smoke under `120s / 40 / 40`

Already proven locally:
- 250-player single-game proof
- broader local matrix coverage
- multi-seed adversarial coverage
- host-local saturation through 10 overlapping instances

Still important/open:
- production-profile local revalidation has not yet been re-run after formalizing the production compile profile
- mid-game / broad auth-expiry behavior is still not deeply proven
- mainnet deploy path should not rely on the repo's unoptimized default Foundry profile

## Hard constraints / lessons from Sepolia

### 1) Production compile profile is mandatory
The current contract is not deployable with the default Foundry profile.

Required production compile mode:
- `optimizer = true`
- `optimizer_runs = 200`
- `via_ir = true`

Operational rule:
- any public deploy or verify command must run with `FOUNDRY_PROFILE=production`
- do not rely on implicit defaults

### 2) The old canary timing profile is not good for rapid live iteration
Observed live:
- `900s / 20 / 20` is too slow for iterative testing
- `20`-block commit/reveal windows are fragile for serial multi-wallet CLI ops

Working follow-on test profile already applied on Sepolia:
- join `120s`
- commit `40` blocks
- reveal `40` blocks

### 3) Fresh rehearsal matters more than squeezing more out of a reused canary deployment
The current Sepolia deployment is valuable evidence, but it is **not** a pristine fresh deployment anymore.
Before mainnet, we should prove the launch procedure once more from a fresh Sepolia deployment using the production profile.

## Go / no-go structure

This plan has three tiers:
- **Tier 1 — MUST PASS before mainnet deploy**
- **Tier 2 — SHOULD PASS if time permits before mainnet deploy**
- **Tier 3 — Mainnet launch-day constraints**

---

# Tier 1 — MUST PASS before mainnet deploy

## T1. Freeze the launch candidate commit
Pick a single exact commit for the mainnet candidate.

Why:
- all tests, rehearsals, deploys, and evidence need to refer to one immutable launch candidate

Required output:
- record the commit hash in operator notes / launch notes

## T2. Re-run core local validation under the production profile
Run the important local gates with the same compile mode required for public deploy.

Recommended commands:

```bash
cd /root/projects/prisoners-daolemma
export FOUNDRY_PROFILE=production

yarn test
yarn next:check-types
yarn smoke:integration
yarn workspace @prisoners-daolemma/foundry load:harness:auth-expiry
```

Pass criteria:
- all commands exit 0
- no new failing assertions / invariant breaks / integration mismatches

Why this is mandatory:
- we already know deployment behavior changes materially between default and production compile profiles
- behavior must be revalidated under the deployable build, not just the dev build

## T3. Enforce the contract-size gate on the launch candidate
Run the size audit on the launch candidate under the production profile.

Recommended command:

```bash
cd /root/projects/prisoners-daolemma/packages/foundry
FOUNDRY_PROFILE=production forge build --sizes --skip test
```

Current known size:
- `PrisonersDAOlemma` runtime ≈ `19,809 B`
- margin to EVM limit ≈ `4,767 B`

Pass criteria:
- `PrisonersDAOlemma` runtime stays below `24,576 B`
- no unexpected size regression from the validated canary build

Operational rule:
- if size regresses materially, stop and reassess before mainnet

## T4. Fresh Sepolia dress rehearsal from a new deployment
Do **one fresh deployment** to Base Sepolia using the exact intended public-deploy profile.

Important:
- use a **new** Sepolia deployment, not the already-exercised canary deployment
- use `FOUNDRY_PROFILE=production`
- capture a fresh run bundle

Minimum rehearsal scope:
1. preflight
2. deploy
3. verify
4. whitelist causes
5. auth 3–5 players
6. create one game
7. run one clean winner-path game end to end
8. export evidence

If time permits, also include:
- one no-winner game
- one cancelled/refund game

Pass criteria:
- deploy/verify succeed with the production profile
- no script-path surprises
- no artifact-path surprises
- one clean end-to-end game succeeds on a fresh deployment

Why this matters:
- Sepolia canary proved the system works
- a fresh deployment proves the launch procedure itself works cleanly

## T5. Final deploy-path sanity check
Before mainnet, explicitly confirm that the command actually used for deployment inherits the production profile.

Conservative recommendation:
- either use `FOUNDRY_PROFILE=production yarn deploy ...`
- or call `FOUNDRY_PROFILE=production forge script ... --broadcast` directly

Do **not** assume the default wrapper is safe without the environment set.

Also confirm:
- `packages/foundry/deployments/` exists before deploy
- BaseScan / explorer verification key is present
- keystore + password path are valid

Why this matters:
- the first Sepolia deploy attempt exposed both compile-profile drift and a small packaging issue (`deployments/` write target)

## T6. Mainnet parameter lock before deployment
Before mainnet, decide and write down the exact launch parameters.

Recommended initial mainnet stance:
- low stake
- invited / known participants only
- single active game only
- explicit monitoring window

My recommendation for the **first mainnet canary** is more conservative than the fast-follow Sepolia test profile.

Suggested initial mainnet canary profile:
- join `300s` or `600s`
- commit `60` blocks
- reveal `60` blocks
- min players `3`
- low entry fee
- tiny-canary roster only

Rationale:
- gives enough operational slack without returning to an overly slow 15-minute join
- keeps the game human-observable during the first real-money run
- avoids the fragility of 20-block live rounds
- should not be mistaken for a public-scale timing profile

Pass criteria:
- owner / treasury / verifier / cause recipients independently verified
- final launch parameter sheet written down before broadcast

---

# Tier 2 — SHOULD PASS if time permits before mainnet deploy

## T7. Representative broader local load under production profile
Do at least one meaningful broader/local stress run under the production profile.

Recommended commands:

```bash
cd /root/projects/prisoners-daolemma
export FOUNDRY_PROFILE=production

yarn load:harness:matrix:broader
yarn load:harness:matrix -- --preset broader-local --instance-concurrency 6
```

If time still allows:

```bash
yarn load:harness:matrix:xlarge
```

Why:
- the code is already locally strong, but production-profile confirmation on a representative stress slice would further reduce launch risk

## T8. One more auth-focused Sepolia rehearsal
Because auth remains one of the less-proven live surfaces, run one short fresh rehearsal focused on:
- permit issue
- register
- authorized join
- expired permit / stale bundle rejection if feasible

Why:
- the repo still honestly notes that auth-expiry realism is not fully exhausted

## T9. Screenshots / reviewer polish
Optional for launch safety, helpful for submission/judging:
- add screenshots under `screenshots/`
- add short tx-hash narrative in `operator-notes.md`
- curate a cleaner conversation log if submission polish matters

---

# Tier 3 — Mainnet launch-day constraints

## T10. Mainnet canary only — not a broad public launch
The first Base mainnet deployment should be treated as a canary/pilot, not a scale launch.

Recommended shape:
- 3–5 invited players
- low stake only
- one game at a time
- direct monitoring throughout
- explicitly **not** the `256`-player public target profile

## T11. Mainnet pause criteria
Pause immediately if any of the following happen:
- deployment/verification mismatch
- auth admission failures for legitimate players
- timing surprises during commit/reveal
- replay/export disagreement with onchain state
- any stuck payout or withdrawal path
- any unexpected revert in the live game path
- the roster/timing combination is materially larger than what Sepolia actually proved

## T12. Mainnet evidence capture from the first live run
For the first mainnet run, preserve the same artifact structure as the Sepolia bundle:
- preflight summary
- deployment summary
- deployments file
- verify log
- operator notes
- auth artifacts
- query summary
- query export
- screenshots if possible

---

# Recommended execution order in the next 24 hours

## Highest-priority path

1. Freeze launch candidate commit
2. Re-run local gates under `FOUNDRY_PROFILE=production`
3. Run production-profile size audit
4. Fresh Sepolia deploy rehearsal from a new deployment
5. Verify exact mainnet deploy command/profile
6. Lock mainnet parameters + addresses
7. Launch mainnet canary only if all above are green

## If we are forced to cut scope
The minimum acceptable cut line before mainnet is still:
- T1
- T2
- T3
- T4
- T5
- T6

I would **not** skip the fresh Sepolia rehearsal if mainnet is within ~24 hours.

---

# Bottom line

The project is now far past “untested.”

But the next 24 hours should focus on one thing:

> **turning the proven Sepolia canary into a clean, production-profile, fresh-deployment launch rehearsal — and only then doing a tightly scoped mainnet canary.**

That is the safest comprehensive path from here.
