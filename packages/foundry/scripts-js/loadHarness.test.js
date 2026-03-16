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

function countForKey(entries, key) {
  return (entries ?? []).find((entry) => entry.key === key)?.count ?? 0;
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
    assert.deepEqual(report.scenarios.plan, [
      "winner-all-share",
      "winner-all-share",
    ]);
    assert.equal(report.txSummary.failed, 0);
    assert.equal(report.txSummary.failedExpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.ok(report.txSummary.succeeded > 0);
    assert.ok(report.chaos.skippedCommitCount > 0);
    assert.ok(report.chaos.skippedRevealCount > 0);
    assert.equal(report.localScaleReadiness.maxJoinedPlayersInSingleGame, 6);
    assert.equal(report.localScaleReadiness.totalJoinedPlayersAcrossRun, 12);
    assert.equal(
      report.localScaleReadiness.gamesHittingRequestedPlayerTarget,
      2
    );
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 2);
    assert.equal(report.localScaleReadiness.replayConsistentGames, 2);
    assert.equal(
      report.localScaleReadiness.totalTerminalActions.winnerClaimsExecuted,
      12
    );
    assert.equal(
      report.localScaleReadiness.totalTerminalActions
        .treasuryWithdrawalsExecuted,
      2
    );
    assert.equal(
      report.localScaleReadiness.totalTerminalActions.causeWithdrawalsExecuted,
      6
    );
    assert.ok(report.localScaleReadiness.hotspots.byAction.join);
    assert.ok(report.localScaleReadiness.hotspots.byAction.claim);
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
      assert.equal(game.withdrawals.treasury.executed, true);
      assert.equal(game.withdrawals.causes.succeeded, 3);
      assert.equal(game.terminalActions.treasuryWithdrawalExecuted, true);
      assert.equal(game.terminalActions.causeWithdrawalsExecuted, 3);
      assert.equal(game.postRunOutstanding.treasuryClaimableWei, "0");
      assert.equal(game.postRunOutstanding.totalCauseClaimableWei, "0");
      assert.equal(game.postRunOutstanding.unclaimedWinnerCount, 0);
      assert.equal(game.postRunOutstanding.pendingRefundCount, 0);
      assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
      assert.equal(game.expectedFailures.attempted, 0);
      assert.equal(game.replayConsistency.ok, true);
      assert.ok(
        game.deadlineMisses.commitRounds > 0 ||
          game.deadlineMisses.revealRounds > 0
      );
      assert.ok(existsSync(game.evidence.outputDir));
      assert.ok(existsSync(game.evidence.manifestPath));
    }
  }
);

