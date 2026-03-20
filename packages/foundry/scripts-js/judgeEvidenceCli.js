import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, extname, join, relative } from "path";
import { fileURLToPath } from "url";
import {
  parseCliArgs,
  printJson,
  resolveFromPackageRoot,
} from "./authTooling.js";

export const JUDGE_EVIDENCE_SCHEMA =
  "prisoners-daolemma/judge-evidence-v0";
export const LOCAL_PROOF_PACK_SCHEMA =
  "prisoners-daolemma/local-proof-pack-v1";
export const JUDGE_EVIDENCE_BOUNDARY_NOTE =
  "This helper does not create new proof. It only indexes artifacts that already exist in a local load-harness run, a compact local proof pack, or a Base Sepolia canary bundle, then writes a compact judge-facing guide plus a machine-readable inventory.";

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolveFromPackageRoot(".");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function displayPath(referenceDir, targetPath) {
  return toPosixPath(relative(referenceDir, targetPath)) || ".";
}

function resolveDirectoryArg(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing ${label}.`);
  }

  const resolved = resolveFromPackageRoot(value);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`${label} directory not found: ${resolved}`);
  }

  return resolved;
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

function fileIfExists(path) {
  return existsSync(path) ? path : null;
}

function readJson(path, description = "JSON file") {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${description} at ${path}: ${error.message}`);
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function walkFiles(rootDir) {
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(rootDir)) {
    const entryPath = join(rootDir, entry);
    const entryStat = statSync(entryPath);
    if (entryStat.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entryStat.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function pushUnique(list, value) {
  if (!value || list.includes(value)) {
    return;
  }

  list.push(value);
}

function pushOpenOrder(entries, path, why) {
  if (!path) {
    return;
  }

  entries.push({
    path,
    why,
  });
}

function emptyLocalProof({ status = "missing", kind = null } = {}) {
  return {
    kind,
    status,
    reportPath: null,
    txLogPath: null,
    report: null,
    exports: [],
    outcomes: [],
    claims: [],
    packManifestPath: null,
    packReadmePath: null,
    pack: null,
    matrixBundles: [],
  };
}

function summarizeGameSummary(summary) {
  if (!summary) {
    return {
      gameId: null,
      chainId: null,
      outcome: null,
      terminalPath: null,
      counts: null,
      notes: [],
      addresses: null,
      evidenceWindow: null,
    };
  }

  return {
    gameId: summary.gameId ?? null,
    chainId: summary.chainId ?? null,
    outcome: summary.game?.outcome ?? null,
    terminalPath:
      summary.game?.terminalOutcome?.terminalPath ??
      summary.game?.settlement?.terminalPath ??
      null,
    counts: summary.game?.counts ?? null,
    notes: Array.isArray(summary.notes) ? summary.notes : [],
    addresses: summary.addresses ?? null,
    evidenceWindow: summary.evidenceWindow ?? null,
  };
}

function summarizeExportBundle(manifestPath, linkRootDir) {
  const manifest = readJson(manifestPath, "evidence export manifest");
  const exportDir = dirname(manifestPath);

  const resolveArtifact = (artifactName) => {
    const artifactPath = join(exportDir, artifactName);
    return fileIfExists(artifactPath);
  };

  const gameSummaryPath = resolveArtifact("game-summary.json");
  const summary = gameSummaryPath
    ? readJson(gameSummaryPath, "evidence game summary")
    : null;
  const summaryShape = summarizeGameSummary(summary);

  return {
    manifestPath: displayPath(linkRootDir, manifestPath),
    files: {
      gameSummary: gameSummaryPath
        ? displayPath(linkRootDir, gameSummaryPath)
        : null,
      roster: resolveArtifact("roster.json")
        ? displayPath(linkRootDir, resolveArtifact("roster.json"))
        : null,
      causes: resolveArtifact("causes.json")
        ? displayPath(linkRootDir, resolveArtifact("causes.json"))
        : null,
      rounds: resolveArtifact("rounds.json")
        ? displayPath(linkRootDir, resolveArtifact("rounds.json"))
        : null,
      auth: resolveArtifact("auth.json")
        ? displayPath(linkRootDir, resolveArtifact("auth.json"))
        : null,
      payouts: resolveArtifact("payouts.json")
        ? displayPath(linkRootDir, resolveArtifact("payouts.json"))
        : null,
      messages: resolveArtifact("messages.jsonl")
        ? displayPath(linkRootDir, resolveArtifact("messages.jsonl"))
        : null,
    },
    gameId: summaryShape.gameId ?? manifest.gameId ?? null,
    chainId: summaryShape.chainId ?? manifest.chainId ?? null,
    outcome: summaryShape.outcome,
    terminalPath: summaryShape.terminalPath,
    counts: summaryShape.counts,
    notes: summaryShape.notes,
    addresses: summaryShape.addresses,
    evidenceWindow: summaryShape.evidenceWindow ?? manifest.evidenceWindow ?? null,
    produced: Array.isArray(manifest.produced)
      ? manifest.produced.map((artifact) => artifact.artifact)
      : [],
    skipped: Array.isArray(manifest.skipped)
      ? manifest.skipped.map((artifact) => ({
          artifact: artifact.artifact,
          reason: artifact.reason,
        }))
      : [],
  };
}

function discoverLocalExportBundles(bundleDir, linkRootDir) {
  return walkFiles(bundleDir)
    .filter((path) =>
      /^game-[^/]+\/evidence\/export-manifest\.json$/.test(
        displayPath(bundleDir, path)
      )
    )
    .sort()
    .map((path) => summarizeExportBundle(path, linkRootDir));
}

function discoverScreenshots(bundleDir, linkRootDir) {
  const screenshotsDir = join(bundleDir, "screenshots");
  if (!existsSync(screenshotsDir) || !statSync(screenshotsDir).isDirectory()) {
    return [];
  }

  return walkFiles(screenshotsDir)
    .filter((path) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort()
    .map((path) => ({
      path: displayPath(linkRootDir, path),
      filename: basename(path),
    }));
}

function discoverLocalLoadHarness(bundleDir, linkRootDir) {
  const reportPath = fileIfExists(join(bundleDir, "report.json"));
  const txLogPath = fileIfExists(join(bundleDir, "txs.jsonl"));
  const exports = discoverLocalExportBundles(bundleDir, linkRootDir);
  const report = reportPath
    ? readJson(reportPath, "local load harness report")
    : null;

  const outcomes = exports
    .map((entry) => entry.outcome)
    .filter((value) => typeof value === "string" && value.length > 0);

  const terminalPaths = exports
    .map((entry) => entry.terminalPath)
    .filter((value) => typeof value === "string" && value.length > 0);

  const claims = [];
  if (report?.options?.playerCount && report?.options?.games) {
    claims.push(
      `This bundle includes a local load-harness report for ${report.options.playerCount} synthetic players across ${report.options.games} game(s).`
    );
  }
  if (report?.localScaleReadiness?.replayConsistentGames != null) {
    claims.push(
      `Replay consistency is recorded for ${report.localScaleReadiness.replayConsistentGames}/${report.options?.games ?? "?"} completed game(s) in this bundle.`
    );
  }
  if (terminalPaths.length > 0) {
    claims.push(
      `The exported local evidence covers terminal paths present in this bundle: ${Array.from(new Set(terminalPaths)).join(", ")}.`
    );
  }
  if (txLogPath) {
    claims.push(
      "A raw local transaction log is present alongside the report and per-game evidence exports."
    );
  }

  const status = reportPath && exports.length > 0 ? "present" : reportPath || exports.length > 0 ? "partial" : "missing";

  return {
    ...emptyLocalProof({ status, kind: "load-harness" }),
    reportPath: reportPath ? displayPath(linkRootDir, reportPath) : null,
    txLogPath: txLogPath ? displayPath(linkRootDir, txLogPath) : null,
    report: report
      ? {
          status: report.status ?? null,
          mode: report.mode ?? null,
          profileName: report.profile?.name ?? null,
          playerCount: report.options?.playerCount ?? null,
          gamesRequested: report.options?.games ?? null,
          selectedScenarioTypes:
            report.options?.selectedScenarioTypes ??
            report.scenarios?.selectedTypes ??
            [],
          replayConsistentGames:
            report.localScaleReadiness?.replayConsistentGames ?? null,
          startedAt: report.startedAt ?? null,
          finishedAt: report.finishedAt ?? null,
          wallClockMs: report.wallClockMs ?? null,
          limitations: Array.isArray(report.limitations)
            ? report.limitations
            : [],
        }
      : null,
    exports,
    outcomes: Array.from(new Set(outcomes)),
    claims,
  };
}

function discoverLocalProofPack(bundleDir, linkRootDir) {
  const manifestPath = fileIfExists(join(bundleDir, "local-proof-pack.json"));
  if (!manifestPath) {
    return emptyLocalProof();
  }

  const packReadmePath = fileIfExists(join(bundleDir, "README.md"));
  const manifest = readJson(manifestPath, "local proof pack manifest");
  const preservedRuns = Array.isArray(manifest.preservedRuns)
    ? manifest.preservedRuns
    : [];

  const matrixBundles = preservedRuns.map((entry, index) => {
    const matrixReportSource =
      entry?.preservedFiles?.matrixReport?.path ?? null;
    const summarySource = entry?.preservedFiles?.summary?.path ?? null;
    const matrixReportPath =
      typeof matrixReportSource === "string"
        ? fileIfExists(join(bundleDir, matrixReportSource))
        : null;
    const summaryPath =
      typeof summarySource === "string"
        ? fileIfExists(join(bundleDir, summarySource))
        : null;
    const summary = entry?.summary ?? {};

    return {
      index: index + 1,
      id: entry?.id ?? `proof-run-${index + 1}`,
      label: entry?.label ?? entry?.id ?? `proof-run-${index + 1}`,
      description: entry?.description ?? null,
      sourceDir: entry?.sourceDir ?? null,
      matrixReportPath: matrixReportPath
        ? displayPath(linkRootDir, matrixReportPath)
        : typeof matrixReportSource === "string"
          ? toPosixPath(matrixReportSource)
          : null,
      summaryPath: summaryPath
        ? displayPath(linkRootDir, summaryPath)
        : typeof summarySource === "string"
          ? toPosixPath(summarySource)
          : null,
      status:
        matrixReportPath && summaryPath
          ? "present"
          : matrixReportPath || summaryPath
            ? "partial"
            : "missing",
      summary: {
        status: summary.status ?? null,
        presetName: summary.presetName ?? null,
        presetLabel: summary.presetLabel ?? null,
        startedAt: summary.startedAt ?? null,
        finishedAt: summary.finishedAt ?? null,
        wallClockMs: summary.wallClockMs ?? null,
        plannedRuns: summary.plannedRuns ?? null,
        completedRuns: summary.completedRuns ?? null,
        totalCompletedGames: summary.totalCompletedGames ?? null,
        requestedScenarios: Array.isArray(summary.requestedScenarios)
          ? summary.requestedScenarios
          : [],
        seeds: Array.isArray(summary.seeds) ? summary.seeds : [],
        profiles: Array.isArray(summary.profiles) ? summary.profiles : [],
        largestRequestedPlayerCount:
          summary.largestRequestedPlayerCount ?? null,
        maxJoinedPlayersInSingleGame:
          summary.maxJoinedPlayersInSingleGame ?? null,
        gamesHittingRequestedPlayerTarget:
          summary.gamesHittingRequestedPlayerTarget ?? null,
        fullyDrainedGames: summary.fullyDrainedGames ?? null,
        replayConsistentGames: summary.replayConsistentGames ?? null,
        txSummary: summary.txSummary ?? null,
        breakageSummary: summary.breakageSummary ?? null,
        terminalOutcomes: Array.isArray(summary.terminalOutcomes)
          ? summary.terminalOutcomes
          : [],
        terminalPaths: Array.isArray(summary.terminalPaths)
          ? summary.terminalPaths
          : [],
      },
    };
  });

  const claims = [];
  if (matrixBundles.length > 0) {
    claims.push(
      `This compact local proof pack preserves ${matrixBundles.length} copied matrix artifact set(s) rooted in validated current local runs.`
    );
  }
  for (const bundle of matrixBundles) {
    const maxPlayers = bundle.summary.maxJoinedPlayersInSingleGame ?? "?";
    const totalGames = bundle.summary.totalCompletedGames ?? "?";
    const failedUnexpected =
      bundle.summary.txSummary?.failedUnexpected ?? "?";
    claims.push(
      `${bundle.label} records ${totalGames} completed game(s), max joined players ${maxPlayers}, and ${failedUnexpected} unexpected failed tx(s).`
    );
  }
  if (Array.isArray(manifest.notPreserved) && manifest.notPreserved.length > 0) {
    claims.push(
      `This pack stays compact on purpose: ${manifest.notPreserved[0]}`
    );
  }

  const hasAllArtifacts =
    matrixBundles.length > 0 &&
    matrixBundles.every((entry) => entry.status === "present");
  const status = hasAllArtifacts
    ? "present"
    : matrixBundles.length > 0 || packReadmePath
      ? "partial"
      : "missing";

  return {
    ...emptyLocalProof({ status, kind: "proof-pack" }),
    packManifestPath: displayPath(linkRootDir, manifestPath),
    packReadmePath: packReadmePath
      ? displayPath(linkRootDir, packReadmePath)
      : null,
    pack: {
      schemaVersion: manifest.schemaVersion ?? null,
      title: manifest.title ?? null,
      generatedAt: manifest.generatedAt ?? null,
      bundleBoundaryNote: manifest.bundleBoundaryNote ?? null,
      notPreserved: Array.isArray(manifest.notPreserved)
        ? manifest.notPreserved
        : [],
      remainingLocalGaps: Array.isArray(manifest.remainingLocalGaps)
        ? manifest.remainingLocalGaps
        : [],
    },
    matrixBundles,
    claims,
  };
}

function discoverCanaryBundle(bundleDir, linkRootDir) {
  const preflightPath = fileIfExists(join(bundleDir, "preflight.json"));
  const deploymentSummaryPath = fileIfExists(
    join(bundleDir, "deployment-summary.json")
  );
  const deploymentFilePath = fileIfExists(
    join(bundleDir, "deployments-84532.json")
  );
  const verifyLogPath = fileIfExists(join(bundleDir, "verify.log"));
  const operatorNotesPath = fileIfExists(join(bundleDir, "operator-notes.md"));
  const querySummaryPath = fileIfExists(
    join(bundleDir, "query", "game-summary-live.json")
  );
  const queryExportManifestPath = fileIfExists(
    join(bundleDir, "query", "export", "export-manifest.json")
  );
  const createPath = fileIfExists(join(bundleDir, "game", "create.json"));

  const authDir = join(bundleDir, "auth");
  const authFiles = walkFiles(authDir);
  const authStatusPaths = authFiles
    .filter((path) => basename(path) === "auth-status.json")
    .sort();
  const authPermitPaths = authFiles
    .filter((path) => basename(path) === "auth-permit.json")
    .sort();

  const screenshots = discoverScreenshots(bundleDir, linkRootDir);
  const preflight = preflightPath
    ? readJson(preflightPath, "canary preflight report")
    : null;
  const deployment = deploymentSummaryPath
    ? readJson(deploymentSummaryPath, "canary deployment summary")
    : null;
  const querySummary = querySummaryPath
    ? readJson(querySummaryPath, "live query summary")
    : null;
  const queryExport = queryExportManifestPath
    ? summarizeExportBundle(queryExportManifestPath, linkRootDir)
    : null;
  const operatorNotes = operatorNotesPath ? readText(operatorNotesPath) : "";
  const txHashMatches = Array.from(
    new Set(operatorNotes.match(/\b0x[a-fA-F0-9]{64}\b/g) ?? [])
  );

  const claims = [];
  if (preflight) {
    claims.push(
      `Preflight inputs were captured for chain ${preflight.target?.chainId ?? "?"} before deployment.`
    );
  }
  if (deployment) {
    claims.push(
      "An onchain deployment summary is present, so owner/treasury/verifier wiring and default config can be inspected after deployment."
    );
  }
  if (queryExport) {
    claims.push(
      "A live query export bundle is present, so judges can inspect the deployed contracts through the same repo-native export surface used locally."
    );
  }
  if (authStatusPaths.length > 0) {
    claims.push(
      `${authStatusPaths.length} saved auth status artifact(s) are present for admitted gameplay wallets.`
    );
  }
  if (txHashMatches.length > 0) {
    claims.push(
      `${txHashMatches.length} transaction hash reference(s) were found in operator notes.`
    );
  }
  if (screenshots.length > 0) {
    claims.push(
      `${screenshots.length} screenshot artifact(s) are bundled for judge-friendly visual inspection.`
    );
  }

  const hasLiveInspection = Boolean(deploymentSummaryPath);
  const hasLiveQuery = Boolean(querySummaryPath || queryExportManifestPath);
  const anyArtifact = Boolean(
    preflightPath ||
      deploymentSummaryPath ||
      deploymentFilePath ||
      verifyLogPath ||
      operatorNotesPath ||
      querySummaryPath ||
      queryExportManifestPath ||
      authStatusPaths.length > 0 ||
      screenshots.length > 0
  );
  const status = hasLiveInspection && hasLiveQuery ? "present" : anyArtifact ? "partial" : "pending";

  return {
    status,
    preflightPath: preflightPath ? displayPath(linkRootDir, preflightPath) : null,
    deploymentSummaryPath: deploymentSummaryPath
      ? displayPath(linkRootDir, deploymentSummaryPath)
      : null,
    deploymentFilePath: deploymentFilePath
      ? displayPath(linkRootDir, deploymentFilePath)
      : null,
    verifyLogPath: verifyLogPath
      ? displayPath(linkRootDir, verifyLogPath)
      : null,
    operatorNotesPath: operatorNotesPath
      ? displayPath(linkRootDir, operatorNotesPath)
      : null,
    createPath: createPath ? displayPath(linkRootDir, createPath) : null,
    querySummaryPath: querySummaryPath
      ? displayPath(linkRootDir, querySummaryPath)
      : null,
    preflight: preflight
      ? {
          chainId: preflight.target?.chainId ?? null,
          latestBlock: preflight.target?.latestBlock ?? null,
          warnings: Array.isArray(preflight.warnings) ? preflight.warnings : [],
          matchesRecommendedProfile:
            preflight.profileComparison?.matchesRecommendedProfile ?? null,
        }
      : null,
    deployment: deployment
      ? {
          chainId: deployment.target?.chainId ?? null,
          latestBlock: deployment.target?.latestBlock ?? null,
          currentGameId: deployment.onchain?.currentGameId ?? null,
          activeGameId: deployment.onchain?.activeGameId ?? null,
          messageCount: deployment.onchain?.messageCount ?? null,
          activeCauseCount: deployment.onchain?.activeCauseCount ?? null,
          warnings: Array.isArray(deployment.warnings)
            ? deployment.warnings
            : [],
          matchesRecommendedProfile:
            deployment.profileComparison?.matchesRecommendedProfile ?? null,
          addresses: deployment.addresses ?? null,
        }
      : null,
    querySummary: querySummary ? summarizeGameSummary(querySummary) : null,
    queryExport,
    auth: {
      authStatusCount: authStatusPaths.length,
      authPermitCount: authPermitPaths.length,
      authStatusPaths: authStatusPaths.map((path) =>
        displayPath(linkRootDir, path)
      ),
      authPermitPaths: authPermitPaths.map((path) =>
        displayPath(linkRootDir, path)
      ),
    },
    operatorNotes: {
      txHashCount: txHashMatches.length,
    },
    screenshots,
    claims,
  };
}

function classifyLocalBundleType(localProof) {
  return localProof.kind === "proof-pack"
    ? "local-proof-pack"
    : "local-load-harness";
}

function buildBundleType(mode, localProof, liveSepoliaProof) {
  if (mode === "local") {
    return classifyLocalBundleType(localProof);
  }
  if (mode === "sepolia") {
    return "base-sepolia-canary";
  }
  if (
    localProof.status !== "missing" &&
    liveSepoliaProof.status !== "pending"
  ) {
    return "mixed";
  }
  if (liveSepoliaProof.status !== "pending") {
    return "base-sepolia-canary";
  }
  if (localProof.status !== "missing") {
    return classifyLocalBundleType(localProof);
  }
  return "generic-artifact-bundle";
}

function buildOpenOrder(bundleType, localProof, liveSepoliaProof) {
  const entries = [];

  const includeCanary =
    bundleType === "base-sepolia-canary" || bundleType === "mixed";
  const includeLocal =
    bundleType === "local-load-harness" ||
    bundleType === "local-proof-pack" ||
    bundleType === "mixed";

  if (includeCanary) {
    pushOpenOrder(
      entries,
      liveSepoliaProof.preflightPath,
      "Expected Base Sepolia deploy inputs before the live run."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.deploymentSummaryPath,
      "Onchain wiring, default config, and deployment freshness after deploy."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.operatorNotesPath,
      "Operator-written tx hashes, explorer links, auth flavor, and notable manual observations."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.createPath,
      "Saved game creation output, including the live game id."
    );
    for (const authPath of liveSepoliaProof.auth.authStatusPaths) {
      pushOpenOrder(
        entries,
        authPath,
        "Saved auth status for a wallet admitted to the live canary."
      );
    }
    pushOpenOrder(
      entries,
      liveSepoliaProof.querySummaryPath,
      "Live game summary exported directly from the deployed contracts."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.queryExport?.files.gameSummary,
      "Live export snapshot for the final game state and terminal outcome."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.queryExport?.files.rounds,
      "Live round-by-round replay context."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.queryExport?.files.payouts,
      "Live settlement and payout routing."
    );
    pushOpenOrder(
      entries,
      liveSepoliaProof.queryExport?.manifestPath,
      "Live export manifest, including anything intentionally skipped."
    );
    for (const screenshot of liveSepoliaProof.screenshots.slice(0, 3)) {
      pushOpenOrder(
        entries,
        screenshot.path,
        "Screenshot artifact for visual confirmation alongside the JSON evidence."
      );
    }
  }

  if (includeLocal) {
    if (localProof.kind === "proof-pack") {
      pushOpenOrder(
        entries,
        localProof.packReadmePath,
        "Compact human summary of what this preserved local proof pack includes and intentionally omits."
      );
      pushOpenOrder(
        entries,
        localProof.packManifestPath,
        "Machine-readable manifest tying each preserved file back to the original local matrix artifact directory."
      );
      for (const matrixBundle of localProof.matrixBundles) {
        pushOpenOrder(
          entries,
          matrixBundle.matrixReportPath,
          `${matrixBundle.label} copied matrix report: preset, seeds, tx totals, and aggregate breakage signals.`
        );
        pushOpenOrder(
          entries,
          matrixBundle.summaryPath,
          `${matrixBundle.label} compact human summary for the same preserved local run set.`
        );
      }
    } else {
      pushOpenOrder(
        entries,
        localProof.reportPath,
        "Run-level local proof summary: scale, scenario mix, limitations, and overall status."
      );
      pushOpenOrder(
        entries,
        localProof.txLogPath,
        "Raw local transaction log for the load-harness run."
      );
      for (const gameExport of localProof.exports) {
        const label = `Game ${gameExport.gameId ?? "?"}`;
        pushOpenOrder(
          entries,
          gameExport.files.gameSummary,
          `${label} final snapshot (${gameExport.outcome ?? "unknown outcome"} / ${gameExport.terminalPath ?? "unknown terminal path"}).`
        );
        pushOpenOrder(
          entries,
          gameExport.files.rounds,
          `${label} round-by-round replay context.`
        );
        pushOpenOrder(
          entries,
          gameExport.files.payouts,
          `${label} settlement and payout routing.`
        );
        pushOpenOrder(
          entries,
          gameExport.manifestPath,
          `${label} export manifest, including anything intentionally skipped.`
        );
      }
    }
  }

  return entries;
}

function buildMissingArtifacts(bundleType, localProof, liveSepoliaProof) {
  const missing = [];

  if (
    bundleType === "local-load-harness" ||
    bundleType === "local-proof-pack" ||
    bundleType === "generic-artifact-bundle"
  ) {
    missing.push(
      "No Base Sepolia canary artifact bundle is present here yet, so this bundle does not prove live network behavior."
    );
  }

  if (localProof.status === "partial") {
    if (localProof.kind === "proof-pack") {
      if (!localProof.packManifestPath) {
        missing.push(
          "Local proof pack is missing local-proof-pack.json, so the copied matrix artifacts cannot be traced back to their source runs cleanly."
        );
      }
      for (const matrixBundle of localProof.matrixBundles) {
        if (!matrixBundle.matrixReportPath) {
          missing.push(
            `${matrixBundle.label} is missing its copied matrix-report.json.`
          );
        }
        if (!matrixBundle.summaryPath) {
          missing.push(
            `${matrixBundle.label} is missing its copied MATRIX_SUMMARY.md.`
          );
        }
      }
    } else {
      if (!localProof.reportPath) {
        missing.push(
          "Local bundle is missing report.json, so the top-level scenario/scale summary is incomplete."
        );
      }
      if (localProof.exports.length === 0) {
        missing.push(
          "Local bundle is missing per-game export-manifest.json files, so replay/export coverage cannot be inspected cleanly."
        );
      }
    }
  }

  if (liveSepoliaProof.status !== "pending") {
    if (!liveSepoliaProof.preflightPath) {
      missing.push(
        "Live bundle is missing preflight.json, so deploy-input capture is incomplete."
      );
    }
    if (!liveSepoliaProof.deploymentSummaryPath) {
      missing.push(
        "Live bundle is missing deployment-summary.json, so post-deploy onchain inspection is incomplete."
      );
    }
    if (!liveSepoliaProof.querySummaryPath) {
      missing.push(
        "Live bundle is missing query/game-summary-live.json, so the quick post-game snapshot is incomplete."
      );
    }
    if (!liveSepoliaProof.queryExport?.manifestPath) {
      missing.push(
        "Live bundle is missing query/export/export-manifest.json, so the full repo-native evidence export is incomplete."
      );
    }
    if (!liveSepoliaProof.operatorNotesPath) {
      missing.push(
        "Live bundle is missing operator-notes.md, so tx hashes and manual run notes are not packaged yet."
      );
    }
    if (liveSepoliaProof.screenshots.length === 0) {
      missing.push(
        "No screenshots were found under screenshots/, so there is no bundled visual companion to the JSON evidence yet."
      );
    }
  }

  return missing;
}

function buildUnknowns(bundleType, liveSepoliaProof) {
  const unknowns = [];

  if (
    bundleType === "local-load-harness" ||
    bundleType === "local-proof-pack" ||
    liveSepoliaProof.status === "pending"
  ) {
    pushUnique(
      unknowns,
      "Actual Base Sepolia timing and operator comfort for the selected join/commit/reveal windows remain unproven until a live canary bundle is captured."
    );
    pushUnique(
      unknowns,
      "Explorer verification is still open until verify.log and/or explorer links are packaged from a real Sepolia deployment."
    );
    pushUnique(
      unknowns,
      "The honest live auth flavor is still open until a canary bundle records whether the run used minimal permit/register or the full SIWA-backed path."
    );
    pushUnique(
      unknowns,
      "Whether a second Sepolia scenario (cancelled or no-winner) is immediately required stays open until after the first live canary result is reviewed."
    );
  }

  if (liveSepoliaProof.status !== "pending" && !liveSepoliaProof.verifyLogPath) {
    pushUnique(
      unknowns,
      "verify.log is not present in this live bundle, so explorer verification status still needs an explicit artifact."
    );
  }

  return unknowns;
}

function buildNextCapturePriorities(bundleType, localProof, liveSepoliaProof) {
  const priorities = [];

  if (bundleType === "local-load-harness" || bundleType === "local-proof-pack") {
    priorities.push(
      "Run the first Base Sepolia canary and capture preflight.json, deployment-summary.json, operator-notes.md, query/game-summary-live.json, and query/export/export-manifest.json under packages/foundry/canary/base-sepolia/<run-id>/."
    );
    if (bundleType === "local-proof-pack") {
      priorities.push(
        "If deeper local auditability is needed beyond this compact pack, preserve a full load-harness or matrix bundle with raw tx logs and per-run exports beside the copied summaries."
      );
    }
    priorities.push(
      "Save tx hashes and explorer links in operator-notes.md instead of relying on shell history or memory."
    );
    priorities.push(
      "Add any judge-facing screenshots under screenshots/ before regenerating the evidence pack."
    );
    return priorities;
  }

  if (liveSepoliaProof.status === "partial") {
    if (!liveSepoliaProof.operatorNotesPath) {
      priorities.push(
        "Add operator-notes.md with commit hash, auth flavor, tx hashes, explorer links, and any timing surprises."
      );
    }
    if (!liveSepoliaProof.queryExport?.manifestPath) {
      priorities.push(
        "Run yarn query:export for the live game so the canary bundle includes the full repo-native export directory."
      );
    }
    if (liveSepoliaProof.screenshots.length === 0) {
      priorities.push(
        "Capture screenshots into screenshots/ so judges have a visual anchor alongside the JSON artifacts."
      );
    }
    return priorities;
  }

  if (bundleType === "base-sepolia-canary" && liveSepoliaProof.screenshots.length === 0) {
    priorities.push(
      "Add screenshots/ if you want a more judge-friendly visual companion to the live JSON bundle."
    );
  }

  return priorities;
}

export function buildJudgeEvidenceIndex({
  bundleDir,
  outputDir = bundleDir,
  mode = "auto",
  title,
} = {}) {
  if (!["auto", "local", "sepolia"].includes(mode)) {
    throw new Error(`Unsupported mode '${mode}'. Use auto, local, or sepolia.`);
  }
  if (!bundleDir || !existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    throw new Error(`Bundle directory not found: ${bundleDir}`);
  }
  if (!outputDir || !existsSync(outputDir) || !statSync(outputDir).isDirectory()) {
    throw new Error(`Output directory not found: ${outputDir}`);
  }

  const localProofPack = discoverLocalProofPack(bundleDir, outputDir);
  const localLoadHarnessProof = discoverLocalLoadHarness(bundleDir, outputDir);
  const localProof =
    localProofPack.status !== "missing"
      ? localProofPack
      : localLoadHarnessProof;
  const liveSepoliaProof = discoverCanaryBundle(bundleDir, outputDir);
  const bundleType = buildBundleType(mode, localProof, liveSepoliaProof);
  const recommendedOpenOrder = buildOpenOrder(
    bundleType,
    localProof,
    liveSepoliaProof
  );
  const missingImportantArtifacts = buildMissingArtifacts(
    bundleType,
    localProof,
    liveSepoliaProof
  );
  const unknowns = buildUnknowns(bundleType, liveSepoliaProof);
  const nextCapturePriorities = buildNextCapturePriorities(
    bundleType,
    localProof,
    liveSepoliaProof
  );

  return {
    schemaVersion: JUDGE_EVIDENCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    title: title?.trim() || "Prisoners DAOlemma Judge Evidence Pack",
    boundaryNote: JUDGE_EVIDENCE_BOUNDARY_NOTE,
    bundleType,
    bundleDir: displayPath(PACKAGE_ROOT, bundleDir),
    outputDir: displayPath(PACKAGE_ROOT, outputDir),
    generatedArtifacts: {
      humanGuide: "JUDGE_README.md",
      machineIndex: "judge-evidence-index.json",
    },
    localProof,
    liveSepoliaProof,
    recommendedOpenOrder,
    missingImportantArtifacts,
    unknowns,
    nextCapturePriorities,
  };
}

function formatOpenOrder(entries = []) {
  if (entries.length === 0) {
    return "No recognizable artifacts were found in this bundle yet.";
  }

  return entries
    .map(
      (entry, index) =>
        `${index + 1}. \`${entry.path}\` — ${entry.why}`
    )
    .join("\n");
}

function formatClaims(claims = [], fallback) {
  if (claims.length === 0) {
    return `- ${fallback}`;
  }

  return claims.map((claim) => `- ${claim}`).join("\n");
}

function formatMissing(items = [], fallback) {
  if (items.length === 0) {
    return `- ${fallback}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderLocalInventory(localProof) {
  if (localProof.status === "missing") {
    return [
      "### Local proof",
      "- Not present in this bundle.",
    ].join("\n");
  }

  const heading =
    localProof.kind === "proof-pack"
      ? "### Local proof pack"
      : "### Local load-harness proof";
  const lines = [heading, `- Status: ${localProof.status}`];

  if (localProof.kind === "proof-pack") {
    if (localProof.packManifestPath) {
      lines.push(`- local-proof-pack.json: \`${localProof.packManifestPath}\``);
    }
    if (localProof.packReadmePath) {
      lines.push(`- README.md: \`${localProof.packReadmePath}\``);
    }
    if (localProof.pack?.schemaVersion) {
      lines.push(`- Schema: ${localProof.pack.schemaVersion}`);
    }
    if (localProof.pack?.generatedAt) {
      lines.push(`- Generated at: ${localProof.pack.generatedAt}`);
    }
    for (const matrixBundle of localProof.matrixBundles) {
      lines.push(
        `- ${matrixBundle.label}: ${matrixBundle.summary.totalCompletedGames ?? "?"} game(s), max joined players ${matrixBundle.summary.maxJoinedPlayersInSingleGame ?? "?"}, unexpected failed txs ${matrixBundle.summary.txSummary?.failedUnexpected ?? "?"}`
      );
      if (matrixBundle.matrixReportPath) {
        lines.push(`  - matrix report: \`${matrixBundle.matrixReportPath}\``);
      }
      if (matrixBundle.summaryPath) {
        lines.push(`  - summary: \`${matrixBundle.summaryPath}\``);
      }
      if (matrixBundle.summary.requestedScenarios.length > 0) {
        lines.push(
          `  - scenarios: ${matrixBundle.summary.requestedScenarios.join(", ")}`
        );
      }
      if (matrixBundle.summary.seeds.length > 0) {
        lines.push(`  - seeds: ${matrixBundle.summary.seeds.join(", ")}`);
      }
    }
    for (const note of localProof.pack?.notPreserved ?? []) {
      lines.push(`- Not preserved here: ${note}`);
    }
    for (const gap of localProof.pack?.remainingLocalGaps ?? []) {
      lines.push(`- Remaining local gap: ${gap}`);
    }
    return lines.join("\n");
  }

  if (localProof.reportPath) {
    lines.push(`- report.json: \`${localProof.reportPath}\``);
  }
  if (localProof.txLogPath) {
    lines.push(`- txs.jsonl: \`${localProof.txLogPath}\``);
  }
  if (localProof.report) {
    lines.push(
      `- Players / games: ${localProof.report.playerCount ?? "?"} / ${localProof.report.gamesRequested ?? "?"}`
    );
    lines.push(
      `- Replay-consistent games: ${localProof.report.replayConsistentGames ?? "?"}`
    );
    if (localProof.report.selectedScenarioTypes.length > 0) {
      lines.push(
        `- Scenario mix: ${localProof.report.selectedScenarioTypes.join(", ")}`
      );
    }
  }

  for (const exportBundle of localProof.exports) {
    lines.push(
      `- Game ${exportBundle.gameId ?? "?"}: ${exportBundle.outcome ?? "unknown"} / ${exportBundle.terminalPath ?? "unknown"}`
    );
    if (exportBundle.files.gameSummary) {
      lines.push(`  - summary: \`${exportBundle.files.gameSummary}\``);
    }
    if (exportBundle.files.rounds) {
      lines.push(`  - rounds: \`${exportBundle.files.rounds}\``);
    }
    if (exportBundle.files.payouts) {
      lines.push(`  - payouts: \`${exportBundle.files.payouts}\``);
    }
    lines.push(`  - manifest: \`${exportBundle.manifestPath}\``);
    if (exportBundle.skipped.length > 0) {
      for (const skipped of exportBundle.skipped) {
        lines.push(
          `  - skipped ${skipped.artifact}: ${skipped.reason}`
        );
      }
    }
  }

  return lines.join("\n");
}

function renderCanaryInventory(liveSepoliaProof) {
  const lines = [
    "### Base Sepolia canary proof",
    `- Status: ${liveSepoliaProof.status}`,
  ];

  const pathEntries = [
    ["preflight.json", liveSepoliaProof.preflightPath],
    ["deployment-summary.json", liveSepoliaProof.deploymentSummaryPath],
    ["deployments-84532.json", liveSepoliaProof.deploymentFilePath],
    ["verify.log", liveSepoliaProof.verifyLogPath],
    ["operator-notes.md", liveSepoliaProof.operatorNotesPath],
    ["game/create.json", liveSepoliaProof.createPath],
    ["query/game-summary-live.json", liveSepoliaProof.querySummaryPath],
  ];

  for (const [label, path] of pathEntries) {
    lines.push(`- ${label}: ${path ? `\`${path}\`` : "missing"}`);
  }

  if (liveSepoliaProof.preflight) {
    lines.push(
      `- Preflight chain id: ${liveSepoliaProof.preflight.chainId ?? "?"}`
    );
    lines.push(
      `- Preflight profile match: ${liveSepoliaProof.preflight.matchesRecommendedProfile}`
    );
  }

  if (liveSepoliaProof.deployment) {
    lines.push(
      `- Deployment chain id: ${liveSepoliaProof.deployment.chainId ?? "?"}`
    );
    lines.push(
      `- Active causes: ${liveSepoliaProof.deployment.activeCauseCount ?? "?"}`
    );
    lines.push(
      `- currentGameId / activeGameId / messageCount: ${liveSepoliaProof.deployment.currentGameId ?? "?"} / ${liveSepoliaProof.deployment.activeGameId ?? "?"} / ${liveSepoliaProof.deployment.messageCount ?? "?"}`
    );
  }

  if (liveSepoliaProof.querySummary) {
    lines.push(
      `- Live outcome: ${liveSepoliaProof.querySummary.outcome ?? "unknown"} / ${liveSepoliaProof.querySummary.terminalPath ?? "unknown"}`
    );
  }

  if (liveSepoliaProof.queryExport) {
    lines.push(
      `- Live export manifest: \`${liveSepoliaProof.queryExport.manifestPath}\``
    );
    if (liveSepoliaProof.queryExport.files.gameSummary) {
      lines.push(
        `  - export summary: \`${liveSepoliaProof.queryExport.files.gameSummary}\``
      );
    }
    if (liveSepoliaProof.queryExport.files.rounds) {
      lines.push(
        `  - export rounds: \`${liveSepoliaProof.queryExport.files.rounds}\``
      );
    }
    if (liveSepoliaProof.queryExport.files.payouts) {
      lines.push(
        `  - export payouts: \`${liveSepoliaProof.queryExport.files.payouts}\``
      );
    }
    if (liveSepoliaProof.queryExport.files.messages) {
      lines.push(
        `  - export messages: \`${liveSepoliaProof.queryExport.files.messages}\``
      );
    }
  }

  lines.push(
    `- Auth status artifacts: ${liveSepoliaProof.auth.authStatusCount}`
  );
  lines.push(
    `- Auth permit artifacts: ${liveSepoliaProof.auth.authPermitCount}`
  );
  lines.push(
    `- Tx hashes referenced in operator notes: ${liveSepoliaProof.operatorNotes.txHashCount}`
  );
  lines.push(`- Screenshots bundled: ${liveSepoliaProof.screenshots.length}`);

  for (const screenshot of liveSepoliaProof.screenshots) {
    lines.push(`  - screenshot: \`${screenshot.path}\``);
  }

  return lines.join("\n");
}

