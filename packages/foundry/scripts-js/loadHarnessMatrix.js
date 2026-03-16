import net from "net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { resolveFromPackageRoot } from "./authTooling.js";
import { LOAD_HARNESS_BOUNDARY_NOTE, runLoadHarness } from "./loadHarness.js";

export const LOAD_HARNESS_MATRIX_SCHEMA_VERSION =
  "prisoners-daollema/load-harness-matrix-v1";
export const LOAD_HARNESS_MATRIX_BOUNDARY_NOTE =
  `${LOAD_HARNESS_BOUNDARY_NOTE} This matrix runner only automates multiple local harness runs and aggregates their local-dev results; it does not add live-network realism, public mempool contention, or multi-instance parallel deployment stress.`;
export const DEFAULT_LOAD_HARNESS_MATRIX_PRESET = "broader-local-smoke";

export const LOAD_HARNESS_MATRIX_CASES = {
  "smoke-mixed-same-block": {
    label: "smoke-mixed-same-block",
    description:
      "Repeat the deterministic winner/cancelled/no-winner family with same-block ordering probes enabled so the full local settlement family gets one auditable repeated pass.",
    harnessOptions: {
      profile: "smoke",
      playerCount: 6,
      causeCount: 3,
      games: 3,
      scenario: "mixed",
      concurrency: 3,
      expectedFailures: true,
      sameBlockProbes: true,
    },
  },
  "smoke-adversarial-sweep": {
    label: "smoke-adversarial-sweep",
    description:
      "Seeded adversarial local breakage hunting across repeated games with mixed started-vs-underfilled outcomes, wrong-preimage probes, deadline pressure, and replay/drain checks, while leaving same-block contention to the dedicated mixed-family case.",
    harnessOptions: {
      profile: "smoke",
      playerCount: 7,
      causeCount: 3,
      games: 4,
      scenario: "adversarial-random",
      concurrency: 3,
      skipCommitRate: 0.25,
      skipRevealRate: 0.25,
      underfilledRate: 0.5,
      invalidRevealRate: 0.2,
      probeRate: 1,
    },
  },
  "scale-winner-soak": {
    label: "scale-winner-soak",
    description:
      "Larger local winner-path drain rehearsal on the scale profile, still bounded and local-only, with enough phase budget to avoid accidentally timing out a fully populated round.",
    harnessOptions: {
      profile: "scale",
      playerCount: 20,
      causeCount: 6,
      games: 2,
      scenario: "winner-all-share",
      concurrency: 8,
      commitDurationBlocks: 40,
      revealDurationBlocks: 40,
      skipCommitRate: 0.1,
      skipRevealRate: 0.15,
    },
  },
};

export const LOAD_HARNESS_MATRIX_PRESETS = {
  "same-block-smoke": {
    label: "same-block-smoke",
    description:
      "One deterministic mixed-family same-block probe pass on local Anvil.",
    runs: [
      {
        id: "same-block-family-a",
        caseId: "smoke-mixed-same-block",
        seed: "same-block-family-a",
      },
    ],
  },
  "adversarial-smoke": {
    label: "adversarial-smoke",
    description:
      "Three seeded adversarial smoke passes for broader local breakage hunting.",
    runs: [
      {
        id: "adversarial-a",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-a",
      },
      {
        id: "adversarial-b",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-b",
      },
      {
        id: "adversarial-c",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-c",
      },
    ],
  },
  "broader-local-smoke": {
    label: "broader-local-smoke",
    description:
      "Small but real local soak matrix: one deterministic same-block mixed-family pass plus two seeded adversarial sweeps.",
    runs: [
      {
        id: "same-block-family-a",
        caseId: "smoke-mixed-same-block",
        seed: "same-block-family-a",
      },
      {
        id: "adversarial-a",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-a",
      },
      {
        id: "adversarial-b",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-b",
      },
    ],
  },
  "winner-scale": {
    label: "winner-scale",
    description:
      "Two larger winner-path scale-profile drain rehearsals with distinct seeds.",
    runs: [
      {
        id: "scale-winner-a",
        caseId: "scale-winner-soak",
        seed: "scale-winner-a",
      },
      {
        id: "scale-winner-b",
        caseId: "scale-winner-soak",
        seed: "scale-winner-b",
      },
    ],
  },
  "broader-local": {
    label: "broader-local",
    description:
      "Bounded broader local soak: one deterministic same-block family pass, three seeded adversarial smoke sweeps, and two larger scale-profile winner-path drain rehearsals.",
    runs: [
      {
        id: "same-block-family-a",
        caseId: "smoke-mixed-same-block",
        seed: "same-block-family-a",
      },
      {
        id: "adversarial-a",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-a",
      },
      {
        id: "adversarial-b",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-b",
      },
      {
        id: "adversarial-c",
        caseId: "smoke-adversarial-sweep",
        seed: "adversarial-c",
      },
      {
        id: "scale-winner-a",
        caseId: "scale-winner-soak",
        seed: "scale-winner-a",
      },
      {
        id: "scale-winner-b",
        caseId: "scale-winner-soak",
        seed: "scale-winner-b",
      },
    ],
  },
};

function timestampSlug() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function parseCsvList(rawValue) {
  return String(rawValue)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sanitizeToken(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function groupCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([key, count]) => ({ key, count }));
}

