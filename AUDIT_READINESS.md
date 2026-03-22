# AUDIT READINESS: Prisoners DAOlemma permissionless-auth cutover

**Date:** 2026-03-22  
**Status:** Working audit-readiness note for the ERC-8004 admission migration

---

## 1. Contract set in current live scope

Primary contracts under review:
- `packages/foundry/contracts/ERC8004AuthAdapter.sol`
- `packages/foundry/contracts/PrisonersDAOlemma.sol`
- `packages/foundry/contracts/GameChat.sol`

Local/mock support used for tests and harnesses:
- `packages/foundry/contracts/mocks/MockAgentIdentityRegistry.sol`

Historical verifier-era auth code is archived under:
- `packages/foundry/legacy/`

It is not part of the live deployment path.

---

## 2. What changed in this migration

Auth/admission changed from a verifier-issued permit model to a permissionless ERC-8004 ownership model.

Old live assumptions removed:
- verifier signer key
- onchain permit registration
- permit expiry / nonce replay handling in the live path
- hybrid verifier/ERC-8004 admission branching

New live assumptions:
- deployment wires `ERC8004AuthAdapter` to the intended ERC-8004 identity registry
- a wallet is authorized iff it owns at least one identity token
- `PrisonersDAOlemma` only depends on the adapter interface (`isAuthorized`, `agentKeyOf`)

---

## 3. Primary audit questions

### Admission / identity
- Does `ERC8004AuthAdapter` correctly reject a zero registry address?
- Does it correctly reject zero-address wallets?
- Does it authorize only wallets with `balanceOf(wallet) > 0`?
- Is the derived agent key deterministic and collision-resistant enough for per-game uniqueness?
- Are there unsafe assumptions about ERC-8004 registry behavior beyond ERC-721 ownership semantics?

### Game integration
- Can an unauthorized wallet join or launch?
- Can a joined player bypass duplicate-wallet or duplicate-agent-key protections?
- Does post-join identity loss incorrectly wedge gameplay, claims, or settlement?
- Does the migration accidentally weaken any existing payout / settlement invariants?

### Tooling / operator safety
- Do deploy scripts require the intended `ERC8004_IDENTITY_REGISTRY` input?
- Do runbooks/scripts still assume verifier-era admission anywhere in the live path?
- Do query/export artifacts accurately describe ERC-8004 admission status?

---

## 4. Key tests expected before/after audit fixes

Foundry:
- `forge build`
- `forge test`

JS / local tooling:
- `node --test scripts-js/*.test.js`
- local integration smoke
- load harness smoke / matrix runs required by the current validation plan

Live rehearsal:
- Base Sepolia deployment using `ERC8004_IDENTITY_REGISTRY`
- self-registration of all rehearsal wallets on the live ERC-8004 registry
- 32-player game execution without any verifier involvement
- exported evidence bundle + verification artifacts

---

## 5. Operator config that must now exist

Required live deploy/run inputs:
- `PRISONERS_OWNER`
- `PRISONERS_TREASURY`
- `ERC8004_IDENTITY_REGISTRY`
- `BASESCAN_API_KEY` when explorer verification is required

Base Sepolia registry locked for current rehearsal:
- `0x7177a6867296406881E20d6647232314736Dd09A`

---

## 6. Out-of-scope / legacy notes

Not part of the live audit target anymore:
- verifier signer assumptions
- SIWA live admission semantics
- permit expiry / nonce replay protections in the live path
- contract/EIP-1271 verifier compatibility

If historical files still mention those behaviors, they should be treated as legacy/archive context only.
