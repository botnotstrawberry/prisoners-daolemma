# Public Launch Validation

**Date:** 2026-03-22 UTC  
**Purpose:** record the validation status for the V1.1 public-launch patch that allows any admitted wallet to launch the next official game by auto-joining and selecting a bounded join window.

---

## Patch summary

Behavior added:
- any wallet already admitted under the normal join/auth rules may call `launchGameAndJoin(...)`
- launching auto-joins the caller and requires the normal entry fee
- only `joinDurationSeconds` is caller-selected
- public bounds are `300..3600` seconds
- all other game settings remain inherited from the owner-managed default config
- cause whitelist remains owner-managed

Primary contract file:
- `packages/foundry/contracts/PrisonersDAOlemma.sol`

Primary tooling/tests touched:
- `packages/foundry/test/PrisonersDAOlemma.t.sol`
- `packages/foundry/scripts-js/gameTooling.js`
- `packages/foundry/scripts-js/gameCli.js`
- `packages/foundry/scripts-js/integrationSmoke.test.js`
- `scripts/run-fresh-sepolia-public-launch-rehearsal.sh`

---

## Local validation

### Solidity / Foundry
- full Foundry suite passed: **106 / 106**
- launch-focused unit tests cover:
  - admitted wallet can launch and auto-join
  - unauthorized wallet cannot launch
  - too-small / too-large join duration reverts
  - active-game gate remains enforced
  - invalid cause / wrong entry fee reverts unwind creation
  - underfilled launched game still cancels/refunds

### JS / CLI
- `node --check` passed for:
  - `packages/foundry/scripts-js/gameCli.js`
  - `packages/foundry/scripts-js/gameTooling.js`
- full `scripts-js/*.test.js` suite passed: **54 / 54**
- `integrationSmoke.test.js` was updated to exercise the real `launch` path end-to-end

### Size check
- `PrisonersDAOlemma` runtime size: **20,922 B**
- EIP-170 limit: **24,576 B**
- remaining margin: **3,654 B**

---

## Focused audit result

Focused review conclusion:
- **no material contract-level bug found** in the new `launchGameAndJoin` path
- main issues found during review were JS/CLI release blockers in the first draft of the patch
- those JS/CLI issues were fixed before final validation

Audit focus areas reviewed:
- launch auth equivalence with normal join auth
- launch+join atomicity and revert safety
- snapshot correctness
- one-active-game discipline
- remaining owner-only product surfaces
- JS/CLI consistency with the contract entrypoint

Important accepted V1 tradeoff:
- admitted-wallet grief remains possible at low cost (gas/time), because an admitted wallet can launch an underfilled game and later be refunded after cancel
- this is accepted for the hackathon V1 product model and bounded by the 300..3600 join window

---

## Fresh Base Sepolia validation run

Successful run directory:
- `.mainnet-readiness/20260322T182933Z-fresh-sepolia-public-launch-rehearsal/`

Deployment summary:
- Registry: `0xa343C17E44614fB549f32ECFfb2bF2813ECa8AB7`
- Game: `0xB6F0382e6809e013C8D9772a2DA5bF3F204cBB37`
- Chat: `0xa9bB6E2DBd3b483f89Aa8C42A6e477cfCaE52606`

Validation profile used:
- `joinDurationSeconds = 300`
- `commitDurationBlocks = 60`
- `revealDurationBlocks = 60`
- `minPlayers = 9`
- `maxPlayers = 9`
- `maxCauses = 2`
- `entryFeeWei = 1000000000000000` (`0.001 ETH`)

Public-launch path exercised:
- player wallet launched the game through the new public launch entrypoint
- launcher auto-joined in the same transaction
- players `2..9` joined afterward
- owner was **not** required to create the game itself

Final run outcome (`query/game-summary-final.json`):
- phase: **Ended**
- outcome: **Winners**
- round: **3**
- terminal path: **winner-claims**
- joined: **9**
- alive at end: **9**
- claimed: **9**
- used causes: **2**
- committed: **9**
- revealed: **9**
- treasury withdrawn: **yes**

Interpretation:
- the new public launch path works onchain on Base Sepolia
- the 9-player small-mainnet-style profile completed end-to-end cleanly
- a fresh 32-player rerun is not required for this patch specifically, because the round/settlement mechanics were unchanged and the public-launch change is narrow

---

## Freeze implication

This patch replaces the earlier freeze candidate.
The next freeze/mainnet candidate should be the commit that contains:
- the contract patch,
- the tests/tooling fixes,
- the gameplay skill/docs update,
- the public-launch validation note,
- and the successful Sepolia validation artifacts required by repo policy.