test(
  "load harness can rehearse stale bundles plus expired auth before join and recover into a winner run",
  { timeout: 120_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-auth-expiry-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "winner-all-share",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      authExpiryChaos: true,
      authExpiryStaleBundles: 1,
      authExpiryJoinFailures: 1,
      authExpiryTtlSeconds: 2,
      seed: "load-harness-auth-expiry-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "single-game");
    assert.equal(report.options.authExpiryChaos.enabled, true);
    assert.deepEqual(report.options.authExpiryChaos.applyBeforeGameIndexes, [1]);
    assert.equal(report.authChaos.enabled, true);
    assert.equal(report.authChaos.gamesSelected, 1);
    assert.equal(report.authChaos.gamesApplied, 1);
    assert.equal(report.authChaos.staleBundle.attempted, 1);
    assert.equal(report.authChaos.staleBundle.failedAsExpected, 1);
    assert.equal(report.authChaos.expiredJoin.shortAuthRegistrations, 1);
    assert.equal(report.authChaos.expiredJoin.joinAttempts, 1);
    assert.equal(report.authChaos.expiredJoin.failedAsExpected, 1);
    assert.ok(report.authChaos.expiredJoin.localRegisterRejections >= 0);
    assert.equal(report.authChaos.expiredJoin.refreshedRegistrations, 1);
    assert.equal(report.authChaos.manualBlocksMined, 1);
    assert.ok(report.txSummary.failed >= 2);
    assert.ok(report.txSummary.failedExpected >= 2);
    assert.equal(report.txSummary.failedUnexpected, 0);
    assert.ok(report.txSummary.failedOnchain >= 1);
    assert.ok(report.txSummary.failedLocal >= 1);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);

    assert.equal(game.resultState.outcome, "Winners");
    assert.equal(game.resultState.phase, "Ended");
    assert.equal(game.resultState.counts.joined, 6);
    assert.equal(game.claims.succeeded, 6);
    assert.equal(game.postRunOutstanding.unclaimedWinnerCount, 0);
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
    assert.equal(game.replayConsistency.ok, true);
    assert.equal(game.authChaos.enabled, true);
    assert.equal(game.authChaos.applied, true);
    assert.equal(game.authChaos.staleBundle.attempted, 1);
    assert.equal(game.authChaos.staleBundle.failedAsExpected, 1);
    assert.equal(game.authChaos.expiredJoin.shortAuthRegistrations, 1);
    assert.equal(game.authChaos.expiredJoin.joinAttempts, 1);
    assert.equal(game.authChaos.expiredJoin.failedAsExpected, 1);
    assert.ok(game.authChaos.expiredJoin.localRegisterRejections >= 0);
    assert.equal(game.authChaos.expiredJoin.refreshedRegistrations, 1);
    assert.equal(game.authChaos.staleBundle.players[0].statusBeforeAttempt.isAuthorized, true);
    assert.equal(game.authChaos.staleBundle.players[0].statusAfterFailure.isAuthorized, true);
    assert.match(game.authChaos.staleBundle.players[0].failure, /expired/i);
    assert.equal(
      game.authChaos.expiredJoin.players[0].shortAuth.statusAfterRegister.isAuthorized,
      true
    );
    assert.equal(
      game.authChaos.expiredJoin.players[0].statusAfterExpiry.isAuthorized,
      false
    );
    assert.ok(game.authChaos.expiredJoin.players[0].joinFailure.length > 0);
    assert.equal(
      game.authChaos.expiredJoin.players[0].refreshedAuth.statusAfterRefresh.isAuthorized,
      true
    );
    assert.ok(game.blocks.manualMined >= 2);
    assert.ok(existsSync(game.evidence.outputDir));
    assert.ok(existsSync(game.evidence.manifestPath));
  }
);

