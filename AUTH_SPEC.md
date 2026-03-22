# AUTH SPEC: Prisoners DAOlemma v1 admission

**Date:** 2026-03-22  
**Status:** Current live auth/admission design  
**Purpose:** Define the live admission path enforced by the contracts and supported by the repo tooling.

---

## 1. Bottom line

Prisoners DAOlemma v1 now uses **permissionless ERC-8004 ownership auth only**.

Live flow:
1. a wallet self-registers on the configured ERC-8004 Identity Registry
2. the wallet now owns at least one ERC-8004 identity token
3. `ERC8004AuthAdapter` reports that wallet as authorized
4. `PrisonersDAOlemma.join()` admits the wallet

There is:
- **no verifier-issued permit**
- **no SIWA-gated live admission path**
- **no hybrid mode**

Historical verifier-era tooling may remain under clearly marked legacy/archive paths, but it is not part of the live system.

---

## 2. Contract surfaces

### 2.1 `ERC8004AuthAdapter`
Responsibilities:
- hold the immutable ERC-8004 Identity Registry address
- expose `isAuthorized(address wallet) -> bool`
- expose `agentKeyOf(address wallet) -> bytes32`
- derive a deterministic agent key for each currently authorized wallet

Current rules:
- `isAuthorized(wallet)` is true iff `wallet != address(0)` and `identityRegistry.balanceOf(wallet) > 0`
- `agentKeyOf(wallet)` returns `bytes32(0)` when unauthorized
- otherwise `agentKeyOf(wallet)` returns a deterministic namespace-hashed key derived from the wallet address

### 2.2 `PrisonersDAOlemma`
Responsibilities relevant to admission:
- store the auth adapter address as `authRegistry`
- require `authRegistry.isAuthorized(msg.sender)` at join/launch admission boundaries
- snapshot/store the derived `agentKeyOf(msg.sender)` when a player joins
- enforce duplicate wallet and duplicate derived-agent-key protections inside a game

Important live behavior:
- admission is checked **at join time**
- once admitted, later loss/transfer of the ERC-8004 identity token does **not** retroactively eject an already joined player from an in-progress game

---

## 3. Why this model

This split keeps the game contract simple:
- the game only needs a cheap onchain admission check
- the identity registry remains the source of truth for ownership
- admission is portable and permissionless instead of verifier-mediated

It also avoids the operational burden of:
- verifier key custody
- verifier nonce/replay management
- permit expiry handling
- hybrid-mode branching in deployment/runbooks/tooling

---

## 4. Supported operator / wallet flow

### Self-registration
A wallet self-registers directly on the ERC-8004 Identity Registry:
- either by calling `register(string agentURI)` directly
- or by using `packages/foundry/scripts-js/authCli.js register`

### Admission inspection
Operators can inspect admission with:
- `authCli.js status`
- direct calls to the adapter / identity registry
- query/export evidence after a game is created and joined

### Join
After self-registration, the same wallet joins the game normally.

---

## 5. Tooling expectations

Current live auth tooling supports:
- `register`
- `status`

Current live auth tooling does **not** support:
- verifier-backed permit issuance
- verifier-backed permit registration
- SIWA-backed live admission

`authCli.js permit` is intentionally retired and should error if called.

---

## 6. Deployment expectations

Deployments must configure:
- `PRISONERS_OWNER`
- `PRISONERS_TREASURY`
- `ERC8004_IDENTITY_REGISTRY`

The deploy script then:
1. deploys `ERC8004AuthAdapter(identityRegistry)`
2. deploys `PrisonersDAOlemma(owner, treasury, adapter, defaultConfig)`
3. deploys `GameChat(game)`

Base Sepolia live registry used for current rehearsal work:
- `0x7177a6867296406881E20d6647232314736Dd09A`

---

## 7. Security / trust assumptions

The live model assumes:
- the configured ERC-8004 registry is the intended source of identity ownership
- ownership of at least one identity token is sufficient for admission
- the adapter’s deterministic derived agent key is only used for per-game uniqueness/accounting, not for offchain identity attestation quality

Out of scope for v1 admission:
- verifier provenance
- SIWA session proof semantics
- delegated or sponsored admission
- one-token-per-wallet guarantees at the registry layer

---

## 8. Test / audit focus for auth

Required focus areas:
- zero-address rejection / non-authorization
- authorization when wallet owns >= 1 identity token
- deterministic derived agent keys
- distinct authorized wallets produce distinct derived agent keys
- adapter constructor rejects zero registry address
- game join blocks unauthorized wallets
- loss of identity after join does not break already-admitted gameplay or claims
- duplicate-wallet and duplicate-derived-agent-key protections still hold inside a game

---

## 9. Historical note

Older repo materials may mention:
- SIWA
- verifier-issued permits
- `AgentAuthRegistry`
- auth expiry / nonce replay protection

Those describe the retired verifier-era design, not the current live path.
