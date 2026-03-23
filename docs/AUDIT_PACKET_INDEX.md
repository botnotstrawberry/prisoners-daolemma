# Prisoners DAOlemma Audit Packet Index

Date: 2026-03-20 UTC
Repo: `/root/projects/prisoners-daolemma`

## Purpose

Provide one place that points auditors/operators at the current audit-readiness notes and the strongest available local evidence bundles.

## Current code provenance

- **Chosen local audit-freeze candidate commit:** `f8e0555ca932b32fa61701402784f324c54ba08d`
- **Local tag:** `audit-freeze-candidate-20260320-mainnet-provenance`
- **Meaning:** this commit collects the bounded-v1 contract hardening plus the deploy/auth provenance fixes needed to support a clean internal audit-complete claim.
- **Important note:** this packet index may itself live in a follow-up docs commit; treat the hash above as the actual audited code target.

## Current audit outcome

Internal review of the **bounded-v1 contracts + deploy/auth boundary** is now complete on the candidate above.

Bottom line:
- no remaining code-security blocker was identified in the bounded-v1 contract set
- no remaining deploy/auth provenance blocker remains on the candidate above
- the repo now has clean candidate-pinned local validation bundles

This is **not** launch authorization.
Mainnet execution still requires separate operator confirmation and launch inputs.

## Core audit/readiness notes

- `AUDIT_BLOCKERS.md`
- `AUDIT_READINESS.md`
- `AUDIT_FREEZE_CANDIDATE.md`
- `SCALING_STRATEGY.md`
- workspace shortlist note: `/root/.openclaw/workspace/PRISONERS_DAOLLEMMA_AUDIT_SKILLS.md`

## Latest broad validation bundle

- `.mainnet-readiness/20260320T114449Z-production-gates/`

This bundle was generated on a clean tree for the current candidate and includes:
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

- `.mainnet-readiness/20260320T115420Z-bounded-v1-audit-targets/`

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

These are supportive evidence bundles, not the primary clean candidate-pinned audit artifacts.

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
- the current candidate has deterministic evidence for exact `256` join acceptance and `257th` rejection
- post-join auth semantics are explicit in tests: admission is gated, ongoing gameplay is not re-gated in v1
- winner payout recovery is improved with `claimTo(...)` and `claimFor(...)`
- high-cardinality no-winner routing has a deterministic 128-player multi-cause test on the current candidate
- mainnet-facing preflight/deploy/verify/gates scripts now enforce clean-tree provenance by default and support explicit commit pinning via `EXPECTED_GIT_COMMIT`
- the mainnet verifier input is now explicitly documented/acknowledged as an EOA-with-signing-key requirement (`PRISONERS_AUTH_VERIFIER_CONFIRM_EOA_SIGNER=true`)

## Accepted bounded-v1 limitations to say plainly

These are important to state clearly rather than hide:
- **hard safety boundary:** do not raise `maxPlayers` above `256` without redesign + re-audit
- **auth policy:** auth gates admission, not ongoing participation after join
- **payout recovery:** `claimTo` / `claimFor` materially improve recovery, but there is still no universal rescue path for every broken recipient setup
- **verifier model:** contract/EIP-1271 verifiers are not supported by the current `AgentAuthRegistry` ECDSA flow
- **preflight scope:** deploy preflight does not itself prove at least one cause has already been whitelisted onchain before `createGame()`

## Remaining work after audit completion

Remaining work is now mostly operator/handoff work, not an internal audit blocker:
- decide whether/when to push/share the candidate as the canonical external review target
- finalize operator-owned mainnet inputs separately from the code freeze
- keep sensitive submission/chat-log archives out of any audit bundle until explicitly sanitized
