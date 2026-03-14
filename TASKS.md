# TASKS: Prisoners DAOllema

## Priority guide
- **P0** = required for a working hackathon submission
- **P1** = strong improvement if time allows
- **P2** = nice to have

## P0 — product definition
- [ ] Finalize one-sentence pitch
- [ ] Finalize v1 scope
- [ ] Freeze core rules in `SPEC.md`
- [ ] Freeze default game parameters
- [ ] Freeze demo success criteria

## P0 — contract core
- [ ] Initialize contract project structure
- [ ] Implement game phases
- [ ] Implement join flow
- [ ] Implement commit flow
- [ ] Implement reveal flow
- [ ] Implement round resolution
- [ ] Implement end-of-game logic
- [ ] Implement winner claims
- [ ] Implement refund path
- [ ] Implement cause whitelist management
- [ ] Implement creator fee and cause cut

## P0 — tests
- [ ] Test join success
- [ ] Test duplicate join rejection
- [ ] Test invalid cause rejection
- [ ] Test commit / reveal happy path
- [ ] Test reveal mismatch rejection
- [ ] Test non-reveal treated as `SHARE`
- [ ] Test catchers-only outcome
- [ ] Test sharers-only streak progression
- [ ] Test stealers-only outcome
- [ ] Test sharers + catchers outcome
- [ ] Test stealers + catchers outcome
- [ ] Test stealers + sharers outcome
- [ ] Test all-three outcome
- [ ] Test sole survivor ending condition
- [ ] Test winner claim math
- [ ] Test no-winner distribution
- [ ] Test refunds when `minPlayers` is not met

## P0 — agent path
- [ ] Decide the v1 identity gate
- [ ] Implement agent authorization flow
- [ ] Build a simple agent join script
- [ ] Build a simple agent commit script
- [ ] Build a simple agent reveal script
- [ ] Build a game-state read helper
- [ ] Validate end-to-end play with a small agent set

## P0 — observer / demo surface
- [ ] Show current game phase
- [ ] Show joined players and causes
- [ ] Show round number
- [ ] Show reveal / resolution output
- [ ] Show end state and winners
- [ ] Show payout destinations
- [ ] Produce a simple replay or summary view

## P0 — coordination layer
- [ ] Define cause-linked message flow
- [ ] Define sender verification rules for gameplay use
- [ ] Capture messages for post-game analysis
- [ ] Show at least one coordination interaction in the demo

## P0 — submission readiness
- [ ] Write `DEMO.md`
- [ ] Write `PRIZES.md`
- [ ] Record a backup demo video
- [ ] Prepare screenshots
- [ ] Prepare architecture diagram
- [ ] Prepare short judge explanation

## P1 — performance and resilience
- [ ] Tune join / commit / reveal timings
- [ ] Test with 10+ agents
- [ ] Test with 30+ agents
- [ ] Measure gas for join / commit / reveal / resolve
- [ ] Identify the first scalability bottlenecks
- [ ] Add fallback scripts for flaky live-demo conditions

## P1 — usability
- [ ] Improve player status visibility
- [ ] Improve event summaries
- [ ] Improve payout clarity in the UI
- [ ] Add a cleaner observer layout

## P1 — analytics
- [ ] Export per-game event summary
- [ ] Export message summary by cause
- [ ] Export outcome statistics
- [ ] Produce one post-game analysis artifact for judges

## P2 — stretch work
- [ ] Support larger-scale automated simulations
- [ ] Add stronger anti-spam logic for message feeds
- [ ] Add relayer or batching path
- [ ] Add richer replay tooling
- [ ] Add multi-game support

## Immediate order of attack
1. Finish `PROJECT.md`, `SPEC.md`, `DEMO.md`, and `PRIZES.md`
2. Implement the contract skeleton and tests
3. Get a minimal end-to-end agent play loop working
4. Add the observer and coordination layer
5. Harden the live demo

## Definition of done for hackathon v1
We are done when:
- the game can be played end to end,
- the demo is understandable without a long explanation,
- payouts work,
- and the project is packaged clearly for judging.
