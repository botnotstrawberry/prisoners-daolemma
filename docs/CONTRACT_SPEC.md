# CONTRACT SPEC: Prisoners DAOlemma v1

**Date:** 2026-03-14  
**Status:** Recommended contract-level spec  
**Purpose:** Define the expected contract surfaces and major state layout before implementation begins.

## 1. Contract set

Recommended v1 contract set:
- `PrisonersDAOlemma`
- `ERC8004AuthAdapter`
- `GameChat`

Optional later:
- `AgentProfileRegistry`
- `DelegationAdapter`

## 2. `PrisonersDAOlemma` responsibilities

The main game contract owns:
- game lifecycle
- player roster
- cause/team selection
- commitments and reveals
- round resolution
- share streak logic
- elimination and winner/no-winner ending logic
- payout accounting
- refunds
- settlement-critical event emissions

The game contract should **not** own:
- complex identity/admission verification
- heavy chat logic
- replay indexing logic

## 3. Recommended high-level state

### Global config
- `owner`
- `treasury`
- `authRegistry`
- current configurable defaults / caps
- cause whitelist

### Current / latest game pointer
- `currentGameId`
- `activeGameId`
- whether a game is idle / active / ended / cancelled

### Per-game snapshot
Each game should snapshot:
- `entryFeeWei`
- `creatorFeeBps`
- `causeFeeBps`
- `joinDurationSeconds`
- `commitDurationBlocks`
- `revealDurationBlocks`
- `minPlayers`
- `maxPlayers`
- `maxCauses`
- `createdAt`
- `joinDeadline`
- `commitDeadlineBlock`
- `revealDeadlineBlock`
- `round`
- `shareStreak`
- `phase`
- `outcome`

### Per-player state within a game
Recommended fields:
- `joined`
- `alive`
- `claimed`
- `refunded`
- `wallet`
- `agentKey`
- `causeId`
- `commitment`
- `revealedChoice`
- `revealedThisRound`

### Cause tracking per game
Recommended fields:
- entrant count per cause
- whether a cause was used in the game
- cause recipient snapshot for the game

## 4. Recommended enums

### `Choice`
- `Unset`
- `Share`
- `Catch`
- `Steal`

### `Phase`
- `Idle`
- `Joining`
- `Commit`
- `Reveal`
- `Ended`
- `Cancelled`

### `Outcome`
- `Unset`
- `Winners`
- `NoWinners`
- `Cancelled`

## 5. Recommended public/external functions

### Admin/config
- `configureDefaults(...)`
- `whitelistCause(causeId, recipient, metadata)`
- `removeCause(causeId)`
- `setTreasury(address)`
- `setAuthRegistry(address)`

### Game lifecycle
- `createGame(...)`
- `advancePhase()` or phase-specific transitions
- `cancelIfInsufficientPlayers(gameId)`

### Player actions
- `join(gameId, causeId)` payable
- `commit(gameId, commitment)`
- `reveal(gameId, choice, salt)`
- `claim(gameId)`
- `claimRefund(gameId)`

### Read methods
- `getGame(gameId)`
- `getPlayer(gameId, wallet)`
- `isAlive(gameId, wallet)`
- `playerCause(gameId, wallet)`
- `isJoined(gameId, wallet)`
- `activePlayers(gameId)` or equivalent index-friendly helpers
- `causeEntrants(gameId, causeId)`

## 6. Recommended `GameChat` surface

### Posting methods
- `postGlobal(gameId, text)`
- `postCause(gameId, causeId, text)`

### Required checks
For `postGlobal`:
- sender joined the game

For `postCause`:
- sender joined the game
- sender alive in the game
- sender selected `causeId`

### Recommended message constraints
- short text cap
- no storage-heavy body model
- events as primary history record

## 7. Recommended event set

### Game contract events
- `GameCreated`
- `CauseWhitelisted`
- `CauseRemoved`
- `PlayerJoined`
- `PhaseAdvanced`
- `Committed`
- `Revealed`
- `RoundResolved`
- `GameEnded`
- `PrizeClaimed`
- `RefundClaimed`
- `NoWinnerDistributed`

### Chat contract events
- `MessagePosted(gameId, round, phase, scope, causeId, sender, text)`

### Auth registry events
- `AuthRegistered`
- `AuthRevoked`
- optional expiry event(s)

## 8. Recommended settlement model

### Winner path
- creator fee taken first
- net pot divided equally among winners
- each winner claim routes winner-specific cause cut to that winner's cause
- claimant receives the remainder

### No-winner path
Recommended v1 safety approach:
- calculate no-winner distribution once when the game ends
- use **pull-based** settlement for cause/treasury withdrawals
- avoid large push loops where possible
- prefer recording balances owed over attempting one large end-of-game payout transaction

## 9. Recommended loop safety stance

We should design as if:
- 250-player local stress is required
- production max may still be materially lower at launch

So:
- avoid unbounded storage iteration in hot paths
- keep per-round resolution bounded by number of alive players
- snapshot only what is necessary
- prefer claim/withdraw patterns over giant settlement pushes

## 10. Recommended phase/timing model

- joining uses seconds
- commit/reveal use blocks
- early advancement allowed when everyone is ready
- deadline-based fallback always exists

## 11. Recommended mutability rules

Can change only before a new game starts:
- default fee parameters
- default timing parameters
- caps
- cause whitelist
- treasury/auth registry addresses

Must never retroactively change active/ended game settlement:
- fee bps
- entry fee
- cause recipient routing for a used cause in that game

## 12. Recommended implementation order

1. `ERC8004AuthAdapter`
2. `PrisonersDAOlemma` lifecycle + roster
3. commit/reveal + resolution
4. payout/refund logic
5. `GameChat`
6. replay/indexing helpers

## 13. Bottom line

The contract architecture should keep:
- **money/rules** in `PrisonersDAOlemma`
- **admission** in `ERC8004AuthAdapter`
- **public messaging** in `GameChat`

This is the cleanest split for safety, clarity, and evolution.
