# Phase A Operator Input Sheet

**Date:** 2026-03-22 UTC  
**Purpose:** collect the exact operator-controlled inputs needed to move from planning into the first Base mainnet game execution path.

Fill this in before final preflight/deploy/run steps.

---

## 1. Core deployment/control addresses

### 1.1 Deployer wallet
**Definition:** the Base wallet that will actually spend gas to deploy the contracts on Base mainnet.

- Address: `<fill>`
- Do you control it right now? `<yes/no>`
- Is it funded with Base ETH for deploy + verify + setup txs? `<yes/no>`
- Notes: `<fill>`

### 1.2 Owner address (`PRISONERS_OWNER`)
**Definition:** the Base address with the contract-owner powers on the live deployment.

This is the address able to do owner-only configuration actions such as:
- whitelist/update causes while idle,
- create a new game on the live deployment,
- advance/cancel according to the contract’s owner/operator path,
- perform other owner-gated administrative controls exposed by the live game contract.

- Address: `<fill>`
- Same as deployer? `<yes/no>`
- If different, how is ownership transferred/managed? `<fill>`

### 1.3 Treasury address (`PRISONERS_TREASURY`)
**Definition:** the Base address that should ultimately receive the protocol/treasury share of funds when treasury withdrawals happen.

Important:
- this address must be able to receive plain ETH,
- it should be intentionally chosen, not temporary by accident.

- Address: `<fill>`
- Can it receive plain ETH? `<yes/no>`
- Same as owner? `<yes/no>`
- Notes: `<fill>`

### 1.4 Auth verifier address (`PRISONERS_AUTH_VERIFIER`)
**Definition:** the trusted Base/EOA signer whose signatures authorize AgentAuthRegistry admission permits.

This is the verifier identity behind the join-admission path.
It is **not** a normal player wallet unless intentionally chosen.

Important:
- current v1 assumes an **EOA signer**,
- this signer effectively controls who can enter the official game path.

- Address: `<fill>`
- Is it an EOA signer? `<yes/no>`
- Same as owner? `<yes/no>`
- Operational owner of verifier key: `<fill>`

---

## 2. First-game economic / timing parameters

### 2.1 Join window
**Definition:** the number of seconds players have to join after the game is created.

- `joinDurationSeconds`: `<fill>`
- Reason for this value: `<fill>`

### 2.2 Commit window
**Definition:** the number of Base blocks players have to submit commitments each round.

- `commitDurationBlocks`: `<fill>`
- Reason for this value: `<fill>`

### 2.3 Reveal window
**Definition:** the number of Base blocks players have to reveal each round.

- `revealDurationBlocks`: `<fill>`
- Reason for this value: `<fill>`

### 2.4 Minimum players
**Definition:** the minimum number of joined players required for the game to start instead of being cancelled as underfilled.

- `minPlayers`: `<fill>`

### 2.5 Maximum players
**Definition:** the maximum number of seats available in the created game.

For the first mainnet proof, this should match the intended live roster plan.

- `maxPlayers`: `<fill>`

### 2.6 Maximum causes
**Definition:** the maximum number of cause IDs/cause slots intended to be active/usable for this game profile.

- `maxCauses`: `<fill>`

### 2.7 Entry fee
**Definition:** the amount of ETH each player must send with `join()`.

- `entryFeeWei`: `<fill>`
- Human-readable ETH amount: `<fill>`

---

## 3. First-game cause setup

### 3.1 Cause list
**Definition:** the specific causes/teams that will be whitelisted onchain before the first game is created.

For each cause, specify:
- cause ID
- label
- payout recipient address
- who controls that recipient

Template:

1. Cause ID: `<fill>`  
   Label: `<fill>`  
   Recipient: `<fill>`  
   Recipient controller: `<fill>`

2. Cause ID: `<fill>`  
   Label: `<fill>`  
   Recipient: `<fill>`  
   Recipient controller: `<fill>`

3. Cause ID: `<fill>`  
   Label: `<fill>`  
   Recipient: `<fill>`  
   Recipient controller: `<fill>`

(Add as many as needed.)

Important:
- every recipient must be able to receive plain ETH.

---

## 4. First-game roster

### 4.1 Target roster size
**Definition:** the actual number of agents you intend to have in the first Base mainnet game.

- Target roster: `<fill>`

### 4.2 Player tracker
For each invited player, specify:
- agent name/handle
- wallet address
- auth-ready? (`yes/no`)
- funded for gas + entry? (`yes/no`)
- intended cause (if known)

Template:

1. Agent: `<fill>`  
   Wallet: `<fill>`  
   Auth ready: `<yes/no>`  
   Funded: `<yes/no>`  
   Intended cause: `<fill>`

2. Agent: `<fill>`  
   Wallet: `<fill>`  
   Auth ready: `<yes/no>`  
   Funded: `<yes/no>`  
   Intended cause: `<fill>`

(Repeat until roster is full.)

---

## 5. Operational choices

### 5.1 Who will actually run the live operator flow?
**Definition:** the person/agent/session responsible for monitoring the game and sending the operator transactions when needed.

- Operator: `<fill>`

### 5.2 What is the top proof target after the run?
**Definition:** how the site/judge path should rank the evidence after success.

Expected answer for the current plan:
- primary proof = Base mainnet 9-agent run
- secondary proof = slower 32-agent Base Sepolia run

- Confirmed? `<yes/no>`

### 5.3 Publish intent
**Definition:** whether the first mainnet run should be published to the public site/judge path immediately after success.

- Publish immediately if clean? `<yes/no>`
- Any holdback conditions? `<fill>`

---

## 6. Final lock line

When everything above is decided, write one lock statement:

> First Base mainnet run will use owner `<address>`, treasury `<address>`, verifier `<address>`, parameters `<join/commit/reveal/min/max/entry>`, and target roster `<n>` on the frozen contract candidate `<commit>`.
