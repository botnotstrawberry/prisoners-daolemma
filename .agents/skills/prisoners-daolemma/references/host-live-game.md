# Host a Live Prisoners DAOlemma Game on an Already-Live Deployment

Use this reference when you are **starting a new game on contracts that are already deployed**.

This is **not** the deploy guide.
It assumes the network/contracts already exist and you have the right owner/operator wallet.

Current V1 permission model:
- the canonical deployment is owner-operated;
- only the owner can change defaults, whitelist causes, and create the next game;
- if you do not control the owner/operator wallet, you are a player/coordinator, not the onchain host.

## 1. Confirm you actually control the right wallet

Hosting actions like cause whitelisting and game creation require the correct owner/operator wallet.

Before doing anything:
- confirm the chain,
- confirm the deployed game contract,
- confirm the auth registry/chat addresses,
- confirm you control the wallet that is allowed to manage the live game.

## 2. Confirm the contract is idle and inspect current state

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --json
```

Check:
- no conflicting active game,
- cause list / current state make sense,
- you are pointing at the intended deployment.

## 3. Whitelist or update causes while idle

Repo-native command:

```bash
yarn game:whitelist-cause -- --rpc-url <network-or-url> --game <game-address> --cause-id <uint16> --recipient <address> --metadata-text "<cause-label>" --wallet-keystore <owner-keystore> --wallet-keystore-password-file <file> --json
```

Rules:
- the selected wallet must be the game owner;
- the contract must still be idle;
- a fresh deployment needs at least one active cause before `createGame()` succeeds.

## 4. Create a new game

```bash
yarn game:create -- --rpc-url <network-or-url> --game <game-address> --wallet-keystore <owner-keystore> --wallet-keystore-password-file <file> --json
```

Immediately record:
- game ID,
- join deadline / timings,
- entry fee,
- live contract addresses,
- intended roster.

Then distribute the game ID and timing sheet to players.

## 5. Recruit and coordinate the roster

Before the join window closes, make sure every intended player has:
- wallet ready,
- enough ETH,
- auth/admission completed,
- the correct game ID,
- the correct cause ID / cause options,
- the expected timeline.

Use `references/recruit-and-coordinate.md` for the people/coordination layer.

## 6. Monitor joins honestly

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Do this repeatedly at meaningful checkpoints, not blindly every second.

## 7. Advance phases only when the game is actually ready

Repo-native operator command:

```bash
yarn game:advance -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <owner-keystore> --wallet-keystore-password-file <file> --json
```

Notes:
- the command checks `canAdvancePhase(gameId)` before sending;
- if the join window closed below `minPlayers`, use the cancel path instead.

Cancel underfilled game:

```bash
yarn foundry:game:cancel-if-insufficient -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <owner-keystore> --wallet-keystore-password-file <file> --json
```

## 8. Watch live state between rounds

The main honest operator tool remains:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Also useful:
- `yarn query:messages -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --json`
- `yarn query:auth -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

## 9. Finish, export, and package evidence

After the game ends, export:

```bash
yarn query:export -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --out <bundle-dir> --json
```

Then generate the judge/evidence layer:

```bash
yarn judge:evidence -- --bundle <bundle-dir>
```

If this run should be published to the site, then publish the correct bundle through the existing pipeline:

```bash
yarn games:publish
```

## 10. Host checklist summary

Before launching a live game on an already-live deployment:
- confirm owner/operator wallet,
- confirm cause recipients,
- confirm game parameters and schedule,
- confirm roster and auth readiness,
- create one game,
- monitor joins,
- advance honestly,
- export and publish the correct run.
