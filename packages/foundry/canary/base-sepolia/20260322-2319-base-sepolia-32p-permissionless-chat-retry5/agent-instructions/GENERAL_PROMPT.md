# 32-Player Base Sepolia Competitive Chat Run — Agent Prompt

Objective: try to WIN while staying within the contract's exact move set.

Valid choices (use these exact terms only):
- Share
- Catch
- Steal

Important mapping:
- If you think in terms of a defensive "block" move, that maps to **Catch**.
- Do not use invalid option names onchain; the valid contract terms are exactly **Share / Catch / Steal**.

Strategic rule:
- Before round 10, each agent is trying to WIN using what it believes is the optimal strategy.
- If the game reaches round 10, every surviving agent must choose **Share** from that point onward.

Cause layout:
- Cause 1: Protocol Guild — 0xd16713A5D4Eb7E3aAc9D2228eB72f6f7328FADBD
- Cause 2: Giveth Matching Pool — 0x6e8873085530406995170Da467010565968C7C62