test(
  "load harness can repeat bounded auth-expiry chaos before every sequential winner-path game",
  { timeout: 240_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-auth-expiry-broader-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "winner-all-share",
      playerCount: 6,
      causeCount: 3,
      games: 3,
      concurrency: 3,
      authExpiryChaos: true,
      authExpiryGames: "all",
      authExpiryStaleBundles: 2,
      authExpiryJoinFailures: 2,
      authExpiryTtlSeconds: 2,
      seed: "load-harness-auth-expiry-broader-seed",
      anvilPort,
      out: outDir,
    });

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "sequential");
    assert.deepEqual(report.options.authExpiryChaos.applyBeforeGameIndexes, [
      1,
      2,
      3,
    ]);
    assert.equal(report.authChaos.enabled, true);
    assert.equal(report.authChaos.gamesConsidered, 3);
    assert.equal(report.authChaos.gamesSelected, 3);
    assert.equal(report.authChaos.gamesApplied, 3);
    assert.equal(report.authChaos.timeWarpSeconds, 9);
    assert.equal(report.authChaos.manualBlocksMined, 3);
    assert.equal(report.authChaos.staleBundle.requested, 6);
    assert.equal(report.authChaos.staleBundle.attempted, 6);
    assert.equal(report.authChaos.staleBundle.failedAsExpected, 6);
    assert.equal(report.authChaos.expiredJoin.requested, 6);
    assert.equal(report.authChaos.expiredJoin.shortAuthRegistrations, 6);
    assert.equal(report.authChaos.expiredJoin.joinAttempts, 6);
    assert.equal(report.authChaos.expiredJoin.failedAsExpected, 6);
    assert.equal(report.authChaos.expiredJoin.refreshedRegistrations, 6);
    assert.equal(report.txSummary.failed, 12);
    assert.equal(report.txSummary.failedExpected, 12);
    assert.equal(report.txSummary.failedUnexpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 3);
    assert.equal(report.localScaleReadiness.replayConsistentGames, 3);

    for (const game of report.games) {
      assert.equal(game.resultState.outcome, "Winners");
      assert.equal(game.resultState.phase, "Ended");
      assert.equal(game.resultState.counts.joined, 6);
      assert.equal(game.claims.succeeded, 6);
      assert.equal(game.postRunOutstanding.unclaimedWinnerCount, 0);
      assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
      assert.equal(game.replayConsistency.ok, true);
      assert.equal(game.authChaos.enabled, true);
      assert.equal(game.authChaos.selectedForGame, true);
      assert.equal(game.authChaos.applied, true);
      assert.equal(game.authChaos.timeWarpSeconds, 3);
      assert.equal(game.authChaos.manualBlocksMined, 1);
      assert.equal(game.authChaos.staleBundle.requested, 2);
      assert.equal(game.authChaos.staleBundle.attempted, 2);
      assert.equal(game.authChaos.staleBundle.failedAsExpected, 2);
      assert.equal(game.authChaos.expiredJoin.requested, 2);
      assert.equal(game.authChaos.expiredJoin.shortAuthRegistrations, 2);
      assert.equal(game.authChaos.expiredJoin.joinAttempts, 2);
      assert.equal(game.authChaos.expiredJoin.failedAsExpected, 2);
      assert.equal(game.authChaos.expiredJoin.refreshedRegistrations, 2);
      assert.equal(game.authChaos.expiredJoin.players.length, 2);
      assert.equal(game.authChaos.staleBundle.players.length, 2);
      assert.ok(
        game.authChaos.expiredJoin.players.every(
          (player) =>
            player.shortAuth.statusAfterRegister.isAuthorized === true &&
            player.statusAfterExpiry.isAuthorized === false &&
            player.joinFailure.length > 0 &&
            player.refreshedAuth.statusAfterRefresh.isAuthorized === true
        )
      );
      assert.ok(
        game.authChaos.staleBundle.players.every(
          (player) =>
            player.statusBeforeAttempt.isAuthorized === true &&
            player.statusAfterFailure.isAuthorized === true &&
            /expired/i.test(player.failure)
        )
      );
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
    assert.equal(report.txSummary.failedOnchain, 2);
    assert.equal(report.txSummary.failedLocal, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 1);
    assert.equal(
      report.localScaleReadiness.totalTerminalActions.refundsExecuted,
      2
    );

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
    assert.equal(game.postRunOutstanding.treasuryClaimableWei, "0");
    assert.equal(game.postRunOutstanding.totalCauseClaimableWei, "0");
    assert.equal(game.postRunOutstanding.pendingRefundCount, 0);
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
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
    assert.equal(report.txSummary.failedOnchain, 5);
    assert.equal(report.txSummary.failedLocal, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 1);
    assert.equal(
      report.localScaleReadiness.totalTerminalActions
        .treasuryWithdrawalsExecuted,
      1
    );
    assert.equal(
      report.localScaleReadiness.totalTerminalActions.causeWithdrawalsExecuted,
      3
    );

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
    assert.equal(game.postRunOutstanding.treasuryClaimableWei, "0");
    assert.equal(game.postRunOutstanding.totalCauseClaimableWei, "0");
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
    assert.equal(game.expectedFailures.enabled, true);
    assert.equal(game.expectedFailures.attempted, 5);
    assert.equal(game.expectedFailures.failedAsExpected, 5);
    assert.equal(game.expectedFailures.unexpectedSuccesses, 0);
    assert.equal(game.replayConsistency.ok, true);
    assert.ok(existsSync(game.evidence.outputDir));
    assert.ok(existsSync(game.evidence.manifestPath));
  }
);


