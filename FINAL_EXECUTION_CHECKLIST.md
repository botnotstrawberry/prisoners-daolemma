# Final Execution Checklist — Prisoners DAOlemma

**Date:** 2026-03-22 UTC  
**Purpose:** single source of truth for the final hackathon/mainnet/submission push.  
**Status:** active execution checklist.

---

## 0. Current truth snapshot

### Already done
- [x] Core Solidity locked for v1 at commit `839cf76` (`Add narrow asset rescue paths`)
- [x] All three production contracts unchanged since `839cf76`
  - `PrisonersDAOlemma.sol`
  - `AgentAuthRegistry.sol`
  - `GameChat.sol`
- [x] Internal bounded-v1 audit completed on earlier freeze candidate
- [x] Focused rescue-path audit completed on `839cf76`
- [x] Additional canary-focused audit pass completed on `839cf76`
- [x] Full Foundry suite green on the rescue-patch candidate
- [x] Production-profile validation/gates green
- [x] Local large-scale evidence exists
  - preserved `250`-player local proof bundle
  - broader matrix / multiseed / saturation local proof bundles
- [x] Full slower `32`-player Base Sepolia run completed successfully on commit `839cf76`
  - `32/32` joined
  - `32/32` committed
  - `32/32` revealed
  - `32/32` claimed
  - full terminal `winner-claims` path
- [x] Published site data is now constrained to the final slower `32`-player run by the games publisher allowlist

### Important interpretation
- The project is **past protocol-risk planning**.
- The remaining work is **execution and packaging**, not open-ended design.
- The next most important proof is a **real Base mainnet 9-agent full game**.

---

## 1. Final top-level goal

### Primary objective
Ship **one fully completed 9-agent Base mainnet game** and make it the **top proof** for the project.

### Secondary proof
Keep the full slower **32-agent Base Sepolia** run as the **second-tier proof / rehearsal evidence**.

### Supporting proof
Keep the preserved local large-scale bundles as **scale-supporting evidence**, not the lead story.

---

## 2. What “mainnet canary” means here

For this repo, “mainnet canary” means:
- a **real Base mainnet deployment**
- **real ETH**
- a **small invited roster**
- **one game at a time**
- **full end-to-end completion**
- **full artifact capture**
- **tight live monitoring**

It does **not** mean a fake/toy/partial run.

For the final push, the intended canary is:
- **9 invited agents**
- **1 full game**
- **clean terminal completion**
- **evidence exported + published**

---

## 3. Final execution order

1. **Lock mainnet operator inputs**
2. **Run final Base mainnet preflight**
3. **Deploy + verify on Base mainnet**
4. **Run one full 9-agent mainnet game**
5. **Export + judge-pack + publish the mainnet proof**
6. **Make mainnet the primary site story; Sepolia second**
7. **Finish submission assets**
8. **Submit**

---

## 4. Phase A — operator lock-in (must finish first)

## A1. Freeze the execution target
- [x] Solidity already frozen at `839cf76`
- [ ] Explicitly confirm: **no more Solidity changes before mainnet run**
- [ ] Record the final deployment target commit in launch notes

## A2. Lock first-mainnet parameters
Recommended current target for the 9-agent game:
- [ ] `joinDurationSeconds = 300` or `600`
- [ ] `commitDurationBlocks = 60`
- [ ] `revealDurationBlocks = 60`
- [ ] `minPlayers = 3`
- [ ] `maxPlayers = 9` (or keep a slightly wider ceiling if needed, but the run target is 9)
- [ ] `entryFeeWei` explicitly chosen
- [ ] `maxCauses` explicitly chosen

## A3. Lock first-mainnet addresses
- [ ] final `PRISONERS_OWNER`
- [ ] final `PRISONERS_TREASURY`
- [ ] final `PRISONERS_AUTH_VERIFIER`
- [ ] final cause-recipient whitelist for the first game

