import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAW_ARTIFACTS = [
  "game-summary.json",
  "roster.json",
  "causes.json",
  "rounds.json",
  "auth.json",
  "payouts.json",
  "messages.jsonl",
  "export-manifest.json",
];

const CHAIN_LABELS = {
  8453: "Base Mainnet",
  84532: "Base Sepolia",
  31337: "Local Hardhat",
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    includeLoadHarness: false,
    clean: true,
  };

  for (const token of argv) {
    if (token === "--include-load-harness") args.includeLoadHarness = true;
    if (token === "--no-clean") args.clean = false;
  }

  return args;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function relativePosix(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function chainLabel(chainId) {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}

function chainKey(chainId) {
  if (chainId === 8453) return "base-mainnet";
  if (chainId === 84532) return "base-sepolia";
  if (chainId === 31337) return "hardhat";
  return `chain-${chainId}`;
}

function inferChoiceSignal(content = "") {
  const upper = content.toUpperCase();
  if (/\bSHARE\b/.test(upper)) return "Share";
  if (/\bCATCH\b/.test(upper)) return "Catch";
  if (/\bSTEAL\b/.test(upper)) return "Steal";
  return null;
}

function buildAnalysis({ summary, rounds, roster, messages }) {
  const participants = Array.isArray(roster?.participants) ? roster.participants : [];
  const roundList = Array.isArray(rounds?.rounds) ? rounds.rounds : [];
  const latestRound = roundList[roundList.length - 1] ?? null;
  const latestChoices = new Map();
  for (const choice of latestRound?.effectiveChoices ?? []) {
    latestChoices.set(String(choice.wallet).toLowerCase(), choice.choice);
  }

  const messageSignals = messages
    .map(message => ({
      wallet: message.senderWallet,
      causeId: message.causeId ?? message.senderCause ?? null,
      scope: message.scope,
      round: message.round,
      content: message.content,
      signaledChoice: inferChoiceSignal(message.content),
      actualChoice: latestChoices.get(String(message.senderWallet).toLowerCase()) ?? null,
    }))
    .filter(signal => signal.signaledChoice);

  const divergences = messageSignals.filter(
    signal => signal.actualChoice && signal.signaledChoice && signal.actualChoice !== signal.signaledChoice,
  );

  const featuredDivergence = divergences[0] ?? null;
  let featuredStory = null;
  if (featuredDivergence) {
    featuredStory = `${featuredDivergence.wallet} signaled ${featuredDivergence.signaledChoice.toUpperCase()} in ${featuredDivergence.scope} chat but revealed ${featuredDivergence.actualChoice.toUpperCase()} onchain.`;
  }

  const coalitionCounts = new Map();
  for (const participant of participants) {
    const key = String(participant.causeId ?? 0);
    coalitionCounts.set(key, (coalitionCounts.get(key) ?? 0) + 1);
  }

  return {
    messageSignals,
    divergenceCount: divergences.length,
    divergences,
    coalitionCount: coalitionCounts.size,
    featuredStory,
  };
}

function formatTakeaway(summary, rounds, messages, sourceKind, analysis) {
  const outcome = summary?.game?.outcome ?? "Unknown";
  const terminalPath = summary?.game?.settlement?.terminalPath ?? summary?.game?.terminalOutcome?.terminalPath ?? null;
  const winnerCount = Number(summary?.game?.settlement?.winnerCount ?? 0);
  const roundCount = Array.isArray(rounds?.rounds) ? rounds.rounds.length : 0;
  const messageCount = Array.isArray(messages) ? messages.length : 0;

  if (analysis?.featuredStory) {
    return analysis.featuredStory;
  }

  if (messageCount > 0) {
    return `Includes ${messageCount} onchain coalition/global message${messageCount === 1 ? "" : "s"} tied to gameplay.`;
  }

  if (terminalPath === "winner-claims" && winnerCount > 0) {
    return `Winner-path settlement completed after ${roundCount} round${roundCount === 1 ? "" : "s"}.`;
  }

  if (outcome === "NoWinners") {
    return "No-winner settlement path preserved value routing for causes and treasury.";
  }

  if (outcome === "Cancelled") {
    return "Cancellation path demonstrates refund handling when a game does not progress.";
  }

  if (sourceKind === "load-harness") {
    return "Local load-harness export suitable for deeper replay and data inspection.";
  }

  return `Replayable ${chainLabel(summary?.chainId)} game export with rounds, payouts, and roster data.`;
}

function deriveSourceInfo(relativeManifestPath, summary) {
  const normalized = relativeManifestPath;
  const parts = normalized.split("/");
  const gameId = summary?.gameId ?? summary?.game?.currentGameId ?? null;

  if (normalized.includes("/canary/")) {
    const canaryIndex = parts.indexOf("canary");
    const network = parts[canaryIndex + 1] ?? "canary-network";
    const runName = parts[canaryIndex + 2] ?? "canary-run";
    return {
      sourceKind: "canary",
      sourceRun: `${network}/${runName}`,
      slug: slugify(`${runName}-game-${gameId}`),
      sourceLabel: `Canary run ${runName} (${network})`,
    };
  }

  if (normalized.includes("/load-harness-matrix/")) {
    const matrixIndex = parts.indexOf("load-harness-matrix");
    const runName = parts[matrixIndex + 1] ?? "matrix-run";
    const scenario = parts[matrixIndex + 3] ?? "scenario";
    return {
      sourceKind: "load-harness-matrix",
      sourceRun: `${runName}/${scenario}`,
      slug: slugify(`${runName}-${scenario}-game-${gameId}`),
      sourceLabel: `Load harness matrix ${runName} / ${scenario}`,
    };
  }

  if (normalized.includes("/load-harness/")) {
    const harnessIndex = parts.indexOf("load-harness");
    const runName = parts[harnessIndex + 1] ?? "load-harness-run";
    return {
      sourceKind: "load-harness",
      sourceRun: runName,
      slug: slugify(`${runName}-game-${gameId}`),
      sourceLabel: `Load harness ${runName}`,
    };
  }

  return {
    sourceKind: "unknown",
    sourceRun: "unknown",
    slug: slugify(`game-${gameId}`),
    sourceLabel: "Unknown source",
  };
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(resolved);
      return [resolved];
    }),
  );
  return files.flat();
}

