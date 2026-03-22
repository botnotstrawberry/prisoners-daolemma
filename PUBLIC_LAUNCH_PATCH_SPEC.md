# Public Launch Patch Spec

**Date:** 2026-03-22 UTC  
**Status:** approved implementation spec  
**Scope:** narrow V1.1 patch to remove owner-presence as a prerequisite for starting the next official game on the canonical deployment.

---

## 1. Problem

Current V1 lets any authorized wallet **join** an existing game, but only the owner can:
- set game defaults,
- whitelist causes,
- create the next game.

That means the canonical deployment is not actually usable without owner presence.

---

## 2. Approved product decision

### Launch gate
Any wallet that is already **authorized to join** may also launch the next game.

In practice:
- the same onchain auth/admission checks used by `join()` must gate launch,
- no separate launcher allowlist is introduced.

### Anti-grief rule
The launcher must also **join the game in the same transaction** and pay the normal entry fee.

### Caller-controlled setting
Only **`joinDurationSeconds`** becomes caller-selected.

### Join-duration bounds
- minimum: **300 seconds**
- maximum: **3600 seconds**

### What remains fixed from defaults
The launcher does **not** choose:
- `commitDurationBlocks`
- `revealDurationBlocks`
- `minPlayers`
- `maxPlayers`
- `maxCauses`
- `entryFeeWei`
- fee bps
- treasury/auth config

### Cause model
Cause whitelist remains owner-managed.
The launcher must choose one already-whitelisted valid cause when launching.

---

## 3. Intended contract behavior

Add a new public launch function on `PrisonersDAOlemma`:

```solidity
function launchGameAndJoin(uint32 joinDurationSeconds, uint16 causeId)
    external
    payable
    returns (uint256 gameId)
```

Expected behavior:
1. require the contract is idle / no active game
2. require caller is admitted/authorized under the same rules as `join()`
3. require `300 <= joinDurationSeconds <= 3600`
4. copy current `defaultConfig`
5. override only `joinDurationSeconds`
6. create the game from that config snapshot
7. immediately join the caller into that new game
8. require normal entry fee payment
9. require a valid whitelisted cause

Atomicity requirement:
- if the join half fails, the game creation must also revert with it

---

## 4. Explicit non-goals for this patch

This patch does **not**:
- make arbitrary wallets able to set all game parameters
- make causes permissionless
- remove owner-only treasury/auth/admin controls
- change settlement logic
- change rescue logic
- change one-active-game discipline

---

## 5. Implementation notes

### Recommended refactor
Refactor current owner-only `createGame()` and normal `join()` logic into internal helpers so the new launch path reuses the same core game-creation and player-join code.

Suggested helpers:
- internal game-creation helper from a `GameConfig`
- internal join helper for `(gameId, causeId, wallet, value)`

### New bounds error
Add a dedicated custom error for invalid public launch join durations.

### Events
Keep existing `GameCreated` and `PlayerJoined` behavior intact.
A new launcher-specific event is optional, but not required for the first implementation if it broadens scope unnecessarily.

---

## 6. CLI/tooling scope

Add a gameplay CLI path for the new public launch flow.

Suggested command shape:

```bash
yarn game:launch -- --rpc-url <network> --game <address|name> --join-duration-seconds <300-3600> --cause-id <uint16> [--value-wei <wei>] --wallet-keystore <...>
```

Requirements:
- uses the new contract entrypoint
- requires the same player/auth assumptions as normal join
- defaults `--value-wei` to the current default entry fee if omitted
- returns `gameId`, wallet, join duration, cause ID, and counts

---

## 7. Required tests

### Foundry unit tests
- authorized wallet can launch and auto-join
- unauthorized wallet cannot launch
- invalid/too-small join duration reverts
- too-large join duration reverts
- active game blocks launch
- wrong entry fee reverts
- invalid cause reverts
- snapshot stores overridden join duration only
- all other config fields remain inherited from defaults
- owner `createGame()` still works unchanged
- underfilled launched game still cancels/refunds correctly

### JS/integration
At least one fresh integration path should exercise the new CLI launch flow end-to-end.

---

## 8. Required validation before mainnet freeze

1. implement patch
2. targeted unit tests
3. full Foundry suite rerun
4. full JS/tooling/integration smoke rerun
5. focused audit/review on the finished diff
6. fresh Sepolia run using the new launch path
7. freeze a new mainnet candidate commit

---

## 9. Audit focus

The focused audit should concentrate on:
- access control equivalence with join auth
- launch+join atomicity
- snapshot correctness
- denial/grief edge cases under one-active-game discipline
- invalid cause / invalid entry fee handling
- compatibility with existing settlement/refund/rescue flows

---

## 10. Mainnet-freeze implication

This patch changes contract behavior materially enough that the old freeze commit is no longer the mainnet candidate.
A new freeze commit is required after implementation, testing, audit, and fresh Sepolia validation.
