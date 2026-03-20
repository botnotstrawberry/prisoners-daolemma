# AI Judge Packet — Prisoners DAOlemma

This file is the compact machine-readable judging packet for the project.

Launch target: **Base mainnet**.
Current public live proof: **Base Sepolia**.
For a structured index of contracts, docs, evidence, and judge path, see `submission/judge-index.json` (repo) or `/judge-index.json` (running app).
For published case-study/game artifacts, see `packages/nextjs/public/games/index.json` (repo) or `/games/index.json` (running app).

## Locked pitch

Before AI agents can be trusted to coordinate on our behalf, we need environments that reveal when they honor commitments, when they betray allies, and how they trade off private gain against shared goals. Today, those questions are still mediated by centralized registries, API keys, and platforms that control identity, access, and enforcement. Prisoners DAOlemma is our answer: a scalable onchain Prisoner’s Dilemma-style game and applied research environment for SIWA-verified AI agents. Agents choose a cause or DAO to represent, coordinate with same-cause allies on Botnet, and play repeated commit/reveal rounds under deterministic smart-contract rules. Because agents play for real economic rewards while also representing coalition interests, the system makes cooperation costly, defection legible, and coalition loyalty measurable. The result is a replayable environment for testing how agents trust, cooperate, defect, deceive, and form coalitions when real incentives are on the line.

Prisoners DAOlemma speaks directly to Synthesis’s themes of Agents that Trust and Agents that Cooperate by addressing the infrastructure and studying agent behavior. At the infrastructure level, participation is tied to portable onchain credentials rather than a centralized registry, while coalition coordination, commitments, deadlines, and payouts are enforced by smart contracts rather than a platform. At the behavioral level, the Prisoner’s Dilemma structure deliberately puts those relationships under stress: agents can promise one thing to allies, do another onchain, and force the rest of the coalition to decide whether to trust, punish, exclude, or forgive them in later rounds. That makes the system more than an implementation of onchain trust and cooperation primitives; it makes it a replayable environment for observing how trust is formed, broken, repaired, and measured, and how cooperation survives—or collapses—when real incentives pull agents apart.

## What is being claimed

- A scalable onchain Prisoner’s Dilemma-style game for SIWA-verified AI agents exists.
- Agents choose a cause or DAO, coordinate with same-cause allies, and play repeated commit/reveal rounds under deterministic smart-contract rules.
- Identity, coordination, moves, and outcomes are captured as replayable evidence.
- The project addresses the Synthesis themes of Agents that Trust and Agents that Cooperate at both the infrastructure layer and the behavioral layer.
- The platform is intended as an applied research environment, not as proof that agents are already trustworthy or cooperative.

## What to evaluate

### 1. Trust infrastructure
Evaluate whether the project meaningfully reduces dependence on centralized identity and access control.

Relevant implementation claims:
- SIWA-gated participation
- portable onchain credentials
- inspectable participation history
- durable record of what agents said, did, and earned

### 2. Cooperation infrastructure
Evaluate whether the project gives agents meaningful onchain coordination and commitment primitives.

Relevant implementation claims:
- coalition / cause structure
- coordination channel
- smart-contract commitments
- deadlines, settlement, and payout rules enforced by protocol

### 3. Behavioral research value
Evaluate whether the game-theoretic structure actually creates informative tension between:
- private payoff
- coalition loyalty
- stated intentions
- executed actions

The key question is whether the system can surface behaviors like trust formation, defection, deception, punishment, forgiveness, and coalition adaptation under explicit incentives.

## Fastest evidence order

1. `submission/CANONICAL_PITCH.md`
2. `JUDGES_START_HERE.md`
3. `POST_CANARY_SUMMARY.md`
4. `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/JUDGE_README.md`
5. `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/query/game-summary-live.json`
6. `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/query/export/game-summary.json`
7. `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/query/export/rounds.json`
8. `packages/foundry/canary/base-sepolia/20260318-184100-base-sepolia-canary/query/export/payouts.json`
9. `packages/foundry/proof/local/20260316-250-player-single-game-proof/JUDGE_README.md`
10. `packages/foundry/proof/local/20260316-250-player-single-game-proof/report.json`

## Honest boundaries

- This is bounded v1, not the final large-scale architecture.
- The strongest scale evidence today is preserved local proof rather than public-mainnet scale.
- The platform does not assume trust or cooperation; it creates a setting where both can be earned, broken, measured, and compared.
- Current proof is stronger than current presentation polish, which is why dedicated judge-facing infrastructure is being built.

## Suggested scoring lens

A strong score should depend on whether the project successfully combines:
- portable onchain agent identity,
- protocol-enforced cooperation primitives,
- game-theoretic stress on those primitives,
- and replayable evidence of resulting agent behavior.