test(
  "load harness same-block probes cover winner edge ordering and duplicate settlement contention on local Anvil",
  { timeout: 180_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-same-block-winner-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "winner-all-share",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      sameBlockProbes: true,
      seed: "load-harness-same-block-winner-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];
    const expectedSameBlockBatches = game.rounds.length * 2 + 3;
    const expectedSameBlockTxs = game.rounds.length * 6 + 6;

    assert.equal(report.status, "ok");
    assert.equal(report.options.sameBlockProbes, true);
    assert.equal(report.sameBlockSummary.attemptedBatches, expectedSameBlockBatches);
    assert.equal(
      report.sameBlockSummary.minedBatches,
      report.sameBlockSummary.attemptedBatches
    );
    assert.equal(report.sameBlockSummary.attemptedTxs, expectedSameBlockTxs);
    assert.equal(
      report.sameBlockSummary.expectedFailures,
      report.sameBlockSummary.attemptedBatches
    );
    assert.equal(report.sameBlockSummary.unexpectedFailures, 0);
    assert.equal(report.sameBlockSummary.unexpectedSuccesses, 0);
    assert.equal(
      countForKey(report.sameBlockSummary.byLabel, "advanceFromCommit"),
      game.rounds.length
    );
    assert.equal(
      countForKey(report.sameBlockSummary.byLabel, "advanceFromReveal"),
      game.rounds.length
    );
    assert.equal(
      countForKey(report.sameBlockSummary.byLabel, "duplicate-claim-same-block"),
      1
    );
    assert.equal(
      countForKey(
        report.sameBlockSummary.byLabel,
        "duplicate-withdraw-treasury-same-block"
      ),
      1
    );
    assert.equal(
      countForKey(
        report.sameBlockSummary.byLabel,
        "duplicate-withdraw-cause-same-block"
      ),
      1
    );
    assert.equal(report.txSummary.failedUnexpected, 0);

    assert.equal(game.resultState.outcome, "Winners");
    assert.equal(game.resultState.phase, "Ended");
    assert.equal(game.claims.succeeded, 6);
    assert.equal(game.refunds.succeeded, 0);
    assert.equal(game.withdrawals.treasury.executed, true);
    assert.ok(game.withdrawals.causes.succeeded >= 3);
    assert.equal(game.sameBlock.enabled, true);
    assert.equal(game.sameBlock.attemptedBatches, expectedSameBlockBatches);
    assert.equal(game.sameBlock.minedBatches, expectedSameBlockBatches);
    assert.equal(game.sameBlock.attemptedTxs, expectedSameBlockTxs);
    assert.equal(game.sameBlock.expectedFailures, expectedSameBlockBatches);
    assert.equal(game.sameBlock.skipped, 0);
    assert.ok(game.rounds[0].commit.sameBlockAdvanceBatchId > 0);
    assert.ok(game.rounds[0].reveal.sameBlockAdvanceBatchId > 0);
    assert.equal(game.breakageChecks.ok, true);
    assert.equal(game.postRunOutstanding.treasuryClaimableWei, "0");
    assert.equal(game.postRunOutstanding.totalCauseClaimableWei, "0");
    assert.equal(game.postRunOutstanding.unclaimedWinnerCount, 0);
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
    assert.equal(game.replayConsistency.ok, true);
  }
);

test(
  "load harness same-block probes cover underfilled transition ordering and duplicate refunds",
  { timeout: 180_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-same-block-cancelled-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "cancelled-underfilled",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      sameBlockProbes: true,
      seed: "load-harness-same-block-cancelled-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];

    assert.equal(report.status, "ok");
    assert.equal(report.options.sameBlockProbes, true);
    assert.equal(report.sameBlockSummary.attemptedBatches, 2);
    assert.equal(report.sameBlockSummary.minedBatches, 2);
    assert.equal(report.sameBlockSummary.attemptedTxs, 4);
    assert.equal(report.sameBlockSummary.expectedFailures, 2);
    assert.equal(report.sameBlockSummary.unexpectedFailures, 0);
    assert.equal(report.sameBlockSummary.unexpectedSuccesses, 0);
    assert.equal(
      countForKey(report.sameBlockSummary.byLabel, "underfilled-transition-same-block"),
      1
    );
    assert.equal(
      countForKey(report.sameBlockSummary.byLabel, "duplicate-refund-same-block"),
      1
    );
    assert.equal(report.txSummary.failed, 2);
    assert.equal(report.txSummary.failedExpected, 2);
    assert.equal(report.txSummary.failedUnexpected, 0);

    assert.equal(game.resultState.outcome, "Cancelled");
    assert.equal(game.resultState.phase, "Cancelled");
    assert.equal(game.refunds.succeeded, 2);
    assert.equal(game.claims.succeeded, 0);
    assert.equal(game.sameBlock.enabled, true);
    assert.equal(game.sameBlock.attemptedBatches, 2);
    assert.equal(game.sameBlock.expectedFailures, 2);
    assert.equal(game.sameBlock.skipped, 0);
    assert.equal(game.breakageChecks.ok, true);
    assert.equal(game.postRunOutstanding.pendingRefundCount, 0);
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
    assert.equal(game.replayConsistency.ok, true);
  }
);

