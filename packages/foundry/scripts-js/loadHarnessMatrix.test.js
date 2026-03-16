import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runLoadHarnessMatrix } from "./loadHarnessMatrix.js";

function createOutDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function countForKey(entries, key) {
  return (entries ?? []).find((entry) => entry.key === key)?.count ?? 0;
}

test(
  "load harness matrix aggregates a broader local smoke across same-block and adversarial modes",
  { timeout: 480_000, concurrency: false },
  async () => {
    const outDir = createOutDir("pd-load-harness-matrix-");

    const { report, reportPath, summaryPath } = await runLoadHarnessMatrix({
      preset: "broader-local-smoke",
      runs: "same-block-family-a,adversarial-a",
      out: outDir,
    });

    assert.equal(report.status, "ok");
    assert.equal(report.preset.name, "broader-local-smoke");
    assert.equal(report.plan.plannedRunCount, 2);
    assert.equal(report.plan.completedRunCount, 2);
    assert.deepEqual(report.plan.runIds, [
      "same-block-family-a",
      "adversarial-a",
    ]);
    assert.deepEqual(report.plan.caseIds, [
      "smoke-adversarial-sweep",
      "smoke-mixed-same-block",
    ]);
    assert.equal(report.coverage.totalRequestedGames, 7);
    assert.equal(report.coverage.totalCompletedGames, 7);
    assert.equal(report.coverage.sameBlockEnabledRuns, 1);
    assert.equal(report.coverage.profiles.length, 1);
    assert.equal(report.coverage.profiles[0], "smoke");
    assert.deepEqual(report.coverage.requestedScenarios, [
      "adversarial-random",
      "mixed",
    ]);
    assert.ok(report.coverage.seeds.includes("same-block-family-a"));
    assert.ok(report.coverage.seeds.includes("adversarial-a"));

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
        7
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
    assert.ok(report.expectedFailureSummary.txFailedExpected > 0);
    assert.ok(report.expectedFailureSummary.probeFailedAsExpected > 0);
    assert.ok(report.expectedFailureSummary.probeOnchainReverts > 0);
    assert.ok(report.expectedFailureSummary.sameBlockExpectedFailures > 0);
    assert.ok(report.sameBlockSummary.attemptedBatches > 0);
    assert.ok(report.sameBlockSummary.attemptedTxs > 0);
    assert.equal(report.sameBlockSummary.unexpectedFailures, 0);
    assert.equal(report.sameBlockSummary.unexpectedSuccesses, 0);
    assert.equal(report.localScaleReadiness.fullyDrainedGames, 7);
    assert.equal(report.localScaleReadiness.replayConsistentGames, 7);

    assert.equal(report.caseSummary.length, 2);
    assert.equal(
      report.caseSummary.find((entry) => entry.caseId === "smoke-mixed-same-block")
        ?.breakageSummary.gamesWithTerminalStateMismatch,
      0
    );
    assert.equal(
      report.caseSummary.find((entry) => entry.caseId === "smoke-adversarial-sweep")
        ?.breakageSummary.gamesWithDrainMismatch,
      0
    );

    assert.ok(existsSync(reportPath));
    assert.ok(existsSync(summaryPath));
    assert.equal(report.paths.report, reportPath);
    assert.equal(report.paths.summary, summaryPath);
    const markdown = readFileSync(summaryPath, "utf8");
    assert.match(markdown, /# Prisoners DAOllema local soak matrix/);
    assert.match(markdown, /## Aggregate breakage signals/);
    assert.match(markdown, /broader-local-smoke/);
    assert.match(markdown, /same-block-family-a/);
    assert.match(markdown, /adversarial-a/);

    for (const run of report.runs) {
      assert.equal(run.status, "ok");
      assert.ok(existsSync(run.paths.report));
      assert.ok(existsSync(run.paths.txLog));
      assert.equal(run.result?.harnessStatus, "ok");
      assert.equal(run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0, 0);
      assert.equal(
        run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0,
        0
      );
      assert.equal(run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0, 0);
      assert.equal(run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0, 0);
      assert.equal(run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0, 0);
      assert.equal(
        run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0,
        0
      );
      assert.equal(run.result?.breakageSummary?.totalUnexpectedFailures ?? 0, 0);
      assert.equal(run.result?.txSummary?.failedUnexpected ?? 0, 0);
      assert.equal(run.result?.txSummary?.unexpectedSuccesses ?? 0, 0);
    }
  }
);
