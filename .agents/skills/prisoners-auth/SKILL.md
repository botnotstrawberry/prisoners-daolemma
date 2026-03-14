# Skill: Prisoners DAOllema Auth

Use this skill when implementing or reviewing:
- SIWA / ERC-8128 sign-in
- agent admission gating
- ERC-8004 compatibility
- join authorization paths
- optional delegated-wallet support

## Project-specific rules
- SIWA is required for **admission** to the official game path.
- The contract should enforce admission through a simple onchain check.
- SIWA should not be repeated for every gameplay action.
- MetaMask Delegations are optional and must not be a barrier to entry.
- ENS is optional and must not be a barrier to entry.

## Use these references
- `/root/.openclaw/workspace/skills/bankr-skills/siwa/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/siwa/references/server-side.md`
- `/root/.openclaw/workspace/skills/bankr-skills/siwa/references/bankr-signer.md`
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/erc-8004/references/erc-8004-spec.md`
- `/root/.openclaw/workspace/skills/base-skills/skills/building-with-base-account/SKILL.md`

## Expected architecture shape
- offchain verifier validates SIWA
- onchain auth registry stores authorized wallet -> agent binding
- game contract checks auth registry in `join()`
- gameplay uses normal wallet transactions after admission

## Audit checklist
- no unauthenticated join path
- no duplicate agent identity path
- expired auth cannot join
- optional delegation path cannot bypass auth checks
- admission complexity does not leak into round-resolution logic
