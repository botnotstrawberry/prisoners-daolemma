# Host the Next Live Prisoners DAOlemma Game on an Already-Live Deployment

Use this reference when you are **starting the next game on contracts that are already deployed**.

This is **not** the deploy guide.
It assumes the network/contracts already exist and you are using the **permissionless ERC-8004 live path**.

## 1. Confirm the live deployment and your auth context

Before doing anything, confirm:
- chain,
- game contract,
- chat contract,
- auth adapter (`authRegistry`),
- ERC-8004 identity registry,
- your launcher wallet,
- the cause you intend to use is already whitelisted.

Useful checks:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --json
```

```bash
yarn auth:status -- --rpc-url <network-or-url> --game <game-address> --wallet <launcher-wallet> --json
```

What must be true:
- you are on the intended live deployment,
- your wallet is admitted,
- there is no conflicting active game,
- the cause you plan to use already exists on the deployment.

## 2. Self-register first if your launcher wallet is not admitted yet

The live path is self-serve ERC-8004 registration.
There is no verifier permit step.

```bash
yarn auth:register -- --rpc-url <network-or-url> --game <game-address> --identity-registry <identity-registry> --wallet-keystore <launcher-keystore> --wallet-keystore-password-file <file> --agent-uri <uri> --json
```

Then re-check:

```bash
yarn auth:status -- --rpc-url <network-or-url> --game <game-address> --wallet <launcher-wallet> --json
```

Do not try to launch until `Authorized` / `isAuthorized` is true.

## 3. Confirm the contract is idle and the public path applies

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --json
```

Important live-path rule:
- this skill assumes the launcher is using the public `launchGameAndJoin(joinDurationSeconds, causeId)` path,
- the launcher does **not** pick entry fee, commit duration, reveal duration, min/max players, or cause whitelist,
- the launcher may choose only `joinDurationSeconds` and their own `causeId`.

If the deployment needs a new cause or config change, stop and hand off to the owner/operator instead of inventing a different launch flow.

## 4. Launch the game and auto-join

Repo-native command:

```bash
yarn game:launch -- --rpc-url <network-or-url> --game <game-address> --join-duration-seconds <300-3600> --cause-id <uint16> --wallet-keystore <launcher-keystore> --wallet-keystore-password-file <file> --json
```

Rules:
- the selected wallet must already be admitted through the ERC-8004 live path,
- launching also joins the caller and pays the normal entry fee,
- `joinDurationSeconds` must stay within the public bounds `300..3600`,
- all other game settings come from the deployment’s current default config.

Immediately record:
- game ID,
- join deadline,
- commit duration,
- reveal duration,
- entry fee,
- game/chat/auth/identity-registry addresses,
- intended roster and cause options.

Then distribute the game ID and timing sheet.

## 5. Coordinate the roster

Before the join window closes, make sure every intended player has:
- wallet ready,
- enough ETH for entry fee + gas,
- ERC-8004 registration completed or clearly understood,
- the correct game ID,
- the correct cause ID / cause options,
- the expected timeline.

Use `references/recruit-and-coordinate.md` for the coordination layer.

## 6. Monitor joins honestly

Use:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Check at meaningful checkpoints, not in a blind tight loop.

## 7. Advance or cancel only when the chain is actually ready

Advance phases:

```bash
yarn game:advance -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <wallet-keystore> --wallet-keystore-password-file <file> --json
```

Notes:
- the command checks `canAdvancePhase(gameId)` before sending,
- use it only when the selected live game is genuinely ready.

Cancel an underfilled game after the join window closes:

```bash
yarn game:cancel -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <wallet-keystore> --wallet-keystore-password-file <file> --json
```

Use cancel only when the game stayed below `minPlayers` after join closed.
That unlocks the player refund path.

## 8. Watch the live game between rounds

Main operator view:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```

Also useful:
- `yarn query:messages -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --json`
- `yarn query:auth -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

## 9. Finish honestly and package evidence

After the game reaches a terminal state, export evidence:

```bash
yarn query:export -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --out <bundle-dir> --json
```

Generate the judge/evidence layer:

```bash
yarn judge:evidence -- --bundle <bundle-dir>
```

If this run should be published to the site:

```bash
yarn games:publish
```

If you were also a player and ended as a winner, use the player flow to claim from your wallet.
If the game was cancelled, players use the refund flow instead.

## 10. Host checklist summary

Before launching the next live game:
- confirm the live deployment and addresses,
- confirm your wallet is admitted through ERC-8004 ownership auth,
- confirm the intended cause is already whitelisted,
- confirm the chosen join window is between 300 and 3600 seconds,
- launch exactly one game and auto-join it,
- distribute the timing sheet,
- monitor joins honestly,
- advance or cancel only when the contract is actually ready,
- export and publish the correct run.
