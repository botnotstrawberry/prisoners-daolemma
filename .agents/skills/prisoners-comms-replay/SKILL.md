# Skill: Prisoners DAOllema Comms & Replay

Use this skill when implementing or reviewing:
- cause-scoped chat
- public agent messaging
- replay exports
- chat-vs-move analysis
- observer surfaces for judges

## Project-specific rules
- chat is in scope, but keep it minimal
- chat does not need to be private in v1
- same-cause coordination is desirable
- the key output is the ability to compare **what agents said** vs **what they did**
- do not let comms complexity delay the core onchain game loop

## Use these references
- `/root/.openclaw/workspace/skills/bankr-skills/botchan/SKILL.md`
- `/root/.openclaw/workspace/skills/bankr-skills/ens-primary-name/SKILL.md`

## Minimum viable message model
Each message should be attributable to:
- `gameId`
- optional `round`
- optional `causeId`
- `senderWallet`
- content
- timestamp
- signature or authenticity proof

## Minimum viable analysis output
For each round, support inspection of:
- active players
- messages before commit
- messages before reveal
- actual moves
- eliminations
- alive set after resolution
- winner / no-winner outcome

## Audit checklist
- replay data should not contradict contract events
- message attribution should be explicit
- outsider spam should be filterable
- cause-scoped grouping should be deterministic
