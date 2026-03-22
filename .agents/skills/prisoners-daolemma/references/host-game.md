# Host / Launch a Game on a Live Deployment

Use this reference when the contracts are already live and you need to run a game on top of them.

## Scope

This is for:
- cause whitelisting
- creating a game
- monitoring and advancing phases
- exporting evidence afterward

This is **not** for:
- redeploying contracts
- changing Solidity
- changing protocol rules

## 1. Confirm the live context first

Before touching the chain, confirm all of these:
- chain: `Base mainnet` vs `Base Sepolia`
- game contract address/name
- auth registry address
- GameChat address if relevant
- owner wallet you control
- intended `gameId` or whether you are about to create one
- cause list and recipients
- current phase / whether a game is already active

Useful inspection commands:
- `yarn canary:deployment -- --rpc-url <url|network>`
- `yarn query:summary -- --rpc-url <url|network> --game <address|name> --game-id <id>`

## 2. Whitelist causes before createGame()

If causes are missing or need updating while the contract is idle, use:

```bash
yarn game:whitelist-cause -- \
  --rpc-url <url|network> \
  --game <address|name> \
  --cause-id <uint16> \
  --recipient <address> \
  --metadata-text "<cause label>" \
  --wallet-keystore <name|path> \
  --wallet-keystore-password-file <file>
```

Notes:
- this is owner-only
- the contract must be idle
- at least one active cause must exist before `createGame()` succeeds

## 3. Create a game on the live deployment

```bash
yarn game:create -- \
  --rpc-url <url|network> \
  --game <address|name> \
  --wallet-keystore <name|path> \
  --wallet-keystore-password-file <file>
```

Notes:
- this uses the already-snapshotted contract parameters
- the selected wallet must be the owner wallet
- record the returned `gameId` immediately and share it with players

## 4. Monitor join readiness

During joins, keep checking summary state:

```bash
yarn query:summary -- \
  --rpc-url <url|network> \
  --game <address|name> \
  --game-id <id>
```

Track at minimum:
- joined count
- join deadline
- phase
- entry fee
- cause distribution if useful

## 5. Advance phases when ready

When the game is advance-ready, use:

```bash
yarn game:advance -- \
  --rpc-url <url|network> \
  --game <address|name> \
  --game-id <id> \
  --wallet-keystore <name|path> \
  --wallet-keystore-password-file <file>
```

Notes:
- this checks `canAdvancePhase(gameId)` before sending
- do not advance on vibes; advance because the phase is actually ready
- communicate deadlines and phase transitions clearly to players

## 6. Finish and export the run

After the game reaches terminal state:

```bash
yarn query:export -- \
  --rpc-url <url|network> \
  --game <address|name> \
  --game-id <id> \
  --chat <address|name> \
  --out <directory>
```

Then package judge evidence:

```bash
yarn judge:evidence -- --bundle <directory>
```

Then republish site game data when appropriate:

```bash
yarn games:publish
```

## 7. Host checklist

- confirm live addresses
- confirm owner wallet control
- confirm causes are correct
- create game
- share `gameId`, chain, deadlines, and join instructions
- monitor joins
- advance phases only when ready
- export bundle
- package evidence
- publish the intended run
