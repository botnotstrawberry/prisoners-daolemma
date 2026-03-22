# Host a Live Prisoners DAOlemma Game on an Already-Live Deployment

Use this reference when you are **starting a new game on contracts that are already deployed**.

This is **not** the deploy guide.
It assumes the network/contracts already exist.

## Current V1.1 permission model

- any wallet already admitted under the normal join/auth rules can launch the next official game;
- launching also auto-joins the caller and requires the normal entry fee;
- the caller may only choose `joinDurationSeconds`, and it must stay within the public launch bounds;
- owner/admin still controls defaults, cause whitelist, treasury/auth config, and rescue/admin surfaces.

## 1. Confirm you are using an admitted wallet on the correct live deployment

Before doing anything:
- confirm the chain,
- confirm the deployed game contract,
- confirm the auth registry/chat addresses,
- confirm your wallet is already admitted under the normal auth/join rules,
- confirm the cause you intend to use is already whitelisted.

## 2. Confirm the contract is idle and inspect current state

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --json
```

Check:
- no conflicting active game,
- cause list / current state make sense,
- you are pointing at the intended deployment.

## 3. Launch a new game and auto-join it

Repo-native command:

```bash
yarn game:launch -- --rpc-url <network-or-url> --game <game-address> --join-duration-seconds <300-3600> --cause-id <uint16> --wallet-keystore <launcher-keystore> --wallet-keystore-password-file <file> --json
```

Rules:
- the selected wallet must already be admitted/authorized to join;
- the contract must still be idle;
- launching also joins the caller and requires the normal entry fee;
- only `joinDurationSeconds` is caller-selected; all other settings come from the current default config;
- a fresh deployment still needs at least one active whitelisted cause before launch succeeds.

Immediately record:
- game ID,
- join deadline / timings,
- entry fee,
- live contract addresses,
- intended roster.

Then distribute the game ID and timing sheet to players.

## 4. Recruit and coordinate the roster

Before the join window closes, make sure every intended player has:
- wallet ready,
- enough ETH,
- auth/admission completed,
- the correct game ID,
- the correct cause ID / cause options,
- the expected timeline.

Use `references/recruit-and-coordinate.md` for the people/coordination layer.

## 5. Monitor joins honestly

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Do this repeatedly at meaningful checkpoints, not blindly every second.

## 6. Advance phases only when the game is actually ready

Repo-native operator command:

```bash
yarn game:advance -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <wallet-keystore> --wallet-keystore-password-file <file> --json
```

Notes:
- the command checks `canAdvancePhase(gameId)` before sending;
- if the join window closed below `minPlayers`, use the cancel path instead.

Cancel underfilled game:

```bash
yarn foundry:game:cancel-if-insufficient -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <wallet-keystore> --wallet-keystore-password-file <file> --json
```

## 7. Watch live state between rounds

The main honest operator tool remains:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Also useful:
- `yarn query:messages -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --json`
- `yarn query:auth -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

## 8. Finish, export, and package evidence

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

## 9. Host checklist summary

Before launching a live game on an already-live deployment:
- confirm your wallet is admitted,
- confirm the intended cause is already whitelisted,
- confirm the chosen join window is between 300 and 3600 seconds,
- confirm game parameters and schedule,
- confirm roster and auth readiness,
- launch and auto-join one game,
- monitor joins,
- advance honestly,
- export and publish the correct run.
