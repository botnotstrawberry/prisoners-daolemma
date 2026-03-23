# Final Execution Checklist — Prisoners DAOlemma

**Date:** 2026-03-23 UTC  
**Purpose:** current execution checklist for the permissionless ERC-8004 launch line.  
**Status:** authoritative only for the current launch candidate and its exact freeze artifacts.

---

## 0. Current truth snapshot

### Already true
- [x] The live auth model is **permissionless ERC-8004** through `ERC8004AuthAdapter`
- [x] The live path does **not** require a verifier signer
- [x] The live path does **not** require a SIWA gate
- [x] A successful Base Sepolia proof exists on the permissionless launch line:
  - run: `20260322-2319-base-sepolia-32p-permissionless-chat-retry5`
  - joined: `32`
  - winners: `12`
  - used causes: `2`
  - messages exported: `26`
  - terminal round: `5`
  - settlement path: `winner-claims`
- [x] The exact merged launch candidate must be reviewed/frozen separately from the earlier auth-only Sepolia tree

### Important interpretation
- The remaining risk is **exact-candidate correctness and operational discipline**, not open-ended protocol design.
- Until a clean mainnet proof exists, the **featured public proof should remain the successful Base Sepolia permissionless run**.
- No one should rely on older verifier-era checklists as launch authority.

---

## 1. Freeze the exact launch target before deployment

- [ ] Record the exact final commit hash that passed strict review
- [ ] Confirm the working tree is clean on that exact candidate
- [ ] Preserve the final launch audit summary
- [ ] Preserve the final launch validation summary
- [ ] Preserve the final mainnet freeze / GO-NO-GO memo
- [ ] Confirm no further contract or launch-surface changes after the freeze point

**Checkpoint 1 pass condition:** there is one exact launch candidate commit and one matching freeze packet.

---

## 2. Lock operator-controlled mainnet inputs

- [ ] `PRISONERS_OWNER`
- [ ] `PRISONERS_TREASURY`
- [ ] `ERC8004_IDENTITY_REGISTRY`
- [ ] cause recipient whitelist
- [ ] deployer wallet and gas funding plan
- [ ] exact first-mainnet roster plan
- [ ] exact first-mainnet entry fee
- [ ] explicit approval to spend Base mainnet gas and broadcast

### Timing guardrail reminder
The current preflight enforces these minimums:
- [ ] if `maxPlayers <= 8`: join `>=300s`, commit `>=60`, reveal `>=60`
- [ ] if `9 <= maxPlayers <= 32`: join `>=300s`, commit `>=120`, reveal `>=120`
- [ ] if `maxPlayers > 32`: join `>=600s`, commit `>=320`, reveal `>=320`

**Checkpoint 2 pass condition:** no operator-controlled launch variable is still ambiguous.

---

## 3. Run final Base mainnet preflight on the frozen candidate

- [ ] run `scripts/run-base-mainnet-preflight.sh`
- [ ] confirm clean-tree / expected-commit provenance is green
- [ ] confirm deployer balance is sufficient
- [ ] confirm timing guardrails pass for the exact intended `maxPlayers`
- [ ] confirm `ERC8004_IDENTITY_REGISTRY` points to deployed contract code on Base mainnet
- [ ] confirm no verifier-era assumptions remain in the live path

**Checkpoint 3 pass condition:** preflight passes without waivers.

---

## 4. Deploy + verify on Base mainnet

- [ ] deploy on Base mainnet from the frozen candidate commit
- [ ] capture deploy artifacts
- [ ] verify on Base mainnet
- [ ] record deployed addresses for:
  - [ ] `ERC8004AuthAdapter`
  - [ ] `PrisonersDAOlemma`
  - [ ] `GameChat`
- [ ] confirm owner / treasury / registry wiring onchain
- [ ] confirm cause whitelist setup onchain

**Checkpoint 4 pass condition:** contracts are live, verified, and match the locked inputs.

---

## 5. Execute the first mainnet game conservatively

- [ ] confirm every invited player is identity-ready against the chosen registry
- [ ] confirm every invited player is funded for gas + entry
- [ ] confirm the owner wallet has enough gas buffer for the full live sequence
- [ ] create one game with the locked parameters
- [ ] all intended players join before deadline
- [ ] commits complete
- [ ] reveals complete
- [ ] terminal resolution occurs cleanly
- [ ] settlement actions complete cleanly
- [ ] record any manual intervention immediately

**Checkpoint 5 pass condition:** one full mainnet game completes with a clean evidence trail.

---

## 6. Publish and freeze the proof

- [ ] export the mainnet run with the same evidence structure used for Sepolia
- [ ] generate judge/operator evidence pack
- [ ] publish the mainnet run to the site if it is clean
- [ ] retain the Sepolia permissionless run as secondary rehearsal evidence
- [ ] update public links / contract page / proof ordering only after confirming the published bundle is correct
- [ ] write operator notes, tx hashes, and any incident notes

**Checkpoint 6 pass condition:** the public proof story matches reality.

---

## 7. Abort / NO-GO triggers

If any of the following are unresolved, stop and do not broadcast:
- [ ] no exact frozen launch-candidate commit
- [ ] missing `PRISONERS_OWNER`, `PRISONERS_TREASURY`, or `ERC8004_IDENTITY_REGISTRY`
- [ ] first-mainnet parameters fail current preflight guardrails
- [ ] deployer wallet not funded
- [ ] stale verifier-era launch instructions are being used as authority
- [ ] public proof or operator docs no longer match the exact candidate being deployed

---

## 8. One-screen execution summary

1. Freeze one exact reviewed candidate commit
2. Lock owner / treasury / identity registry / causes / parameters / roster
3. Run final Base mainnet preflight
4. Deploy + verify
5. Run one clean mainnet game
6. Export + publish evidence
7. Freeze the proof packet and notes