## A4. Lock the first roster
- [ ] identify the 9 participating agents/wallets
- [ ] confirm auth path for all 9
- [ ] confirm each wallet has enough ETH for gameplay gas + entry
- [ ] confirm the operator wallet can fund/setup any missing balances

## A5. Fund deployment wallet
- [ ] fund `0xDb463b29c82138188d5e425EDe5E0Fcbb09f1408` on Base mainnet
- [ ] verify nonzero Base mainnet balance before preflight

**Checkpoint A pass condition:** all addresses, parameters, wallets, and funding are locked.

---

## 5. Phase B — final Base mainnet preflight + deploy

## B1. Preflight
- [ ] run Base mainnet preflight against the exact intended first-game parameters
- [ ] confirm timing guardrails pass for the intended `maxPlayers`
- [ ] confirm deployer balance is nonzero
- [ ] confirm verifier assumptions are satisfied
- [ ] confirm clean-tree / expected-commit provenance is green

## B2. Deploy
- [ ] deploy on Base mainnet using the locked candidate commit
- [ ] capture deploy artifacts
- [ ] record deployed addresses for all three contracts

## B3. Verify
- [ ] run verification flow on Base mainnet
- [ ] record BaseScan links for:
  - [ ] `AgentAuthRegistry`
  - [ ] `PrisonersDAOlemma`
  - [ ] `GameChat`

## B4. Initial post-deploy setup
- [ ] whitelist first-game causes
- [ ] confirm owner/treasury/verifier config is correct onchain
- [ ] save final address/config sheet in repo artifacts or operator notes

**Checkpoint B pass condition:** mainnet contracts are live, verified, and configured for the first game.

---

## 6. Phase C — the 9-agent mainnet proof run

## C1. Admission
- [ ] issue/prepare auth material for all 9 agents
- [ ] verify all 9 can join successfully
- [ ] record any auth edge cases immediately

## C2. Game execution
- [ ] create one game with the locked parameters
- [ ] all 9 join before deadline
- [ ] all 9 commit
- [ ] all 9 reveal
- [ ] game resolves to terminal state cleanly

## C3. Settlement
- [ ] all winners claim successfully, if winner-path
- [ ] treasury withdrawal captured if applicable
- [ ] cause withdrawals captured if applicable
- [ ] no stuck-fund surprise appears

## C4. Operator notes
- [ ] record tx hashes
- [ ] record contract addresses
- [ ] record exact parameter sheet used
- [ ] record outcome summary
- [ ] record any manual interventions

**Checkpoint C pass condition:** one full 9-agent Base mainnet game completes end-to-end with a clean evidence trail.

---

## 7. Phase D — evidence packaging + site promotion

## D1. Evidence bundle
- [ ] export the mainnet run with the same artifact structure used for Sepolia
- [ ] generate judge pack for the mainnet run
- [ ] confirm bundle includes summary, rounds, roster, payouts, auth, messages, manifest

## D2. Site publishing
- [ ] publish the mainnet run into the site game-data pipeline
- [ ] make the **mainnet 9-agent run** the top/featured proof
- [ ] keep the slower `32`-agent Base Sepolia run as the secondary proof
- [ ] ensure `/games` ordering reflects that
- [ ] ensure `/judge` and homepage reflect that ordering too

## D3. Judge-facing wording update
- [ ] update judge-facing copy from “current public proof is Sepolia” to “primary proof is Base mainnet; Sepolia remains rehearsal/secondary proof”
- [ ] update any old addresses still pointing only to Sepolia proof
- [ ] verify the game detail page describes the mainnet run correctly

**Checkpoint D pass condition:** mainnet proof is the lead story across site + judge path.

---

## 8. Phase E — submission package completion

