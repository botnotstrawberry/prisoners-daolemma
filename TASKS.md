# TASKS: Prisoners DAOllema

## Priority guide
- **P0** = required for a serious hackathon submission and safe pilot path
- **P1** = strong improvement if time allows
- **P2** = stretch

## Status note
This checklist is now best treated as a backlog, not as the authoritative completion record.

For the current done-locally vs still-open status, start with `LOCAL_READINESS.md`.

## First read
Before implementing, use:
1. `CANON.md`
2. `ARCHITECTURE.md`
3. `BUILD_PLAN.md`
4. `AUTH_SPEC.md`
5. `CONTRACT_SPEC.md`
6. `REPLAY_SPEC.md`
7. `TEST_PLAN.md`
8. `PARAMETERS.md`
9. `LAUNCH_PLAN.md`
10. `SKILLS.md`

---

## P0 — planning freeze
- [ ] Review `CANON.md`
- [ ] Review `ARCHITECTURE.md`
- [ ] Review `BUILD_PLAN.md`
- [ ] Review `TEST_PLAN.md`
- [ ] Review `PARAMETERS.md`
- [ ] Review `LAUNCH_PLAN.md`
- [ ] Resolve the most important open question(s) in `OPEN_QUESTIONS.md`

---

## P0 — contract core
- [ ] Implement game phases and one-active-game lifecycle
- [ ] Implement join flow
- [ ] Implement commit flow
- [ ] Implement reveal flow
- [ ] Implement round resolution
- [ ] Implement end-of-game logic
- [ ] Implement winner claims
- [ ] Implement refund path
- [ ] Implement cause whitelist management
- [ ] Implement creator fee and cause cut
- [ ] Implement per-game parameter snapshots
- [ ] Implement per-game cause-routing snapshots
- [ ] Enforce `maxPlayers`
- [ ] Enforce `maxCauses`

---

## P0 — auth / admission
- [ ] Implement verifier CLI for SIWA admission
- [ ] Implement onchain `AgentAuthRegistry`
- [ ] Implement wallet -> agent binding
- [ ] Implement expiry / replay protection
- [ ] Implement join-time auth enforcement
- [ ] Implement duplicate-agent rejection
- [ ] Implement auth status tooling
- [ ] Add optional local API wrapper only if CLI-first testing becomes too painful

---

## P0 — Foundry test suites
- [ ] State-machine tests
- [ ] Join/admission tests
- [ ] Commit/reveal tests
- [ ] Truth-table tests for all 7 cases
- [ ] Missed-commit => `SHARE` tests
- [ ] Non-reveal => `SHARE` tests
- [ ] Share-streak tests
- [ ] Sole-survivor tests
- [ ] Winner-claim tests
- [ ] No-winner distribution tests
- [ ] Refund tests
- [ ] Snapshot/mutability tests
- [ ] Event/replay sufficiency tests

---

## P0 — fuzz / invariants
- [ ] Add invariants for value conservation
- [ ] Add invariants for no double claim / refund
- [ ] Add invariants for phase monotonicity
- [ ] Add invariants for one identity per seat
- [ ] Add fuzz tests for timing boundaries
- [ ] Add fuzz tests for cause distributions

---

## P0 — Anvil load harness
- [ ] Build single-game 250-player stress harness
- [ ] Build sequential-game soak harness
- [ ] Build multi-instance local stress harness
- [ ] Add chaos profile (missed reveals / invalid attempts / auth expiry)
- [ ] Emit machine-readable load reports
- [ ] Record gas summaries by action
- [ ] Verify replay consistency after stress runs

---

## P0 — Base Sepolia readiness
- [ ] Finalize Sepolia parameter profile
- [ ] Deploy canary contracts to Base Sepolia
- [ ] Verify auth flow on testnet
- [ ] Run first small canary game
- [ ] Produce replay artifact from Sepolia data
- [ ] Run repeated pilot games on Sepolia
- [ ] Validate payout and refund behavior on Sepolia

---

## P0 — agent tooling
- [ ] Build auth/join script
- [ ] Build commit script
- [ ] Build reveal script
- [ ] Build claim script
- [ ] Build state-read helper
- [ ] Build round-summary helper
- [ ] Define `agent.json` shape
- [ ] Validate end-to-end play with a small agent set

---

## P0 — observer / replay
- [ ] Show current game phase
- [ ] Show joined players and causes
- [ ] Show round number
- [ ] Show reveal/resolution output
- [ ] Show winners or no-winner outcome
- [ ] Show payout destinations
- [ ] Export replay summary
- [ ] Export chat-vs-move summary

---

## P0 — coordination layer
- [ ] Implement dedicated `GameChat` contract
- [ ] Finalize minimal public onchain message model
- [ ] Implement global and cause-scoped message posting
- [ ] Restrict global posting to joined participants, including eliminated players
- [ ] Restrict cause posting to **alive** actual same-cause participants
- [ ] Capture messages for post-game analysis
- [ ] Label actual teammates from contract state in replay output

---

## P0 — mainnet launch readiness
- [ ] Freeze mainnet pilot parameters
- [ ] Prepare deployment checklist
- [ ] Prepare incident / pause checklist
- [ ] Prepare contract address + config sheet
- [ ] Prepare first invited-agent mainnet pilot

---

## P1 — prize/quality improvements
- [ ] Add ENS display support
- [ ] Add demo ENS subnames if useful
- [ ] Add optional MetaMask Delegations path
- [ ] Improve observer UI
- [ ] Improve replay visualization
- [ ] Improve agent behavior summaries

---

## P1 — documentation and submission
- [ ] Update `DEMO.md`
- [ ] Update `PRIZES.md`
- [ ] Prepare architecture diagram
- [ ] Prepare backup demo video
- [ ] Prepare screenshots
- [ ] Prepare judge-friendly proof pack

---

## P2 — stretch work
- [ ] Private/encrypted comms experiments
- [ ] Larger-scale automated simulations
- [ ] Richer replay search/filtering
- [ ] More advanced identity/reputation layers

---

## Definition of done for v1
We are done when:
- the onchain game works end to end,
- the rules are fully locked by tests,
- Anvil stress has tried hard to break it,
- Base Sepolia pilots succeed,
- and a small Base mainnet pilot can be launched responsibly.
