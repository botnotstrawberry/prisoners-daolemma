import net from "net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { resolveFromPackageRoot } from "./authTooling.js";
import { LOAD_HARNESS_BOUNDARY_NOTE, runLoadHarness } from "./loadHarness.js";

export const LOAD_HARNESS_MATRIX_SCHEMA_VERSION =
  "prisoners-daollema/load-harness-matrix-v1";
export const LOAD_HARNESS_MATRIX_BOUNDARY_NOTE = `${LOAD_HARNESS_BOUNDARY_NOTE} This matrix runner automates multiple local harness runs and aggregates their local-dev results. When instanceConcurrency is greater than 1, it coordinates multiple isolated harness + Anvil instances in parallel on one host. That is still synthetic host-local stress only: it does not add live-network realism, public mempool contention, or distributed-agent behavior.`;
export const DEFAULT_LOAD_HARNESS_MATRIX_PRESET = "broader-local";

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
      "Seeded adversarial local breakage hunting across repeated games with mixed started-vs-underfilled outcomes, wrong-preimage probes, deadline pressure, and same-block edge batches.",
    harnessOptions: {
      profile: "smoke",
      playerCount: 12,
      causeCount: 4,
      games: 4,
      scenario: "adversarial-random",
      concurrency: 6,
      commitDurationBlocks: 24,
      revealDurationBlocks: 24,
      skipCommitRate: 0.25,
      skipRevealRate: 0.25,
      underfilledRate: 0.2,
      invalidRevealRate: 0.15,
      probeRate: 0.6,
      sameBlockProbes: true,
    },
  },
  "smoke-auth-expiry-sweep": {
    label: "smoke-auth-expiry-sweep",
    description:
      "Sequential winner-path auth-expiry sweep on the smoke profile: repeat bounded stale-bundle plus expired-join recovery before every game's join batch so pre-join auth-expiry coverage is broader than a single once-per-run rehearsal.",
    harnessOptions: {
      profile: "smoke",
      playerCount: 6,
      causeCount: 3,
      games: 3,
      scenario: "winner-all-share",
      concurrency: 3,
      authExpiryChaos: true,
      authExpiryGames: "all",
      authExpiryStaleBundles: 2,
      authExpiryJoinFailures: 2,
      authExpiryTtlSeconds: 2,
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
  "medium-mixed-scale": {
    label: "medium-mixed-scale",
    description:
      "Deterministic medium-scale mixed-family soak on the scale profile: winner, cancelled, and no-winner paths at 16 requested players with explicit 40-block phase budgets so full local participation does not fake-deadline out.",
    harnessOptions: {
      profile: "scale",
      playerCount: 16,
      causeCount: 6,
      games: 3,
      scenario: "mixed",
      concurrency: 8,
      commitDurationBlocks: 40,
      revealDurationBlocks: 40,
    },
  },
  "medium-adversarial-scale": {
    label: "medium-adversarial-scale",
    description:
      "Medium-scale seeded adversarial soak on the scale profile: 20 requested players across repeated local games with explicit 48-block phase budgets, bounded underfill/skip chaos, and probe-heavy breakage hunting.",
    harnessOptions: {
      profile: "scale",
      playerCount: 20,
      causeCount: 6,
      games: 3,
      scenario: "adversarial-random",
      concurrency: 10,
      commitDurationBlocks: 48,
      revealDurationBlocks: 48,
      skipCommitRate: 0.2,
      skipRevealRate: 0.2,
      underfilledRate: 0.15,
      invalidRevealRate: 0.1,
      probeRate: 0.5,
    },
  },
  "large-mixed-scale": {
    label: "large-mixed-scale",
    description:
      "Deterministic larger local mixed-family soak on the scale profile: 24 requested players across winner, cancelled, and no-winner paths with explicit 56-block phase budgets so larger local rounds stay honest instead of fake-timing out.",
    harnessOptions: {
      profile: "scale",
      playerCount: 24,
      causeCount: 8,
      games: 3,
      scenario: "mixed",
      concurrency: 12,
      commitDurationBlocks: 56,
      revealDurationBlocks: 56,
    },
  },
  "large-adversarial-scale": {
    label: "large-adversarial-scale",
    description:
      "Larger seeded adversarial soak on the scale profile: 28 requested players across two sequential local games with bounded skip/underfill/probe pressure and explicit 64-block phase budgets for honest higher-join breakage hunting.",
    harnessOptions: {
      profile: "scale",
      playerCount: 28,
      causeCount: 8,
      games: 2,
      scenario: "adversarial-random",
      concurrency: 12,
      commitDurationBlocks: 64,
      revealDurationBlocks: 64,
      skipCommitRate: 0.18,
      skipRevealRate: 0.18,
      underfilledRate: 0.1,
      invalidRevealRate: 0.08,
      probeRate: 0.55,
    },
  },
  "xlarge-mixed-scale": {
    label: "xlarge-mixed-scale",
    description:
      "Deterministic xlarge local mixed-family soak on the scale profile: 32 requested players across winner, cancelled, and no-winner paths with explicit 72-block phase budgets so bigger local rounds fail for real reasons instead of fake auto-mined deadline pressure.",
    harnessOptions: {
      profile: "scale",
      playerCount: 32,
      causeCount: 8,
      games: 3,
      scenario: "mixed",
      concurrency: 16,
      commitDurationBlocks: 72,
      revealDurationBlocks: 72,
    },
  },
  "xlarge-adversarial-scale": {
    label: "xlarge-adversarial-scale",
    description:
      "Seeded xlarge adversarial soak on the scale profile: one started full-roster 32-player local game envelope per seed with underfill disabled, bounded omission/probe chaos, and explicit 80-block phase budgets so the matrix can repeat honest 32-player breakage hunting across multiple seeds without pretending one run proves exhaustive coverage.",
    harnessOptions: {
      profile: "scale",
      playerCount: 32,
      causeCount: 8,
      games: 1,
      scenario: "adversarial-random",
      minPlayers: 32,
      concurrency: 16,
      commitDurationBlocks: 80,
      revealDurationBlocks: 80,
      skipCommitRate: 0.16,
      skipRevealRate: 0.16,
      underfilledRate: 0,
      invalidRevealRate: 0.08,
      probeRate: 0.55,
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
  "auth-expiry-local": {
    label: "auth-expiry-local",
    description:
      "Two seeded repeated auth-expiry sweeps on the smoke profile, each replaying bounded stale-bundle plus expired-join recovery before every sequential winner-path game.",
    runs: [
      {
        id: "auth-expiry-a",
        caseId: "smoke-auth-expiry-sweep",
        seed: "auth-expiry-a",
      },
      {
        id: "auth-expiry-b",
        caseId: "smoke-auth-expiry-sweep",
        seed: "auth-expiry-b",
      },
    ],
  },
  "medium-local": {
    label: "medium-local",
    description:
      "Bounded medium-scale local soak: one deterministic 16-player mixed-family pass plus two seeded 20-player adversarial sweeps, all with explicit longer phase budgets to avoid fake local deadline failures.",
    runs: [
      {
        id: "medium-mixed-a",
        caseId: "medium-mixed-scale",
        seed: "medium-mixed-a",
      },
      {
        id: "medium-adversarial-a",
        caseId: "medium-adversarial-scale",
        seed: "medium-adversarial-a",
      },
      {
        id: "medium-adversarial-b",
        caseId: "medium-adversarial-scale",
        seed: "medium-adversarial-b",
      },
    ],
  },
  "large-local": {
    label: "large-local",
    description:
      "Bounded larger local soak: one deterministic 24-player mixed-family pass plus one seeded 28-player adversarial sweep across two sequential games, all with explicit 56/64-block phase budgets for honest higher-join local stress.",
    runs: [
      {
        id: "large-mixed-a",
        caseId: "large-mixed-scale",
        seed: "large-mixed-a",
      },
      {
        id: "large-adversarial-a",
        caseId: "large-adversarial-scale",
        seed: "large-adversarial-32",
      },
    ],
  },
  "xlarge-local": {
    label: "xlarge-local",
    description:
      "Bounded xlarge local soak: one deterministic 32-player mixed-family pass plus three seeded started full-roster 32-player single-game adversarial sweeps, with explicit 72/80-block phase budgets so bigger local rounds fail for real reasons instead of fake auto-mined deadline pressure while broadening 32-player adversarial coverage beyond one seed.",
    runs: [
      {
        id: "xlarge-mixed-a",
        caseId: "xlarge-mixed-scale",
        seed: "xlarge-mixed-a",
      },
      {
        id: "xlarge-adversarial-a",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-19",
      },
      {
        id: "xlarge-adversarial-b",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-73",
      },
      {
        id: "xlarge-adversarial-c",
        caseId: "xlarge-adversarial-scale",
        seed: "xlarge-seed-211",
      },
    ],
  },
  "parallel-local": {
    label: "parallel-local",
    description:
      "Bounded host-local multi-instance stress: one same-block family pass, one seeded adversarial smoke sweep, and one larger scale-profile winner soak coordinated across isolated local harness + Anvil instances on the same machine.",
    instanceConcurrency: 2,
    runs: [
      {
        id: "parallel-same-block-a",
        caseId: "smoke-mixed-same-block",
        seed: "parallel-same-block-a",
      },
      {
        id: "parallel-adversarial-a",
        caseId: "smoke-adversarial-sweep",
        seed: "parallel-adversarial-a",
      },
      {
        id: "parallel-winner-a",
        caseId: "scale-winner-soak",
        seed: "parallel-winner-a",
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
      "Bounded broader local soak: one deterministic same-block family pass, three seeded adversarial smoke sweeps, one repeated auth-expiry sweep, and two larger scale-profile winner-path drain rehearsals.",
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
        id: "auth-expiry-a",
        caseId: "smoke-auth-expiry-sweep",
        seed: "auth-expiry-a",
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

function parseIntegerOption(
  rawValue,
  label,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {}
) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
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

  const requestedInstanceConcurrency = parseIntegerOption(
    rawOptions.instanceConcurrency ?? preset.instanceConcurrency ?? 1,
    "instanceConcurrency",
    { min: 1, max: 32 }
  );
  const instanceConcurrency = Math.min(
    requestedInstanceConcurrency,
    selectedPresetRuns.length
  );

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
    requestedInstanceConcurrency,
    instanceConcurrency,
    executionMode: instanceConcurrency > 1 ? "parallel-local" : "sequential",
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
    execution: {
      mode: execution.mode ?? null,
      workerSlot: execution.workerSlot ?? null,
      startedAt: execution.startedAt ?? null,
      finishedAt: execution.finishedAt ?? null,
      wallClockMs: execution.wallClockMs ?? null,
    },
    environment: {
      spawnedAnvil:
        execution.report?.environment?.spawnedAnvil ??
        execution.spawnedAnvil ??
        !plannedRun.harnessOptions.rpcUrl,
      chainId: execution.report?.environment?.chainId ?? null,
      rpcUrl:
        execution.report?.environment?.rpcUrl ??
        execution.rpcUrl ??
        plannedRun.harnessOptions.rpcUrl ??
        null,
      anvilPort:
        execution.report?.environment?.anvilPort ??
        execution.anvilPort ??
        plannedRun.harnessOptions.anvilPort ??
        null,
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
      authExpiryChaos: {
        enabled: Boolean(plannedRun.harnessOptions.authExpiryChaos),
        games: plannedRun.harnessOptions.authExpiryGames ?? null,
        staleBundleFailures:
          plannedRun.harnessOptions.authExpiryStaleBundles ?? 0,
        expiredJoinFailures:
          plannedRun.harnessOptions.authExpiryJoinFailures ?? 0,
        ttlSeconds: plannedRun.harnessOptions.authExpiryTtlSeconds ?? null,
      },
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
          authChaos: report?.authChaos ?? null,
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
                gamesWithDrainMismatch: breakageSummary.gamesWithDrainMismatch,
                gamesWithReplayInconsistency:
                  breakageSummary.gamesWithReplayInconsistency,
                gamesWithUnexpectedFailures:
                  breakageSummary.gamesWithUnexpectedFailures,
                totalUnexpectedFailures:
                  breakageSummary.totalUnexpectedFailures,
                probeSummary: breakageSummary.probeSummary,
              }
            : null,
          unexpectedFailureClusters,
        }
      : null,
  };
}

function buildMatrixAuthChaosSummary(runs) {
  const runAuthChaos = runs
    .map((run) => run.result?.authChaos)
    .filter((entry) => entry?.enabled);

  return {
    enabledRuns: runAuthChaos.length,
    gamesConsidered: sumBy(
      runAuthChaos,
      (entry) => entry?.gamesConsidered ?? 0
    ),
    gamesSelected: sumBy(runAuthChaos, (entry) => entry?.gamesSelected ?? 0),
    gamesApplied: sumBy(runAuthChaos, (entry) => entry?.gamesApplied ?? 0),
    timeWarpSeconds: sumBy(runAuthChaos, (entry) => entry?.timeWarpSeconds ?? 0),
    manualBlocksMined: sumBy(
      runAuthChaos,
      (entry) => entry?.manualBlocksMined ?? 0
    ),
    staleBundle: {
      requested: sumBy(runAuthChaos, (entry) => entry?.staleBundle?.requested ?? 0),
      attempted: sumBy(runAuthChaos, (entry) => entry?.staleBundle?.attempted ?? 0),
      failedAsExpected: sumBy(
        runAuthChaos,
        (entry) => entry?.staleBundle?.failedAsExpected ?? 0
      ),
    },
    expiredJoin: {
      requested: sumBy(runAuthChaos, (entry) => entry?.expiredJoin?.requested ?? 0),
      shortAuthRegistrations: sumBy(
        runAuthChaos,
        (entry) => entry?.expiredJoin?.shortAuthRegistrations ?? 0
      ),
      joinAttempts: sumBy(runAuthChaos, (entry) => entry?.expiredJoin?.joinAttempts ?? 0),
      failedAsExpected: sumBy(
        runAuthChaos,
        (entry) => entry?.expiredJoin?.failedAsExpected ?? 0
      ),
      localRegisterRejections: sumBy(
        runAuthChaos,
        (entry) => entry?.expiredJoin?.localRegisterRejections ?? 0
      ),
      refreshedRegistrations: sumBy(
        runAuthChaos,
        (entry) => entry?.expiredJoin?.refreshedRegistrations ?? 0
      ),
    },
    skipped: runAuthChaos.flatMap((entry) => entry?.skipped ?? []),
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
      txAttempted: sumBy(
        caseRuns,
        (run) => run.result?.txSummary?.attempted ?? 0
      ),
      txFailedExpected: sumBy(
        caseRuns,
        (run) => run.result?.txSummary?.failedExpected ?? 0
      ),
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
      sameBlockExpectedFailures: sumBy(
        caseRuns,
        (run) => run.result?.sameBlockSummary?.expectedFailures ?? 0
      ),
      probeFailedAsExpected: sumBy(
        caseRuns,
        (run) =>
          run.result?.breakageSummary?.probeSummary?.failedAsExpected ?? 0
      ),
      terminalOutcomes: mergeCountEntries(
        caseRuns.map((run) => run.result?.terminalOutcomes ?? [])
      ),
      breakageSummary: {
        gamesWithWedgedActiveSlot: sumBy(
          caseRuns,
          (run) => run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0
        ),
        gamesWithTerminalStateMismatch: sumBy(
          caseRuns,
          (run) =>
            run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0
        ),
        gamesWithAccountingMismatch: sumBy(
          caseRuns,
          (run) => run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0
        ),
        gamesWithPreviewMismatch: sumBy(
          caseRuns,
          (run) => run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0
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

function parseRunExecutionTimestamp(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildExecutionSummary(plan, runs) {
  const intervals = runs
    .map((run) => ({
      id: run.id,
      startedAt: run.execution?.startedAt ?? null,
      finishedAt: run.execution?.finishedAt ?? null,
      startMs: parseRunExecutionTimestamp(run.execution?.startedAt ?? null),
      endMs: parseRunExecutionTimestamp(run.execution?.finishedAt ?? null),
    }))
    .filter((interval) => interval.startMs !== null && interval.endMs !== null);

  const events = [];
  for (const interval of intervals) {
    events.push({ time: interval.startMs, delta: 1, order: 1 });
    events.push({ time: interval.endMs, delta: -1, order: 0 });
  }
  events.sort((a, b) => a.time - b.time || a.order - b.order);

  let activeRuns = 0;
  let peakActiveRuns = 0;
  for (const event of events) {
    activeRuns += event.delta;
    peakActiveRuns = Math.max(peakActiveRuns, activeRuns);
  }

  const overlappingRunPairs = [];
  const overlappedRunIds = new Set();
  for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < intervals.length;
      rightIndex += 1
    ) {
      const left = intervals[leftIndex];
      const right = intervals[rightIndex];
      const overlapMs = Math.max(
        0,
        Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs)
      );
      if (overlapMs <= 0) {
        continue;
      }
      overlappingRunPairs.push({
        leftRunId: left.id,
        rightRunId: right.id,
        overlapMs,
      });
      overlappedRunIds.add(left.id);
      overlappedRunIds.add(right.id);
    }
  }

  return {
    mode: plan.executionMode,
    requestedInstanceConcurrency: plan.requestedInstanceConcurrency,
    instanceConcurrencyLimit: plan.instanceConcurrency,
    peakActiveRuns,
    runsWithAnyOverlap: overlappedRunIds.size,
    localParallelismConfirmed:
      plan.executionMode === "parallel-local" && peakActiveRuns > 1,
    stopOnError: plan.stopOnError,
    dispatchStoppedEarly:
      plan.stopOnError && runs.length < plan.plannedRunCount,
    overlappingRunPairs: overlappingRunPairs.sort(
      (a, b) => b.overlapMs - a.overlapMs
    ),
  };
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
  const authChaosSummary = buildMatrixAuthChaosSummary(runs);
  const aggregateBreakageSummary = {
    gamesChecked: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesChecked ?? 0
    ),
    gamesWithWedgedActiveSlot: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0
    ),
    gamesWithTerminalStateMismatch: sumBy(
      runs,
      (run) => run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0
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
    execution: buildExecutionSummary(plan, runs),
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
      requestedInstanceConcurrency: plan.requestedInstanceConcurrency,
      instanceConcurrency: plan.instanceConcurrency,
      executionMode: plan.executionMode,
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
      authChaosEnabledRuns: runs.filter(
        (run) => run.config.authExpiryChaos?.enabled
      ).length,
      largestRequestedPlayerCount: maxBy(runs, (run) => run.config.playerCount),
      totalRequestedGames: sumBy(runs, (run) => run.config.games),
      totalCompletedGames: sumBy(
        runs,
        (run) => run.result?.gamesCompleted ?? 0
      ),
    },
    runStatusSummary,
    txSummary: aggregateTxSummary,
    sameBlockSummary: aggregateSameBlockSummary,
    authChaosSummary,
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
        (run) => run.result?.localScaleReadiness?.replayConsistentGames ?? 0
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

function isMatrixRunFailure(run) {
  return run.status !== "ok" || run.result?.harnessStatus === "failed";
}

async function executePlannedMatrixRun({
  plannedRun,
  workerSlot,
  executionMode,
  executeHarness,
  reservedPorts,
}) {
  const reportPath = join(plannedRun.outDir, "report.json");
  const txLogPath = join(plannedRun.outDir, "txs.jsonl");
  const harnessOptions = { ...plannedRun.harnessOptions };

  if (!harnessOptions.rpcUrl && harnessOptions.anvilPort === undefined) {
    let reservedPort = null;
    do {
      reservedPort = await reserveFreePort();
    } while (reservedPorts.has(reservedPort));
    reservedPorts.add(reservedPort);
    harnessOptions.anvilPort = reservedPort;
  }

  const startedAt = new Date().toISOString();

  try {
    const result = await executeHarness(harnessOptions);
    const finishedAt = new Date().toISOString();
    return buildRunResult(plannedRun, {
      status: "ok",
      report: result.report,
      reportPath: result.reportPath,
      txLogPath: result.txLogPath,
      mode: executionMode,
      workerSlot,
      startedAt,
      finishedAt,
      wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
      spawnedAnvil: !harnessOptions.rpcUrl,
      rpcUrl: harnessOptions.rpcUrl ?? null,
      anvilPort: harnessOptions.anvilPort ?? null,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const report = existsSync(reportPath) ? readJsonFile(reportPath) : null;
    return buildRunResult(plannedRun, {
      status: report?.status ?? "failed",
      report,
      reportPath: existsSync(reportPath) ? reportPath : null,
      txLogPath: existsSync(txLogPath) ? txLogPath : null,
      error: error?.message ?? String(error),
      mode: executionMode,
      workerSlot,
      startedAt,
      finishedAt,
      wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
      spawnedAnvil: !harnessOptions.rpcUrl,
      rpcUrl: harnessOptions.rpcUrl ?? null,
      anvilPort: harnessOptions.anvilPort ?? null,
    });
  }
}

export async function runLoadHarnessMatrix(rawOptions = {}, dependencies = {}) {
  const plan = buildLoadHarnessMatrixPlan(rawOptions);
  ensureDir(plan.runDir);

  const executeHarness = dependencies.runLoadHarness ?? runLoadHarness;
  const startedAt = new Date().toISOString();
  const reservedPorts = new Set();
  const runResults = new Array(plan.runs.length);

  if (plan.executionMode === "parallel-local") {
    let cursor = 0;
    let stopDispatch = false;

    async function worker(workerSlot) {
      while (true) {
        if (stopDispatch) {
          return;
        }

        const plannedRun = plan.runs[cursor];
        cursor += 1;
        if (!plannedRun) {
          return;
        }

        const run = await executePlannedMatrixRun({
          plannedRun,
          workerSlot,
          executionMode: plan.executionMode,
          executeHarness,
          reservedPorts,
        });
        runResults[plannedRun.index - 1] = run;

        if (plan.stopOnError && isMatrixRunFailure(run)) {
          stopDispatch = true;
        }
      }
    }

    await Promise.all(
      Array.from({ length: plan.instanceConcurrency }, (_, index) =>
        worker(index + 1)
      )
    );
  } else {
    for (const plannedRun of plan.runs) {
      const run = await executePlannedMatrixRun({
        plannedRun,
        workerSlot: 1,
        executionMode: plan.executionMode,
        executeHarness,
        reservedPorts,
      });
      runResults[plannedRun.index - 1] = run;

      if (plan.stopOnError && isMatrixRunFailure(run)) {
        break;
      }
    }
  }

  const runs = runResults.filter(Boolean);
  const finishedAt = new Date().toISOString();
  const report = buildLoadHarnessMatrixReport({
    plan,
    runs,
    startedAt,
    finishedAt,
    wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
  });
  writeJsonFile(plan.reportPath, report);
  writeFileSync(
    plan.summaryPath,
    renderLoadHarnessMatrixMarkdown(report),
    "utf8"
  );

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

function renderLoadHarnessMatrixRunMarkdown(run) {
  const txSummary = run.result?.txSummary ?? {};
  const sameBlockSummary = run.result?.sameBlockSummary ?? {};
  const breakageSummary = run.result?.breakageSummary ?? {};
  const probeSummary = breakageSummary.probeSummary ?? {};
  const authChaos = run.result?.authChaos ?? {};
  const localScaleReadiness = run.result?.localScaleReadiness ?? {};

  return [
    `### Run ${String(run.index).padStart(2, "0")} — ${run.id}`,
    "",
    `- Case: ${run.caseId}`,
    `- Seed: ${run.seed}`,
    `- Status: ${run.status}`,
    `- Profile: ${run.config.profile}`,
    `- Requested scenario: ${run.config.requestedScenario}`,
    `- Requested size: ${run.config.playerCount} players / ${run.config.games} games / ${run.config.causeCount} causes / concurrency ${run.config.concurrency}`,
    `- Execution: mode=${run.execution?.mode ?? "unknown"}, workerSlot=${
      run.execution?.workerSlot ?? "n/a"
    }, wallClockMs=${run.execution?.wallClockMs ?? 0}`,
    `- Started / finished: ${run.execution?.startedAt ?? "n/a"} -> ${
      run.execution?.finishedAt ?? "n/a"
    }`,
    `- Local instance: spawnedAnvil=${run.environment?.spawnedAnvil ? "yes" : "no"}, anvilPort=${
      run.environment?.anvilPort ?? "n/a"
    }`,
    `- Phase budgets: commit=${
      run.config.commitDurationBlocks ?? "profile-default"
    }, reveal=${run.config.revealDurationBlocks ?? "profile-default"}`,
    `- Games completed: ${run.result?.gamesCompleted ?? 0}`,
    `- Scenario plan: ${
      (run.result?.scenarioPlan ?? []).join(", ") || "(none)"
    }`,
    `- Joined players: max single game=${
      localScaleReadiness.maxJoinedPlayersInSingleGame ?? 0
    }, total across run=${
      localScaleReadiness.totalJoinedPlayersAcrossRun ?? 0
    }`,
    `- Terminal outcomes: ${formatCountEntries(
      run.result?.terminalOutcomes ?? []
    )}`,
    `- Tx summary: attempted=${txSummary.attempted ?? 0}, succeeded=${
      txSummary.succeeded ?? 0
    }, failedExpected=${txSummary.failedExpected ?? 0}, failedUnexpected=${
      txSummary.failedUnexpected ?? 0
    }, unexpectedSuccesses=${txSummary.unexpectedSuccesses ?? 0}`,
    `- Probe summary: expected=${probeSummary.failedAsExpected ?? 0}/${
      probeSummary.attempted ?? 0
    }, unexpectedSuccesses=${
      probeSummary.unexpectedSuccesses ?? 0
    }, onchainReverts=${probeSummary.onchainReverts ?? 0}, localRejections=${
      probeSummary.localRejections ?? 0
    }`,
    `- Same-block summary: batches=${
      sameBlockSummary.attemptedBatches ?? 0
    }, tx=${sameBlockSummary.attemptedTxs ?? 0}, expectedFailures=${
      sameBlockSummary.expectedFailures ?? 0
    }, unexpectedFailures=${sameBlockSummary.unexpectedFailures ?? 0}`,
    authChaos.enabled
      ? `- Auth chaos: selectedGames=${authChaos.gamesSelected ?? 0}, appliedGames=${authChaos.gamesApplied ?? 0}, stale=${authChaos.staleBundle?.failedAsExpected ?? 0}/${authChaos.staleBundle?.attempted ?? 0}, expiredJoin=${authChaos.expiredJoin?.failedAsExpected ?? 0}/${authChaos.expiredJoin?.joinAttempts ?? 0}, refresh=${authChaos.expiredJoin?.refreshedRegistrations ?? 0}`
      : null,
    `- Breakage: wedge=${
      breakageSummary.gamesWithWedgedActiveSlot ?? 0
    }, terminal=${
      breakageSummary.gamesWithTerminalStateMismatch ?? 0
    }, accounting=${
      breakageSummary.gamesWithAccountingMismatch ?? 0
    }, preview=${breakageSummary.gamesWithPreviewMismatch ?? 0}, drain=${
      breakageSummary.gamesWithDrainMismatch ?? 0
    }, replay=${
      breakageSummary.gamesWithReplayInconsistency ?? 0
    }, unexpected=${breakageSummary.totalUnexpectedFailures ?? 0}`,
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
    `- Summary markdown: ${report.paths.summary}`,
    "",
    "## Execution model",
    "",
    `- Mode: ${report.execution.mode}`,
    `- Requested instance concurrency: ${report.execution.requestedInstanceConcurrency}`,
    `- Effective instance concurrency limit: ${report.execution.instanceConcurrencyLimit}`,
    `- Peak active runs observed: ${report.execution.peakActiveRuns}`,
    `- Runs with any overlap: ${report.execution.runsWithAnyOverlap}`,
    `- Parallel overlap confirmed: ${report.execution.localParallelismConfirmed ? "yes" : "no"}`,
    `- stopOnError: ${report.execution.stopOnError}`,
    `- Dispatch stopped early: ${report.execution.dispatchStoppedEarly ? "yes" : "no"}`,
    "",
    "## Coverage",
    "",
    `- Seeds: ${report.coverage.seeds.join(", ")}`,
    `- Profiles: ${report.coverage.profiles.join(", ")}`,
    `- Requested scenarios: ${report.coverage.requestedScenarios.join(", ")}`,
    `- Largest requested player count: ${report.coverage.largestRequestedPlayerCount}`,
    `- Max joined players in a single game: ${report.localScaleReadiness.maxJoinedPlayersInSingleGame}`,
    `- Games hitting requested player target: ${report.localScaleReadiness.gamesHittingRequestedPlayerTarget}`,
    `- Same-block-enabled runs: ${report.coverage.sameBlockEnabledRuns}`,
    `- Expected-failure-enabled runs: ${report.coverage.expectedFailuresEnabledRuns}`,
    `- Auth-chaos-enabled runs: ${report.coverage.authChaosEnabledRuns}`,
    `- Total requested games: ${report.coverage.totalRequestedGames}`,
    "",
    "## Auth-expiry chaos summary",
    "",
    `- Enabled runs: ${report.authChaosSummary.enabledRuns}`,
    `- Selected games: ${report.authChaosSummary.gamesSelected}`,
    `- Applied games: ${report.authChaosSummary.gamesApplied}`,
    `- Stale bundles failed as expected: ${report.authChaosSummary.staleBundle.failedAsExpected}/${report.authChaosSummary.staleBundle.attempted}`,
    `- Expired joins failed as expected: ${report.authChaosSummary.expiredJoin.failedAsExpected}/${report.authChaosSummary.expiredJoin.joinAttempts}`,
    `- Refreshed registrations: ${report.authChaosSummary.expiredJoin.refreshedRegistrations}`,
    `- Manual blocks mined for auth chaos: ${report.authChaosSummary.manualBlocksMined}`,
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
    `- Expected failed txs: ${report.txSummary.failedExpected}`,
    `- Probe failures as expected: ${report.breakageSummary.probeSummary.failedAsExpected}`,
    `- Probe onchain reverts: ${report.breakageSummary.probeSummary.onchainReverts}`,
    `- Probe local rejections: ${report.breakageSummary.probeSummary.localRejections}`,
    `- Same-block expected failures: ${report.sameBlockSummary.expectedFailures}`,
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
    "## Case summary",
    "",
  ];

  for (const caseSummary of report.caseSummary) {
    lines.push(`### ${caseSummary.caseId}`);
    lines.push("");
    lines.push(`- Runs: ${caseSummary.runs}`);
    lines.push(`- Seeds: ${caseSummary.seeds.join(", ")}`);
    lines.push(
      `- Requested scenarios: ${caseSummary.requestedScenarios.join(", ")}`
    );
    lines.push(`- Total games completed: ${caseSummary.totalGamesCompleted}`);
    lines.push(
      `- Max joined players in a single game: ${caseSummary.maxJoinedPlayersInSingleGame}`
    );
    lines.push(
      `- Total joined players across runs: ${caseSummary.totalJoinedPlayersAcrossRuns}`
    );
    lines.push(
      `- Tx summary: attempted=${caseSummary.txAttempted}, failedExpected=${caseSummary.txFailedExpected}, failedUnexpected=${caseSummary.txFailedUnexpected}, unexpectedSuccesses=${caseSummary.unexpectedSuccesses}`
    );
    lines.push(
      `- Probe failures as expected: ${caseSummary.probeFailedAsExpected}`
    );
    lines.push(
      `- Same-block expected failures: ${caseSummary.sameBlockExpectedFailures}`
    );
    lines.push(
      `- Breakage: wedge=${caseSummary.breakageSummary.gamesWithWedgedActiveSlot}, terminal=${caseSummary.breakageSummary.gamesWithTerminalStateMismatch}, accounting=${caseSummary.breakageSummary.gamesWithAccountingMismatch}, preview=${caseSummary.breakageSummary.gamesWithPreviewMismatch}, drain=${caseSummary.breakageSummary.gamesWithDrainMismatch}, replay=${caseSummary.breakageSummary.gamesWithReplayInconsistency}, unexpected=${caseSummary.breakageSummary.totalUnexpectedFailures}`
    );
    lines.push(
      `- Terminal outcomes: ${formatCountEntries(caseSummary.terminalOutcomes)}`
    );
    lines.push("");
  }

  lines.push("## Parallel overlap pairs");
  lines.push("");
  if (report.execution.overlappingRunPairs.length > 0) {
    for (const pair of report.execution.overlappingRunPairs) {
      lines.push(
        `- ${pair.leftRunId} ↔ ${pair.rightRunId}: ${pair.overlapMs} ms overlap`
      );
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  lines.push("## Runs");
  lines.push("");
  for (const run of report.runs) {
    lines.push(renderLoadHarnessMatrixRunMarkdown(run));
  }

  if (report.unexpectedFailureClusters.length > 0) {
    lines.push("## Unexpected failure clusters");
    lines.push("");
    for (const cluster of report.unexpectedFailureClusters.slice(0, 10)) {
      lines.push(
        `- ${cluster.action} @ ${cluster.phase}: ${cluster.errorFingerprint} (${
          cluster.count
        }) | runs=${cluster.runIds.join(", ")}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
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
    `Execution:      ${report.execution.mode} / requested=${report.execution.requestedInstanceConcurrency} / limit=${report.execution.instanceConcurrencyLimit} / peak=${report.execution.peakActiveRuns}`
  );
  console.log(
    `Overlap:        ${report.execution.runsWithAnyOverlap} runs / confirmed=${report.execution.localParallelismConfirmed ? "yes" : "no"}`
  );
  console.log(
    `Tx summary:     ${report.txSummary.attempted} attempted / ${report.txSummary.succeeded} succeeded / ${report.txSummary.failed} failed`
  );
  console.log(
    `Tx unexpected:  ${report.txSummary.failedUnexpected} failed / ${report.txSummary.unexpectedSuccesses} unexpected success`
  );
  console.log(
    `Same-block:     ${report.sameBlockSummary.attemptedBatches} batches / ${report.sameBlockSummary.attemptedTxs} tx / ${report.sameBlockSummary.expectedFailures} expected failures`
  );
  if (report.authChaosSummary?.enabledRuns > 0) {
    console.log(
      `Auth chaos:     runs=${report.authChaosSummary.enabledRuns}, games=${report.authChaosSummary.gamesApplied}/${report.authChaosSummary.gamesSelected}, stale=${report.authChaosSummary.staleBundle.failedAsExpected}/${report.authChaosSummary.staleBundle.attempted}, expiredJoin=${report.authChaosSummary.expiredJoin.failedAsExpected}/${report.authChaosSummary.expiredJoin.joinAttempts}`
    );
  }
  console.log(
    `Exp failures:   tx=${report.txSummary.failedExpected}, probes=${report.breakageSummary.probeSummary.failedAsExpected}, onchain=${report.breakageSummary.probeSummary.onchainReverts}, same-block=${report.sameBlockSummary.expectedFailures}`
  );
  console.log(
    `Probe summary:  ${report.breakageSummary.probeSummary.failedAsExpected}/${report.breakageSummary.probeSummary.attempted} expected failures, ${report.breakageSummary.probeSummary.unexpectedSuccesses} unexpected success`
  );
  console.log(
    `Breakage:       wedge=${report.breakageSummary.gamesWithWedgedActiveSlot}, terminal=${report.breakageSummary.gamesWithTerminalStateMismatch}, accounting=${report.breakageSummary.gamesWithAccountingMismatch}, preview=${report.breakageSummary.gamesWithPreviewMismatch}, drain=${report.breakageSummary.gamesWithDrainMismatch}, replay=${report.breakageSummary.gamesWithReplayInconsistency}, unexpected=${report.breakageSummary.totalUnexpectedFailures}`
  );
  console.log(
    `Outcomes:       ${formatCountEntries(
      report.scenarioSummary.byTerminalOutcome
    )}`
  );
  console.log(
    `Terminal paths: ${formatCountEntries(
      report.scenarioSummary.byTerminalPath
    )}`
  );

  for (const run of report.runs) {
    console.log(`\nRun ${String(run.index).padStart(2, "0")} — ${run.id}`);
    console.log(`  Case:         ${run.caseId}`);
    console.log(`  Seed:         ${run.seed}`);
    console.log(`  Status:       ${run.status}`);
    console.log(`  Profile:      ${run.config.profile}`);
    console.log(
      `  Execution:    ${run.execution?.mode ?? "unknown"} / worker=${
        run.execution?.workerSlot ?? "n/a"
      } / wall=${run.execution?.wallClockMs ?? 0} ms / port=${
        run.environment?.anvilPort ?? "n/a"
      }`
    );
    console.log(
      `  Scenario:     ${run.config.requestedScenario} (${
        run.result?.gamesCompleted ?? 0
      } games)`
    );
    console.log(
      `  Outcomes:     ${formatCountEntries(
        run.result?.terminalOutcomes ?? []
      )}`
    );
    console.log(
      `  Tx unexpected:${
        run.result?.txSummary?.failedUnexpected ?? 0
      } failed / ${
        run.result?.txSummary?.unexpectedSuccesses ?? 0
      } unexpected success`
    );
    console.log(
      `  Exp failures: tx=${
        run.result?.txSummary?.failedExpected ?? 0
      }, probes=${
        run.result?.breakageSummary?.probeSummary?.failedAsExpected ?? 0
      }, onchain=${
        run.result?.breakageSummary?.probeSummary?.onchainReverts ?? 0
      }, same-block=${run.result?.sameBlockSummary?.expectedFailures ?? 0}`
    );
    if (run.result?.authChaos?.enabled) {
      console.log(
        `  Auth chaos:   games=${run.result?.authChaos?.gamesApplied ?? 0}/${run.result?.authChaos?.gamesSelected ?? 0}, stale=${run.result?.authChaos?.staleBundle?.failedAsExpected ?? 0}/${run.result?.authChaos?.staleBundle?.attempted ?? 0}, expiredJoin=${run.result?.authChaos?.expiredJoin?.failedAsExpected ?? 0}/${run.result?.authChaos?.expiredJoin?.joinAttempts ?? 0}, refresh=${run.result?.authChaos?.expiredJoin?.refreshedRegistrations ?? 0}`
      );
    }
    console.log(
      `  Breakage:     wedge=${
        run.result?.breakageSummary?.gamesWithWedgedActiveSlot ?? 0
      }, terminal=${
        run.result?.breakageSummary?.gamesWithTerminalStateMismatch ?? 0
      }, accounting=${
        run.result?.breakageSummary?.gamesWithAccountingMismatch ?? 0
      }, preview=${
        run.result?.breakageSummary?.gamesWithPreviewMismatch ?? 0
      }, drain=${
        run.result?.breakageSummary?.gamesWithDrainMismatch ?? 0
      }, replay=${
        run.result?.breakageSummary?.gamesWithReplayInconsistency ?? 0
      }, unexpected=${
        run.result?.breakageSummary?.totalUnexpectedFailures ?? 0
      }`
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