## E1. Must-have submission assets / agent-facing deliverables
- [ ] `submission/PROOF_INDEX.md`
- [ ] `submission/PRIZE_MAP.md`
- [ ] `.agents/skills/prisoners-daolemma/` live gameplay skill for post-deploy launch/join/play flows
- [ ] 4–6 screenshots
- [ ] 60–90 second backup demo video
- [ ] one architecture diagram

## E1.5 Agent enablement deliverable
- [ ] finalize `.agents/skills/prisoners-daolemma/SKILL.md` for live post-deploy gameplay
- [ ] ensure the skill covers host/launch-on-live-deployment, player join/play, and recruitment/coordination
- [ ] ensure the skill is explicitly **not** about redeploying contracts or editing Solidity

## E2. Existing assets to reuse
Already present and should be reused, not rewritten from scratch:
- [x] `JUDGES_START_HERE.md`
- [x] `submission/AI_JUDGE_PACKET.md`
- [x] `submission/HUMAN_JUDGE_ONEPAGER.md`
- [x] `submission/DEVFOLIO_COPY.md`
- [x] `/judge`

## E3. Tracks / category labeling
The project should clearly label itself around these themes:
- [ ] **Agents that Trust**
- [ ] **Agents that Cooperate**
- [ ] **Autonomous Agents / AI Agents**
- [ ] **Onchain Game / Consumer App**
- [ ] **Base ecosystem**
- [ ] **Public goods / cause layer** (if a relevant category exists in the form)

**Important note:** use the exact field/track names shown in the actual Devfolio form / builder guide at submission time. If naming differs, preserve the intent above but match the official form labels exactly.

## E4. Final submission consistency check
- [ ] site copy matches submission copy
- [ ] homepage matches `/judge`
- [ ] pitch matches `submission/DEVFOLIO_COPY.md`
- [ ] links point to the intended mainnet proof first
- [ ] screenshots/video show the same current story the site tells

**Checkpoint E pass condition:** a judge can understand the project from one page, one proof path, and one consistent pitch.

---

## 9. Phase F — submit

## F1. Final pre-submit review
- [ ] Devfolio text pasted from the canonical copy pack
- [ ] track/category labels selected intentionally
- [ ] top evidence link points to the mainnet run
- [ ] secondary evidence points to the slower `32`-agent Sepolia run
- [ ] repo/judge links are public and working

## F2. Submission artifacts
- [ ] logo / branding ready if required
- [ ] screenshots attached
- [ ] demo video attached
- [ ] live URL attached
- [ ] repo URL attached

## F3. Final audit of claims
Only claim what is true:
- [ ] full Base mainnet 9-agent proof exists
- [ ] slower full Base Sepolia 32-agent proof exists
- [ ] preserved local large-scale proof exists
- [ ] contracts are internally audited/frozen for bounded v1
- [ ] do **not** overclaim public 256-player mainnet readiness

**Checkpoint F pass condition:** submission is live and internally consistent.

---

## 10. One-screen execution summary

If time is short, do this in order:

1. Fund deployer + lock owner/treasury/verifier/causes/params
2. Run final mainnet preflight
3. Deploy + verify on Base mainnet
4. Run one full 9-agent game
5. Export + judge-pack + publish the run
6. Promote mainnet proof to top slot on the site
7. Capture screenshots + record backup demo video
8. Fill Devfolio with canonical copy + track labels
9. Submit

---

## 11. What is *not* left

These are **not** the bottlenecks anymore:
- broad protocol redesign
- more Solidity feature work
- waiting on another generic planning cycle
- proving Sepolia/local from scratch again

Those proof layers already exist.
The remaining job is to **execute the mainnet proof + package it clearly**.
ots + record backup demo video
8. Fill Devfolio with canonical copy + track labels
9. Submit

---

## 11. What is *not* left

These are **not** the bottlenecks anymore:
- broad protocol redesign
- more Solidity feature work
- waiting on another generic planning cycle
- proving Sepolia/local from scratch again

Those proof layers already exist.
The remaining job is to **execute the mainnet proof + package it clearly**.