export function renderJudgeEvidenceReadme(index) {
  return `# ${index.title}

> ${index.boundaryNote}

## Quick verdict

- Bundle type: ${index.bundleType}
- Local proof: ${index.localProof.status}
- Live Base Sepolia proof: ${index.liveSepoliaProof.status}
- Generated artifacts: \`${index.generatedArtifacts.humanGuide}\`, \`${index.generatedArtifacts.machineIndex}\`

## Open these first

${formatOpenOrder(index.recommendedOpenOrder)}

## What this bundle proves

### Local proof
${formatClaims(
  index.localProof.claims,
  "No recognizable local proof artifacts are packaged here."
)}

### Live Base Sepolia proof
${formatClaims(
  index.liveSepoliaProof.claims,
  "No recognizable live Base Sepolia canary artifacts are packaged here yet."
)}

## Important missing or still pending

${formatMissing(
  index.missingImportantArtifacts,
  "No obvious packaging gaps were detected from the artifacts currently present."
)}

## Still-unknowns to keep honest

${formatMissing(index.unknowns, "No additional unknowns were inferred from this bundle.")}

## Artifact inventory

${renderLocalInventory(index.localProof)}

${renderCanaryInventory(index.liveSepoliaProof)}

## Next capture priorities

${formatMissing(
  index.nextCapturePriorities,
  "No additional bundle-packaging follow-up is implied beyond reviewing the listed artifacts."
)}
`;
}

