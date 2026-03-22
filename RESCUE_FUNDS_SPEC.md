# RESCUE_FUNDS_SPEC.md

**Date:** 2026-03-22  
**Status:** Draft for implementation + focused re-audit  
**Scope:** narrow rescue of accidental foreign assets only  
**Non-goal:** sponsorship, bonus pots, free-entry games, or reclaiming legitimate player/cause/treasury liabilities

---

## 1. Motivation

The current protocol is ETH-native and does not appear to expose a general-purpose rescue path for:
- arbitrary ERC-20s accidentally sent to the game contract
- ETH that ends up in the contract balance but is **not** assigned to any legitimate protocol liability

This is uncomfortable operationally because:
- foreign ERC-20s can be sent to the contract address accidentally and become stranded forever
- ETH can become stranded through force-send or other edge cases
- a generic owner sweep would be dangerous, but a narrow liability-aware rescue path is reasonable

This spec intentionally keeps the change **extremely narrow**.

---

## 2. Features to add

### 2.1 Foreign ERC-20 rescue
Add an owner-only/admin-only function to recover arbitrary ERC-20 tokens that are not part of normal protocol accounting.

Suggested shape:
- `rescueERC20(address token, address to, uint256 amount)`

Required properties:
- only authorized owner/admin can call it
- emits event
- reverts on zero token / zero recipient / zero amount
- should be blocked when a live game is active (see section 4)
- should transfer the ERC-20 from the contract to the specified recipient
- must not interact with game accounting

### 2.2 Excess ETH rescue
Add an owner-only/admin-only function to recover **only ETH that is provably excess**.

Suggested shape:
- `rescueExcessETH(address payable to, uint256 amount)`
- plus a view helper such as `excessETH()` or `getExcessETH()`

Required properties:
- only authorized owner/admin can call it
- emits event
- reverts on zero recipient / zero amount
- blocked when a live game is active (see section 4)
- may only transfer up to `excessETH`
- must never reduce contract balance below total accounted liabilities

---

## 3. Critical safety invariant

The rescue path must never touch ETH already owed through legitimate protocol accounting.

Conceptually:

`excessETH = address(this).balance - accountedLiabilities`

Rescue may only transfer ETH if:
- `excessETH > 0`
- `amount <= excessETH`

### 3.1 What counts as accounted liabilities
Implementation must derive this from existing protocol state, not from assumptions.

At a minimum, accounted liabilities include any ETH currently owed to:
- unclaimed player winnings
- unclaimed refunds
- unwithdrawn cause balances
- unwithdrawn treasury balances
- any active/unsettled game pot liability still tracked by the protocol

If the current contract structure cannot compute this safely from explicit state, the implementation should stop and report instead of guessing.

### 3.2 Explicit non-goal
This feature is **not** an expiry/clawback system for:
- abandoned winner claims
- abandoned refunds
- abandoned cause withdrawals
- abandoned treasury withdrawals

Those are policy/governance features and must not be smuggled in under “rescue”.

---

## 4. Operational narrowness: no live game

Both rescue functions should be unavailable while a live game is active.

Interpretation:
- if the current game is in a non-terminal phase such as joining / commit / reveal, rescue must revert
- if a game is ended/cancelled but liabilities remain, the `excessETH` invariant must still protect them

This keeps the feature narrow and reduces the chance of operator confusion during live play.

---

## 5. Events and errors

Suggested events:
- `event ForeignTokenRescued(address indexed token, address indexed to, uint256 amount);`
- `event ExcessETHRescued(address indexed to, uint256 amount);`

Suggested custom errors (names can vary if they better match repo conventions):
- `UnauthorizedRescueCaller()`
- `RescueUnavailableDuringLiveGame()`
- `InvalidRescueRecipient()`
- `InvalidRescueAmount()`
- `InsufficientExcessETH(uint256 requested, uint256 available)`

---

## 6. Testing requirements

### 6.1 ERC-20 rescue tests
Add tests that prove:
- owner/admin can rescue an accidentally-sent ERC-20
- non-owner/non-admin cannot rescue
- rescue reverts during a live game
- rescue reverts on zero amount or zero recipient
- rescue emits the expected event

### 6.2 Excess ETH rescue tests
Add tests that prove:
- excess ETH can be rescued only up to the computed excess amount
- rescue reverts when requested amount exceeds excess
- rescue reverts during a live game
- rescue reverts for unauthorized caller
- rescue emits the expected event

### 6.3 Liability protection tests
Add tests that prove rescue cannot touch legitimate obligations, including representative cases for:
- unclaimed winner payouts
- unclaimed refunds
- unwithdrawn cause balances
- unwithdrawn treasury balances

### 6.4 Forced ETH test
Include a helper test contract that can force-send ETH (for example via `selfdestruct`) so the excess-ETH path is tested against a realistic stranded-balance scenario.

---

## 7. Audit focus

This change should be treated as a **focused post-audit contract change**.

It does not require rethinking the whole game, but it **does** require a targeted review of:
- whether `accountedLiabilities` is complete
- whether any rescue path could drain legitimate claims
- whether no-live-game gating is sufficient
- whether ERC-20 rescue can interfere with any current or future protocol assumptions

This is narrower than adding sponsorship/bonus-pot support, but it still changes custody behavior and must be reviewed carefully.

---

## 8. Non-goals for this change

Do **not** include any of the following in the same patch:
- sponsor/donate to game pot
- bonus prize pool support
- free-entry sponsored games
- expiry/clawback of unclaimed payouts
- broad owner sweep of ETH
- rescue during an active game
- changes to game settlement rules

Keep this patch boring.

---

## 9. Go / no-go rule

Implementation is only acceptable if:
- excess ETH is computed from explicit state-backed liabilities
- tests prove legitimate balances cannot be rescued
- focused audit/review finds no path that can drain player/cause/treasury funds

If not, do not ship.
