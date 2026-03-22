import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { runNode } from "./testHelpers.js";

test("load harness smoke run deploys ERC-8004 stack and finishes successfully", () => {
  const outDir = mkdtempSync(join(tmpdir(), "load-harness-smoke-"));
  const report = JSON.parse(
    runNode([
      "scripts-js/loadHarnessCli.js",
      "--profile",
      "smoke",
      "--player-count",
      "4",
      "--cause-count",
      "2",
      "--games",
      "1",
      "--scenario",
      "winner-all-share",
      "--concurrency",
      "2",
      "--out",
      outDir,
      "--json",
    ])
  );

  assert.equal(report.status, "ok");
  assert.match(report.deployment.identityRegistry, /^0x[0-9a-fA-F]{40}$/);
  assert.match(report.deployment.authRegistry, /^0x[0-9a-fA-F]{40}$/);
  assert.match(report.deployment.game, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(report.bootstrap.playersRegistered, 4);
  assert.equal(report.games.length, 1);
});
