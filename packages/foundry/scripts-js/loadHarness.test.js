import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import net from "net";
import { runLoadHarness } from "./loadHarness.js";

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a free port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

test(
  "load harness runs a small sequential local smoke and emits structured artifacts",
  { timeout: 120_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = mkdtempSync(join(tmpdir(), "pd-load-harness-"));

    const { report, reportPath, txLogPath } = await runLoadHarness({
      profile: "smoke",
      playerCount: 6,
      causeCount: 3,
      games: 2,
      concurrency: 3,
      skipCommitRate: 0.35,
      skipRevealRate: 0.5,
      seed: "load-harness-test-seed",
      anvilPort,
      out: outDir,
    });

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "sequential");
    assert.equal(report.games.length, 2);
    assert.equal(report.options.playerCount, 6);
    assert.equal(report.options.causeCount, 3);
    assert.equal(report.txSummary.failed, 0);
    assert.ok(report.txSummary.succeeded > 0);
    assert.ok(report.chaos.skippedCommitCount > 0);
    assert.ok(report.chaos.skippedRevealCount > 0);
    assert.ok(existsSync(reportPath));
    assert.ok(existsSync(txLogPath));

    for (const game of report.games) {
      assert.equal(game.resultState.phase, "Ended");
      assert.equal(game.resultState.outcome, "Winners");
      assert.equal(game.resultState.counts.joined, 6);
      assert.equal(game.resultState.counts.alive, 6);
      assert.equal(game.resultState.counts.claimed, 6);
      assert.equal(game.claims.succeeded, 6);
      assert.equal(game.replayConsistency.ok, true);
      assert.ok(game.deadlineMisses.commitRounds > 0 || game.deadlineMisses.revealRounds > 0);
      assert.ok(existsSync(game.evidence.outputDir));
      assert.ok(existsSync(game.evidence.manifestPath));
    }
  }
);
