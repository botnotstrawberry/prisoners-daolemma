import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "fs";
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

test("load harness matrix exposes a bounded xlarge local preset", () => {
  const outDir = createOutDir("pd-load-harness-matrix-xlarge-plan-");
  const plan = buildLoadHarnessMatrixPlan({
    preset: "xlarge-local",
    out: outDir,
  });

  assert.equal(plan.presetName, "xlarge-local");
  assert.equal(plan.plannedRunCount, 4);
  assert.deepEqual(
    plan.runs.map((run) => ({
      id: run.id,
      caseId: run.caseId,
      seed: run.seed,
      playerCount: run.harnessOptions.playerCount,
      games: run.harnessOptions.games,
      minPlayers: run.harnessOptions.minPlayers,
      commitDurationBlocks: run.harnessOptions.commitDurationBlocks,
      revealDurationBlocks: run.harnessOptions.revealDurationBlocks,
      underfilledRate: run.harnessOptions.underfilledRate,
      probeRate: run.harnessOptions.probeRate,
    })),
    [
      {
        id: "xlarge-mixed-a",
        caseId: "xlarge-mixed-scale",
        seed: "xlarge-mixed-a",
        playerCount: 32,
        games: 3,
        minPlayers: undefined,
        commitDurationBlocks: 72,
        revealDurationBlocks: 72,
        underfilledRate: undefined,
        probeRate: undefined,
      },
      {
        id: "xlarge-adversarial-a",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-19",
        playerCount: 32,
        games: 1,
        minPlayers: 32,
        commitDurationBlocks: 80,
        revealDurationBlocks: 80,
        underfilledRate: 0,
        probeRate: 0.55,
      },
      {
        id: "xlarge-adversarial-b",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-73",
        playerCount: 32,
        games: 1,
        minPlayers: 32,
        commitDurationBlocks: 80,
        revealDurationBlocks: 80,
        underfilledRate: 0,
        probeRate: 0.55,
      },
      {
        id: "xlarge-adversarial-c",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-211",
        playerCount: 32,
        games: 1,
        minPlayers: 32,
        commitDurationBlocks: 80,
        revealDurationBlocks: 80,
        underfilledRate: 0,
        probeRate: 0.55,
      },
    ]
  );
  assert.equal(
    Math.max(...plan.runs.map((run) => run.harnessOptions.playerCount)),
    32
  );
  assert.equal(
    plan.runs.reduce((sum, run) => sum + run.harnessOptions.games, 0),
    6
  );
});

test("load harness matrix exposes a bounded parallel-local preset", () => {
  const outDir = createOutDir("pd-load-harness-matrix-parallel-plan-");
  const plan = buildLoadHarnessMatrixPlan({
    preset: "parallel-local",
    out: outDir,
  });

  assert.equal(plan.presetName, "parallel-local");
  assert.equal(plan.plannedRunCount, 3);
  assert.equal(plan.requestedInstanceConcurrency, 2);
  assert.equal(plan.instanceConcurrency, 2);
  assert.equal(plan.executionMode, "parallel-local");
  assert.deepEqual(
    plan.runs.map((run) => ({
      id: run.id,
      caseId: run.caseId,
      seed: run.seed,
      playerCount: run.harnessOptions.playerCount,
      games: run.harnessOptions.games,
      sameBlockProbes: Boolean(run.harnessOptions.sameBlockProbes),
    })),
    [
      {
        id: "parallel-same-block-a",
        caseId: "smoke-mixed-same-block",
        seed: "parallel-same-block-a",
        playerCount: 6,
        games: 3,
        sameBlockProbes: true,
      },
      {
        id: "parallel-adversarial-a",
        caseId: "smoke-adversarial-sweep",
        seed: "parallel-adversarial-a",
        playerCount: 12,
        games: 4,
        sameBlockProbes: true,
      },
      {
        id: "parallel-winner-a",
        caseId: "scale-winner-soak",
        seed: "parallel-winner-a",
        playerCount: 20,
        games: 2,
        sameBlockProbes: false,
      },
    ]
  );
});

