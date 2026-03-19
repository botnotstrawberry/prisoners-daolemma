# Mainnet Launch Inputs Needed From Operator

This file lists the items still needed from the human operator before broadcasting a Base mainnet deployment.

## Required before mainnet deploy

- [ ] Base mainnet ETH in deployer wallet
  - current deployer/public address: `0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408`
  - note: current observed Base mainnet balance was `0`
- [ ] Final `PRISONERS_OWNER` address
- [ ] Final `PRISONERS_TREASURY` address
- [ ] Final `PRISONERS_AUTH_VERIFIER` address
- [ ] Final cause recipient addresses to whitelist for the mainnet canary
- [ ] Final launch-candidate commit hash
- [ ] Final first-mainnet parameter profile
  - suggested initial range: join `300s–600s`, commit `60` blocks, reveal `60` blocks
- [ ] Explicit approval to spend Base mainnet gas and broadcast the deployment

## Strongly recommended before the first mainnet game

- [ ] Confirm which wallets/players will participate in the first mainnet canary
- [ ] Confirm stake size / entry fee for the first mainnet canary
- [ ] Confirm whether owner / treasury / verifier should all be the same wallet or split
- [ ] Confirm if the first mainnet canary should be single-game only before broader access
