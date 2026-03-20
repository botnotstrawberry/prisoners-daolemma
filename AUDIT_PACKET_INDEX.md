# Prisoners DAOllema Audit Packet Index

Date: 2026-03-20 UTC
Repo: `/root/projects/prisoners-daollema`

## Purpose

Provide one place that points auditors/operators at the current audit-readiness notes and the strongest available local evidence bundles.

## Current code provenance

- **Current HEAD:** `2474e2fa6591196dcd0c54e8490fcfcd6dedeb39`
- **Important note:** the working tree is still dirty, so this is a **provenance reference**, not yet a finalized audit-freeze commit.

## Core audit/readiness notes

- `AUDIT_BLOCKERS.md`
- `AUDIT_READINESS.md`
- `AUDIT_FREEZE_CANDIDATE.md`
- `SCALING_STRATEGY.md`
- workspace shortlist note: `/root/.openclaw/workspace/PRISONERS_DAOLLEMMA_AUDIT_SKILLS.md`

## Latest broad validation bundle

- `.mainnet-readiness/20260320T001239Z-production-gates/`

This bundle includes:
- `01-yarn-test.log`
- `02-yarn-next-check-types.log`
- `03-yarn-smoke-integration.log`
- `04-yarn-auth-expiry.log`
- `05-production-size-check.log`
- `git-commit.txt`
- `git-status.txt`
- `git-diffstat.txt`
- `foundry-profile.txt`

## Latest bounded-v1 targeted audit bundle

- `.mainnet-readiness/20260320T002341Z-bounded-v1-audit-targets/`

This bundle captures targeted Forge evidence for:
- `testJoinAccepts256PlayersAndRejects257th`
- `testPostJoinRevokedOrExpiredAuthDoesNotBlockGameplayOrClaims`
- `testWinnerCanRedirectPrizeWithClaimTo`
- `testThirdPartyCanTriggerWinnerClaimForWinnerAddress`
- `testHighCardinalityNoWinnerSettlementRoutesAcrossCauses`

Files:
- `README.txt`
- `forge-test.log`
- `git-commit.txt`
- `git-status.txt`

## Earlier preserved evidence of interest

- winner-path local scale proof:
  - `packages/foundry/proof/local/20260316-250-player-single-game-proof/`
- auth-expiry matrix proof:
  - `packages/foundry/proof/local/20260316-auth-expiry-matrix-proof/`
- xlarge adversarial raw proof bundle:
  - `packages/foundry/proof/local/20260316-xlarge-matrix-raw-proof/`
- live Base Sepolia canary:
  - `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/`

## Current bounded-v1 statements supported by the latest work

- v1 remains bounded at hard `maxPlayers <= 256`
- the current tree has deterministic evidence for exact `256` join acceptance and `257th` rejection
- post-join auth semantics are now explicit in tests: admission is gated, ongoing gameplay is not re-gated in v1
- winner payout recovery is improved with `claimTo(...)` and `claimFor(...)`
- high-cardinality no-winner routing now has a deterministic 128-player multi-cause test on the current tree

## Remaining gap before a true audit-freeze handoff

- choose and record the exact **final** audit candidate commit after deciding what to commit from the dirty tree
- keep the audit packet tied to that exact frozen commit rather than to a moving worktree
