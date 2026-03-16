import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  DEFAULT_LOAD_HARNESS_MATRIX_PRESET,
  buildLoadHarnessMatrixPlan,
  runLoadHarnessMatrix,
} from "./loadHarnessMatrix.js";

function createOutDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function countForKey(entries, key) {
  return (entries ?? []).find((entry) => entry.key === key)?.count ?? 0;
}

test("load harness matrix exposes a bounded large local preset", () => {
  const outDir = createOutDir("pd-load-harness-matrix-large-plan-");
  const plan = buildLoadHarnessMatrixPlan({
    preset: "large-local",
    out: outDir,
  });

  assert.equal(plan.presetName, "large-local");
  assert.equal(plan.plannedRunCount, 2);
  assert.deepEqual(
    plan.runs.map((run) => ({
      id: run.id,
      caseId: run.caseId,
      playerCount: run.harnessOptions.playerCount,
      games: run.harnessOptions.games,
      commitDurationBlocks: run.harnessOptions.commitDurationBlocks,
      revealDurationBlocks: run.harnessOptions.revealDurationBlocks,
    })),
    [
      {
        id: "large-mixed-a",
        caseId: "large-mixed-scale",
        playerCount: 24,
        games: 3,
        commitDurationBlocks: 56,
        revealDurationBlocks: 56,
      },
      {
        id: "large-adversarial-a",
        caseId: "large-adversarial-scale",
        playerCount: 28,
        games: 2,
        commitDurationBlocks: 64,
        revealDurationBlocks: 64,
      },
    ]
  );
  assert.equal(
    Math.max(...plan.runs.map((run) => run.harnessOptions.playerCount)),
    28
  );
  assert.equal(
    plan.runs.reduce((sum, run) => sum + run.harnessOptions.games, 0),
    5
  );
});

