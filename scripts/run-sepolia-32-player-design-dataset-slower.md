# Slower 32-player Base Sepolia prep

Prepared only. Not executed.

## Intended profile
- joinDurationSeconds: 300
- commitDurationBlocks: 120
- revealDurationBlocks: 120
- minPlayers: 3
- maxPlayers: 32
- maxCauses: 8
- entryFeeWei: 0.001 ETH
- target player balance: 0.005 ETH
- parallelism: 16

## Why this exists
The fast 32-player live run proved that:
- wallet provisioning/auth/funding were no longer the main blocker
- 32 players can join successfully on Base Sepolia
- 40-block commit/reveal windows are too tight for a 32-wallet live burst

At ~2s/block on Base/Base Sepolia:
- 40 blocks ≈ 80s
- 60 blocks ≈ 120s
- 120 blocks ≈ 240s

This slower profile is the next prepared run to validate a full 32-player terminal path onchain.