function shouldIncludeManifest(relativeManifestPath, args) {
  if (relativeManifestPath.endsWith("/query/export/export-manifest.json")) return false;
  if (/\/canary\/.+\/query\/game-\d+-export-final\/export-manifest\.json$/.test(relativeManifestPath)) return true;
  if (args.includeLoadHarness && /\/load-harness(?:-matrix)?\/.+\/game-\d+\/evidence\/export-manifest\.json$/.test(relativeManifestPath)) {
    return true;
  }
  return false;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyIfExists(sourcePath, destinationPath) {
  try {
    await fs.copyFile(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
}

async function publishManifest({ manifestPath, repoRoot, publicGamesRoot }) {
  const manifestDir = path.dirname(manifestPath);
  const relativeManifestPath = relativePosix(repoRoot, manifestPath);
  const relativeManifestDir = relativePosix(repoRoot, manifestDir);

  const summaryPath = path.join(manifestDir, "game-summary.json");
  const roundsPath = path.join(manifestDir, "rounds.json");
  const rosterPath = path.join(manifestDir, "roster.json");
  const messagesJsonlPath = path.join(manifestDir, "messages.jsonl");
  const summary = await readJson(summaryPath);
  const rounds = await readJson(roundsPath);
  const roster = await readJson(rosterPath);
  const messages = await readJsonl(messagesJsonlPath);

  const sourceInfo = deriveSourceInfo(relativeManifestPath, summary);
  const outputDir = path.join(publicGamesRoot, sourceInfo.slug);
  await ensureDir(outputDir);

  for (const artifact of RAW_ARTIFACTS) {
    await copyIfExists(path.join(manifestDir, artifact), path.join(outputDir, artifact));
  }

  await fs.writeFile(path.join(outputDir, "messages.json"), `${JSON.stringify(messages, null, 2)}\n`, "utf8");

  const chainId = Number(summary?.chainId ?? 0);
  const networkLabel = chainLabel(chainId);
  const createdAt = Number(summary?.game?.createdAt ?? 0);
  const exportedAt = Number(summary?.evidenceWindow?.stateSnapshot?.timestamp ?? createdAt ?? 0);
  const counts = summary?.game?.counts ?? {};
  const analysis = buildAnalysis({ summary, rounds, roster, messages });
  const manifest = {
    schemaVersion: "prisoners-daolemma/web-game-manifest-v1",
    slug: sourceInfo.slug,
    title: `Game ${summary?.gameId} · ${networkLabel}`,
    sourceKind: sourceInfo.sourceKind,
    sourceRun: sourceInfo.sourceRun,
    sourceLabel: sourceInfo.sourceLabel,
    sourcePath: relativeManifestDir,
    gameId: summary?.gameId,
    chainId,
    networkKey: chainKey(chainId),
    networkLabel,
    createdAt,
    exportedAt,
    phase: summary?.game?.phase ?? null,
    outcome: summary?.game?.outcome ?? null,
    terminalPath: summary?.game?.settlement?.terminalPath ?? summary?.game?.terminalOutcome?.terminalPath ?? null,
    round: summary?.game?.round ?? null,
    shareStreak: summary?.game?.shareStreak ?? null,
    counts: {
      joined: Number(counts.joined ?? 0),
      alive: Number(counts.alive ?? 0),
      claimed: Number(counts.claimed ?? 0),
      refunded: Number(counts.refunded ?? 0),
      usedCauses: Number(counts.usedCauses ?? 0),
      committed: Number(counts.committed ?? 0),
      revealed: Number(counts.revealed ?? 0),
      messages: messages.length,
      rounds: Array.isArray(rounds?.rounds) ? rounds.rounds.length : 0,
    },
    economics: {
      entryFeeWei: summary?.game?.parameterSnapshot?.entryFeeWei ?? null,
      totalPotWei: summary?.game?.settlement?.totalPotWei ?? null,
      creatorFeeWei: summary?.game?.settlement?.creatorFeeWei ?? null,
      winnerCount: summary?.game?.settlement?.winnerCount ?? null,
      winnerShareWei: summary?.game?.settlement?.winnerShareWei ?? null,
      noWinnerCausePoolWei: summary?.game?.settlement?.noWinnerCausePoolWei ?? null,
    },
    takeaway: formatTakeaway(summary, rounds, messages, sourceInfo.sourceKind, analysis),
    analysis,
    urls: {
      detail: `/games/${sourceInfo.slug}`,
      manifest: `/games/${sourceInfo.slug}/manifest.json`,
      gameSummary: `/games/${sourceInfo.slug}/game-summary.json`,
      roster: `/games/${sourceInfo.slug}/roster.json`,
      causes: `/games/${sourceInfo.slug}/causes.json`,
      rounds: `/games/${sourceInfo.slug}/rounds.json`,
      auth: `/games/${sourceInfo.slug}/auth.json`,
      payouts: `/games/${sourceInfo.slug}/payouts.json`,
      messagesJsonl: `/games/${sourceInfo.slug}/messages.jsonl`,
      messagesJson: `/games/${sourceInfo.slug}/messages.json`,
      rawExportManifest: `/games/${sourceInfo.slug}/export-manifest.json`,
    },
  };

  await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function main() {
  const args = parseArgs();
  const filePath = fileURLToPath(import.meta.url);
  const scriptsDir = path.dirname(filePath);
  const foundryRoot = path.resolve(scriptsDir, "..");
  const repoRoot = path.resolve(foundryRoot, "../..");
  const publicGamesRoot = path.join(repoRoot, "packages", "nextjs", "public", "games");
  const foundryPackageRoot = path.join(repoRoot, "packages", "foundry");

  if (args.clean) {
    await fs.rm(publicGamesRoot, { recursive: true, force: true });
  }
  await ensureDir(publicGamesRoot);

  const allFiles = await walk(foundryPackageRoot);
  const manifestPaths = allFiles
    .filter(candidate => candidate.endsWith("export-manifest.json"))
    .filter(candidate => shouldIncludeManifest(relativePosix(repoRoot, candidate), args))
    .sort();

  const entries = [];
  for (const manifestPath of manifestPaths) {
    const entry = await publishManifest({ manifestPath, repoRoot, publicGamesRoot });
    entries.push(entry);
  }

  entries.sort((a, b) => {
    const bTime = b.exportedAt || b.createdAt || 0;
    const aTime = a.exportedAt || a.createdAt || 0;
    return bTime - aTime;
  });

  const index = {
    schemaVersion: "prisoners-daolemma/games-index-v1",
    generatedAt: new Date().toISOString(),
    launchTarget: {
      name: "Base Mainnet",
      chainId: 8453,
      note: "Base mainnet is the launch target.",
    },
    currentLiveProof: {
      name: "Base Sepolia",
      chainId: 84532,
      note: "Current public deployed evidence lives on Base Sepolia until mainnet games are available.",
    },
    entries,
  };

  await fs.writeFile(path.join(publicGamesRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

  console.log(`Published ${entries.length} game bundle${entries.length === 1 ? "" : "s"} to ${relativePosix(repoRoot, publicGamesRoot)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
