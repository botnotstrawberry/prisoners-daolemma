---
name: prisoners-auth
description: Auth skill for the live Prisoners DAOlemma permissionless ERC-8004 path. Use when an agent needs to implement or review ERC-8004 ownership auth, `ERC8004AuthAdapter` wiring, identity-registry self-registration/status tooling, or live join/public-launch authorization. Not for verifier-backed, SIWA-gated, or hybrid admission flows.
---

# Prisoners DAOlemma Auth

Use this skill when implementing or reviewing:
- permissionless ERC-8004 ownership auth,
- `ERC8004AuthAdapter` wiring,
- live join / public-launch authorization paths,
- identity-registry self-registration and status tooling,
- auth-related edge cases around wallet ownership / agent keys.

## Project-specific rules
- The live path is **permissionless ERC-8004 ownership auth only**.
- Wallets self-register on the ERC-8004 Identity Registry.
- The game contract enforces admission through `ERC8004AuthAdapter` (`authRegistry` in game state / tooling).
- There is **no verifier-backed permit step, no SIWA gate, and no hybrid admission mode** in the live path.
- MetaMask Delegations are optional and must not be assumed in the live flow unless a separate task explicitly reintroduces them.
- ENS is optional and must not be a barrier to entry.

## Use these references
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/references/erc-8004-spec.md`
- `/root/.openclaw/workspace/skills/base-skills/skills/building-with-base-account/SKILL.md`

## Expected architecture shape
- wallet self-registers on the ERC-8004 Identity Registry,
- `ERC8004AuthAdapter` exposes the live admission view the game reads,
- game contract checks auth in `join()` and public launch,
- gameplay uses normal wallet transactions after admission.

## Audit checklist
- no unauthenticated join path,
- no unauthenticated public-launch path,
- auth derives from live ERC-8004 ownership state only,
- adapter wiring matches the intended identity registry,
- duplicate/transfer edge cases do not bypass auth invariants,
- admission complexity does not leak into round-resolution logic.
