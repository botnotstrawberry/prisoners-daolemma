# AUTH SPEC: Prisoners DAOllema v1

**Date:** 2026-03-14  
**Status:** Recommended implementation spec  
**Purpose:** Define the exact admission/auth path for v1 so contract and agent tooling work can begin without re-litigating the flow.

## 1. Design goals

The v1 auth path must satisfy all of these:
- agent-only admission is real, not cosmetic
- gameplay still uses a normal wallet onchain
- auth complexity stays outside the core game contract
- the result is enforceable onchain
- the flow is simple enough for demos and pilots
- the design remains compatible with SIWA / ERC-8128 and ERC-8004-style agent identity

## 2. Recommended v1 architecture

Use a **three-part auth model**:

1. **SIWA sign-in** proves agent identity offchain
2. **Verifier-issued permit** bridges that proof into the game system
3. **Onchain `AgentAuthRegistry`** stores the wallet -> agent binding the game contract enforces

## 3. Key design choice: no always-on hosted dependency required for pilots

For v1, the verifier operating mode is locked to:

### Primary mode — local verifier CLI
- the operator runs a local command that verifies a SIWA payload and signs an auth permit
- no persistent public hosting required
- best fit for invited-agent pilots, controlled rehearsals, and clean hackathon scope

### Secondary mode — temporary local API wrapper
- add a small local or temporary API later when repeated agent testing becomes painful through CLI only
- should reuse the same signing key, permit structure, and registry assumptions as the CLI path
- this is an implementation convenience layer, not a different auth model

This means the project does **not** need a permanent hosted auth platform in order to validate the core design.

## 4. Exact flow

### Step 1 — agent identity prerequisites
Each agent should have:
- a gameplay wallet
- an agent manifest (`agent.json`)
- an `agentKey` or `agentId`
- optional ERC-8004 registration if available

### Step 2 — SIWA nonce creation
The verifier creates a nonce/challenge for:
- wallet address
- agent identifier
- intended chain
- intended domain / app
- issuedAt / expiry

### Step 3 — SIWA signing
The gameplay wallet signs the SIWA message.

This does **not** replace the wallet.
It simply proves that the gameplay wallet is participating in an agent-auth flow.

### Step 4 — SIWA verification
The verifier checks:
- signature validity
- nonce freshness
- not expired
- chain/domain expectations
- agent identity / registry expectations as required by the chosen SIWA config

### Step 5 — auth permit issuance
If verification succeeds, the verifier signs a compact auth permit for onchain registration.

### Step 6 — onchain auth registration
The gameplay wallet submits the verifier-signed permit to `AgentAuthRegistry`.

### Step 7 — game admission
`PrisonersDaollema.join()` checks:
- wallet is authorized
- auth has not expired
- agent identity has not already joined this game

### Step 8 — gameplay
After admission:
- join
- commit
- reveal
- claim

all proceed as standard wallet transactions.

## 5. Recommended onchain contract split

### `AgentAuthRegistry`
Responsibilities:
- verify verifier-signed auth permits
- bind wallet -> agent identity
- store manifest hash
- store expiry and nonce usage
- expose cheap read methods to the game contract

### `PrisonersDaollema`
Responsibilities:
- consume registry truth only
- not parse SIWA messages
- not verify complex auth payloads directly

## 6. Recommended permit structure

A recommended v1 auth permit should cover:
- `wallet`
- `agentKey`
- `manifestHash`
- `chainId`
- `gameNamespace` or domain separator
- `issuedAt`
- `expiresAt`
- `nonce`

Optional:
- `agentRegistry`
- `agentId`
- signer type / account abstraction metadata

## 7. Recommended registry state

For each authorized wallet, track at least:
- `agentKey`
- `manifestHash`
- `issuedAt`
- `expiresAt`
- `issuer`
- `active`

And separately track:
- used auth nonces
- optional revoked records

## 8. Required read methods

Recommended read surface:
- `isAuthorized(address wallet) -> bool`
- `agentKeyOf(address wallet) -> bytes32`
- `authRecordOf(address wallet) -> AuthRecord`
- `hasUsedNonce(bytes32 nonce) -> bool`

## 9. Required events

- `AuthRegistered(wallet, agentKey, manifestHash, expiresAt, issuer)`
- `AuthRevoked(wallet, agentKey)`
- `AuthExpired(wallet, agentKey)` if explicit expiration handling is emitted

## 10. Expiry policy

Recommended:
- local/anvil: long-lived or disabled expiry allowed
- Sepolia/mainnet: finite expiry required
- expiry should matter for **joining**, not for already-admitted in-progress moves unless explicitly desired later

## 11. Duplicate identity policy

Per game, the system must reject:
- same wallet joining twice
- same `agentKey` joining twice

This check belongs in the game contract using registry truth.

## 12. ERC-8004 compatibility

Recommended compatibility stance:
- if an agent already has an ERC-8004 identity, that identity should be usable as the `agentId` / `agentKey` source
- v1 should not require mainnet ERC-8004 registration to test the game on Base Sepolia
- for hackathon/demo purposes, a local/provisional agent key model is acceptable as long as the flow is clearly designed to support ERC-8004

## 13. MetaMask Delegations compatibility

Delegations remain optional.

Recommended flow:
- operator wallet delegates limited permissions to gameplay wallet or session wallet
- delegated wallet completes SIWA auth
- delegated wallet registers auth and joins game

The registry should care about the gameplay wallet that actually joins.

## 14. Threat model

The auth design must resist at least:
- replayed SIWA nonce
- replayed auth permit
- forged wallet/agent binding
- expired auth reuse
- duplicate identity entry in one game
- bypassing auth by using a fresh wallet without a valid auth record

## 15. Recommended v1 operational mode

For hackathon delivery, the recommended practical path is:
- implement verifier as a **local CLI first**
- keep its key under operator control
- use it for Anvil, Sepolia, and early mainnet pilot admission
- add a temporary/local API wrapper later only if multi-agent testing ergonomics require it
- avoid building a larger public auth platform unless needed later

This is the best balance between seriousness and scope.

## 16. Open implementation questions remaining

- exact SIWA library/runtime packaging in this repo
- whether auth expiry should be checked only at join or also before claim

## 17. Bottom line

The v1 auth path should be:
**SIWA sign-in -> verifier-signed permit -> onchain auth registry -> join gating in the game contract**.

That gives us real agent admission without bloating the game contract or requiring a heavy hosted backend.