export function writeJudgeEvidencePack({
  bundle,
  bundleDir,
  out,
  outputDir,
  mode = "auto",
  title,
} = {}) {
  const resolvedBundleDir = resolveDirectoryArg(
    bundleDir ?? bundle,
    "bundle"
  );
  const resolvedOutputDir = resolveFromPackageRoot(
    outputDir ?? out ?? bundleDir ?? bundle
  );

  ensureDirectory(resolvedOutputDir);

  const index = buildJudgeEvidenceIndex({
    bundleDir: resolvedBundleDir,
    outputDir: resolvedOutputDir,
    mode,
    title,
  });

  const readmePath = join(resolvedOutputDir, "JUDGE_README.md");
  const indexPath = join(resolvedOutputDir, "judge-evidence-index.json");
  writeFileSync(readmePath, renderJudgeEvidenceReadme(index), "utf8");
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return {
    index,
    readmePath,
    indexPath,
  };
}

export function printJudgeEvidenceSummary(result) {
  console.log("\n🧾 Judge evidence pack written.");
  console.log(`Bundle:        ${result.index.bundleDir}`);
  console.log(`Output:        ${result.index.outputDir}`);
  console.log(`Bundle type:   ${result.index.bundleType}`);
  console.log(`Local proof:   ${result.index.localProof.status}`);
  console.log(
    `Live Sepolia: ${result.index.liveSepoliaProof.status}`
  );
  console.log(`Guide:         ${displayPath(PACKAGE_ROOT, result.readmePath)}`);
  console.log(`Index:         ${displayPath(PACKAGE_ROOT, result.indexPath)}`);
}