function mergeCountEntries(entryLists) {
  const counts = new Map();
  for (const entries of entryLists) {
    for (const entry of entries ?? []) {
      if (!entry || entry.key === undefined || entry.key === null) {
        continue;
      }
      counts.set(entry.key, (counts.get(entry.key) ?? 0) + Number(entry.count));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([key, count]) => ({ key, count }));
}

function sumBy(items, selector) {
  return items.reduce((sum, item) => sum + Number(selector(item) ?? 0), 0);
}

function maxBy(items, selector) {
  if (!items.length) {
    return 0;
  }
  return items.reduce(
    (max, item) => Math.max(max, Number(selector(item) ?? 0)),
    0
  );
}

function formatScenarioPlan(run) {
  return (run.result?.scenarioPlan ?? []).join(", ");
}

function mergeFailureClusters(clusterLists) {
  const grouped = new Map();
  for (const clusters of clusterLists) {
    for (const cluster of clusters ?? []) {
      const key = [
        cluster.action,
        cluster.phase,
        cluster.failureClass,
        cluster.failureTransport,
        cluster.errorFingerprint,
      ].join("|");
      const current = grouped.get(key) ?? {
        action: cluster.action,
        phase: cluster.phase,
        failureClass: cluster.failureClass,
        failureTransport: cluster.failureTransport,
        errorFingerprint: cluster.errorFingerprint,
        count: 0,
        cases: new Set(),
        runs: new Set(),
        seeds: new Set(),
        scenarios: new Set(),
      };
      current.count += Number(cluster.count ?? 0);
      for (const caseId of cluster.caseIds ?? []) {
        current.cases.add(caseId);
      }
      for (const runId of cluster.runIds ?? []) {
        current.runs.add(runId);
      }
      for (const seed of cluster.seeds ?? []) {
        current.seeds.add(seed);
      }
      for (const scenario of cluster.scenarios ?? []) {
        current.scenarios.add(scenario);
      }
      grouped.set(key, current);
    }
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
    .map((entry) => ({
      action: entry.action,
      phase: entry.phase,
      failureClass: entry.failureClass,
      failureTransport: entry.failureTransport,
      errorFingerprint: entry.errorFingerprint,
      count: entry.count,
      caseIds: [...entry.cases].sort(),
      runIds: [...entry.runs].sort(),
      seeds: [...entry.seeds].sort(),
      scenarios: [...entry.scenarios].sort(),
    }));
}

function resolveMatrixRunDir(rawOut) {
  return resolveFromPackageRoot(
    rawOut ?? join("load-harness-matrix", timestampSlug())
  );
}

function normalizeRunSelection(preset, rawRuns) {
  if (!rawRuns) {
    return preset.runs;
  }

  const selectedRunIds = new Set(parseCsvList(rawRuns));
  const knownRunIds = new Set(preset.runs.map((run) => run.id));
  for (const runId of selectedRunIds) {
    if (!knownRunIds.has(runId)) {
      throw new Error(
        `Unknown preset run '${runId}'. Available runs: ${preset.runs
          .map((run) => run.id)
          .join(", ")}`
      );
    }
  }

  return preset.runs.filter((run) => selectedRunIds.has(run.id));
}

export function buildLoadHarnessMatrixPlan(rawOptions = {}) {
  const presetName = rawOptions.preset
    ? String(rawOptions.preset)
    : DEFAULT_LOAD_HARNESS_MATRIX_PRESET;
  const preset = LOAD_HARNESS_MATRIX_PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unsupported load harness matrix preset '${presetName}'. Use one of: ${Object.keys(
        LOAD_HARNESS_MATRIX_PRESETS
      ).join(", ")}`
    );
  }

  const selectedPresetRuns = normalizeRunSelection(preset, rawOptions.runs);
  if (selectedPresetRuns.length === 0) {
    throw new Error("Load harness matrix selected zero runs.");
  }

  const runDir = resolveMatrixRunDir(rawOptions.out);
  const planRuns = selectedPresetRuns.map((presetRun, index) => {
    const caseDef = LOAD_HARNESS_MATRIX_CASES[presetRun.caseId];
    if (!caseDef) {
      throw new Error(
        `Matrix preset '${presetName}' references unknown case '${presetRun.caseId}'.`
      );
    }

    const runIndex = index + 1;
    const runLeaf = `${String(runIndex).padStart(2, "0")}-${sanitizeToken(
      presetRun.id
    )}`;
    const runOutDir = join(runDir, "runs", runLeaf);

    return {
      index: runIndex,
      id: presetRun.id,
      caseId: presetRun.caseId,
      label: presetRun.label ?? caseDef.label,
      description: presetRun.description ?? caseDef.description,
      seed: String(presetRun.seed),
      outDir: runOutDir,
      harnessOptions: {
        ...caseDef.harnessOptions,
        ...(presetRun.harnessOverrides ?? {}),
        seed: String(presetRun.seed),
        out: runOutDir,
      },
    };
  });

  return {
    schemaVersion: LOAD_HARNESS_MATRIX_SCHEMA_VERSION,
    presetName,
    preset,
    boundaryNote: LOAD_HARNESS_MATRIX_BOUNDARY_NOTE,
    stopOnError: Boolean(rawOptions.stopOnError),
    runDir,
    reportPath: join(runDir, "matrix-report.json"),
    summaryPath: join(runDir, "MATRIX_SUMMARY.md"),
    plannedRunCount: planRuns.length,
    runs: planRuns,
  };
}

async function reserveFreePort() {
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

function buildExpectedFailureSnapshot({
  txSummary = null,
  sameBlockSummary = null,
  breakageSummary = null,
}) {
  return {
    txFailedExpected: Number(txSummary?.failedExpected ?? 0),
    txFailedUnexpected: Number(txSummary?.failedUnexpected ?? 0),
    unexpectedSuccesses: Number(txSummary?.unexpectedSuccesses ?? 0),
    sameBlockExpectedFailures: Number(sameBlockSummary?.expectedFailures ?? 0),
    sameBlockUnexpectedFailures: Number(
      sameBlockSummary?.unexpectedFailures ?? 0
    ),
    sameBlockUnexpectedSuccesses: Number(
      sameBlockSummary?.unexpectedSuccesses ?? 0
    ),
    probeFailedAsExpected: Number(
      breakageSummary?.probeSummary?.failedAsExpected ?? 0
    ),
    probeUnexpectedSuccesses: Number(
      breakageSummary?.probeSummary?.unexpectedSuccesses ?? 0
    ),
    probeOnchainReverts: Number(
      breakageSummary?.probeSummary?.onchainReverts ?? 0
    ),
    probeLocalRejections: Number(
      breakageSummary?.probeSummary?.localRejections ?? 0
    ),
  };
}

function buildRunResult(plannedRun, execution) {
  const report = execution.report;
  const terminalOutcomes = report?.scenarioSummary?.byTerminalOutcome ?? [];
  const terminalPaths = report?.scenarioSummary?.byTerminalPath ?? [];
  const txSummary = report?.txSummary ?? null;
  const sameBlockSummary = report?.sameBlockSummary ?? null;
  const localScaleReadiness = report?.localScaleReadiness ?? null;
  const breakageSummary = report?.breakageSummary ?? null;
  const unexpectedFailureClusters =
    breakageSummary?.unexpectedFailureClusters?.map((cluster) => ({
      ...cluster,
      caseIds: [plannedRun.caseId],
      runIds: [plannedRun.id],
      seeds: [plannedRun.seed],
    })) ?? [];

  return {
    index: plannedRun.index,
    id: plannedRun.id,
    caseId: plannedRun.caseId,
    label: plannedRun.label,
    description: plannedRun.description,
    seed: plannedRun.seed,
    status: execution.status,
    error: execution.error ?? null,
    paths: {
      runDir: plannedRun.outDir,
      report: execution.reportPath ?? join(plannedRun.outDir, "report.json"),
      txLog: execution.txLogPath ?? join(plannedRun.outDir, "txs.jsonl"),
    },
    config: {
      profile: String(plannedRun.harnessOptions.profile),
      playerCount: Number(plannedRun.harnessOptions.playerCount),
      causeCount: Number(plannedRun.harnessOptions.causeCount),
      games: Number(plannedRun.harnessOptions.games),
      concurrency: Number(plannedRun.harnessOptions.concurrency),
      requestedScenario: String(plannedRun.harnessOptions.scenario),
      sameBlockProbes: Boolean(plannedRun.harnessOptions.sameBlockProbes),
      expectedFailures: Boolean(plannedRun.harnessOptions.expectedFailures),
      commitDurationBlocks:
        plannedRun.harnessOptions.commitDurationBlocks ?? null,
      revealDurationBlocks:
        plannedRun.harnessOptions.revealDurationBlocks ?? null,
      skipCommitRate: Number(plannedRun.harnessOptions.skipCommitRate ?? 0),
      skipRevealRate: Number(plannedRun.harnessOptions.skipRevealRate ?? 0),
      underfilledRate: Number(plannedRun.harnessOptions.underfilledRate ?? 0),
      invalidRevealRate: Number(
        plannedRun.harnessOptions.invalidRevealRate ?? 0
      ),
      probeRate: Number(plannedRun.harnessOptions.probeRate ?? 0),
    },
    result: report
      ? {
          harnessStatus: report.status,
          mode: report.mode,
          wallClockMs: report.wallClockMs,
          gamesCompleted: Array.isArray(report.games) ? report.games.length : 0,
          scenarioPlan: report.scenarios?.plan ?? [],
          terminalOutcomes,
          terminalPaths,
          txSummary: txSummary
            ? {
                attempted: txSummary.attempted,
                succeeded: txSummary.succeeded,
                failed: txSummary.failed,
                failedExpected: txSummary.failedExpected,
                failedUnexpected: txSummary.failedUnexpected,
                unexpectedSuccesses: txSummary.unexpectedSuccesses,
              }
            : null,
          sameBlockSummary: sameBlockSummary
            ? {
                enabled: sameBlockSummary.enabled,
                attemptedBatches: sameBlockSummary.attemptedBatches,
                minedBatches: sameBlockSummary.minedBatches,
                attemptedTxs: sameBlockSummary.attemptedTxs,
                expectedFailures: sameBlockSummary.expectedFailures,
                unexpectedFailures: sameBlockSummary.unexpectedFailures,
                unexpectedSuccesses: sameBlockSummary.unexpectedSuccesses,
                skipped: sameBlockSummary.skipped,
              }
            : null,
          localScaleReadiness: localScaleReadiness
            ? {
                maxJoinedPlayersInSingleGame:
                  localScaleReadiness.maxJoinedPlayersInSingleGame,
                totalJoinedPlayersAcrossRun:
                  localScaleReadiness.totalJoinedPlayersAcrossRun,
                gamesHittingRequestedPlayerTarget:
                  localScaleReadiness.gamesHittingRequestedPlayerTarget,
                fullyDrainedGames: localScaleReadiness.fullyDrainedGames,
                replayConsistentGames:
                  localScaleReadiness.replayConsistentGames,
              }
            : null,
          breakageSummary: breakageSummary
            ? {
                gamesChecked: breakageSummary.gamesChecked,
                gamesWithWedgedActiveSlot:
                  breakageSummary.gamesWithWedgedActiveSlot,
                gamesWithTerminalStateMismatch:
                  breakageSummary.gamesWithTerminalStateMismatch,
                gamesWithAccountingMismatch:
                  breakageSummary.gamesWithAccountingMismatch,
                gamesWithPreviewMismatch:
                  breakageSummary.gamesWithPreviewMismatch,
                gamesWithDrainMismatch:
                  breakageSummary.gamesWithDrainMismatch,
                gamesWithReplayInconsistency:
                  breakageSummary.gamesWithReplayInconsistency,
                gamesWithUnexpectedFailures:
                  breakageSummary.gamesWithUnexpectedFailures,
                totalUnexpectedFailures:
                  breakageSummary.totalUnexpectedFailures,
                probeSummary: breakageSummary.probeSummary,
              }
            : null,
          expectedFailureSummary: buildExpectedFailureSnapshot({
            txSummary,
            sameBlockSummary,
            breakageSummary,
          }),
          unexpectedFailureClusters,
        }
      : null,
  };
}

function buildCaseSummary(runs) {
  const grouped = new Map();
  for (const run of runs) {
    const current = grouped.get(run.caseId) ?? [];
    current.push(run);
    grouped.set(run.caseId, current);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([caseId, caseRuns]) => ({
      caseId,
      label: caseRuns[0].label,
      description: caseRuns[0].description,
      runs: caseRuns.length,
      seeds: uniqueSorted(caseRuns.map((run) => run.seed)),
      profiles: uniqueSorted(caseRuns.map((run) => run.config.profile)),
      requestedScenarios: uniqueSorted(
        caseRuns.map((run) => run.config.requestedScenario)
      ),
      totalGamesCompleted: sumBy(
        caseRuns,
        (run) => run.result?.gamesCompleted ?? 0
      ),
      txAttempted: sumBy(caseRuns, (run) => run.result?.txSummary?.attempted ?? 0),
      txFailedUnexpected: sumBy(
        caseRuns,
        (run) => run.result?.txSummary?.failedUnexpected ?? 0
      ),
      unexpectedSuccesses: sumBy(
        caseRuns,
        (run) => run.result?.txSummary?.unexpectedSuccesses ?? 0
      ),
      maxJoinedPlayersInSingleGame: maxBy(
        caseRuns,
        (run) =>
          run.result?.localScaleReadiness?.maxJoinedPlayersInSingleGame ?? 0
      ),
      totalJoinedPlayersAcrossRuns: sumBy(
        caseRuns,
        (run) =>
          run.result?.localScaleReadiness?.totalJoinedPlayersAcrossRun ?? 0
      ),
      sameBlockBatches: sumBy(
        caseRuns,
        (run) => run.result?.sameBlockSummary?.attemptedBatches ?? 0
      ),
      terminalOutcomes: mergeCountEntries(
        caseRuns.map((run) => run.result?.terminalOutcomes ?? [])
      ),
      expectedFailureSummary: {
        txFailedExpected: sumBy(
          caseRuns,
          (run) => run.result?.expectedFailureSummary?.txFailedExpected ?? 0
        ),
        probeFailedAsExpected: sumBy(
          caseRuns,
          (run) =>
            run.result?.expectedFailureSummary?.probeFailedAsExpected ?? 0
        ),
        probeOnchainReverts: sumBy(
          caseRuns,
          (run) => run.result?.expectedFailureSummary?.probeOnchainReverts ?? 0
        ),
        sameBlockExpectedFailures: sumBy(
          caseRuns,
          (run) =>
            run.result?.expectedFailureSummary?.sameBlockExpectedFailures ?? 0
        ),
      },
      breakageSummary: {
        gamesWithWedgedActiveSlot: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0
        ),
        gamesWithTerminalStateMismatch: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0
        ),
        gamesWithAccountingMismatch: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0
        ),
        gamesWithPreviewMismatch: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0
        ),
        gamesWithDrainMismatch: sumBy(
          caseRuns,
          (run) => run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0
        ),
        gamesWithReplayInconsistency: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0
        ),
        totalUnexpectedFailures: sumBy(
          caseRuns,
          (run) => run.result?.breakageSummary?.totalUnexpectedFailures ?? 0
        ),
      },
    }));
}

export function buildLoadHarnessMatrixReport({
  plan,
  runs,
  startedAt,
  finishedAt,
  wallClockMs,
}) {
  const runStatusSummary = groupCount(runs, (run) => run.status);
  const aggregateTxSummary = {
    attempted: sumBy(runs, (run) => run.result?.txSummary?.attempted ?? 0),
    succeeded: sumBy(runs, (run) => run.result?.txSummary?.succeeded ?? 0),
    failed: sumBy(runs, (run) => run.result?.txSummary?.failed ?? 0),
    failedExpected: sumBy(
      runs,
      (run) => run.result?.txSummary?.failedExpected ?? 0
    ),
    failedUnexpected: sumBy(
      runs,
      (run) => run.result?.txSummary?.failedUnexpected ?? 0
    ),
    unexpectedSuccesses: sumBy(
      runs,
      (run) => run.result?.txSummary?.unexpectedSuccesses ?? 0
    ),
  };
  const aggregateSameBlockSummary = {
    attemptedBatches: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.attemptedBatches ?? 0
    ),
    minedBatches: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.minedBatches ?? 0
    ),
    attemptedTxs: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.attemptedTxs ?? 0
    ),
    expectedFailures: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.expectedFailures ?? 0
    ),
    unexpectedFailures: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.unexpectedFailures ?? 0
    ),
    unexpectedSuccesses: sumBy(
      runs,
      (run) => run.result?.sameBlockSummary?.unexpectedSuccesses ?? 0
    ),
    skipped: sumBy(runs, (run) => run.result?.sameBlockSummary?.skipped ?? 0),
  };
  const aggregateBreakageSummary = {
    gamesChecked: sumBy(runs, (run) => run.result?.breakageSummary?.gamesChecked ?? 0),
    gamesWithWedgedActiveSlot: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0
    ),
    gamesWithTerminalStateMismatch: sumBy(
      runs,
      (run) =>
        run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0
    ),
    gamesWithAccountingMismatch: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0
    ),
    gamesWithPreviewMismatch: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0
    ),
    gamesWithDrainMismatch: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0
    ),
    gamesWithReplayInconsistency: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0
    ),
    gamesWithUnexpectedFailures: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithUnexpectedFailures ?? 0
    ),
    totalUnexpectedFailures: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.totalUnexpectedFailures ?? 0
    ),
    probeSummary: {
      attempted: sumBy(
        runs,
        (run) => run.result?.breakageSummary?.probeSummary?.attempted ?? 0
      ),
      failedAsExpected: sumBy(
        runs,
        (run) =>
          run.result?.breakageSummary?.probeSummary?.failedAsExpected ?? 0
      ),
      unexpectedSuccesses: sumBy(
        runs,
        (run) =>
          run.result?.breakageSummary?.probeSummary?.unexpectedSuccesses ?? 0
      ),
      onchainReverts: sumBy(
        runs,
        (run) => run.result?.breakageSummary?.probeSummary?.onchainReverts ?? 0
      ),
      localRejections: sumBy(
        runs,
        (run) => run.result?.breakageSummary?.probeSummary?.localRejections ?? 0
      ),
    },
  };

  const aggregateExpectedFailureSummary = {
    txFailedExpected: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.txFailedExpected ?? 0
    ),
    txFailedUnexpected: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.txFailedUnexpected ?? 0
    ),
    unexpectedSuccesses: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.unexpectedSuccesses ?? 0
    ),
    sameBlockExpectedFailures: sumBy(
      runs,
      (run) =>
        run.result?.expectedFailureSummary?.sameBlockExpectedFailures ?? 0
    ),
    sameBlockUnexpectedFailures: sumBy(
      runs,
      (run) =>
        run.result?.expectedFailureSummary?.sameBlockUnexpectedFailures ?? 0
    ),
    sameBlockUnexpectedSuccesses: sumBy(
      runs,
      (run) =>
        run.result?.expectedFailureSummary?.sameBlockUnexpectedSuccesses ?? 0
    ),
    probeFailedAsExpected: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.probeFailedAsExpected ?? 0
    ),
    probeUnexpectedSuccesses: sumBy(
      runs,
      (run) =>
        run.result?.expectedFailureSummary?.probeUnexpectedSuccesses ?? 0
    ),
    probeOnchainReverts: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.probeOnchainReverts ?? 0
    ),
    probeLocalRejections: sumBy(
      runs,
      (run) => run.result?.expectedFailureSummary?.probeLocalRejections ?? 0
    ),
  };

  const status = runs.some(
    (run) => run.status !== "ok" || run.result?.harnessStatus === "failed"
  )
    ? "failed"
    : aggregateBreakageSummary.totalUnexpectedFailures > 0 ||
        aggregateBreakageSummary.gamesWithWedgedActiveSlot > 0 ||
        aggregateBreakageSummary.gamesWithTerminalStateMismatch > 0 ||
        aggregateBreakageSummary.gamesWithAccountingMismatch > 0 ||
        aggregateBreakageSummary.gamesWithPreviewMismatch > 0 ||
        aggregateBreakageSummary.gamesWithDrainMismatch > 0 ||
        aggregateBreakageSummary.gamesWithReplayInconsistency > 0 ||
        aggregateTxSummary.failedUnexpected > 0 ||
        aggregateTxSummary.unexpectedSuccesses > 0 ||
        aggregateSameBlockSummary.unexpectedFailures > 0 ||
        aggregateSameBlockSummary.unexpectedSuccesses > 0
      ? "issues-detected"
      : "ok";

  return {
    schemaVersion: LOAD_HARNESS_MATRIX_SCHEMA_VERSION,
    status,
    boundaryNote: LOAD_HARNESS_MATRIX_BOUNDARY_NOTE,
    startedAt,
    finishedAt,
    wallClockMs,
    preset: {
      name: plan.presetName,
      label: plan.preset.label,
      description: plan.preset.description,
    },
    paths: {
      runDir: plan.runDir,
      report: plan.reportPath,
      summary: plan.summaryPath,
    },
    plan: {
      plannedRunCount: plan.plannedRunCount,
      completedRunCount: runs.length,
      stopOnError: plan.stopOnError,
      runIds: plan.runs.map((run) => run.id),
      caseIds: uniqueSorted(plan.runs.map((run) => run.caseId)),
    },
    coverage: {
      seeds: uniqueSorted(runs.map((run) => run.seed)),
      profiles: uniqueSorted(runs.map((run) => run.config.profile)),
      requestedScenarios: uniqueSorted(
        runs.map((run) => run.config.requestedScenario)
      ),
      scenarioPlans: groupCount(runs, (run) => formatScenarioPlan(run)),
      sameBlockEnabledRuns: runs.filter((run) => run.config.sameBlockProbes)
        .length,
      expectedFailuresEnabledRuns: runs.filter(
        (run) => run.config.expectedFailures
      ).length,
      largestRequestedPlayerCount: maxBy(
        runs,
        (run) => run.config.playerCount
      ),
      totalRequestedGames: sumBy(runs, (run) => run.config.games),
      totalCompletedGames: sumBy(
        runs,
        (run) => run.result?.gamesCompleted ?? 0
      ),
    },
    runStatusSummary,
    txSummary: aggregateTxSummary,
    expectedFailureSummary: aggregateExpectedFailureSummary,
    sameBlockSummary: aggregateSameBlockSummary,
    scenarioSummary: {
      byTerminalOutcome: mergeCountEntries(
        runs.map((run) => run.result?.terminalOutcomes ?? [])
      ),
      byTerminalPath: mergeCountEntries(
        runs.map((run) => run.result?.terminalPaths ?? [])
      ),
    },
    localScaleReadiness: {
      maxJoinedPlayersInSingleGame: maxBy(
        runs,
        (run) =>
          run.result?.localScaleReadiness?.maxJoinedPlayersInSingleGame ?? 0
      ),
      totalJoinedPlayersAcrossRun: sumBy(
        runs,
        (run) =>
          run.result?.localScaleReadiness?.totalJoinedPlayersAcrossRun ?? 0
      ),
      gamesHittingRequestedPlayerTarget: sumBy(
        runs,
        (run) =>
          run.result?.localScaleReadiness?.gamesHittingRequestedPlayerTarget ??
          0
      ),
      fullyDrainedGames: sumBy(
        runs,
        (run) => run.result?.localScaleReadiness?.fullyDrainedGames ?? 0
      ),
      replayConsistentGames: sumBy(
        runs,
        (run) =>
          run.result?.localScaleReadiness?.replayConsistentGames ?? 0
      ),
    },
    breakageSummary: aggregateBreakageSummary,
    unexpectedFailureClusters: mergeFailureClusters(
      runs.map((run) => run.result?.unexpectedFailureClusters ?? [])
    ),
    caseSummary: buildCaseSummary(runs),
    runs,
  };
}

export async function runLoadHarnessMatrix(rawOptions = {}, dependencies = {}) {
  const plan = buildLoadHarnessMatrixPlan(rawOptions);
  ensureDir(plan.runDir);

  const executeHarness = dependencies.runLoadHarness ?? runLoadHarness;
  const startedAt = new Date().toISOString();
  const runs = [];

  for (const plannedRun of plan.runs) {
    const reportPath = join(plannedRun.outDir, "report.json");
    const txLogPath = join(plannedRun.outDir, "txs.jsonl");
    const harnessOptions = { ...plannedRun.harnessOptions };

    if (!harnessOptions.rpcUrl && harnessOptions.anvilPort === undefined) {
      harnessOptions.anvilPort = await reserveFreePort();
    }

    try {
      const result = await executeHarness(harnessOptions);
      runs.push(
        buildRunResult(plannedRun, {
          status: "ok",
          report: result.report,
          reportPath: result.reportPath,
          txLogPath: result.txLogPath,
        })
      );
    } catch (error) {
      const report = existsSync(reportPath) ? readJsonFile(reportPath) : null;
      runs.push(
        buildRunResult(plannedRun, {
          status: report?.status ?? "failed",
          report,
          reportPath: existsSync(reportPath) ? reportPath : null,
          txLogPath: existsSync(txLogPath) ? txLogPath : null,
          error: error?.message ?? String(error),
        })
      );

      if (plan.stopOnError) {
        break;
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const report = buildLoadHarnessMatrixReport({
    plan,
    runs,
    startedAt,
    finishedAt,
    wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
  });
  writeJsonFile(plan.reportPath, report);
  writeFileSync(plan.summaryPath, renderLoadHarnessMatrixMarkdown(report), "utf8");

  return {
    report,
    reportPath: plan.reportPath,
    summaryPath: plan.summaryPath,
  };
}

function formatCountEntries(entries) {
  return (entries ?? []).length
    ? entries.map((entry) => `${entry.key}=${entry.count}`).join(", ")
    : "(none)";
}

function renderMarkdownCountEntries(entries) {
  return (entries ?? []).length
    ? entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n")
    : "- (none)";
}

function renderMarkdownRunSummary(run) {
  return [
    `### Run ${String(run.index).padStart(2, "0")} — ${run.id}`,
    "",
    `- Case: ${run.caseId}`,
    `- Seed: ${run.seed}`,
    `- Status: ${run.status}`,
    `- Profile: ${run.config.profile}`,
    `- Requested scenario: ${run.config.requestedScenario}`,
    `- Games completed: ${run.result?.gamesCompleted ?? 0}`,
    `- Scenario plan: ${(run.result?.scenarioPlan ?? []).join(", ") || "(none)"}`,
    `- Terminal outcomes: ${formatCountEntries(run.result?.terminalOutcomes ?? [])}`,
    `- Tx unexpected: ${run.result?.txSummary?.failedUnexpected ?? 0} failed / ${run.result?.txSummary?.unexpectedSuccesses ?? 0} unexpected success`,
    `- Expected failures: tx=${run.result?.expectedFailureSummary?.txFailedExpected ?? 0}, probes=${run.result?.expectedFailureSummary?.probeFailedAsExpected ?? 0}, onchain reverts=${run.result?.expectedFailureSummary?.probeOnchainReverts ?? 0}, same-block=${run.result?.expectedFailureSummary?.sameBlockExpectedFailures ?? 0}`,
    `- Breakage: wedge=${run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0}, terminal=${run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0}, accounting=${run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0}, preview=${run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0}, drain=${run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0}, replay=${run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0}, unexpected=${run.result?.breakageSummary?.totalUnexpectedFailures ?? 0}`,
    `- Report: ${run.paths.report}`,
    run.error ? `- Error: ${run.error}` : null,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderLoadHarnessMatrixMarkdown(report) {
  const lines = [
    "# Prisoners DAOllema local soak matrix",
    "",
    report.boundaryNote,
    "",
    "## Aggregate summary",
    "",
    `- Status: ${report.status}`,
    `- Preset: ${report.preset.label}`,
    `- Runs completed: ${report.plan.completedRunCount}/${report.plan.plannedRunCount}`,
    `- Games completed: ${report.coverage.totalCompletedGames}`,
    `- Wall clock ms: ${report.wallClockMs}`,
    `- JSON report: ${report.paths.report}`,
    "",
    "## Coverage",
    "",
    `- Seeds: ${report.coverage.seeds.join(", ")}`,
    `- Profiles: ${report.coverage.profiles.join(", ")}`,
    `- Requested scenarios: ${report.coverage.requestedScenarios.join(", ")}`,
    `- Largest requested player count: ${report.coverage.largestRequestedPlayerCount}`,
    `- Same-block-enabled runs: ${report.coverage.sameBlockEnabledRuns}`,
    `- Expected-failure-enabled runs: ${report.coverage.expectedFailuresEnabledRuns}`,
    `- Total requested games: ${report.coverage.totalRequestedGames}`,
    "",
    "## Aggregate breakage signals",
    "",
    `- Unexpected failures: ${report.breakageSummary.totalUnexpectedFailures}`,
    `- Wedged active slots: ${report.breakageSummary.gamesWithWedgedActiveSlot}`,
    `- Terminal mismatches: ${report.breakageSummary.gamesWithTerminalStateMismatch}`,
    `- Accounting mismatches: ${report.breakageSummary.gamesWithAccountingMismatch}`,
    `- Preview mismatches: ${report.breakageSummary.gamesWithPreviewMismatch}`,
    `- Drain mismatches: ${report.breakageSummary.gamesWithDrainMismatch}`,
    `- Replay inconsistencies: ${report.breakageSummary.gamesWithReplayInconsistency}`,
    `- Expected failed txs: ${report.expectedFailureSummary.txFailedExpected}`,
    `- Probe failures as expected: ${report.expectedFailureSummary.probeFailedAsExpected}`,
    `- Probe onchain reverts: ${report.expectedFailureSummary.probeOnchainReverts}`,
    `- Probe local rejections: ${report.expectedFailureSummary.probeLocalRejections}`,
    `- Same-block expected failures: ${report.expectedFailureSummary.sameBlockExpectedFailures}`,
    "",
    "## Transaction summary",
    "",
    `- Attempted: ${report.txSummary.attempted}`,
    `- Succeeded: ${report.txSummary.succeeded}`,
    `- Failed: ${report.txSummary.failed}`,
    `- Failed expected: ${report.txSummary.failedExpected}`,
    `- Failed unexpected: ${report.txSummary.failedUnexpected}`,
    `- Unexpected successes: ${report.txSummary.unexpectedSuccesses}`,
    "",
    "## Terminal outcomes",
    "",
    renderMarkdownCountEntries(report.scenarioSummary.byTerminalOutcome),
    "",
    "## Terminal paths",
    "",
    renderMarkdownCountEntries(report.scenarioSummary.byTerminalPath),
    "",
    "## Runs",
    "",
    ...report.runs.flatMap((run) => [renderMarkdownRunSummary(run)]),
    "## Case summary",
    "",
  ];

  for (const caseSummary of report.caseSummary) {
    lines.push(`### ${caseSummary.caseId}`);
    lines.push("");
    lines.push(`- Runs: ${caseSummary.runs}`);
    lines.push(`- Seeds: ${caseSummary.seeds.join(", ")}`);
    lines.push(`- Requested scenarios: ${caseSummary.requestedScenarios.join(", ")}`);
    lines.push(`- Total games completed: ${caseSummary.totalGamesCompleted}`);
    lines.push(`- Total joined players across runs: ${caseSummary.totalJoinedPlayersAcrossRuns}`);
    lines.push(`- Max joined players in a single game: ${caseSummary.maxJoinedPlayersInSingleGame}`);
    lines.push(`- Expected failures: tx=${caseSummary.expectedFailureSummary.txFailedExpected}, probes=${caseSummary.expectedFailureSummary.probeFailedAsExpected}, onchain reverts=${caseSummary.expectedFailureSummary.probeOnchainReverts}, same-block=${caseSummary.expectedFailureSummary.sameBlockExpectedFailures}`);
    lines.push(`- Breakage: wedge=${caseSummary.breakageSummary.gamesWithWedgedActiveSlot}, terminal=${caseSummary.breakageSummary.gamesWithTerminalStateMismatch}, accounting=${caseSummary.breakageSummary.gamesWithAccountingMismatch}, preview=${caseSummary.breakageSummary.gamesWithPreviewMismatch}, drain=${caseSummary.breakageSummary.gamesWithDrainMismatch}, replay=${caseSummary.breakageSummary.gamesWithReplayInconsistency}, unexpected=${caseSummary.breakageSummary.totalUnexpectedFailures}`);
    lines.push(`- Terminal outcomes: ${formatCountEntries(caseSummary.terminalOutcomes)}`);
    lines.push("");
  }

  if (report.unexpectedFailureClusters.length > 0) {
    lines.push("## Unexpected failure clusters");
    lines.push("");
    for (const cluster of report.unexpectedFailureClusters.slice(0, 10)) {
      lines.push(
        `- ${cluster.action} @ ${cluster.phase}: ${cluster.errorFingerprint} (${cluster.count}) | runs=${cluster.runIds.join(", ")}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}
`;
}

export function printLoadHarnessMatrixSummary(report) {
  console.log("\n🏋️ Prisoners DAOllema load harness matrix summary");
  console.log(`Status:         ${report.status}`);
  console.log(`Preset:         ${report.preset.label}`);
  console.log(`Run dir:        ${report.paths.runDir}`);
  console.log(
    `Runs:           ${report.plan.completedRunCount}/${report.plan.plannedRunCount}`
  );
  console.log(`Seeds:          ${report.coverage.seeds.join(", ")}`);
  console.log(`Profiles:       ${report.coverage.profiles.join(", ")}`);
  console.log(
    `Req scenarios:  ${report.coverage.requestedScenarios.join(", ")}`
  );
  console.log(`Games total:    ${report.coverage.totalCompletedGames}`);
  console.log(
    `Tx summary:     ${report.txSummary.attempted} attempted / ${report.txSummary.succeeded} succeeded / ${report.txSummary.failed} failed`
  );
  console.log(
    `Tx unexpected:  ${report.txSummary.failedUnexpected} failed / ${report.txSummary.unexpectedSuccesses} unexpected success`
  );
  console.log(
    `Exp failures:   tx=${report.expectedFailureSummary.txFailedExpected}, probes=${report.expectedFailureSummary.probeFailedAsExpected}, onchain=${report.expectedFailureSummary.probeOnchainReverts}, same-block=${report.expectedFailureSummary.sameBlockExpectedFailures}`
  );
  console.log(
    `Same-block:     ${report.sameBlockSummary.attemptedBatches} batches / ${report.sameBlockSummary.attemptedTxs} tx / ${report.sameBlockSummary.expectedFailures} expected failures`
  );
  console.log(
    `Probe summary:  ${report.breakageSummary.probeSummary.failedAsExpected}/${report.breakageSummary.probeSummary.attempted} expected failures, ${report.breakageSummary.probeSummary.unexpectedSuccesses} unexpected success`
  );
  console.log(
    `Breakage:       wedge=${report.breakageSummary.gamesWithWedgedActiveSlot}, terminal=${report.breakageSummary.gamesWithTerminalStateMismatch}, accounting=${report.breakageSummary.gamesWithAccountingMismatch}, preview=${report.breakageSummary.gamesWithPreviewMismatch}, drain=${report.breakageSummary.gamesWithDrainMismatch}, replay=${report.breakageSummary.gamesWithReplayInconsistency}, unexpected=${report.breakageSummary.totalUnexpectedFailures}`
  );
  console.log(
    `Outcomes:       ${formatCountEntries(report.scenarioSummary.byTerminalOutcome)}`
  );
  console.log(
    `Terminal paths: ${formatCountEntries(report.scenarioSummary.byTerminalPath)}`
  );

  for (const run of report.runs) {
    console.log(`\nRun ${String(run.index).padStart(2, "0")} — ${run.id}`);
    console.log(`  Case:         ${run.caseId}`);
    console.log(`  Seed:         ${run.seed}`);
    console.log(`  Status:       ${run.status}`);
    console.log(`  Profile:      ${run.config.profile}`);
    console.log(
      `  Scenario:     ${run.config.requestedScenario} (${run.result?.gamesCompleted ?? 0} games)`
    );
    console.log(
      `  Outcomes:     ${formatCountEntries(run.result?.terminalOutcomes ?? [])}`
    );
    console.log(
      `  Tx unexpected:${run.result?.txSummary?.failedUnexpected ?? 0} failed / ${run.result?.txSummary?.unexpectedSuccesses ?? 0} unexpected success`
    );
    console.log(
      `  Exp failures: tx=${run.result?.expectedFailureSummary?.txFailedExpected ?? 0}, probes=${run.result?.expectedFailureSummary?.probeFailedAsExpected ?? 0}, onchain=${run.result?.expectedFailureSummary?.probeOnchainReverts ?? 0}, same-block=${run.result?.expectedFailureSummary?.sameBlockExpectedFailures ?? 0}`
    );
    console.log(
      `  Breakage:     wedge=${run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0}, terminal=${run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0}, accounting=${run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0}, preview=${run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0}, drain=${run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0}, replay=${run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0}, unexpected=${run.result?.breakageSummary?.totalUnexpectedFailures ?? 0}`
    );
    console.log(`  Report:       ${run.paths.report}`);
    if (run.error) {
      console.log(`  Error:        ${run.error}`);
    }
  }

  if (report.unexpectedFailureClusters.length > 0) {
    console.log("\nUnexpected failure clusters:");
    for (const cluster of report.unexpectedFailureClusters.slice(0, 10)) {
      console.log(
        `  - ${cluster.action} @ ${cluster.phase}: ${cluster.errorFingerprint} (${cluster.count})`
      );
    }
  }

  console.log(`\nMatrix report:  ${report.paths.report}`);
  console.log(`Summary MD:     ${report.paths.summary}`);
  console.log(`Boundary note:  ${report.boundaryNote}`);
}
