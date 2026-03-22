import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ethers } from "ethers";

import {
  createGame,
  deployStack,
  deriveWallet,
  runNode,
  startAnvil,
  stopAnvil,
  whitelistCause,
} from "./testHelpers.js";

test("permissionless ERC-8004 local flow registers wallets and exports evidence", async () => {
  const { proc, provider, rpcUrl } = await startAnvil({ port: 9546 });
  try {
    const { owner, identityRegistry, authRegistry, game, chat } = await deployStack(provider);
    const player1 = deriveWallet(1, provider);
    const player2 = deriveWallet(2, provider);

    const registration1 = JSON.parse(
      runNode(
        [
          "scripts-js/authCli.js",
          "register",
          "--rpc-url",
          rpcUrl,
          "--identity-registry",
          identityRegistry.address,
          "--auth-registry",
          authRegistry.address,
          "--game",
          game.address,
          "--wallet",
          player1.address,
          "--agent-uri",
          "agent://player-1",
          "--json",
        ],
        {
          env: { GAMEPLAY_WALLET_PRIVATE_KEY: player1.privateKey },
        }
      )
    );
    const registration2 = JSON.parse(
      runNode(
        [
          "scripts-js/authCli.js",
          "register",
          "--rpc-url",
          rpcUrl,
          "--identity-registry",
          identityRegistry.address,
          "--auth-registry",
          authRegistry.address,
          "--game",
          game.address,
          "--wallet",
          player2.address,
          "--agent-uri",
          "agent://player-2",
          "--json",
        ],
        {
          env: { GAMEPLAY_WALLET_PRIVATE_KEY: player2.privateKey },
        }
      )
    );

    assert.equal(registration1.wallet, player1.address);
    assert.equal(registration2.wallet, player2.address);

    const status1 = JSON.parse(
      runNode([
        "scripts-js/authCli.js",
        "status",
        "--rpc-url",
        rpcUrl,
        "--auth-registry",
        authRegistry.address,
        "--wallet",
        player1.address,
        "--agent-id",
        registration1.agentId,
        "--json",
      ])
    );
    assert.equal(status1.isAuthorized, true);
    assert.equal(status1.wallet, player1.address);
    assert.equal(status1.token.owner, player1.address);

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

    const outputDir = mkdtempSync(join(tmpdir(), "permissionless-auth-export-"));
    const exportResult = JSON.parse(
      runNode([
        "scripts-js/queryCli.js",
        "export",
        "--rpc-url",
        rpcUrl,
        "--game",
        game.address,
        "--chat",
        chat.address,
        "--game-id",
        String(gameId),
        "--output-dir",
        outputDir,
        "--json",
      ])
    );

    const produced = Object.fromEntries(
      exportResult.produced.map((entry) => [entry.artifact, entry.path])
    );
    const auth = JSON.parse(readFileSync(produced["auth.json"], "utf8"));
    const summary = JSON.parse(readFileSync(produced["game-summary.json"], "utf8"));
    const roster = JSON.parse(readFileSync(produced["roster.json"], "utf8"));

    assert.equal(auth.registry, authRegistry.address);
    assert.equal(auth.identityRegistry, identityRegistry.address);
    assert.equal(auth.participants.length, 2);
    assert.equal(summary.game.phase, "Joining");
    assert.equal(roster.participants.length, 2);
    assert.equal(roster.participants[0].auth.isAuthorizedNow, true);
  } finally {
    await stopAnvil(proc);
  }
});
