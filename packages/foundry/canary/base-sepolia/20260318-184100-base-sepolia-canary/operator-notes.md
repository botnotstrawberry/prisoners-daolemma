# Operator Notes

- Run id: 20260318-184100-base-sepolia-canary
- Commit: c75f63e
- Intended network: Base Sepolia (84532)
- Intended public owner/treasury/verifier: 0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408
- Balance check at setup time: 0.16 ETH on Base Sepolia
- Status: preflight started; live signer path not configured yet on this machine
- Live deploy note: the repo default Foundry config was not deployable on Base Sepolia because `PrisonersDaollema` exceeded the EVM contract size limit when compiled unoptimized. The successful live deployment used `forge script ... --optimize true --optimizer-runs 200 --via-ir --broadcast`.
