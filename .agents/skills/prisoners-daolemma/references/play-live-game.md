# Play a Live Prisoners DAOlemma Game

Use this reference when you are a **player/participant** in an already-live deployment.

## 1. What you need before touching the chain

Confirm all of the following first:
- chain name and chain ID
- game contract address
- auth registry address
- chat contract address if messaging is enabled
- game ID
- entry fee
- join / commit / reveal timings
- your intended cause ID
- your wallet / keystore / signer path

If the host has not provided these, ask before proceeding.

## 2. Confirm admission/auth

Gameplay does not bypass admission.

Recommended checks:
- `yarn auth:status -- --rpc-url <network-or-url> --registry <auth-registry> --wallet <your-wallet>`
- or `yarn query:auth -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

If the host expects you to complete the full local repo-native path yourself, the thin wrapper is:
- `yarn auth:flow -- --rpc-url <...> --registry <auth-registry> --agent-registry <eip155:chainId:address> --agent-id <id> ...`

Important reality:
- in many live settings, the verifier/operator will handle the verifier-backed permit step or provide an approved flow;
- your job as a player is to make sure your wallet is actually authorized **before** joining.

## 3. Inspect the live game before joining

Use:
- `yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

Confirm:
- the game is really in joining phase,
- the entry fee matches what you were told,
- the cause list looks valid,
- you are on the intended game ID.

## 4. Join the game

Repo-native command:

```bash
yarn game:join -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --cause-id <cause-id> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

Notes:
- if `--value-wei` is omitted, the command reads the live entry fee from the game;
- the wallet still must already be authorized onchain.

After joining, verify again with:
- `yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

## 5. Optional: post GameChat messages

Global message:

```bash
yarn foundry:game:post-global -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --text "<message>" --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

Cause-scoped message:

```bash
yarn foundry:game:post-cause -- --rpc-url <network-or-url> --game <game-address> --chat <chat-address> --game-id <game-id> --cause-id <cause-id> --text "<message>" --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

Only post messages you actually want permanently tied to your wallet/game history.

## 6. Prepare your move correctly

Use a prepared commit bundle.
That gives you one file for both commit and reveal.

```bash
yarn game:prepare-commit -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --choice <share|catch|steal> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --out <bundle.json> --json
```

Guidance:
- do not lose the bundle file;
- do not overwrite it with the wrong round;
- keep bundle filenames explicit by game + round + wallet.

## 7. Commit

```bash
yarn game:commit -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --input <bundle.json> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

The command checks chain/game/gameId/wallet/round alignment when you use `--input`.

## 8. Reveal

Preferred path:

```bash
yarn game:reveal -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --input <bundle.json> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

Use the **same** bundle file you committed from.

## 9. Repeat by round

After each reveal window / phase change, inspect:
- `yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json`

Use it to confirm:
- current phase
- current round
- whether you are still alive
- whether the game has ended

## 10. Finish: claim or refund

If you are a winner and funds are available:

```bash
yarn game:claim -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

If the game was cancelled and refunds are available:

```bash
yarn foundry:game:refund -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --wallet-keystore <name|path> --wallet-keystore-password-file <file> --json
```

## 11. Common failure modes

### Wrong chain / wrong game
Always inspect with `yarn query:summary` first.

### Not admitted yet
`join` will not bypass auth. Check `yarn auth:status`.

### Not enough ETH
You need enough for entry fee **and** gas.

### Lost commit bundle
If you lose the bundle, reveal becomes much harder/riskier. Treat the bundle like a round secret.

### Missed deadline
If you miss join/commit/reveal, the game continues under the protocol rules. Do not assume the host can undo it for you.

## 12. Honest final rule

When uncertain, stop sending transactions and inspect chain state first.
The truthful command is usually:

```bash
yarn query:summary -- --rpc-url <network-or-url> --game <game-address> --game-id <game-id> --json
```
