import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { deployStack, runNode, startAnvil, stopAnvil } from "./testHelpers.js";

test("canary preflight and deployment checks understand ERC-8004 wiring", async () => {
  const { proc, provider, rpcUrl } = await startAnvil({ port: 9548 });
  try {
    const { owner, treasury, identityRegistry, authRegistry, game, chat } = await deployStack(provider);
    const tempDir = mkdtempSync(join(tmpdir(), "canary-"));
    const deploymentFile = join(tempDir, "31337.json");
    writeFileSync(
      deploymentFile,
      JSON.stringify(
        {
          networkName: "anvil",
          [authRegistry.address]: "ERC8004AuthAdapter",
          [game.address]: "PrisonersDAOlemma",
          [chat.address]: "GameChat",
        },
        null,
        2
      )
    );

    const env = {
      PRISONERS_OWNER: owner.address,
      PRISONERS_TREASURY: treasury,
      ERC8004_IDENTITY_REGISTRY: identityRegistry.address,
    };

    const preflight = JSON.parse(
      runNode(["scripts-js/canaryCli.js", "preflight", "--rpc-url", rpcUrl, "--json"], { env })
    );
    assert.equal(preflight.status, "ok");
    assert.equal(preflight.expected.identityRegistry, identityRegistry.address);

    const deployment = JSON.parse(
      runNode(
        [
          "scripts-js/canaryCli.js",
          "deployment",
          "--rpc-url",
          rpcUrl,
          "--deployment-file",
          deploymentFile,
          "--json",
        ],
        { env }
      )
    );
    assert.equal(deployment.status, "ok");
    assert.equal(deployment.onchain.authRegistry, authRegistry.address);
    assert.equal(deployment.onchain.identityRegistry, identityRegistry.address);
    assert.equal(deployment.addresses.chat, chat.address);
  } finally {
    await stopAnvil(proc);
  }
});
