import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import net from "net";
import { ethers } from "ethers";
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

function createOutDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test(
  "load harness runs a small sequential local smoke and emits structured winner artifacts",
  { timeout: 120_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-winner-");

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
    assert.equal(report.options.requestedScenario, "winner-all-share");
    assert.deepEqual(report.scenarios.plan, ["winner-all-share", "winner-all-share"]);
    assert.equal(report.txSummary.failed, 0);
    assert.equal(report.txSummary.failedExpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.ok(report.txSummary.succeeded > 0);
    assert.ok(report.chaos.skippedCommitCount > 0);
    assert.ok(report.chaos.skippedRevealCount > 0);
    assert.ok(existsSync(reportPath));
    assert.ok(existsSync(txLogPath));

    for (const game of report.games) {
      assert.equal(game.scenario.type, "winner-all-share");
      assert.equal(game.resultState.phase, "Ended");
      assert.equal(game.resultState.outcome, "Winners");
      assert.equal(game.resultState.terminalPath, "winner-claims");
      assert.equal(game.resultState.counts.joined, 6);
      assert.equal(game.resultState.counts.alive, 6);
      assert.equal(game.resultState.counts.claimed, 6);
      assert.equal(game.claims.succeeded, 6);
      assert.equal(game.refunds.succeeded, 0);
      assert.equal(game.expectedFailures.attempted, 0);
      assert.equal(game.replayConsistency.ok, true);
      assert.ok(game.deadlineMisses.commitRounds > 0 || game.deadlineMisses.revealRounds > 0);
      assert.ok(existsSync(game.evidence.outputDir));
      assert.ok(existsSync(game.evidence.manifestPath));
    }
  }
);

test(
  "load harness fully wires the cancelled-underfilled refund path and reports expected failures honestly",
  { timeout: 120_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-cancelled-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "cancelled-underfilled",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      expectedFailures: true,
      seed: "load-harness-cancelled-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];
    const expectedRefundWei = ethers.utils
      .parseEther("0.01")
      .mul(game.scenario.plannedJoinedPlayers)
      .toString();

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "single-game");
    assert.deepEqual(report.scenarios.plan, ["cancelled-underfilled"]);
    assert.equal(report.txSummary.failed, 2);
    assert.equal(report.txSummary.failedExpected, 2);
    assert.equal(report.txSummary.failedUnexpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);

    assert.equal(game.scenario.type, "cancelled-underfilled");
    assert.equal(game.scenario.plannedJoinedPlayers, 2);
    assert.equal(game.scenario.nonJoiningRegisteredPlayers, 4);
    assert.equal(game.resultState.phase, "Cancelled");
    assert.equal(game.resultState.outcome, "Cancelled");
    assert.equal(game.resultState.terminalPath, "cancelled-refunds");
    assert.equal(game.rounds.length, 0);
    assert.equal(game.resultState.counts.joined, 2);
    assert.equal(game.resultState.counts.refunded, 2);
    assert.equal(game.claims.succeeded, 0);
    assert.equal(game.refunds.succeeded, 2);
    assert.equal(game.refunds.totalRefundWei, expectedRefundWei);
    assert.equal(game.terminalActions.refundsExecuted, 2);
    assert.equal(game.expectedFailures.enabled, true);
    assert.equal(game.expectedFailures.attempted, 2);
    assert.equal(game.expectedFailures.failedAsExpected, 2);
    assert.equal(game.expectedFailures.unexpectedSuccesses, 0);
    assert.equal(game.replayConsistency.ok, true);
    assert.ok(existsSync(game.evidence.outputDir));
    assert.ok(existsSync(game.evidence.manifestPath));
  }
);

test(
  "load harness wires the no-winner routing path through treasury and cause withdrawals",
  { timeout: 120_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-nowinner-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "no-winner-all-catch",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      expectedFailures: true,
      seed: "load-harness-no-winner-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "single-game");
    assert.deepEqual(report.scenarios.plan, ["no-winner-all-catch"]);
    assert.equal(report.txSummary.failed, 5);
    assert.equal(report.txSummary.failedExpected, 5);
    assert.equal(report.txSummary.failedUnexpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);

    assert.equal(game.scenario.type, "no-winner-all-catch");
    assert.equal(game.resultState.phase, "Ended");
    assert.equal(game.resultState.outcome, "NoWinners");
    assert.equal(game.resultState.terminalPath, "no-winner-routing");
    assert.equal(game.resultState.counts.joined, 6);
    assert.equal(game.resultState.counts.alive, 0);
    assert.equal(game.resultState.counts.claimed, 0);
    assert.equal(game.claims.succeeded, 0);
    assert.equal(game.refunds.succeeded, 0);
    assert.equal(game.withdrawals.treasury.executed, true);
    assert.equal(game.withdrawals.causes.succeeded, 3);
    assert.equal(game.terminalActions.treasuryWithdrawalExecuted, true);
    assert.equal(game.terminalActions.causeWithdrawalsExecuted, 3);
    assert.equal(game.expectedFailures.enabled, true);
    assert.equal(game.expectedFailures.attempted, 5);
    assert.equal(game.expectedFailures.failedAsExpected, 5);
    assert.equal(game.expectedFailures.unexpectedSuccesses, 0);
    assert.equal(game.replayConsistency.ok, true);
    assert.ok(existsSync(game.evidence.outputDir));
    assert.ok(existsSync(game.evidence.manifestPath));
  }
);
