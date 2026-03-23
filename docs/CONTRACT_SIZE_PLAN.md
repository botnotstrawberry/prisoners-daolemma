# Contract Size Plan

Date: 2026-03-18
Context: Base Sepolia canary deployment from commit `c75f63e`

## Why this exists

The first live Base Sepolia deployment attempt exposed a real deployability issue:
`PrisonersDAOlemma` does **not** fit under the EVM runtime code-size limit when built with the repo's default Foundry profile.

The successful live canary deploy used:

- `--optimize true`
- `--optimizer-runs 200`
- `--via-ir`

That compile configuration must become the explicit production/public-deploy baseline.

## Measured sizes

Measured with `forge build --sizes --skip test` variants on 2026-03-18.

### Default profile
- `PrisonersDAOlemma` runtime: **42,136 B**
- EVM runtime limit margin: **-17,560 B**
- Result: **not deployable**

### Optimized only (`optimizer=true`, `optimizer_runs=200`)
- `PrisonersDAOlemma` runtime: **25,456 B**
- EVM runtime limit margin: **-880 B**
- Result: **still not deployable**

### Optimized + via-IR (`optimizer=true`, `optimizer_runs=200`, `via_ir=true`)
- `PrisonersDAOlemma` runtime: **19,809 B**
- EVM runtime limit margin: **+4,767 B**
- Result: **deployable**

Audit artifact:
- `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/contract-size-audit.txt`

## What we need to do before a real deployment

### 1) Treat `production` compile settings as mandatory for live deploys
Done in config:
- `packages/foundry/foundry.toml` now includes `[profile.production]`

Expected usage pattern for live/public deploys:

```bash
FOUNDRY_PROFILE=production forge build
FOUNDRY_PROFILE=production forge script ... --broadcast
FOUNDRY_PROFILE=production forge script ... --verify
```

### 2) Re-run the important local validation under the production profile
Before any real deployment, confirm behavior under the same compile mode used onchain:

- core unit/integration tests
- smoke integration
- auth-expiry harness
- at least one representative load-harness / replay-consistency proof

Goal: prove the production compile mode is not only deployable, but still behaviorally correct.

### 3) Add a size gate to deployment readiness
At minimum, fail readiness if production runtime size is too close to the limit.

Suggested thresholds:
- hard fail if `PrisonersDAOlemma` runtime size > **24,576 B**
- warn if runtime margin < **1,500 B**
- preferred comfort margin: **3,000+ B**

Current measured production margin is **4,767 B**, which is acceptable but not enormous.

### 4) Ensure deploy + verify flows use the same compile profile
The canary showed that “build config drift” is a real risk.

Required rule:
- the exact same production settings must be used for:
  - build
  - deploy
  - verification

If script wrappers or package scripts shell out to `forge`, they should either:
- export `FOUNDRY_PROFILE=production`, or
- pass the equivalent compile flags explicitly and consistently.

### 5) Plan for future feature growth
The current production margin is enough to deploy, but future features can eat it quickly.

If more gameplay/admin logic is added, likely options are:
- move some non-core admin/config surfaces into helper contracts
- split optional logic from the main game contract
- keep chat separate (already done)
- avoid piling more logic into settlement/round-resolution paths without checking size impact

### 6) Keep canary evidence as proof of the issue
The live canary is important evidence that this is not hypothetical.

Relevant bundle:
- `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

Important files:
- `operator-notes.md`
- `deploy.log`
- `verify.log`
- `contract-size-audit.txt`

## Practical takeaway

For any real deployment, the working assumption should be:

> **Default Foundry profile is for local/dev work. `production` profile is for anything public or onchain.**

Until local validation is re-run under that profile and size gates are enforced, deployment readiness should be treated as conditional.