test(
  "load harness matrix can coordinate bounded parallel-local instances and report overlap honestly",
  async () => {
    const outDir = createOutDir("pd-load-harness-matrix-parallel-stub-");
    let activeRuns = 0;
    let observedPeakActiveRuns = 0;
    const delayBySeed = {
      "parallel-same-block-a": 140,
      "parallel-adversarial-a": 180,
      "parallel-winner-a": 120,
    };

    const { report, summaryPath } = await runLoadHarnessMatrix(
      {
        preset: "parallel-local",
        instanceConcurrency: 2,
        out: outDir,
      },
      {
        runLoadHarness: async (options) => {
          activeRuns += 1;
          observedPeakActiveRuns = Math.max(
            observedPeakActiveRuns,
            activeRuns
          );

          const delayMs = delayBySeed[options.seed] ?? 100;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          activeRuns -= 1;

          mkdirSync(options.out, { recursive: true });
          const reportPath = join(options.out, "report.json");
          const txLogPath = join(options.out, "txs.jsonl");
          const stubReport = {
            status: "ok",
            mode: "stubbed",
            wallClockMs: delayMs,
            environment: {
              spawnedAnvil: true,
              chainId: 31337,
              rpcUrl: `http://127.0.0.1:${options.anvilPort}`,
              anvilPort: options.anvilPort,
            },
            games: [{}],
            scenarios: {
              plan: [String(options.scenario)],
            },
            scenarioSummary: {
              byTerminalOutcome: [{ key: "Winners", count: 1 }],
              byTerminalPath: [{ key: "winner-claims", count: 1 }],
            },
            txSummary: {
              attempted: 10,
              succeeded: 10,
              failed: 0,
              failedExpected: 0,
              failedUnexpected: 0,
              unexpectedSuccesses: 0,
            },
            sameBlockSummary: {
              enabled: Boolean(options.sameBlockProbes),
              attemptedBatches: 0,
              minedBatches: 0,
              attemptedTxs: 0,
              expectedFailures: 0,
              unexpectedFailures: 0,
              unexpectedSuccesses: 0,
              skipped: 0,
            },
            localScaleReadiness: {
              maxJoinedPlayersInSingleGame: Number(options.playerCount),
              totalJoinedPlayersAcrossRun: Number(options.playerCount),
              gamesHittingRequestedPlayerTarget: 1,
              fullyDrainedGames: 1,
              replayConsistentGames: 1,
            },
            breakageSummary: {
              gamesChecked: 1,
              gamesWithWedgedActiveSlot: 0,
              gamesWithTerminalStateMismatch: 0,
              gamesWithAccountingMismatch: 0,
              gamesWithPreviewMismatch: 0,
              gamesWithDrainMismatch: 0,
              gamesWithReplayInconsistency: 0,
              gamesWithUnexpectedFailures: 0,
              totalUnexpectedFailures: 0,
              probeSummary: {
                attempted: 0,
                failedAsExpected: 0,
                unexpectedSuccesses: 0,
                onchainReverts: 0,
                localRejections: 0,
              },
              unexpectedFailureClusters: [],
            },
          };

          writeFileSync(reportPath, `${JSON.stringify(stubReport, null, 2)}\n`);
          writeFileSync(txLogPath, "", "utf8");

          return {
            report: stubReport,
            reportPath,
            txLogPath,
          };
        },
      }
    );

    assert.ok(observedPeakActiveRuns >= 2);
    assert.equal(report.status, "ok");
    assert.equal(report.execution.mode, "parallel-local");
    assert.equal(report.execution.requestedInstanceConcurrency, 2);
    assert.equal(report.execution.instanceConcurrencyLimit, 2);
    assert.ok(report.execution.peakActiveRuns >= 2);
    assert.ok(report.execution.runsWithAnyOverlap >= 2);
    assert.equal(report.execution.localParallelismConfirmed, true);
    assert.ok(report.execution.overlappingRunPairs.length >= 1);
    assert.equal(report.plan.executionMode, "parallel-local");
    assert.equal(report.plan.requestedInstanceConcurrency, 2);
    assert.equal(report.plan.instanceConcurrency, 2);
    assert.deepEqual(report.plan.runIds, [
      "parallel-same-block-a",
      "parallel-adversarial-a",
      "parallel-winner-a",
    ]);
    assert.equal(report.runs.length, 3);
    assert.equal(
      new Set(report.runs.map((run) => run.environment.anvilPort)).size,
      3
    );
    assert.ok(report.runs.every((run) => run.execution.mode === "parallel-local"));
    assert.ok(report.runs.every((run) => run.environment.spawnedAnvil));
    assert.ok(existsSync(summaryPath));
    const markdown = readFileSync(summaryPath, "utf8");
    assert.match(markdown, /## Execution model/);
    assert.match(markdown, /Parallel overlap confirmed: yes/);
    assert.match(markdown, /parallel-same-block-a/);
    assert.match(markdown, /parallel-adversarial-a/);
    assert.match(markdown, /parallel-winner-a/);
  }
);

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