test(
  "load harness same-block probes cover no-winner round edge ordering plus duplicate treasury/cause withdrawals",
  { timeout: 180_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-same-block-nowinner-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "no-winner-all-catch",
      playerCount: 6,
      causeCount: 3,
      games: 1,
      concurrency: 3,
      sameBlockProbes: true,
      seed: "load-harness-same-block-no-winner-seed",
      anvilPort,
      out: outDir,
    });

    const game = report.games[0];

    assert.equal(report.status, "ok");
    assert.equal(report.options.sameBlockProbes, true);
    assert.equal(report.sameBlockSummary.attemptedBatches, 4);
    assert.equal(report.sameBlockSummary.minedBatches, 4);
    assert.equal(report.sameBlockSummary.attemptedTxs, 10);
    assert.equal(report.sameBlockSummary.expectedFailures, 4);
    assert.equal(report.sameBlockSummary.unexpectedFailures, 0);
    assert.equal(report.sameBlockSummary.unexpectedSuccesses, 0);
    assert.equal(countForKey(report.sameBlockSummary.byLabel, "advanceFromCommit"), 1);
    assert.equal(countForKey(report.sameBlockSummary.byLabel, "advanceFromReveal"), 1);
    assert.equal(
      countForKey(
        report.sameBlockSummary.byLabel,
        "duplicate-withdraw-treasury-same-block"
      ),
      1
    );
    assert.equal(
      countForKey(
        report.sameBlockSummary.byLabel,
        "duplicate-withdraw-cause-same-block"
      ),
      1
    );
    assert.equal(report.txSummary.failed, 4);
    assert.equal(report.txSummary.failedExpected, 4);
    assert.equal(report.txSummary.failedUnexpected, 0);

    assert.equal(game.resultState.outcome, "NoWinners");
    assert.equal(game.resultState.phase, "Ended");
    assert.equal(game.rounds.length, 1);
    assert.equal(game.claims.succeeded, 0);
    assert.equal(game.refunds.succeeded, 0);
    assert.equal(game.withdrawals.treasury.executed, true);
    assert.equal(game.withdrawals.causes.succeeded, 3);
    assert.equal(game.sameBlock.enabled, true);
    assert.equal(game.sameBlock.attemptedBatches, 4);
    assert.equal(game.sameBlock.attemptedTxs, 10);
    assert.equal(game.sameBlock.expectedFailures, 4);
    assert.equal(game.sameBlock.skipped, 0);
    assert.ok(game.rounds[0].commit.sameBlockAdvanceBatchId > 0);
    assert.ok(game.rounds[0].reveal.sameBlockAdvanceBatchId > 0);
    assert.equal(game.breakageChecks.ok, true);
    assert.equal(game.postRunOutstanding.treasuryClaimableWei, "0");
    assert.equal(game.postRunOutstanding.totalCauseClaimableWei, "0");
    assert.equal(game.postRunOutstanding.fullyDrainedByHarness, true);
    assert.equal(game.replayConsistency.ok, true);
  }
);

