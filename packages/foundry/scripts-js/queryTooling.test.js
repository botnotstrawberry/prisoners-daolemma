import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

import { collectGameEvidence } from "./queryTooling.js";
import {
  createGame,
  deployStack,
  deriveWallet,
  registerIdentity,
  startAnvil,
  stopAnvil,
  whitelistCause,
} from "./testHelpers.js";

test("collectGameEvidence exports ERC-8004 auth status alongside joined players", async () => {
  const { proc, provider } = await startAnvil({ port: 9547 });
  try {
    const { owner, identityRegistry, authRegistry, game, chat } = await deployStack(provider);
    const player1 = deriveWallet(1, provider);
    const player2 = deriveWallet(2, provider);

    const agentId1 = await registerIdentity(identityRegistry, player1, "agent://player-1");
    const agentId2 = await registerIdentity(identityRegistry, player2, "agent://player-2");

    await whitelistCause(game, owner, 1, deriveWallet(40, provider).address);
    await whitelistCause(game, owner, 2, deriveWallet(41, provider).address);
    const gameId = await createGame(game, owner);

    await (
      await game.connect(player1).join(gameId, 1, {
        value: ethers.utils.parseEther("0.001"),
      })
    ).wait();
    await (
      await game.connect(player2).join(gameId, 2, {
        value: ethers.utils.parseEther("0.001"),
      })
    ).wait();

    await (await identityRegistry.setOwner(agentId2, ethers.constants.AddressZero)).wait();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      chat: chat.address,
      gameId,
    });

    assert.equal(evidence.auth.registry, authRegistry.address);
    assert.equal(evidence.auth.identityRegistry, identityRegistry.address);
    assert.equal(evidence.roster.participants.length, 2);

    const p1 = evidence.roster.participants.find((entry) => entry.wallet === player1.address);
    const p2 = evidence.roster.participants.find((entry) => entry.wallet === player2.address);

    assert.equal(p1.auth.status, "active");
    assert.equal(p1.auth.record.identityBalance, "1");
    assert.equal(p2.auth.status, "missing");
    assert.equal(p2.auth.record.identityBalance, "0");
    assert.equal(p2.joined, true);
    assert.equal(evidence.auth.participants.find((entry) => entry.wallet === player1.address).events.length, 0);
    assert.equal(evidence.auth.participants.find((entry) => entry.wallet === player2.address).events.length, 0);
    assert.equal(agentId1, "1");
    assert.equal(agentId2, "2");
  } finally {
    await stopAnvil(proc);
  }
});