test(
  "load harness matrix runs a medium local preset and emits aggregate artifacts",
  { timeout: 720_000, concurrency: false },
  async () => {
    const outDir = createOutDir("pd-load-harness-matrix-medium-");

    const { report, reportPath, summaryPath } = await runLoadHarnessMatrix({
      preset: "medium-local",
      runs: "medium-mixed-a,medium-adversarial-a",
      out: outDir,
    });

    assert.equal(DEFAULT_LOAD_HARNESS_MATRIX_PRESET, "broader-local");
    assert.equal(report.status, "ok");
    assert.equal(report.preset.name, "medium-local");
    assert.equal(report.plan.plannedRunCount, 2);
    assert.equal(report.plan.completedRunCount, 2);
    assert.deepEqual(report.plan.runIds, [
      "medium-mixed-a",
      "medium-adversarial-a",
    ]);
    assert.deepEqual(report.plan.caseIds, [
      "medium-adversarial-scale",
      "medium-mixed-scale",
    ]);
    assert.equal(report.coverage.totalRequestedGames, 6);
    assert.equal(report.coverage.totalCompletedGames, 6);
    assert.equal(report.coverage.sameBlockEnabledRuns, 0);
    assert.equal(report.coverage.expectedFailuresEnabledRuns, 0);
    assert.deepEqual(report.coverage.profiles, ["scale"]);
    assert.deepEqual(report.coverage.requestedScenarios, [
      "adversarial-random",
      "mixed",
    ]);
    assert.equal(report.coverage.largestRequestedPlayerCount, 20);
    assert.ok(report.coverage.seeds.includes("medium-mixed-a"));
    assert.ok(report.coverage.seeds.includes("medium-adversarial-a"));

    assert.ok(
      countForKey(report.scenarioSummary.byTerminalOutcome, "Winners") >= 1
    );
    assert.ok(
      countForKey(report.scenarioSummary.byTerminalOutcome, "Cancelled") >= 1
    );
    assert.ok(
      countForKey(report.scenarioSummary.byTerminalOutcome, "NoWinners") >= 1
    );
    assert.ok(
      countForKey(report.scenarioSummary.byTerminalOutcome, "Winners") +
        countForKey(report.scenarioSummary.byTerminalOutcome, "Cancelled") +
        countForKey(report.scenarioSummary.byTerminalOutcome, "NoWinners") >=
        6
    );

    assert.equal(report.breakageSummary.gamesWithWedgedActiveSlot, 0);
    assert.equal(report.breakageSummary.gamesWithTerminalStateMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithAccountingMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithPreviewMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithDrainMismatch, 0);
    assert.equal(report.breakageSummary.gamesWithReplayInconsistency, 0);
    assert.equal(report.breakageSummary.gamesWithUnexpectedFailures, 0);
    assert.equal(report.breakageSummary.totalUnexpectedFailures, 0);
    assert.equal(report.txSummary.failedUnexpected, 0);
    assert.equal(report.txSummary.unexpectedSuccesses, 0);
    assert.ok(report.txSummary.failedExpected > 0);
    assert.ok(report.breakageSummary.probeSummary.failedAsExpected > 0);
    assert.equal(report.sameBlockSummary.attemptedBatches, 0);
    assert.equal(report.sameBlockSummary.attemptedTxs, 0);
    assert.equal(report.sameBlockSummary.unexpectedFailures, 0);
    assert.equal(report.sameBlockSummary.unexpectedSuccesses, 0);
    assert.ok(report.localScaleReadiness.maxJoinedPlayersInSingleGame >= 16);
    assert.ok(
      report.localScaleReadiness.gamesHittingRequestedPlayerTarget >= 2
    );
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 6);
    assert.equal(report.localScaleReadiness.replayConsistentGames, 6);

    assert.equal(report.caseSummary.length, 2);
    assert.equal(
      report.caseSummary.find((entry) => entry.caseId === "medium-mixed-scale")
        ?.maxJoinedPlayersInSingleGame,
      16
    );
    assert.equal(
      report.caseSummary.find((entry) => entry.caseId === "medium-mixed-scale")
        ?.breakageSummary.gamesWithTerminalStateMismatch,
      0
    );
    assert.equal(
      report.caseSummary.find(
        (entry) => entry.caseId === "medium-adversarial-scale"
      )?.breakageSummary.gamesWithDrainMismatch,
      0
    );
    assert.ok(
      (report.caseSummary.find(
        (entry) => entry.caseId === "medium-adversarial-scale"
      )?.txFailedExpected ?? 0) > 0
    );

    assert.ok(existsSync(reportPath));
    assert.ok(existsSync(summaryPath));
    assert.equal(report.paths.report, reportPath);
    assert.equal(report.paths.summary, summaryPath);
    const markdown = readFileSync(summaryPath, "utf8");
    assert.match(markdown, /# Prisoners DAOllema local soak matrix/);
    assert.match(markdown, /## Aggregate breakage signals/);
    assert.match(markdown, /medium-local/);
    assert.match(markdown, /medium-mixed-a/);
    assert.match(markdown, /medium-adversarial-a/);
    assert.match(markdown, /Largest requested player count: 20/);

    for (const run of report.runs) {
      assert.equal(run.status, "ok");
      assert.equal(run.config.profile, "scale");
      assert.ok(run.config.commitDurationBlocks >= 40);
      assert.ok(run.config.revealDurationBlocks >= 40);
      assert.ok(existsSync(run.paths.report));
      assert.ok(existsSync(run.paths.txLog));
      assert.equal(run.result?.harnessStatus, "ok");
      assert.equal(
        run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0,
        0
      );
      assert.equal(
        run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0,
        0
      );
      assert.equal(
        run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0,
        0
      );
      assert.equal(
        run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0,
        0
      );
      assert.equal(run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0, 0);
      assert.equal(
        run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0,
        0
      );
      assert.equal(
        run.result?.breakageSummary?.totalUnexpectedFailures ?? 0,
        0
      );
      assert.equal(run.result?.txSummary?.failedUnexpected ?? 0, 0);
      assert.equal(run.result?.txSummary?.unexpectedSuccesses ?? 0, 0);
    }
  }
);
