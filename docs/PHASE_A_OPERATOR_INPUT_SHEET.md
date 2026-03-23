# Phase A Operator Input Sheet

**Date:** 2026-03-23 UTC  
**Purpose:** collect the exact operator-controlled inputs needed before the first Base mainnet deployment/run on the permissionless ERC-8004 launch line.

Fill this in before final preflight / deploy / run steps.

---

## 1. Core deployment/control addresses

### 1.1 Deployer wallet
**Definition:** the Base wallet that will actually spend gas to deploy the contracts on Base mainnet.

- Address: `<fill>`
- Do you control it right now? `<yes/no>`
- Is it funded with Base ETH for deploy + verify + setup + live operations? `<yes/no>`
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

### 1.4 Identity registry address (`ERC8004_IDENTITY_REGISTRY`)
**Definition:** the deployed ERC-8004 / ERC-721 identity registry contract that the live deployment will trust for permissionless admission.

This is **not** a verifier key and it is **not** a player wallet. The live path checks token ownership in this registry through `ERC8004AuthAdapter`.

Important:
- this address must point to deployed contract code on Base mainnet,
- it must be the intended registry for the wallets that will join,
- a wrong registry here will break live admission.

- Address: `<fill>`
- Does it have deployed contract code on Base mainnet? `<yes/no>`
- Is it the intended player identity registry? `<yes/no>`
- Notes: `<fill>`

---

## 2. First-game economic / timing parameters

### 2.0 Timing guardrail reminder
The current mainnet preflight enforces these minimums:
- `maxPlayers <= 8`: join `>=300s`, commit `>=60`, reveal `>=60`
- `9 <= maxPlayers <= 32`: join `>=300s`, commit `>=120`, reveal `>=120`
- `maxPlayers > 32`: join `>=600s`, commit `>=320`, reveal `>=320`

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

For the first mainnet run, this should match the intended live roster plan and the timing guardrails above.

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
- ERC-8004 identity ready? (`yes/no`)
- funded for gas + entry? (`yes/no`)
- intended cause (if known)

Template:

1. Agent: `<fill>`  
   Wallet: `<fill>`  
   Identity ready: `<yes/no>`  
   Funded: `<yes/no>`  
   Intended cause: `<fill>`

2. Agent: `<fill>`  
   Wallet: `<fill>`  
   Identity ready: `<yes/no>`  
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

Suggested current answer:
- before mainnet success: primary proof = Base Sepolia `20260322-2319-base-sepolia-32p-permissionless-chat-retry5`
- after clean mainnet success: primary proof = Base mainnet first-run proof, with Sepolia retained as secondary rehearsal evidence

- Confirmed? `<yes/no>`

### 5.3 Publish intent
**Definition:** whether the first mainnet run should be published to the public site/judge path immediately after success.

- Publish immediately if clean? `<yes/no>`
- Any holdback conditions? `<fill>`

---

## 6. Final lock line

When everything above is decided, write one lock statement:

> First Base mainnet run will use owner `<address>`, treasury `<address>`, identity registry `<address>`, parameters `<join/commit/reveal/min/max/entry>`, cause list `<summary>`, and target roster `<n>` on the frozen contract candidate `<commit>`.
