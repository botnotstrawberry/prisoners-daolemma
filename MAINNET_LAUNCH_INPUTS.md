# Mainnet Launch Inputs Needed From Operator

This file lists the operator-controlled inputs that must be locked before any Base mainnet deployment.

## Required before mainnet deploy

- [ ] Base mainnet ETH in the deployer wallet
  - current deployer/public address: `0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408`
  - note: a prior observed Base mainnet balance was `0`
- [ ] Final `PRISONERS_OWNER` address
- [ ] Final `PRISONERS_TREASURY` address
- [ ] Final `ERC8004_IDENTITY_REGISTRY` address
  - must be the intended deployed ERC-8004 / ERC-721 registry on Base mainnet
  - must point to deployed contract code
- [ ] Final cause recipient addresses to whitelist for the first mainnet game
- [ ] Final exact launch-candidate commit hash
- [ ] Final first-mainnet parameter profile
  - this must satisfy the current mainnet preflight guardrails in `scripts/run-base-mainnet-preflight.sh`
  - current floors are:
    - `maxPlayers <= 8`: join `>=300s`, commit `>=60` blocks, reveal `>=60` blocks
    - `9 <= maxPlayers <= 32`: join `>=300s`, commit `>=120` blocks, reveal `>=120` blocks
    - `maxPlayers > 32`: join `>=600s`, commit `>=320` blocks, reveal `>=320` blocks
- [ ] Explicit approval to spend Base mainnet gas and broadcast the deployment

## Strongly recommended before the first mainnet game

- [ ] Confirm the exact roster size for the first mainnet game
  - if the goal is a tiny canary with `60/60` block windows, keep `maxPlayers <= 8`
  - if the goal is `9+` players, plan around the stricter `120/120` block floors
- [ ] Confirm which wallets/players will participate in the first mainnet game
- [ ] Confirm stake size / entry fee for the first mainnet game
- [ ] Confirm whether owner and treasury should be the same wallet or split
- [ ] Confirm whether cause-recipient withdrawals are expected to be exercised during the first mainnet run or deferred operationally
- [ ] Confirm the deployer/owner wallet has enough gas buffer for deploy, verify, cause whitelisting, game creation, advances, and any settlement actions

## Important current truth

- The live launch path is **permissionless ERC-8004 auth** via `ERC8004AuthAdapter`.
- There is **no live verifier-backed permit flow** and **no SIWA gate** in the current deployment path.
- Do **not** lock or request a `PRISONERS_AUTH_VERIFIER` value for the current mainnet launch line.