test(
  "load harness adversarial-random mode hunts for weird local state without leaving wedges or drain inconsistencies",
  { timeout: 180_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-adversarial-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "adversarial-random",
      playerCount: 7,
      causeCount: 3,
      games: 4,
      concurrency: 3,
      skipCommitRate: 0.25,
      skipRevealRate: 0.25,
      underfilledRate: 0.5,
      invalidRevealRate: 0.2,
      probeRate: 1,
      seed: "load-harness-adversarial-seed",
      anvilPort,
      out: outDir,
    });

    assert.equal(report.status, "ok");
    assert.equal(report.mode, "sequential");
    assert.deepEqual(report.scenarios.plan, [
      "adversarial-random",
      "adversarial-random",
      "adversarial-random",
      "adversarial-random",
    ]);
    assert.ok(report.chaos.probeAttempts > 0);
    assert.ok(report.breakageSummary.probeSummary.attempted > 0);
    assert.ok(report.breakageSummary.probeSummary.failedAsExpected > 0);
    assert.ok(report.breakageSummary.probeSummary.onchainReverts > 0);
    assert.equal(report.breakageSummary.probeSummary.localRejections, 0);
    assert.ok(
      report.games.reduce(
        (sum, game) => sum + countForKey(game.probes.byKind, "phase-edge-burst"),
        0
      ) > 0
    );
    assert.equal(report.breakageSummary.probeSummary.unexpectedSuccesses, 0);
    assert.equal(report.breakageSummary.gamesWithWedgedActiveSlot, 0);
    assert.equal(report.breakageSummary.gamesWithTerminalStateMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithAccountingMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithPreviewMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithDrainMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithReplayInconsistency, 0);
    assert.equal(report.breakageSummary.gamesWithUnexpectedFailures, 0);
    assert.equal(report.txSummary.failedUnexpected, 0);

    for (const game of report.games) {
      assert.equal(game.scenario.type, "adversarial-random");
      assert.equal(game.breakageChecks.ok, true);
      assert.equal(game.replayConsistency.ok, true);
      assert.equal(game.txSummary.failedUnexpected, 0);
      assert.ok(
        ["Winners", "NoWinners", "Cancelled"].includes(
          game.resultState.outcome
        )
      );
      assert.ok(game.probes.attempted >= 0);
      assert.ok(existsSync(game.evidence.outputDir));
      assert.ok(existsSync(game.evidence.manifestPath));
    }
  }
);

test(
  "load harness adversarial-random can force full-roster started games via minPlayers override",
  { timeout: 180_000, concurrency: false },
  async () => {
    const anvilPort = await getFreePort();
    const outDir = createOutDir("pd-load-harness-adversarial-full-roster-");

    const { report } = await runLoadHarness({
      profile: "smoke",
      scenario: "adversarial-random",
      playerCount: 7,
      minPlayers: 7,
      causeCount: 3,
      games: 2,
      concurrency: 3,
      skipCommitRate: 0,
      skipRevealRate: 0,
      underfilledRate: 0,
      invalidRevealRate: 0,
      probeRate: 0,
      seed: "load-harness-adversarial-full-roster-seed",
      anvilPort,
      out: outDir,
    });

    assert.equal(report.status, "ok");
    assert.equal(report.config.minPlayers, 7);
    assert.equal(report.localScaleReadiness.maxJoinedPlayersInSingleGame, 7);
    assert.equal(report.localScaleReadiness.gamesHittingRequestedPlayerTarget, 2);
    assert.equal(report.localScaleReadiness.totalJoinedPlayersAcrossRun, 14);
    assert.equal(report.breakageSummary.gamesWithUnexpectedFailures, 0);
    assert.equal(report.txSummary.failedUnexpected, 0);

    for (const game of report.games) {
      assert.equal(game.scenario.type, "adversarial-random");
      assert.equal(game.joinedPlayerCount, 7);
      assert.equal(game.scenario.plannedJoinedPlayers, 7);
      assert.equal(game.scenario.nonJoiningRegisteredPlayers, 0);
      assert.equal(game.adversarialPlan?.underfilledIntent, false);
      assert.equal(game.adversarialPlan?.nonJoinedPlayerCount, 0);
      assert.equal(game.breakageChecks.ok, true);
      assert.equal(game.replayConsistency.ok, true);
      assert.ok(existsSync(game.evidence.outputDir));
      assert.ok(existsSync(game.evidence.manifestPath));
    }
  }
);