function printHelp() {
  console.log(`
Prisoners DAOlemma judge evidence pack helper

${JUDGE_EVIDENCE_BOUNDARY_NOTE}

Usage:
  node scripts-js/judgeEvidenceCli.js --bundle <directory> [--out <directory>] [--mode <auto|local|sepolia>] [--title <text>] [--json]

Options:
  --bundle <directory>   Required. Existing artifact directory to inspect.
                         Local example: load-harness/manual-scale-proof-2026-03-15-64x3
                         Sepolia example: canary/base-sepolia/<run-id>
  --out <directory>      Optional output directory. Defaults to the bundle directory itself.
  --mode <mode>          Force classification as auto, local, or sepolia. Defaults to auto.
  --title <text>         Optional title for the generated README.
  --json                 Print the machine-readable index to stdout after writing files.
  --help                 Show this help text.

Generated files:
  - JUDGE_README.md
  - judge-evidence-index.json

What the helper looks for:
  - local load-harness bundles: report.json, txs.jsonl, game-*/evidence/export-manifest.json
  - compact local proof packs: local-proof-pack.json plus copied matrix-report.json / MATRIX_SUMMARY.md files
  - Base Sepolia canary bundles: preflight.json, deployment-summary.json, deployments-84532.json,
    operator-notes.md, query/game-summary-live.json, query/export/export-manifest.json,
    auth/**/auth-status.json, and screenshots/*

Examples:
  node scripts-js/judgeEvidenceCli.js --bundle load-harness/manual-scale-proof-2026-03-15-64x3
  node scripts-js/judgeEvidenceCli.js --bundle proof/local/20260316-xlarge-matrix-proof-pack
  node scripts-js/judgeEvidenceCli.js --bundle canary/base-sepolia/20260315-220000-base-sepolia-canary
  node scripts-js/judgeEvidenceCli.js --bundle canary/base-sepolia/20260315-220000-base-sepolia-canary --out canary/base-sepolia/20260315-220000-base-sepolia-canary/judge-pack --json
`);
}

async function main() {
  const { args } = parseCliArgs(["run", ...process.argv.slice(2)]);

  if (args.help) {
    printHelp();
    return;
  }

  const result = writeJudgeEvidencePack({
    bundle: args.bundle,
    out: args.out,
    mode: args.mode ?? "auto",
    title: args.title,
  });

  if (args.json) {
    printJson(result.index);
    return;
  }

  printJudgeEvidenceSummary(result);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(`\n❌ ${error.message}`);
    process.exit(1);
  });
}
