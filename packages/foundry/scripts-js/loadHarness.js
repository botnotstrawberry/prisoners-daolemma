import { spawn } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import {
  buildAndSignAuthPermit,
  bytes32FromUtf8,
  registerSignedPermit,
  resolveFromPackageRoot,
} from "./authTooling.js";
import {
  PHASE_NAMES,
  OUTCOME_NAMES,
  advancePhaseAction,
  cancelIfInsufficientPlayersAction,
  claimAction,
  commitAction,
  createGameAction,
  joinGameAction,
  prepareCommitAction,
  refundAction,
  revealAction,
  withdrawCauseAction,
  withdrawTreasuryAction,
} from "./gameTooling.js";
import { exportGameEvidence } from "./queryTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");

const authRegistryArtifact = JSON.parse(
  readFileSync(
    resolveFromPackageRoot("out/AgentAuthRegistry.sol/AgentAuthRegistry.json"),
    "utf8"
  )
);
const gameArtifact = JSON.parse(
  readFileSync(
    resolveFromPackageRoot("out/PrisonersDaollema.sol/PrisonersDaollema.json"),
    "utf8"
  )
);

export const LOAD_HARNESS_SCHEMA_VERSION = "prisoners-daollema/load-harness-v1";
export const LOAD_HARNESS_BOUNDARY_NOTE =
  "This is a local Anvil-focused load/chaos/adversarial harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos and adversarial probes, and writes machine-readable reports plus evidence exports. It is intended for synthetic local breakage hunting only: it does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation.";
export const DEFAULT_ANVIL_CHAIN_ID = 31337;
export const DEFAULT_ANVIL_PORT = 8555;
export const DEFAULT_ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";

const PROFILE_DEFS = {
  smoke: {
    name: "smoke",
    source: "PARAMETERS.md §5.1 Anvil smoke profile",
    joinDurationSeconds: 60,
    commitDurationBlocks: 10,
    revealDurationBlocks: 10,
    minPlayers: 3,
    maxPlayers: 32,
    maxCauses: 8,
    entryFeeEth: "0.01",
    creatorFeeBps: 100,
    causeFeeBps: 100,
    defaultPlayerCount: 8,
    defaultCauseCount: 4,
  },
  scale: {
    name: "scale",
    source: "PARAMETERS.md §5.2 Anvil scale profile",
    joinDurationSeconds: 60,
    commitDurationBlocks: 10,
    revealDurationBlocks: 10,
    minPlayers: 16,
    maxPlayers: 256,
    maxCauses: 16,
    entryFeeEth: "0.01",
    creatorFeeBps: 100,
    causeFeeBps: 100,
    defaultPlayerCount: 64,
    defaultCauseCount: 8,
  },
};

const NO_WINNER_CAUSE_BPS = 9_000n;
const MIXED_SCENARIO_TYPES = [
  "winner-all-share",
  "cancelled-underfilled",
  "no-winner-all-catch",
];
const SCENARIO_DEFS = {
  "winner-all-share": {
    type: "winner-all-share",
    family: "winner",
    description:
      "All selected players join and the intended move plan is SHARE. Optional skip rates exercise missed commit/reveal deadline pressure while relying on the contract's default-to-SHARE behavior.",
    terminalPath: "winner-claims",
  },
  "cancelled-underfilled": {
    type: "cancelled-underfilled",
    family: "cancelled",
    description:
      "Only an underfilled subset joins, the join window expires, the game is cancelled, and joined players take the refund path.",
    terminalPath: "cancelled-refunds",
  },
  "no-winner-all-catch": {
    type: "no-winner-all-catch",
    family: "no-winner",
    description:
      "All selected players join, commit CATCH, reveal CATCH in round one, and then the treasury/cause withdrawal path is exercised.",
    terminalPath: "no-winner-routing",
  },
  "adversarial-random": {
    type: "adversarial-random",
    family: "adversarial",
    description:
      "Seeded local adversarial stress that randomizes underfilled vs started games, move choices, commit/reveal omissions, wrong-preimage and late-action probes, duplicate follow-ups, and settlement ordering to hunt weird contract or harness state breakage.",
    terminalPath: "variable-by-outcome",
  },
};
const SCENARIO_ALIASES = {
  winner: "winner-all-share",
  "winner-all-share": "winner-all-share",
  cancelled: "cancelled-underfilled",
  underfilled: "cancelled-underfilled",
  "cancelled-underfilled": "cancelled-underfilled",
  "no-winner": "no-winner-all-catch",
  nowinner: "no-winner-all-catch",
  "no-winner-all-catch": "no-winner-all-catch",
  "no-winner-catchers": "no-winner-all-catch",
  adversarial: "adversarial-random",
  chaos: "adversarial-random",
  random: "adversarial-random",
  "adversarial-random": "adversarial-random",
  mixed: "mixed",
};
const CHOICE_VALUES = ["share", "catch", "steal"];

function toNumber(value, label = "value") {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toNumber();
  }
  if (typeof value === "bigint") {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) {
      throw new Error(`${label} exceeds JavaScript safe integer range.`);
    }
    return numeric;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} exceeds JavaScript safe integer range.`);
    }
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) {
      throw new Error(`${label} exceeds JavaScript safe integer range.`);
    }
    return numeric;
  }

  throw new Error(`Unsupported numeric value for ${label}.`);
}

function parseInteger(
  value,
  label,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {}
) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return numeric;
}

function parseRate(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`${label} must be a decimal rate between 0 and 1.`);
  }
  return numeric;
}

function bigintFrom(value, label = "value") {
  if (typeof value === "bigint") {
    return value;
  }
  if (ethers.BigNumber.isBigNumber(value)) {
    return BigInt(value.toString());
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) {
      throw new Error(`${label} must be a decimal string.`);
    }
    return BigInt(value);
  }
  throw new Error(`Unsupported bigint value for ${label}.`);
}

function decimalString(value) {
  return bigintFrom(value).toString();
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function writeJsonlFile(filePath, values) {
  ensureDir(dirname(filePath));
  const content = values.length
    ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n`
    : "";
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

function describeError(error) {
  if (!error) {
    return "Unknown error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error.reason === "string" && error.reason.length > 0) {
    return error.reason;
  }
  if (typeof error.shortMessage === "string" && error.shortMessage.length > 0) {
    return error.shortMessage;
  }
  if (typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  if (typeof error.body === "string" && error.body.length > 0) {
    return error.body;
  }
  return String(error);
}

function looksLikeRevert(message) {
  const normalized = String(message ?? "").toLowerCase();
  return [
    "revert",
    "execution reverted",
    "call_exception",
    "cannot estimate gas",
    "reverted with reason",
  ].some((fragment) => normalized.includes(fragment));
}

function bigintStats(values) {
  if (!values.length) {
    return {
      count: 0,
      total: "0",
      min: null,
      max: null,
      average: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0n);
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return {
    count: values.length,
    total: total.toString(),
    min: min.toString(),
    max: max.toString(),
    average: (total / BigInt(values.length)).toString(),
  };
}

function numberStats(values) {
  if (!values.length) {
    return {
      count: 0,
      total: 0,
      min: null,
      max: null,
      average: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    total,
    min: Math.min(...values),
    max: Math.max(...values),
    average: total / values.length,
  };
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

function buildTxSummary(entries) {
  function summarizeGroup(groupEntries) {
    const gasValues = groupEntries
      .filter((entry) => entry.status === "succeeded" && entry.gasUsed !== null)
      .map((entry) => bigintFrom(entry.gasUsed, "entry.gasUsed"));
    const latencyValues = groupEntries.map((entry) => entry.durationMs);

    return {
      attempted: groupEntries.length,
      succeeded: groupEntries.filter((entry) => entry.status === "succeeded")
        .length,
      failed: groupEntries.filter((entry) => entry.status === "failed").length,
      failedExpected: groupEntries.filter(
        (entry) =>
          entry.status === "failed" && entry.failureClass === "expected"
      ).length,
      failedUnexpected: groupEntries.filter(
        (entry) =>
          entry.status === "failed" && entry.failureClass === "unexpected"
      ).length,
      failedOnchain: groupEntries.filter(
        (entry) =>
          entry.status === "failed" &&
          entry.failureTransport === "onchain-revert"
      ).length,
      failedLocal: groupEntries.filter(
        (entry) =>
          entry.status === "failed" &&
          entry.failureTransport === "local-rejection"
      ).length,
      unexpectedSuccesses: groupEntries.filter(
        (entry) => entry.failureClass === "unexpected-success"
      ).length,
      reverted: groupEntries.filter(
        (entry) => entry.status === "failed" && looksLikeRevert(entry.error)
      ).length,
      gasUsed: bigintStats(gasValues),
      latencyMs: numberStats(latencyValues),
    };
  }

  function summarizeBy(groupSelector) {
    const grouped = new Map();
    for (const entry of entries) {
      const key = groupSelector(entry) ?? "(none)";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(entry);
    }

    const result = {};
    for (const [key, groupEntries] of [...grouped.entries()].sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]))
    )) {
      result[key] = summarizeGroup(groupEntries);
    }

    return result;
  }

  const totalGasValues = entries
    .filter((entry) => entry.status === "succeeded" && entry.gasUsed !== null)
    .map((entry) => bigintFrom(entry.gasUsed, "entry.gasUsed"));
  const latencyValues = entries.map((entry) => entry.durationMs);

  return {
    attempted: entries.length,
    succeeded: entries.filter((entry) => entry.status === "succeeded").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    failedExpected: entries.filter(
      (entry) => entry.status === "failed" && entry.failureClass === "expected"
    ).length,
    failedUnexpected: entries.filter(
      (entry) =>
        entry.status === "failed" && entry.failureClass === "unexpected"
    ).length,
    failedOnchain: entries.filter(
      (entry) =>
        entry.status === "failed" && entry.failureTransport === "onchain-revert"
    ).length,
    failedLocal: entries.filter(
      (entry) =>
        entry.status === "failed" && entry.failureTransport === "local-rejection"
    ).length,
    unexpectedSuccesses: entries.filter(
      (entry) => entry.failureClass === "unexpected-success"
    ).length,
    reverted: entries.filter(
      (entry) => entry.status === "failed" && looksLikeRevert(entry.error)
    ).length,
    gasUsed: bigintStats(totalGasValues),
    latencyMs: numberStats(latencyValues),
    byAction: summarizeBy((entry) => entry.action),
    byPhase: summarizeBy((entry) => entry.phase),
    byScenario: summarizeBy((entry) => entry.scenarioType ?? "bootstrap"),
    byExpectation: summarizeBy((entry) => entry.expectation ?? "success"),
    byProbeKind: summarizeBy((entry) => entry.probeKind ?? "(none)"),
  };
}

function buildFailureClusters(entries, { onlyUnexpected = false } = {}) {
  const filtered = entries.filter((entry) => {
    if (entry.status !== "failed") {
      return false;
    }
    if (onlyUnexpected && entry.failureClass !== "unexpected") {
      return false;
    }
    return true;
  });

  const grouped = new Map();
  for (const entry of filtered) {
    const fingerprint = fingerprintErrorMessage(entry.error);
    const key = [entry.action, entry.phase, fingerprint].join("|");
    const current = grouped.get(key) ?? {
      action: entry.action,
      phase: entry.phase,
      expectation: entry.expectation,
      probeKind: entry.probeKind,
      failureClass: entry.failureClass,
      failureTransport: entry.failureTransport,
      errorFingerprint: fingerprint,
      count: 0,
      scenarios: new Set(),
      games: new Set(),
    };
    current.count += 1;
    if (entry.scenarioType) {
      current.scenarios.add(entry.scenarioType);
    }
    if (entry.gameId !== null && entry.gameId !== undefined) {
      current.games.add(entry.gameId);
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
    .map((entry) => ({
      action: entry.action,
      phase: entry.phase,
      expectation: entry.expectation,
      probeKind: entry.probeKind,
      failureClass: entry.failureClass,
      failureTransport: entry.failureTransport,
      errorFingerprint: entry.errorFingerprint,
      count: entry.count,
      scenarios: [...entry.scenarios].sort(),
      gameIds: [...entry.games].sort((a, b) => a - b),
    }));
}

function normalizeSnapshot(snapshot) {
  return {
    entryFeeWei: decimalString(snapshot.entryFeeWei),
    creatorFeeBps: toNumber(snapshot.creatorFeeBps, "snapshot.creatorFeeBps"),
    causeFeeBps: toNumber(snapshot.causeFeeBps, "snapshot.causeFeeBps"),
    joinDurationSeconds: toNumber(
      snapshot.joinDurationSeconds,
      "snapshot.joinDurationSeconds"
    ),
    commitDurationBlocks: toNumber(
      snapshot.commitDurationBlocks,
      "snapshot.commitDurationBlocks"
    ),
    revealDurationBlocks: toNumber(
      snapshot.revealDurationBlocks,
      "snapshot.revealDurationBlocks"
    ),
    minPlayers: toNumber(snapshot.minPlayers, "snapshot.minPlayers"),
    maxPlayers: toNumber(snapshot.maxPlayers, "snapshot.maxPlayers"),
    maxCauses: toNumber(snapshot.maxCauses, "snapshot.maxCauses"),
    joinedCount: toNumber(snapshot.joinedCount, "snapshot.joinedCount"),
    aliveCount: toNumber(snapshot.aliveCount, "snapshot.aliveCount"),
    usedCauseCount: toNumber(
      snapshot.usedCauseCount,
      "snapshot.usedCauseCount"
    ),
    committedCount: toNumber(
      snapshot.committedCount,
      "snapshot.committedCount"
    ),
    revealedCount: toNumber(snapshot.revealedCount, "snapshot.revealedCount"),
    createdAt: toNumber(snapshot.createdAt, "snapshot.createdAt"),
    joinDeadline: toNumber(snapshot.joinDeadline, "snapshot.joinDeadline"),
    commitDeadlineBlock: toNumber(
      snapshot.commitDeadlineBlock,
      "snapshot.commitDeadlineBlock"
    ),
    revealDeadlineBlock: toNumber(
      snapshot.revealDeadlineBlock,
      "snapshot.revealDeadlineBlock"
    ),
    round: toNumber(snapshot.round, "snapshot.round"),
    shareStreak: toNumber(snapshot.shareStreak, "snapshot.shareStreak"),
    phaseCode: toNumber(snapshot.phase, "snapshot.phase"),
    phase: PHASE_NAMES[toNumber(snapshot.phase, "snapshot.phase")] ?? "Unknown",
    outcomeCode: toNumber(snapshot.outcome, "snapshot.outcome"),
    outcome:
      OUTCOME_NAMES[toNumber(snapshot.outcome, "snapshot.outcome")] ??
      "Unknown",
    treasury: snapshot.treasury,
  };
}

function buildRunLabel() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveRunDir(outPath) {
  return resolveFromPackageRoot(outPath ?? `load-harness/${buildRunLabel()}`);
}

function resolveScenarioType(rawScenario) {
  const normalized = String(rawScenario ?? "winner-all-share")
    .trim()
    .toLowerCase();
  const resolved = SCENARIO_ALIASES[normalized];
  if (!resolved) {
    throw new Error(
      `Unsupported scenario '${rawScenario}'. Use winner-all-share, cancelled-underfilled, no-winner-all-catch, adversarial-random, a comma-separated list of those, or mixed.`
    );
  }
  return resolved;
}

function parseScenarioSelection(rawScenario) {
  if (rawScenario === undefined || rawScenario === null || rawScenario === "") {
    return ["winner-all-share"];
  }

  const tokens = String(rawScenario)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return ["winner-all-share"];
  }

  const resolved = tokens.flatMap((token) => {
    const scenarioType = resolveScenarioType(token);
    return scenarioType === "mixed" ? MIXED_SCENARIO_TYPES : [scenarioType];
  });

  return resolved;
}

function expandScenarioPlan(selectedScenarioTypes, games) {
  return Array.from({ length: games }, (_, index) => {
    const scenarioType =
      selectedScenarioTypes[index % selectedScenarioTypes.length];
    return {
      ...SCENARIO_DEFS[scenarioType],
      ordinal: index + 1,
    };
  });
}

function deriveWallet(mnemonic, index, provider = null) {
  const wallet = ethers.Wallet.fromMnemonic(
    mnemonic,
    `m/44'/60'/0'/0/${index}`
  );
  return provider ? wallet.connect(provider) : wallet;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProvider(provider, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await wait(250);
    }
  }
  throw new Error("Timed out waiting for Anvil RPC to become available.");
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    processHandle.once("exit", finish);
    processHandle.kill("SIGTERM");

    setTimeout(() => {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL");
      }
      finish();
    }, 1_000);
  });
}

async function startAnvil({ port, chainId, accounts, mnemonic }) {
  const anvilProcess = spawn(
    "anvil",
    [
      "--port",
      String(port),
      "--chain-id",
      String(chainId),
      "--accounts",
      String(accounts),
      "--mnemonic",
      mnemonic,
      "--code-size-limit",
      "131072",
    ],
    {
      cwd: packageDir,
      stdio: "ignore",
    }
  );

  const rpcUrl = `http://127.0.0.1:${port}`;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  try {
    await waitForProvider(provider);
  } catch (error) {
    await stopProcess(anvilProcess);
    throw error;
  }

  return {
    anvilProcess,
    provider,
    rpcUrl,
  };
}

async function mapConcurrent(items, limit, mapper) {
  if (items.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = {
          ok: true,
          value: await mapper(items[index], index),
        };
      } catch (error) {
        results[index] = {
          ok: false,
          error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function buildResolvedConfig(rawOptions = {}) {
  const profileName = String(rawOptions.profile ?? "smoke")
    .trim()
    .toLowerCase();
  const profile = PROFILE_DEFS[profileName];
  if (!profile) {
    throw new Error(
      `Unsupported profile '${rawOptions.profile}'. Use one of: ${Object.keys(
        PROFILE_DEFS
      ).join(", ")}.`
    );
  }

  const playerCount = parseInteger(
    rawOptions.playerCount ?? profile.defaultPlayerCount,
    "playerCount",
    { min: 2, max: 256 }
  );
  const causeCount = parseInteger(
    rawOptions.causeCount ?? Math.min(profile.defaultCauseCount, playerCount),
    "causeCount",
    { min: 1, max: 16 }
  );
  const games = parseInteger(rawOptions.games ?? 1, "games", {
    min: 1,
    max: 100,
  });
  const concurrency = parseInteger(
    rawOptions.concurrency ?? Math.min(16, playerCount),
    "concurrency",
    { min: 1, max: 256 }
  );
  const skipCommitRate = parseRate(
    rawOptions.skipCommitRate ?? 0,
    "skipCommitRate"
  );
  const skipRevealRate = parseRate(
    rawOptions.skipRevealRate ?? 0,
    "skipRevealRate"
  );
  const underfilledRate = parseRate(
    rawOptions.underfilledRate ?? 0.2,
    "underfilledRate"
  );
  const invalidRevealRate = parseRate(
    rawOptions.invalidRevealRate ?? 0.15,
    "invalidRevealRate"
  );
  const probeRate = parseRate(rawOptions.probeRate ?? 0.35, "probeRate");
  const choiceWeights = {
    share: parsePositiveNumber(rawOptions.shareWeight ?? 1, "shareWeight", {
      allowZero: true,
    }),
    catch: parsePositiveNumber(rawOptions.catchWeight ?? 1, "catchWeight", {
      allowZero: true,
    }),
    steal: parsePositiveNumber(rawOptions.stealWeight ?? 1, "stealWeight", {
      allowZero: true,
    }),
  };
  if (choiceWeights.share + choiceWeights.catch + choiceWeights.steal <= 0) {
    throw new Error(
      "At least one of shareWeight, catchWeight, or stealWeight must be positive."
    );
  }
  const chainId = parseInteger(
    rawOptions.chainId ?? DEFAULT_ANVIL_CHAIN_ID,
    "chainId",
    { min: 1, max: Number.MAX_SAFE_INTEGER }
  );
  const anvilPort = parseInteger(
    rawOptions.anvilPort ?? DEFAULT_ANVIL_PORT,
    "anvilPort",
    { min: 1, max: 65535 }
  );

  if (causeCount > playerCount) {
    throw new Error(
      `causeCount ${causeCount} cannot exceed playerCount ${playerCount}.`
    );
  }

  const notes = [];
  const joinDurationSeconds =
    rawOptions.joinDurationSeconds !== undefined
      ? parseInteger(rawOptions.joinDurationSeconds, "joinDurationSeconds", {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
        })
      : profile.joinDurationSeconds;
  const commitDurationBlocks =
    rawOptions.commitDurationBlocks !== undefined
      ? parseInteger(rawOptions.commitDurationBlocks, "commitDurationBlocks", {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
        })
      : profile.commitDurationBlocks;
  const revealDurationBlocks =
    rawOptions.revealDurationBlocks !== undefined
      ? parseInteger(rawOptions.revealDurationBlocks, "revealDurationBlocks", {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
        })
      : profile.revealDurationBlocks;

  let minPlayers = profile.minPlayers;
  if (playerCount < minPlayers) {
    minPlayers = playerCount;
    notes.push(
      `Lowered minPlayers from profile default ${profile.minPlayers} to ${playerCount} so the requested local run can start.`
    );
  }

  let maxPlayers = profile.maxPlayers;
  if (playerCount > maxPlayers) {
    maxPlayers = playerCount;
    notes.push(
      `Raised maxPlayers from profile default ${profile.maxPlayers} to ${playerCount} to match the requested local run.`
    );
  }

  let maxCauses = profile.maxCauses;
  if (causeCount > maxCauses) {
    maxCauses = causeCount;
    notes.push(
      `Raised maxCauses from profile default ${profile.maxCauses} to ${causeCount} to match the requested local run.`
    );
  }

  if (maxCauses > maxPlayers) {
    maxCauses = maxPlayers;
    notes.push(
      `Clamped maxCauses to ${maxPlayers} so it does not exceed maxPlayers.`
    );
  }

  const requestedScenario =
    rawOptions.scenario !== undefined
      ? String(rawOptions.scenario)
      : "winner-all-share";
  const selectedScenarioTypes = parseScenarioSelection(requestedScenario);
  const scenarioPlan = expandScenarioPlan(selectedScenarioTypes, games);

  if (
    selectedScenarioTypes.length < games &&
    selectedScenarioTypes.length > 0
  ) {
    notes.push(
      `Scenario list ${selectedScenarioTypes.join(
        ", "
      )} is shorter than games=${games}, so the harness cycles that list across the sequential run.`
    );
  }

  if (
    (skipCommitRate > 0 || skipRevealRate > 0) &&
    scenarioPlan.some(
      (scenario) =>
        scenario.type !== "winner-all-share" &&
        scenario.type !== "adversarial-random"
    )
  ) {
    notes.push(
      "skipCommitRate and skipRevealRate only affect winner-all-share and adversarial-random games. Cancelled and no-winner scenarios ignore those knobs so their terminal outcomes stay deterministic."
    );
  }

  const adversarialScenarioSelected = scenarioPlan.some(
    (scenario) => scenario.type === "adversarial-random"
  );
  if (adversarialScenarioSelected) {
    notes.push(
      `Adversarial scenario enabled with underfilledRate=${underfilledRate}, invalidRevealRate=${invalidRevealRate}, probeRate=${probeRate}, and choiceWeights share/catch/steal=${choiceWeights.share}/${choiceWeights.catch}/${choiceWeights.steal}.`
    );
  }

  if (joinDurationSeconds !== profile.joinDurationSeconds) {
    notes.push(
      `Overrode joinDurationSeconds from profile default ${profile.joinDurationSeconds} to ${joinDurationSeconds} for this run.`
    );
  }
  if (commitDurationBlocks !== profile.commitDurationBlocks) {
    notes.push(
      `Overrode commitDurationBlocks from profile default ${profile.commitDurationBlocks} to ${commitDurationBlocks} for this run.`
    );
  }
  if (revealDurationBlocks !== profile.revealDurationBlocks) {
    notes.push(
      `Overrode revealDurationBlocks from profile default ${profile.revealDurationBlocks} to ${revealDurationBlocks} for this run.`
    );
  }

  const maxFullRoundParticipants = scenarioPlan.some(
    (scenario) => scenario.type !== "cancelled-underfilled"
  )
    ? playerCount
    : 0;
  if (
    maxFullRoundParticipants > 0 &&
    commitDurationBlocks < maxFullRoundParticipants
  ) {
    notes.push(
      `For auto-mined local Anvil runs, commitDurationBlocks=${commitDurationBlocks} is smaller than the max joined-player count ${maxFullRoundParticipants}. Full-participation commit rounds can time out unless you raise commitDurationBlocks or intentionally rely on skipped commits.`
    );
  }
  if (
    maxFullRoundParticipants > 0 &&
    revealDurationBlocks < maxFullRoundParticipants
  ) {
    notes.push(
      `For auto-mined local Anvil runs, revealDurationBlocks=${revealDurationBlocks} is smaller than the max joined-player count ${maxFullRoundParticipants}. Full-participation reveal rounds can time out unless you raise revealDurationBlocks or intentionally rely on skipped reveals.`
    );
  }

  return {
    profileName,
    profile,
    notes,
    playerCount,
    causeCount,
    games,
    concurrency,
    skipCommitRate,
    skipRevealRate,
    underfilledRate,
    invalidRevealRate,
    probeRate,
    choiceWeights,
    chainId,
    anvilPort,
    mnemonic: String(rawOptions.mnemonic ?? DEFAULT_ANVIL_MNEMONIC),
    rpcUrl: rawOptions.rpcUrl ? String(rawOptions.rpcUrl) : null,
    spawnAnvil: !rawOptions.rpcUrl,
    claimWinners: rawOptions.skipClaims ? false : true,
    expectedFailures: Boolean(rawOptions.expectedFailures),
    requestedScenario,
    selectedScenarioTypes,
    scenarioPlan,
    seed: String(rawOptions.seed ?? "load-harness-seed-v0"),
    runDir: resolveRunDir(rawOptions.out),
    profileConfig: {
      entryFeeWei: ethers.utils.parseEther(profile.entryFeeEth).toString(),
      creatorFeeBps: profile.creatorFeeBps,
      causeFeeBps: profile.causeFeeBps,
      joinDurationSeconds,
      commitDurationBlocks,
      revealDurationBlocks,
      minPlayers,
      maxPlayers,
      maxCauses,
    },
  };
}

function createEmptyTxTracker() {
  return {
    entries: [],
    nextIndex: 1,
  };
}

function pushTrackedEntry(
  tracker,
  meta,
  {
    status,
    startedAt,
    finishedAt,
    durationMs,
    txHash = null,
    blockNumber = null,
    gasUsed = null,
    error = null,
    failureClass = null,
    failureTransport = null,
  }
) {
  tracker.entries.push({
    index: tracker.nextIndex++,
    status,
    action: meta.action,
    phase: meta.phase,
    scenarioType: meta.scenarioType ?? null,
    expectation: meta.expectation ?? "success",
    failureLabel: meta.failureLabel ?? null,
    probeKind: meta.probeKind ?? null,
    failureClass,
    failureTransport,
    gameIndex: meta.gameIndex ?? null,
    gameId: meta.gameId ?? null,
    round: meta.round ?? null,
    wallet: meta.wallet ?? null,
    causeId: meta.causeId ?? null,
    startedAt,
    finishedAt,
    durationMs,
    txHash,
    blockNumber,
    gasUsed,
    error,
  });
}

function extractFailureReceipt(error) {
  const receipt = error?.receipt ?? error?.error?.receipt ?? null;
  if (receipt?.transactionHash) {
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber ?? null,
      gasUsed:
        receipt.gasUsed !== undefined && receipt.gasUsed !== null
          ? bigintFrom(receipt.gasUsed, "failureReceipt.gasUsed").toString()
          : null,
    };
  }

  return null;
}

async function extractReceipt(provider, outcome) {
  if (outcome?.transactionHash && outcome?.gasUsed !== undefined) {
    return {
      transactionHash: outcome.transactionHash,
      blockNumber: outcome.blockNumber,
      gasUsed: bigintFrom(outcome.gasUsed, "receipt.gasUsed").toString(),
    };
  }

  if (outcome?.hash && typeof outcome.wait === "function") {
    const receipt = await outcome.wait();
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: bigintFrom(receipt.gasUsed, "receipt.gasUsed").toString(),
    };
  }

  if (outcome?.txHash) {
    if (outcome.gasUsed !== undefined && outcome.blockNumber !== undefined) {
      return {
        transactionHash: outcome.txHash,
        blockNumber: outcome.blockNumber,
        gasUsed: bigintFrom(outcome.gasUsed, "receipt.gasUsed").toString(),
      };
    }

    const receipt = await provider.getTransactionReceipt(outcome.txHash);
    if (!receipt) {
      throw new Error(`Missing receipt for tx ${outcome.txHash}.`);
    }
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: bigintFrom(receipt.gasUsed, "receipt.gasUsed").toString(),
    };
  }

  if (
    outcome?.deployTransaction?.hash &&
    typeof outcome.deployTransaction.wait === "function"
  ) {
    const receipt = await outcome.deployTransaction.wait();
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: bigintFrom(receipt.gasUsed, "receipt.gasUsed").toString(),
    };
  }

  throw new Error(
    "Tracked transaction result did not expose a transaction hash."
  );
}

async function trackedTx(tracker, provider, meta, operation) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const outcome = await operation();
    const receipt = await extractReceipt(provider, outcome);
    pushTrackedEntry(tracker, meta, {
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    });
    return outcome;
  } catch (error) {
    const failureReceipt = extractFailureReceipt(error);
    pushTrackedEntry(tracker, meta, {
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      txHash: failureReceipt?.transactionHash ?? null,
      blockNumber: failureReceipt?.blockNumber ?? null,
      gasUsed: failureReceipt?.gasUsed ?? null,
      error: describeError(error),
      failureClass: "unexpected",
      failureTransport: failureReceipt ? "onchain-revert" : "local-rejection",
    });
    throw error;
  }
}

async function trackedExpectedFailure(tracker, provider, meta, operation) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const outcome = await operation();
    const receipt = await extractReceipt(provider, outcome);
    pushTrackedEntry(
      tracker,
      {
        ...meta,
        expectation: meta.expectation ?? "expected-failure",
      },
      {
        status: "succeeded",
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        failureClass: "unexpected-success",
      }
    );

    const unexpectedSuccess = new Error(
      `${
        meta.failureLabel ?? meta.action
      } unexpectedly succeeded even though the harness expected it to fail.`
    );
    unexpectedSuccess.__loadHarnessUnexpectedSuccess = true;
    throw unexpectedSuccess;
  } catch (error) {
    if (error?.__loadHarnessUnexpectedSuccess) {
      throw error;
    }

    pushTrackedEntry(
      tracker,
      {
        ...meta,
        expectation: meta.expectation ?? "expected-failure",
      },
      {
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        txHash: extractFailureReceipt(error)?.transactionHash ?? null,
        blockNumber: extractFailureReceipt(error)?.blockNumber ?? null,
        gasUsed: extractFailureReceipt(error)?.gasUsed ?? null,
        error: describeError(error),
        failureClass: "expected",
        failureTransport: extractFailureReceipt(error)
          ? "onchain-revert"
          : "local-rejection",
      }
    );

    return {
      expectedFailure: true,
      error: describeError(error),
    };
  }
}

async function readLatestBlock(provider) {
  const block = await provider.getBlock("latest");
  if (!block) {
    throw new Error("Unable to read the latest block from the provider.");
  }
  return block;
}

async function minePastBlock(provider, blockNumber) {
  let mined = 0;
  while ((await provider.getBlockNumber()) <= blockNumber) {
    await provider.send("evm_mine", []);
    mined += 1;
  }
  return mined;
}

function sampleUnitInterval({
  seed,
  stage,
  gameIndex = 0,
  round = 0,
  playerIndex = 0,
  wallet = "global",
  extra = "",
}) {
  const digest = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
      `${seed}:${stage}:game-${gameIndex}:round-${round}:player-${playerIndex}:${wallet}:${extra}`
    )
  );
  return Number(BigInt(digest) % 1_000_000n) / 1_000_000;
}

function shouldSample({
  seed,
  stage,
  gameIndex,
  round,
  playerIndex,
  wallet,
  rate,
  extra = "",
}) {
  if (rate <= 0) {
    return false;
  }
  if (rate >= 1) {
    return true;
  }

  return (
    sampleUnitInterval({
      seed,
      stage,
      gameIndex,
      round,
      playerIndex,
      wallet,
      extra,
    }) < rate
  );
}

function parsePositiveNumber(value, label, { allowZero = false } = {}) {
  const numeric = Number(value);
  const min = allowZero ? 0 : Number.EPSILON;
  if (!Number.isFinite(numeric) || numeric < min) {
    throw new Error(
      `${label} must be a finite ${allowZero ? "non-negative" : "positive"} number.`
    );
  }
  return numeric;
}

function sampleIntegerInRange({
  seed,
  stage,
  gameIndex = 0,
  round = 0,
  min,
  max,
  playerIndex = 0,
  wallet = "global",
  extra = "",
}) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error(`Invalid integer range for ${stage}: [${min}, ${max}].`);
  }
  if (min === max) {
    return min;
  }

  const sample = sampleUnitInterval({
    seed,
    stage,
    gameIndex,
    round,
    playerIndex,
    wallet,
    extra,
  });
  return min + Math.floor(sample * (max - min + 1));
}

function deterministicShuffle(
  items,
  {
    seed,
    stage,
    gameIndex = 0,
    round = 0,
    extra = "",
    keyFn = (_, index) => String(index),
  }
) {
  return items
    .map((item, index) => ({
      item,
      rank: sampleUnitInterval({
        seed,
        stage,
        gameIndex,
        round,
        playerIndex: index,
        wallet: String(keyFn(item, index)),
        extra,
      }),
      index,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

function pickWeightedChoice({
  seed,
  stage,
  gameIndex,
  round,
  playerIndex,
  wallet,
  weights,
}) {
  const orderedChoices = CHOICE_VALUES.map((choice) => ({
    choice,
    weight: Number(weights[choice] ?? 0),
  })).filter((entry) => entry.weight > 0);

  if (orderedChoices.length === 0) {
    throw new Error("At least one choice weight must be positive.");
  }

  const totalWeight = orderedChoices.reduce(
    (sum, entry) => sum + entry.weight,
    0
  );
  const sample =
    sampleUnitInterval({
      seed,
      stage,
      gameIndex,
      round,
      playerIndex,
      wallet,
    }) * totalWeight;

  let cursor = 0;
  for (const entry of orderedChoices) {
    cursor += entry.weight;
    if (sample <= cursor) {
      return entry.choice;
    }
  }

  return orderedChoices[orderedChoices.length - 1].choice;
}

function countChoiceValues(values) {
  return {
    Share: values.filter((value) => value === "share").length,
    Catch: values.filter((value) => value === "catch").length,
    Steal: values.filter((value) => value === "steal").length,
  };
}

function mutateSalt(salt, label) {
  const mutated = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${label}:${salt}`)
  );
  if (mutated.toLowerCase() !== String(salt).toLowerCase()) {
    return mutated;
  }
  return `0x${"0".repeat(63)}1`;
}

function fingerprintErrorMessage(message) {
  return String(message ?? "unknown-error")
    .replace(/0x[a-fA-F0-9]{40,}/g, "0x*")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function buildCauseDefinitions({ mnemonic, playerCount, causeCount }) {
  return Array.from({ length: causeCount }, (_, index) => {
    const causeId = index + 1;
    const recipient = deriveWallet(mnemonic, playerCount + 20 + index).address;
    return {
      causeId,
      recipient,
      metadataHash: bytes32FromUtf8(`cause-${causeId}`),
    };
  });
}

function assignCauseId(playerIndex, gameIndex, causeCount) {
  return ((playerIndex + gameIndex - 1) % causeCount) + 1;
}

function sumDecimalStrings(values) {
  return values.reduce(
    (sum, value) => sum + bigintFrom(value ?? 0, "decimalValue"),
    0n
  );
}

function buildCauseDistribution(causeAssignments) {
  return groupCount(causeAssignments, (entry) => `cause-${entry.causeId}`)
    .map((entry) => ({
      causeId: Number(entry.key.replace("cause-", "")),
      entrantCount: entry.count,
    }))
    .sort((a, b) => a.causeId - b.causeId);
}

function uniqueCauseCount(causeAssignments) {
  return new Set(causeAssignments.map((entry) => entry.causeId)).size;
}

function aggregateClaims(results) {
  const byCause = new Map();
  let totalGross = 0n;
  let totalCauseCut = 0n;
  let totalNet = 0n;

  for (const result of results) {
    const grossPrizeWei = bigintFrom(result.grossPrizeWei, "grossPrizeWei");
    const causeCutWei = bigintFrom(result.causeCutWei, "causeCutWei");
    const netPrizeWei = bigintFrom(result.netPrizeWei, "netPrizeWei");
    totalGross += grossPrizeWei;
    totalCauseCut += causeCutWei;
    totalNet += netPrizeWei;

    const causeId = Number(result.causeId);
    const current = byCause.get(causeId) ?? {
      causeId,
      claims: 0,
      grossPrizeWei: 0n,
      causeCutWei: 0n,
      netPrizeWei: 0n,
    };
    current.claims += 1;
    current.grossPrizeWei += grossPrizeWei;
    current.causeCutWei += causeCutWei;
    current.netPrizeWei += netPrizeWei;
    byCause.set(causeId, current);
  }

  return {
    succeeded: results.length,
    totalGrossPrizeWei: totalGross.toString(),
    totalCauseCutWei: totalCauseCut.toString(),
    totalNetPrizeWei: totalNet.toString(),
    byCause: [...byCause.values()]
      .sort((a, b) => a.causeId - b.causeId)
      .map((entry) => ({
        causeId: entry.causeId,
        claims: entry.claims,
        grossPrizeWei: entry.grossPrizeWei.toString(),
        causeCutWei: entry.causeCutWei.toString(),
        netPrizeWei: entry.netPrizeWei.toString(),
      })),
  };
}

function aggregateRefunds(results) {
  const totalRefundWei = results.reduce(
    (sum, result) => sum + bigintFrom(result.refundWei, "refundWei"),
    0n
  );

  return {
    succeeded: results.length,
    totalRefundWei: totalRefundWei.toString(),
  };
}

function aggregateCauseWithdrawals(results) {
  const byCause = new Map();
  let totalAmountWei = 0n;

  for (const result of results) {
    const amountWei = bigintFrom(result.amountWei, "causeWithdrawal.amountWei");
    totalAmountWei += amountWei;

    const causeId = Number(result.causeId);
    const current = byCause.get(causeId) ?? {
      causeId,
      withdrawals: 0,
      amountWei: 0n,
      recipient: result.recipient,
    };
    current.withdrawals += 1;
    current.amountWei += amountWei;
    byCause.set(causeId, current);
  }

  return {
    succeeded: results.length,
    totalAmountWei: totalAmountWei.toString(),
    byCause: [...byCause.values()]
      .sort((a, b) => a.causeId - b.causeId)
      .map((entry) => ({
        causeId: entry.causeId,
        withdrawals: entry.withdrawals,
        amountWei: entry.amountWei.toString(),
        recipient: entry.recipient,
      })),
  };
}

function summarizeTreasuryWithdrawal(result) {
  return result
    ? {
        executed: true,
        amountWei: result.amountWei,
        recipient: result.recipient,
      }
    : {
        executed: false,
        amountWei: "0",
        recipient: null,
      };
}

function buildPostRunOutstanding(evidence) {
  const payouts = evidence.payouts;
  const totalCauseClaimableWei = sumDecimalStrings(
    payouts.causes.map((cause) => cause.claimableFromGameWei)
  ).toString();
  const unclaimedWinnerCount = payouts.claims.winners.unclaimedWinnerCount;
  const pendingRefundCount = payouts.claims.refunds.pendingRefundCount;
  const treasuryClaimableWei = payouts.treasury.claimableWei;

  return {
    treasuryClaimableWei,
    totalCauseClaimableWei,
    unclaimedWinnerCount,
    pendingRefundCount,
    fullyDrainedByHarness:
      treasuryClaimableWei === "0" &&
      totalCauseClaimableWei === "0" &&
      unclaimedWinnerCount === 0 &&
      pendingRefundCount === 0,
  };
}

function buildReplayConsistency({
  scenarioType,
  evidence,
  config,
  causeAssignments,
  claimSummary,
  claimWinners,
  refundSummary,
  withdrawalSummary,
}) {
  const summary = evidence.summary;
  const payouts = evidence.payouts;
  const settlement = summary.game.settlement;
  const checks = [];
  const joinedCount = causeAssignments.length;
  const usedCauseCount = uniqueCauseCount(causeAssignments);
  const totalPotWei = (
    bigintFrom(config.entryFeeWei) * BigInt(joinedCount)
  ).toString();

  function addCheck(name, expected, actual) {
    checks.push({
      name,
      expected,
      actual,
      ok: expected === actual,
    });
  }

  addCheck("joinedCount", joinedCount, summary.game.counts.joined);
  addCheck("usedCauses", usedCauseCount, summary.game.counts.usedCauses);
  addCheck("settlementFinalized", true, settlement.finalized);
  addCheck("totalPotWei", totalPotWei, settlement.totalPotWei);

  if (scenarioType === "winner-all-share") {
    const totalCauseClaimableWei = sumDecimalStrings(
      payouts.causes.map((cause) => cause.claimableFromGameWei)
    );
    const totalCauseWithdrawnWei = sumDecimalStrings(
      payouts.causes.map((cause) => cause.withdrawnFromGameWei)
    );
    const expectedCauseWithdrawnWei = claimWinners
      ? claimSummary.totalCauseCutWei
      : "0";

    addCheck("phase", "Ended", summary.game.phase);
    addCheck("outcome", "Winners", summary.game.outcome);
    addCheck(
      "terminalPath",
      "winner-claims",
      summary.game.terminalOutcome.terminalPath
    );
    addCheck("shareStreak", 3, summary.game.shareStreak);
    addCheck("aliveCount", joinedCount, summary.game.counts.alive);
    addCheck("winnerCount", joinedCount, settlement.winnerCount);
    addCheck("claimPathAvailable", true, payouts.settlement.claimPathAvailable);
    if (claimWinners) {
      addCheck("claimedCount", joinedCount, summary.game.counts.claimed);
      addCheck(
        "claimedWinnerCount",
        joinedCount,
        payouts.claims.winners.claimedWinnerCount
      );
      addCheck(
        "grossClaimsVsWinnerShare",
        (
          bigintFrom(settlement.winnerShareWei) * BigInt(joinedCount)
        ).toString(),
        claimSummary.totalGrossPrizeWei
      );
      addCheck(
        "grossEqualsNetPlusCauseCut",
        bigintFrom(claimSummary.totalGrossPrizeWei).toString(),
        (
          bigintFrom(claimSummary.totalNetPrizeWei) +
          bigintFrom(claimSummary.totalCauseCutWei)
        ).toString()
      );
      addCheck(
        "grossClaimsAgreeWithEvidence",
        claimSummary.totalGrossPrizeWei,
        payouts.claims.winners.totalGrossClaimedWei
      );
    } else {
      addCheck("claimedCount", 0, summary.game.counts.claimed);
      addCheck(
        "claimedWinnerCount",
        0,
        payouts.claims.winners.claimedWinnerCount
      );
    }
    addCheck(
      "treasuryWithdrawnWei",
      settlement.creatorFeeWei,
      payouts.treasury.withdrawnWei
    );
    addCheck("treasuryClaimableWei", "0", payouts.treasury.claimableWei);
    addCheck(
      "causeClaimableWeiAfterWithdrawals",
      "0",
      totalCauseClaimableWei.toString()
    );
    addCheck(
      "causeWithdrawnWei",
      expectedCauseWithdrawnWei,
      totalCauseWithdrawnWei.toString()
    );
    if (withdrawalSummary) {
      addCheck(
        "treasuryWithdrawnAgreeWithHarness",
        withdrawalSummary.treasury.amountWei,
        payouts.treasury.withdrawnWei
      );
      addCheck(
        "causeWithdrawalsAgreeWithHarness",
        withdrawalSummary.causes.totalAmountWei,
        totalCauseWithdrawnWei.toString()
      );
    }
  } else if (scenarioType === "cancelled-underfilled") {
    addCheck("phase", "Cancelled", summary.game.phase);
    addCheck("outcome", "Cancelled", summary.game.outcome);
    addCheck(
      "terminalPath",
      "cancelled-refunds",
      summary.game.terminalOutcome.terminalPath
    );
    addCheck("round", 0, summary.game.round);
    addCheck("aliveCount", joinedCount, summary.game.counts.alive);
    addCheck("refundedCount", joinedCount, summary.game.counts.refunded);
    addCheck(
      "refundPathAvailable",
      true,
      payouts.settlement.refundPathAvailable
    );
    addCheck(
      "refundPerPlayerWei",
      config.entryFeeWei,
      settlement.refundPerPlayerWei
    );
    addCheck(
      "totalRefundedWei",
      (bigintFrom(config.entryFeeWei) * BigInt(joinedCount)).toString(),
      payouts.claims.refunds.totalRefundedWei
    );
    if (refundSummary) {
      addCheck(
        "refundsAgreeWithEvidence",
        refundSummary.totalRefundWei,
        payouts.claims.refunds.totalRefundedWei
      );
    }
  } else if (scenarioType === "no-winner-all-catch") {
    const totalPot = bigintFrom(config.entryFeeWei) * BigInt(joinedCount);
    const creatorFee = (totalPot * BigInt(config.creatorFeeBps)) / 10_000n;
    const postCreatorPot = totalPot - creatorFee;
    const noWinnerCausePool = (postCreatorPot * NO_WINNER_CAUSE_BPS) / 10_000n;
    const distributedCauseWei = buildCauseDistribution(causeAssignments).reduce(
      (sum, entry) =>
        sum +
        (noWinnerCausePool * BigInt(entry.entrantCount)) / BigInt(joinedCount),
      0n
    );
    const treasuryAccruedWei = totalPot - distributedCauseWei;
    const totalCauseClaimableWei = sumDecimalStrings(
      payouts.causes.map((cause) => cause.claimableFromGameWei)
    );
    const totalCauseWithdrawnWei = sumDecimalStrings(
      payouts.causes.map((cause) => cause.withdrawnFromGameWei)
    );

    addCheck("phase", "Ended", summary.game.phase);
    addCheck("outcome", "NoWinners", summary.game.outcome);
    addCheck(
      "terminalPath",
      "no-winner-routing",
      summary.game.terminalOutcome.terminalPath
    );
    addCheck("round", 1, summary.game.round);
    addCheck("aliveCount", 0, summary.game.counts.alive);
    addCheck("winnerCount", 0, settlement.winnerCount);
    addCheck(
      "noWinnerPathAvailable",
      true,
      payouts.settlement.noWinnerPathAvailable
    );
    addCheck(
      "noWinnerCausePoolWei",
      noWinnerCausePool.toString(),
      settlement.noWinnerCausePoolWei
    );
    addCheck(
      "noWinnerCauseDistributedWei",
      distributedCauseWei.toString(),
      settlement.noWinnerCauseDistributedWei
    );
    addCheck(
      "treasuryAccruedWei",
      treasuryAccruedWei.toString(),
      settlement.treasuryAccruedWei
    );
    addCheck(
      "treasuryWithdrawnWei",
      treasuryAccruedWei.toString(),
      payouts.treasury.withdrawnWei
    );
    addCheck("treasuryClaimableWei", "0", payouts.treasury.claimableWei);
    addCheck(
      "causeClaimableWeiAfterWithdrawals",
      "0",
      totalCauseClaimableWei.toString()
    );
    addCheck(
      "causeWithdrawnWei",
      distributedCauseWei.toString(),
      totalCauseWithdrawnWei.toString()
    );
    if (withdrawalSummary) {
      addCheck(
        "treasuryWithdrawnAgreeWithHarness",
        withdrawalSummary.treasury.amountWei,
        payouts.treasury.withdrawnWei
      );
      addCheck(
        "causeWithdrawalsAgreeWithHarness",
        withdrawalSummary.causes.totalAmountWei,
        totalCauseWithdrawnWei.toString()
      );
    }
  } else {
    throw new Error(
      `Unsupported scenarioType '${scenarioType}' for replay consistency.`
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function buildObservedReplayConsistency({
  evidence,
  config,
  claimSummary,
  refundSummary,
  withdrawalSummary,
}) {
  const summary = evidence.summary;
  const payouts = evidence.payouts;
  const settlement = summary.game.settlement;
  const checks = [];
  const joinedCount = summary.game.counts.joined;
  const totalPotWei = (
    bigintFrom(config.entryFeeWei) * BigInt(joinedCount)
  ).toString();

  function addCheck(name, expected, actual) {
    checks.push({
      name,
      expected,
      actual,
      ok: expected === actual,
    });
  }

  addCheck("settlementFinalized", true, settlement.finalized);
  addCheck("totalPotWei", totalPotWei, settlement.totalPotWei);
  addCheck(
    "usedCauses",
    payouts.causes.length,
    summary.game.counts.usedCauses
  );

  if (summary.game.outcome === "Winners") {
    const totalCauseClaimableWei = sumDecimalStrings(
      payouts.causes.map((cause) => cause.claimableFromGameWei)
    );
    addCheck("phase", "Ended", summary.game.phase);
    addCheck("winnerCount", summary.game.counts.alive, settlement.winnerCount);
    addCheck(
      "claimedWinnerCount",
      summary.game.counts.claimed,
      payouts.claims.winners.claimedWinnerCount
    );
    addCheck(
      "grossClaimsAgreeWithEvidence",
      claimSummary.totalGrossPrizeWei,
      payouts.claims.winners.totalGrossClaimedWei
    );
    addCheck("treasuryClaimableWei", "0", payouts.treasury.claimableWei);
    addCheck(
      "causeClaimableWeiAfterWithdrawals",
      "0",
      totalCauseClaimableWei.toString()
    );
    addCheck(
      "treasuryWithdrawnAgreeWithHarness",
      withdrawalSummary.treasury.amountWei,
      payouts.treasury.withdrawnWei
    );
    addCheck(
      "causeWithdrawalsAgreeWithHarness",
      withdrawalSummary.causes.totalAmountWei,
      sumDecimalStrings(
        payouts.causes.map((cause) => cause.withdrawnFromGameWei)
      ).toString()
    );
  } else if (summary.game.outcome === "Cancelled") {
    addCheck("phase", "Cancelled", summary.game.phase);
    addCheck(
      "refundedCount",
      summary.game.counts.refunded,
      payouts.claims.refunds.refundedCount
    );
    addCheck(
      "refundsAgreeWithEvidence",
      refundSummary.totalRefundWei,
      payouts.claims.refunds.totalRefundedWei
    );
  } else if (summary.game.outcome === "NoWinners") {
    addCheck("phase", "Ended", summary.game.phase);
    addCheck("aliveCount", 0, summary.game.counts.alive);
    addCheck("treasuryClaimableWei", "0", payouts.treasury.claimableWei);
    addCheck(
      "causeClaimableWeiAfterWithdrawals",
      "0",
      sumDecimalStrings(
        payouts.causes.map((cause) => cause.claimableFromGameWei)
      ).toString()
    );
    addCheck(
      "treasuryWithdrawnAgreeWithHarness",
      withdrawalSummary.treasury.amountWei,
      payouts.treasury.withdrawnWei
    );
    addCheck(
      "causeWithdrawalsAgreeWithHarness",
      withdrawalSummary.causes.totalAmountWei,
      sumDecimalStrings(
        payouts.causes.map((cause) => cause.withdrawnFromGameWei)
      ).toString()
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

async function deployContracts({
  provider,
  owner,
  verifier,
  treasuryRecipient,
  config,
  tracker,
}) {
  const authRegistryFactory = new ethers.ContractFactory(
    authRegistryArtifact.abi,
    authRegistryArtifact.bytecode.object,
    owner
  );
  const authRegistry = await authRegistryFactory.deploy(
    owner.address,
    verifier.address
  );
  await trackedTx(
    tracker,
    provider,
    {
      action: "deployAuthRegistry",
      phase: "deploy",
    },
    async () => authRegistry.deployTransaction
  );
  await authRegistry.deployed();

  const gameFactory = new ethers.ContractFactory(
    gameArtifact.abi,
    gameArtifact.bytecode.object,
    owner
  );
  const game = await gameFactory.deploy(
    owner.address,
    treasuryRecipient,
    authRegistry.address,
    {
      entryFeeWei: config.entryFeeWei,
      creatorFeeBps: config.creatorFeeBps,
      causeFeeBps: config.causeFeeBps,
      joinDurationSeconds: config.joinDurationSeconds,
      commitDurationBlocks: config.commitDurationBlocks,
      revealDurationBlocks: config.revealDurationBlocks,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      maxCauses: config.maxCauses,
    }
  );
  await trackedTx(
    tracker,
    provider,
    {
      action: "deployGame",
      phase: "deploy",
    },
    async () => game.deployTransaction
  );
  await game.deployed();

  return {
    authRegistry,
    game,
    treasuryRecipient,
  };
}

async function whitelistCauses({ provider, game, causeDefinitions, tracker }) {
  for (const cause of causeDefinitions) {
    await trackedTx(
      tracker,
      provider,
      {
        action: "whitelistCause",
        phase: "bootstrap",
        causeId: cause.causeId,
      },
      async () =>
        game.whitelistCause(cause.causeId, cause.recipient, cause.metadataHash)
    );
  }
}

async function registerPlayers({
  provider,
  authRegistry,
  verifier,
  players,
  concurrency,
  tracker,
}) {
  const permits = await Promise.all(
    players.map((player) =>
      buildAndSignAuthPermit({
        provider,
        registry: authRegistry.address,
        wallet: player.wallet.address,
        agentKeyText: `load-agent-${player.index}`,
        manifestUri: `manifest://load-harness/player-${player.index}`,
        nonceText: `load-permit-${player.index}`,
        verifierPrivateKey: verifier.privateKey,
        allowUnsafePrivateKey: true,
      })
    )
  );

  const registrationResults = await mapConcurrent(
    players,
    concurrency,
    async (player, index) =>
      trackedTx(
        tracker,
        provider,
        {
          action: "authRegister",
          phase: "bootstrap",
          wallet: player.wallet.address,
        },
        async () =>
          registerSignedPermit({
            provider,
            bundle: permits[index],
            walletPrivateKey: player.wallet.privateKey,
            allowUnsafePrivateKey: true,
          })
      )
  );

  const failures = registrationResults.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(
      `Auth registration failed for ${
        failures.length
      } player(s). First failure: ${describeError(failures[0].error)}`
    );
  }

  return registrationResults.map((result) => result.value);
}

async function runGameBatch({
  items,
  concurrency,
  actionName,
  provider,
  tracker,
  buildMeta,
  operation,
}) {
  const batchResults = await mapConcurrent(
    items,
    concurrency,
    async (item, index) =>
      trackedTx(tracker, provider, buildMeta(item, index), async () =>
        operation(item, index)
      )
  );

  const failures = batchResults.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(
      `${actionName} batch failed for ${
        failures.length
      } item(s). First failure: ${describeError(failures[0].error)}`
    );
  }

  return batchResults.map((result) => result.value);
}

async function runAvailableWithdrawals({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  gameId,
  scenarioType,
  causeIds,
  concurrency,
  tracker,
  expectedFailures,
  skippedExpectedFailures,
}) {
  let treasuryWithdrawal = null;
  let causeWithdrawalResults = [];

  const treasuryClaimableWei = bigintFrom(
    await gameReader.treasuryClaimableAmount(gameId),
    "treasuryClaimableWei"
  );
  if (treasuryClaimableWei > 0n) {
    treasuryWithdrawal = await trackedTx(
      tracker,
      provider,
      {
        action: "withdrawTreasury",
        phase: "settlement",
        scenarioType,
        gameIndex,
        gameId,
        wallet: owner.address,
      },
      async () =>
        withdrawTreasuryAction({
          provider,
          game: gameAddress,
          gameId,
          wallet: owner.address,
          walletPrivateKey: owner.privateKey,
          allowUnsafePrivateKey: true,
        })
    );
  }

  const withdrawableCauses = [];
  for (const causeId of [...new Set(causeIds)].sort((a, b) => a - b)) {
    const claimableWei = bigintFrom(
      await gameReader.gameCauseClaimableAmount(gameId, causeId),
      `cause-${causeId}.claimableWei`
    );
    if (claimableWei > 0n) {
      withdrawableCauses.push({ causeId });
    }
  }

  if (withdrawableCauses.length > 0) {
    causeWithdrawalResults = await runGameBatch({
      items: withdrawableCauses,
      concurrency: 1,
      actionName: "withdraw-cause",
      provider,
      tracker,
      buildMeta: (cause) => ({
        action: "withdrawCause",
        phase: "settlement",
        scenarioType,
        gameIndex,
        gameId,
        wallet: owner.address,
        causeId: cause.causeId,
      }),
      operation: (cause) =>
        withdrawCauseAction({
          provider,
          game: gameAddress,
          gameId,
          causeId: cause.causeId,
          wallet: owner.address,
          walletPrivateKey: owner.privateKey,
          allowUnsafePrivateKey: true,
        }),
    });
  }

  if (expectedFailures) {
    if (treasuryWithdrawal) {
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "withdrawTreasury",
          phase: "settlement",
          scenarioType,
          failureLabel: "duplicate-withdraw-treasury",
          gameIndex,
          gameId,
          wallet: owner.address,
        },
        async () =>
          withdrawTreasuryAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: owner.address,
            walletPrivateKey: owner.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
    } else {
      skippedExpectedFailures.push(
        "duplicate-withdraw-treasury(no treasury withdrawal)"
      );
    }

    if (causeWithdrawalResults.length > 0) {
      const duplicateCause = causeWithdrawalResults[0].causeId;
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "withdrawCause",
          phase: "settlement",
          scenarioType,
          failureLabel: "duplicate-withdraw-cause",
          gameIndex,
          gameId,
          wallet: owner.address,
          causeId: duplicateCause,
        },
        async () =>
          withdrawCauseAction({
            provider,
            game: gameAddress,
            gameId,
            causeId: duplicateCause,
            wallet: owner.address,
            walletPrivateKey: owner.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
    } else {
      skippedExpectedFailures.push(
        "duplicate-withdraw-cause(no cause withdrawal)"
      );
    }
  }

  return {
    treasuryWithdrawal,
    causeWithdrawalResults,
  };
}

function connectGameWithSigner(gameAddress, wallet) {
  return new ethers.Contract(gameAddress, gameArtifact.abi, wallet);
}

async function sendRawGameTx({
  gameAddress,
  wallet,
  method,
  args = [],
  overrides = {},
}) {
  const connectedGame = connectGameWithSigner(gameAddress, wallet);
  return connectedGame[method](...args, {
    gasLimit: overrides.gasLimit ?? 1_500_000,
    ...overrides,
  });
}

async function maybeTrackProbe({
  enabled,
  tracker,
  provider,
  meta,
  operation,
  skippedProbes,
  skipReason,
}) {
  if (!enabled) {
    if (skippedProbes && skipReason) {
      skippedProbes.push(skipReason);
    }
    return {
      skipped: true,
    };
  }

  return trackedExpectedFailure(
    tracker,
    provider,
    {
      ...meta,
      expectation: "probe",
    },
    operation
  );
}

function buildGameExecutionPlan({
  players,
  scenarioType,
  config,
  gameIndex,
  seed,
  underfilledRate,
}) {
  if (scenarioType === "cancelled-underfilled") {
    const joinedCount = Math.min(
      players.length,
      Math.max(1, config.minPlayers - 1)
    );
    return {
      joinedPlayers: players.slice(0, joinedCount),
      joinOrder: players.slice(0, joinedCount),
      nonJoinedPlayers: players.slice(joinedCount),
      plan: {
        underfilledIntent: true,
        joinedCount,
      },
    };
  }

  if (scenarioType === "adversarial-random") {
    const roster = deterministicShuffle(players, {
      seed,
      stage: "adversarial-roster",
      gameIndex,
      keyFn: (player) => player.wallet.address.toLowerCase(),
    });
    const underfilledIntent = shouldSample({
      seed,
      stage: "adversarial-underfilled",
      gameIndex,
      round: 0,
      playerIndex: 0,
      wallet: "roster",
      rate: underfilledRate,
    });
    const joinedCount = underfilledIntent
      ? sampleIntegerInRange({
          seed,
          stage: "adversarial-underfilled-count",
          gameIndex,
          min: 1,
          max: Math.max(1, config.minPlayers - 1),
        })
      : sampleIntegerInRange({
          seed,
          stage: "adversarial-started-count",
          gameIndex,
          min: config.minPlayers,
          max: players.length,
        });
    const joinedPlayers = roster.slice(0, joinedCount);
    return {
      joinedPlayers,
      joinOrder: deterministicShuffle(joinedPlayers, {
        seed,
        stage: "adversarial-join-order",
        gameIndex,
        keyFn: (player) => player.wallet.address.toLowerCase(),
      }),
      nonJoinedPlayers: roster.slice(joinedCount),
      plan: {
        underfilledIntent,
        joinedCount,
        selectedPlayerIndexes: joinedPlayers.map((player) => player.index),
      },
    };
  }

  return {
    joinedPlayers: [...players],
    joinOrder: [...players],
    nonJoinedPlayers: [],
    plan: {
      underfilledIntent: false,
      joinedCount: players.length,
    },
  };
}

async function loadAlivePlayers(gameReader, gameId, players) {
  const playerStates = await Promise.all(
    players.map(async (player) => ({
      player,
      state: await gameReader.getPlayer(gameId, player.wallet.address),
    }))
  );

  return playerStates
    .filter(({ state }) => Boolean(state.joined) && Boolean(state.alive))
    .map(({ player }) => player);
}

function buildRoundPlayerPlans({
  players,
  scenarioType,
  gameIndex,
  round,
  seed,
  fixedChoice = null,
  choiceWeights,
  skipCommitRate,
  skipRevealRate,
  invalidRevealRate,
}) {
  const orderedPlayers = deterministicShuffle(players, {
    seed,
    stage: `${scenarioType}-round-order`,
    gameIndex,
    round,
    keyFn: (player) => player.wallet.address.toLowerCase(),
  });

  return orderedPlayers.map((player) => {
    const choice =
      fixedChoice ??
      pickWeightedChoice({
        seed,
        stage: `${scenarioType}-choice`,
        gameIndex,
        round,
        playerIndex: player.index,
        wallet: player.wallet.address,
        weights: choiceWeights,
      });
    const skipCommit = shouldSample({
      seed,
      stage: `${scenarioType}-skip-commit`,
      gameIndex,
      round,
      playerIndex: player.index,
      wallet: player.wallet.address,
      rate: skipCommitRate,
    });
    const skipReveal = skipCommit
      ? false
      : shouldSample({
          seed,
          stage: `${scenarioType}-skip-reveal`,
          gameIndex,
          round,
          playerIndex: player.index,
          wallet: player.wallet.address,
          rate: skipRevealRate,
        });
    const invalidRevealBeforeValid = skipCommit
      ? false
      : shouldSample({
          seed,
          stage: `${scenarioType}-invalid-reveal`,
          gameIndex,
          round,
          playerIndex: player.index,
          wallet: player.wallet.address,
          rate: invalidRevealRate,
        });

    return {
      player,
      choice,
      skipCommit,
      skipReveal,
      invalidRevealBeforeValid,
    };
  });
}

async function runPlannedRound({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  gameId,
  playerPlans,
  concurrency,
  seed,
  tracker,
  scenarioType,
  expectedFailures,
  skippedExpectedFailures,
  enableAdversarialProbes = false,
  probeRate = 0,
  skippedProbes = [],
}) {
  const snapshotBeforeRound = normalizeSnapshot(
    await gameReader.getGame(gameId)
  );
  if (snapshotBeforeRound.phase !== "Commit") {
    throw new Error(
      `Game ${gameId} is in phase ${snapshotBeforeRound.phase}, not Commit.`
    );
  }

  const round = snapshotBeforeRound.round;
  const roundStartedMs = Date.now();
  const committedPlans = playerPlans.filter((plan) => !plan.skipCommit);
  const skippedCommitPlans = playerPlans.filter((plan) => plan.skipCommit);
  const skippedCommitWallets = skippedCommitPlans.map(
    (plan) => plan.player.wallet.address
  );
  const invalidRevealPlans = playerPlans.filter(
    (plan) => !plan.skipCommit && !plan.skipReveal && plan.invalidRevealBeforeValid
  );

  const preparedBundles = await Promise.all(
    committedPlans.map((plan) =>
      prepareCommitAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: plan.player.wallet.address,
        choice: plan.choice,
        saltText: `game-${gameIndex}-round-${round}-player-${plan.player.index}-${plan.choice}`,
      })
    )
  );
  const bundleByWallet = new Map(
    preparedBundles.map((bundle) => [bundle.wallet.toLowerCase(), bundle])
  );

  const commitStartedMs = Date.now();
  await runGameBatch({
    items: committedPlans,
    concurrency,
    actionName: "commit",
    provider,
    tracker,
    buildMeta: (plan) => ({
      action: "commit",
      phase: "commit",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: plan.player.wallet.address,
    }),
    operation: (plan) =>
      commitAction({
        provider,
        game: gameAddress,
        gameId,
        commitment: bundleByWallet.get(plan.player.wallet.address.toLowerCase())
          .commitment,
        wallet: plan.player.wallet.address,
        walletPrivateKey: plan.player.wallet.privateKey,
        allowUnsafePrivateKey: true,
      }),
  });

  if (expectedFailures) {
    if (committedPlans.length > 0) {
      const duplicateCommitPlan = committedPlans[0];
      const bundle = bundleByWallet.get(
        duplicateCommitPlan.player.wallet.address.toLowerCase()
      );
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "commit",
          phase: "commit",
          scenarioType,
          failureLabel: "duplicate-commit",
          gameIndex,
          gameId,
          round,
          wallet: duplicateCommitPlan.player.wallet.address,
        },
        async () =>
          sendRawGameTx({
            gameAddress,
            wallet: duplicateCommitPlan.player.wallet,
            method: "commit",
            args: [bundle.commitment],
          })
      );
    } else {
      skippedExpectedFailures.push(
        `round-${round}:duplicate-commit(no committed player)`
      );
    }
  }

  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      playerPlans.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-claim-during-commit",
        gameIndex,
        round,
        playerIndex: 0,
        wallet: playerPlans[0].player.wallet.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "claim",
      phase: "commit",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: playerPlans[0]?.player.wallet.address ?? null,
      failureLabel: "claim-during-commit",
      probeKind: "invalid-phase",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: playerPlans[0].player.wallet,
        method: "claim",
        args: [gameId],
      }),
    skippedProbes,
    skipReason: `round-${round}:claim-during-commit probe skipped`,
  });

  let manualBlocksMined = 0;
  let commitDeadlineHit = false;
  if (skippedCommitPlans.length > 0) {
    const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
    manualBlocksMined += await minePastBlock(
      provider,
      snapshot.commitDeadlineBlock
    );
    commitDeadlineHit = true;

    const lateCommitPlan = skippedCommitPlans[0];
    const lateBundle = await prepareCommitAction({
      provider,
      game: gameAddress,
      gameId,
      wallet: lateCommitPlan.player.wallet.address,
      choice: lateCommitPlan.choice,
      saltText: `late-game-${gameIndex}-round-${round}-player-${lateCommitPlan.player.index}`,
    });
    await maybeTrackProbe({
      enabled:
        enableAdversarialProbes &&
        shouldSample({
          seed,
          stage: "probe-late-commit",
          gameIndex,
          round,
          playerIndex: lateCommitPlan.player.index,
          wallet: lateCommitPlan.player.wallet.address,
          rate: probeRate,
        }),
      tracker,
      provider,
      meta: {
        action: "commit",
        phase: "commit",
        scenarioType,
        gameIndex,
        gameId,
        round,
        wallet: lateCommitPlan.player.wallet.address,
        failureLabel: "late-commit-after-deadline",
        probeKind: "late-action",
      },
      operation: async () =>
        sendRawGameTx({
          gameAddress,
          wallet: lateCommitPlan.player.wallet,
          method: "commit",
          args: [lateBundle.commitment],
        }),
      skippedProbes,
      skipReason: `round-${round}:late-commit probe skipped`,
    });
  }

  const commitAdvanceResult = await trackedTx(
    tracker,
    provider,
    {
      action: "advanceFromCommit",
      phase: "commit",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: owner.address,
    },
    async () =>
      advancePhaseAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: owner.address,
        walletPrivateKey: owner.privateKey,
        allowUnsafePrivateKey: true,
      })
  );
  const commitDurationMs = Date.now() - commitStartedMs;

  const revealPlans = committedPlans.filter((plan) => !plan.skipReveal);
  const skippedRevealPlans = committedPlans.filter((plan) => plan.skipReveal);
  const skippedRevealWallets = skippedRevealPlans.map(
    (plan) => plan.player.wallet.address
  );

  for (const invalidPlan of invalidRevealPlans) {
    const bundle = bundleByWallet.get(
      invalidPlan.player.wallet.address.toLowerCase()
    );
    await maybeTrackProbe({
      enabled: enableAdversarialProbes,
      tracker,
      provider,
      meta: {
        action: "reveal",
        phase: "reveal",
        scenarioType,
        gameIndex,
        gameId,
        round,
        wallet: invalidPlan.player.wallet.address,
        failureLabel: "wrong-reveal-preimage",
        probeKind: "wrong-preimage",
      },
      operation: async () =>
        sendRawGameTx({
          gameAddress,
          wallet: invalidPlan.player.wallet,
          method: "reveal",
          args: [
            bundle.choiceCode,
            mutateSalt(bundle.salt, `wrong-reveal-${gameIndex}-${round}`),
          ],
        }),
      skippedProbes,
      skipReason: `round-${round}:wrong-reveal-preimage probe skipped`,
    });
  }

  const revealStartedMs = Date.now();
  await runGameBatch({
    items: revealPlans,
    concurrency,
    actionName: "reveal",
    provider,
    tracker,
    buildMeta: (plan) => ({
      action: "reveal",
      phase: "reveal",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: plan.player.wallet.address,
    }),
    operation: (plan) => {
      const bundle = bundleByWallet.get(plan.player.wallet.address.toLowerCase());
      return revealAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: plan.player.wallet.address,
        walletPrivateKey: plan.player.wallet.privateKey,
        allowUnsafePrivateKey: true,
        choice: bundle.choice,
        salt: bundle.salt,
      });
    },
  });

  if (expectedFailures) {
    if (revealPlans.length > 0) {
      const duplicateRevealPlan = revealPlans[0];
      const bundle = bundleByWallet.get(
        duplicateRevealPlan.player.wallet.address.toLowerCase()
      );
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "reveal",
          phase: "reveal",
          scenarioType,
          failureLabel: "duplicate-reveal",
          gameIndex,
          gameId,
          round,
          wallet: duplicateRevealPlan.player.wallet.address,
        },
        async () =>
          sendRawGameTx({
            gameAddress,
            wallet: duplicateRevealPlan.player.wallet,
            method: "reveal",
            args: [bundle.choiceCode, bundle.salt],
          })
      );
    } else {
      skippedExpectedFailures.push(
        `round-${round}:duplicate-reveal(no revealed player)`
      );
    }
  }

  let revealDeadlineHit = false;
  if (skippedRevealPlans.length > 0) {
    const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
    manualBlocksMined += await minePastBlock(
      provider,
      snapshot.revealDeadlineBlock
    );
    revealDeadlineHit = true;

    const lateRevealPlan = skippedRevealPlans[0];
    const bundle = bundleByWallet.get(
      lateRevealPlan.player.wallet.address.toLowerCase()
    );
    await maybeTrackProbe({
      enabled:
        enableAdversarialProbes &&
        shouldSample({
          seed,
          stage: "probe-late-reveal",
          gameIndex,
          round,
          playerIndex: lateRevealPlan.player.index,
          wallet: lateRevealPlan.player.wallet.address,
          rate: probeRate,
        }),
      tracker,
      provider,
      meta: {
        action: "reveal",
        phase: "reveal",
        scenarioType,
        gameIndex,
        gameId,
        round,
        wallet: lateRevealPlan.player.wallet.address,
        failureLabel: "late-reveal-after-deadline",
        probeKind: "late-action",
      },
      operation: async () =>
        sendRawGameTx({
          gameAddress,
          wallet: lateRevealPlan.player.wallet,
          method: "reveal",
          args: [bundle.choiceCode, bundle.salt],
        }),
      skippedProbes,
      skipReason: `round-${round}:late-reveal probe skipped`,
    });
  }

  const revealAdvanceResult = await trackedTx(
    tracker,
    provider,
    {
      action: "advanceFromReveal",
      phase: "reveal",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: owner.address,
    },
    async () =>
      advancePhaseAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: owner.address,
        walletPrivateKey: owner.privateKey,
        allowUnsafePrivateKey: true,
      })
  );
  const revealDurationMs = Date.now() - revealStartedMs;

  return {
    manualBlocksMined,
    skippedCommits: skippedCommitWallets.length,
    skippedReveals: skippedRevealWallets.length,
    commitDeadlineHit,
    revealDeadlineHit,
    revealAdvanceResult,
    roundReport: {
      round,
      wallClockMs: Date.now() - roundStartedMs,
      choicePlan: {
        activePlayers: playerPlans.length,
        intendedCounts: countChoiceValues(playerPlans.map((plan) => plan.choice)),
        committedCounts: countChoiceValues(
          committedPlans.map((plan) => plan.choice)
        ),
        revealedCounts: countChoiceValues(revealPlans.map((plan) => plan.choice)),
      },
      commit: {
        submitted: committedPlans.length,
        skipped: skippedCommitWallets.length,
        skippedWallets: skippedCommitWallets,
        deadlineHit: commitDeadlineHit,
        durationMs: commitDurationMs,
        advanceResult: {
          phase: commitAdvanceResult.phase,
          outcome: commitAdvanceResult.outcome,
          round: commitAdvanceResult.round,
        },
      },
      reveal: {
        submitted: revealPlans.length,
        skipped: skippedRevealWallets.length,
        skippedWallets: skippedRevealWallets,
        invalidRevealAttempts: invalidRevealPlans.length,
        deadlineHit: revealDeadlineHit,
        durationMs: revealDurationMs,
        advanceResult: {
          phase: revealAdvanceResult.phase,
          outcome: revealAdvanceResult.outcome,
          round: revealAdvanceResult.round,
          shareStreak: revealAdvanceResult.shareStreak,
        },
      },
    },
  };
}

function pickDeterministicCandidate(candidates, { seed, stage, gameIndex, step }) {
  if (candidates.length === 0) {
    return null;
  }
  const index = sampleIntegerInRange({
    seed,
    stage,
    gameIndex,
    round: step,
    min: 0,
    max: candidates.length - 1,
  });
  return candidates[index];
}

function buildProbeSummary(entries) {
  const probeEntries = entries.filter((entry) => entry.expectation === "probe");
  return {
    attempted: probeEntries.length,
    failedAsExpected: probeEntries.filter(
      (entry) => entry.status === "failed" && entry.failureClass === "expected"
    ).length,
    unexpectedSuccesses: probeEntries.filter(
      (entry) => entry.failureClass === "unexpected-success"
    ).length,
    onchainReverts: probeEntries.filter(
      (entry) => entry.status === "failed" && entry.failureTransport === "onchain-revert"
    ).length,
    localRejections: probeEntries.filter(
      (entry) => entry.status === "failed" && entry.failureTransport === "local-rejection"
    ).length,
    byKind: groupCount(probeEntries, (entry) => entry.probeKind ?? "(none)"),
    byAction: groupCount(probeEntries, (entry) => entry.action),
    byPhase: groupCount(probeEntries, (entry) => entry.phase),
  };
}

async function runWinnerSettlement({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  gameId,
  joinedPlayers,
  causeIds,
  concurrency,
  tracker,
  expectedFailures,
  skippedExpectedFailures,
  seed,
  enableAdversarialProbes = false,
  probeRate = 0,
  skippedProbes = [],
}) {
  const winnerPlayers = await loadAlivePlayers(gameReader, gameId, joinedPlayers);
  const claimResults = [];
  const causeWithdrawalResults = [];
  let treasuryWithdrawal = null;
  let step = 0;

  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      winnerPlayers.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-refund-on-winner",
        gameIndex,
        round: 0,
        playerIndex: winnerPlayers[0].index,
        wallet: winnerPlayers[0].wallet.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "refund",
      phase: "settlement",
      scenarioType: "adversarial-random",
      gameIndex,
      gameId,
      wallet: winnerPlayers[0]?.wallet.address ?? null,
      failureLabel: "refund-on-winner-game",
      probeKind: "invalid-path",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: winnerPlayers[0].wallet,
        method: "claimRefund",
        args: [gameId],
      }),
    skippedProbes,
    skipReason: "winner-settlement:refund probe skipped",
  });

  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      causeIds.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-early-cause-withdraw",
        gameIndex,
        round: 0,
        playerIndex: 0,
        wallet: owner.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "withdrawCause",
      phase: "settlement",
      scenarioType: "adversarial-random",
      gameIndex,
      gameId,
      wallet: owner.address,
      causeId: causeIds[0] ?? null,
      failureLabel: "early-cause-withdraw-before-claims",
      probeKind: "settlement-ordering",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: owner,
        method: "withdrawCause",
        args: [gameId, causeIds[0]],
      }),
    skippedProbes,
    skipReason: "winner-settlement:early cause withdraw probe skipped",
  });

  while (true) {
    const candidates = [];
    for (const player of winnerPlayers) {
      const preview = await gameReader.previewWinnerClaim(gameId, player.wallet.address);
      if (preview.availableNow) {
        candidates.push({
          type: "claim",
          player,
        });
      }
    }

    const treasuryClaimableWei = bigintFrom(
      await gameReader.treasuryClaimableAmount(gameId),
      "winnerSettlement.treasuryClaimableWei"
    );
    if (treasuryClaimableWei > 0n) {
      candidates.push({ type: "withdrawTreasury" });
    }

    for (const causeId of [...new Set(causeIds)].sort((a, b) => a - b)) {
      const claimableWei = bigintFrom(
        await gameReader.gameCauseClaimableAmount(gameId, causeId),
        `winnerSettlement.cause-${causeId}.claimableWei`
      );
      if (claimableWei > 0n) {
        candidates.push({ type: "withdrawCause", causeId });
      }
    }

    const selected = pickDeterministicCandidate(candidates, {
      seed,
      stage: "winner-settlement-step",
      gameIndex,
      step,
    });
    if (!selected) {
      break;
    }

    if (selected.type === "claim") {
      const result = await trackedTx(
        tracker,
        provider,
        {
          action: "claim",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: selected.player.wallet.address,
        },
        async () =>
          claimAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: selected.player.wallet.address,
            walletPrivateKey: selected.player.wallet.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
      claimResults.push(result);

      await maybeTrackProbe({
        enabled:
          enableAdversarialProbes &&
          shouldSample({
            seed,
            stage: "probe-duplicate-claim",
            gameIndex,
            round: step,
            playerIndex: selected.player.index,
            wallet: selected.player.wallet.address,
            rate: probeRate,
          }),
        tracker,
        provider,
        meta: {
          action: "claim",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: selected.player.wallet.address,
          failureLabel: "duplicate-claim-after-success",
          probeKind: "duplicate-follow-up",
        },
        operation: async () =>
          sendRawGameTx({
            gameAddress,
            wallet: selected.player.wallet,
            method: "claim",
            args: [gameId],
          }),
        skippedProbes,
        skipReason: "winner-settlement:duplicate claim probe skipped",
      });
    } else if (selected.type === "withdrawTreasury") {
      treasuryWithdrawal = await trackedTx(
        tracker,
        provider,
        {
          action: "withdrawTreasury",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: owner.address,
        },
        async () =>
          withdrawTreasuryAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: owner.address,
            walletPrivateKey: owner.privateKey,
            allowUnsafePrivateKey: true,
          })
      );

      await maybeTrackProbe({
        enabled:
          enableAdversarialProbes &&
          shouldSample({
            seed,
            stage: "probe-duplicate-withdraw-treasury",
            gameIndex,
            round: step,
            playerIndex: 0,
            wallet: owner.address,
            rate: probeRate,
          }),
        tracker,
        provider,
        meta: {
          action: "withdrawTreasury",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: owner.address,
          failureLabel: "duplicate-withdraw-treasury-after-success",
          probeKind: "duplicate-follow-up",
        },
        operation: async () =>
          sendRawGameTx({
            gameAddress,
            wallet: owner,
            method: "withdrawTreasury",
            args: [gameId],
          }),
        skippedProbes,
        skipReason: "winner-settlement:duplicate treasury withdraw probe skipped",
      });
    } else if (selected.type === "withdrawCause") {
      const result = await trackedTx(
        tracker,
        provider,
        {
          action: "withdrawCause",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: owner.address,
          causeId: selected.causeId,
        },
        async () =>
          withdrawCauseAction({
            provider,
            game: gameAddress,
            gameId,
            causeId: selected.causeId,
            wallet: owner.address,
            walletPrivateKey: owner.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
      causeWithdrawalResults.push(result);

      await maybeTrackProbe({
        enabled:
          enableAdversarialProbes &&
          shouldSample({
            seed,
            stage: "probe-duplicate-withdraw-cause",
            gameIndex,
            round: step,
            playerIndex: 0,
            wallet: owner.address,
            rate: probeRate,
            extra: `cause-${selected.causeId}`,
          }),
        tracker,
        provider,
        meta: {
          action: "withdrawCause",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: owner.address,
          causeId: selected.causeId,
          failureLabel: "duplicate-withdraw-cause-after-success",
          probeKind: "duplicate-follow-up",
        },
        operation: async () =>
          sendRawGameTx({
            gameAddress,
            wallet: owner,
            method: "withdrawCause",
            args: [gameId, selected.causeId],
          }),
        skippedProbes,
        skipReason: "winner-settlement:duplicate cause withdraw probe skipped",
      });
    }

    step += 1;
  }

  const remainingWinnerPlayers = [];
  for (const player of winnerPlayers) {
    const preview = await gameReader.previewWinnerClaim(gameId, player.wallet.address);
    if (preview.availableNow) {
      remainingWinnerPlayers.push(player);
    }
  }
  if (remainingWinnerPlayers.length > 0) {
    claimResults.push(
      ...(await runGameBatch({
        items: remainingWinnerPlayers,
        concurrency,
        actionName: "claim",
        provider,
        tracker,
        buildMeta: (player) => ({
          action: "claim",
          phase: "settlement",
          scenarioType: "adversarial-random",
          gameIndex,
          gameId,
          wallet: player.wallet.address,
        }),
        operation: (player) =>
          claimAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: player.wallet.address,
            walletPrivateKey: player.wallet.privateKey,
            allowUnsafePrivateKey: true,
          }),
      }))
    );
  }

  const remainingWithdrawals = await runAvailableWithdrawals({
    provider,
    owner,
    gameReader,
    gameAddress,
    gameIndex,
    gameId,
    scenarioType: "adversarial-random",
    causeIds,
    concurrency,
    tracker,
    expectedFailures,
    skippedExpectedFailures,
  });
  treasuryWithdrawal = treasuryWithdrawal ?? remainingWithdrawals.treasuryWithdrawal;
  causeWithdrawalResults.push(...remainingWithdrawals.causeWithdrawalResults);

  return {
    claimResults,
    refundResults: [],
    treasuryWithdrawal,
    causeWithdrawalResults,
  };
}

async function runCancelledSettlement({
  provider,
  owner,
  gameAddress,
  gameIndex,
  gameId,
  joinedPlayers,
  concurrency,
  tracker,
  expectedFailures,
  skippedExpectedFailures,
  seed,
  enableAdversarialProbes = false,
  probeRate = 0,
  skippedProbes = [],
}) {
  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      joinedPlayers.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-claim-on-cancelled",
        gameIndex,
        round: 0,
        playerIndex: joinedPlayers[0].index,
        wallet: joinedPlayers[0].wallet.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "claim",
      phase: "settlement",
      scenarioType: "adversarial-random",
      gameIndex,
      gameId,
      wallet: joinedPlayers[0]?.wallet.address ?? null,
      failureLabel: "claim-on-cancelled-game",
      probeKind: "invalid-path",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: joinedPlayers[0].wallet,
        method: "claim",
        args: [gameId],
      }),
    skippedProbes,
    skipReason: "cancelled-settlement:claim probe skipped",
  });

  const orderedRefundPlayers = deterministicShuffle(joinedPlayers, {
    seed,
    stage: "cancelled-refund-order",
    gameIndex,
    keyFn: (player) => player.wallet.address.toLowerCase(),
  });
  const refundResults = await runGameBatch({
    items: orderedRefundPlayers,
    concurrency,
    actionName: "refund",
    provider,
    tracker,
    buildMeta: (player) => ({
      action: "refund",
      phase: "settlement",
      scenarioType: enableAdversarialProbes ? "adversarial-random" : "cancelled-underfilled",
      gameIndex,
      gameId,
      wallet: player.wallet.address,
    }),
    operation: (player) =>
      refundAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: player.wallet.address,
        walletPrivateKey: player.wallet.privateKey,
        allowUnsafePrivateKey: true,
      }),
  });

  if (expectedFailures) {
    if (orderedRefundPlayers.length > 0) {
      const duplicateRefundPlayer = orderedRefundPlayers[0];
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "refund",
          phase: "settlement",
          scenarioType: enableAdversarialProbes ? "adversarial-random" : "cancelled-underfilled",
          failureLabel: "duplicate-refund",
          gameIndex,
          gameId,
          wallet: duplicateRefundPlayer.wallet.address,
        },
        async () =>
          sendRawGameTx({
            gameAddress,
            wallet: duplicateRefundPlayer.wallet,
            method: "claimRefund",
            args: [gameId],
          })
      );
    } else {
      skippedExpectedFailures.push("duplicate-refund(no refunded player)");
    }
  }

  return {
    claimResults: [],
    refundResults,
    treasuryWithdrawal: null,
    causeWithdrawalResults: [],
  };
}

async function runNoWinnerSettlement({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  gameId,
  joinedPlayers,
  causeIds,
  concurrency,
  tracker,
  expectedFailures,
  skippedExpectedFailures,
  seed,
  enableAdversarialProbes = false,
  probeRate = 0,
  skippedProbes = [],
}) {
  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      joinedPlayers.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-claim-on-no-winner",
        gameIndex,
        round: 0,
        playerIndex: joinedPlayers[0].index,
        wallet: joinedPlayers[0].wallet.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "claim",
      phase: "settlement",
      scenarioType: "adversarial-random",
      gameIndex,
      gameId,
      wallet: joinedPlayers[0]?.wallet.address ?? null,
      failureLabel: "claim-on-no-winner-game",
      probeKind: "invalid-path",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: joinedPlayers[0].wallet,
        method: "claim",
        args: [gameId],
      }),
    skippedProbes,
    skipReason: "no-winner-settlement:claim probe skipped",
  });

  let treasuryWithdrawal = null;
  const causeWithdrawalResults = [];
  let step = 0;
  while (true) {
    const candidates = [];
    const treasuryClaimableWei = bigintFrom(
      await gameReader.treasuryClaimableAmount(gameId),
      "noWinnerSettlement.treasuryClaimableWei"
    );
    if (treasuryClaimableWei > 0n) {
      candidates.push({ type: "withdrawTreasury" });
    }

    for (const causeId of [...new Set(causeIds)].sort((a, b) => a - b)) {
      const claimableWei = bigintFrom(
        await gameReader.gameCauseClaimableAmount(gameId, causeId),
        `noWinnerSettlement.cause-${causeId}.claimableWei`
      );
      if (claimableWei > 0n) {
        candidates.push({ type: "withdrawCause", causeId });
      }
    }

    const selected = pickDeterministicCandidate(candidates, {
      seed,
      stage: "no-winner-settlement-step",
      gameIndex,
      step,
    });
    if (!selected) {
      break;
    }

    if (selected.type === "withdrawTreasury") {
      treasuryWithdrawal = await trackedTx(
        tracker,
        provider,
        {
          action: "withdrawTreasury",
          phase: "settlement",
          scenarioType: enableAdversarialProbes ? "adversarial-random" : "no-winner-all-catch",
          gameIndex,
          gameId,
          wallet: owner.address,
        },
        async () =>
          withdrawTreasuryAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: owner.address,
            walletPrivateKey: owner.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
    } else {
      causeWithdrawalResults.push(
        await trackedTx(
          tracker,
          provider,
          {
            action: "withdrawCause",
            phase: "settlement",
            scenarioType: enableAdversarialProbes ? "adversarial-random" : "no-winner-all-catch",
            gameIndex,
            gameId,
            wallet: owner.address,
            causeId: selected.causeId,
          },
          async () =>
            withdrawCauseAction({
              provider,
              game: gameAddress,
              gameId,
              causeId: selected.causeId,
              wallet: owner.address,
              walletPrivateKey: owner.privateKey,
              allowUnsafePrivateKey: true,
            })
        )
      );
    }

    step += 1;
  }

  const remainingWithdrawals = await runAvailableWithdrawals({
    provider,
    owner,
    gameReader,
    gameAddress,
    gameIndex,
    gameId,
    scenarioType: enableAdversarialProbes ? "adversarial-random" : "no-winner-all-catch",
    causeIds,
    concurrency,
    tracker,
    expectedFailures,
    skippedExpectedFailures,
  });
  treasuryWithdrawal = treasuryWithdrawal ?? remainingWithdrawals.treasuryWithdrawal;
  causeWithdrawalResults.push(...remainingWithdrawals.causeWithdrawalResults);

  return {
    claimResults: [],
    refundResults: [],
    treasuryWithdrawal,
    causeWithdrawalResults,
  };
}

async function buildBreakageChecks({
  gameReader,
  gameId,
  evidence,
  claimDrainIntended,
}) {
  const onchainSnapshot = normalizeSnapshot(await gameReader.getGame(gameId));
  const activeGameId = toNumber(await gameReader.activeGameId(), "activeGameId");
  const currentGameId = toNumber(await gameReader.currentGameId(), "currentGameId");
  const payouts = evidence.payouts;
  const evidenceGame = evidence.summary.game;
  const checks = [];

  function addCheck(category, name, expected, actual) {
    checks.push({
      category,
      name,
      expected,
      actual,
      ok: expected === actual,
    });
  }

  addCheck("slot", "activeGameIdCleared", 0, activeGameId);
  addCheck("slot", "currentGameIdAtLeastGameId", true, currentGameId >= gameId);
  addCheck("terminal", "phaseMatchesEvidence", evidenceGame.phase, onchainSnapshot.phase);
  addCheck("terminal", "outcomeMatchesEvidence", evidenceGame.outcome, onchainSnapshot.outcome);
  addCheck("terminal", "roundMatchesEvidence", evidenceGame.round, onchainSnapshot.round);
  addCheck(
    "accounting",
    "treasuryAccruedEqualsClaimablePlusWithdrawn",
    payouts.treasury.accruedWei,
    (
      bigintFrom(payouts.treasury.claimableWei) +
      bigintFrom(payouts.treasury.withdrawnWei)
    ).toString()
  );

  for (const cause of payouts.causes) {
    addCheck(
      "accounting",
      `cause-${cause.causeId}-routedEqualsClaimablePlusWithdrawn`,
      cause.routedFromGameWei,
      (
        bigintFrom(cause.claimableFromGameWei) +
        bigintFrom(cause.withdrawnFromGameWei)
      ).toString()
    );

    addCheck(
      "preview",
      `cause-${cause.causeId}-claimableMatchesEvidence`,
      cause.claimableFromGameWei,
      decimalString(await gameReader.gameCauseClaimableAmount(gameId, cause.causeId))
    );
  }

  addCheck(
    "preview",
    "treasuryClaimableMatchesEvidence",
    payouts.treasury.claimableWei,
    decimalString(await gameReader.treasuryClaimableAmount(gameId))
  );

  for (const participant of payouts.participants) {
    const winnerPreview = await gameReader.previewWinnerClaim(gameId, participant.wallet);
    const refundPreview = await gameReader.previewRefund(gameId, participant.wallet);
    addCheck(
      "preview",
      `winner-preview-available-${participant.wallet}`,
      participant.claim.availableNow,
      winnerPreview.availableNow
    );
    addCheck(
      "preview",
      `winner-preview-gross-${participant.wallet}`,
      participant.claim.grossPrizeWei,
      decimalString(winnerPreview.grossPrizeWei)
    );
    addCheck(
      "preview",
      `refund-preview-available-${participant.wallet}`,
      participant.refund.availableNow,
      refundPreview.availableNow
    );
    addCheck(
      "preview",
      `refund-preview-amount-${participant.wallet}`,
      participant.refund.refundWei,
      decimalString(refundPreview.refundWei)
    );
  }

  if (onchainSnapshot.phase === "Cancelled") {
    addCheck(
      "drain",
      "pendingRefundCountAfterCleanup",
      0,
      payouts.claims.refunds.pendingRefundCount
    );
  } else if (onchainSnapshot.outcome === "NoWinners") {
    addCheck("drain", "treasuryClaimableAfterCleanup", "0", payouts.treasury.claimableWei);
    addCheck(
      "drain",
      "causeClaimableAfterCleanup",
      "0",
      sumDecimalStrings(
        payouts.causes.map((cause) => cause.claimableFromGameWei)
      ).toString()
    );
  } else if (onchainSnapshot.outcome === "Winners" && claimDrainIntended) {
    addCheck(
      "drain",
      "unclaimedWinnerCountAfterCleanup",
      0,
      payouts.claims.winners.unclaimedWinnerCount
    );
    addCheck("drain", "treasuryClaimableAfterCleanup", "0", payouts.treasury.claimableWei);
    addCheck(
      "drain",
      "causeClaimableAfterCleanup",
      "0",
      sumDecimalStrings(
        payouts.causes.map((cause) => cause.claimableFromGameWei)
      ).toString()
    );
  }

  const categorySummary = {};
  for (const category of [...new Set(checks.map((check) => check.category))]) {
    const categoryChecks = checks.filter((check) => check.category === category);
    categorySummary[category] = {
      ok: categoryChecks.every((check) => check.ok),
      failed: categoryChecks.filter((check) => !check.ok),
      total: categoryChecks.length,
    };
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    categories: categorySummary,
    slotState: {
      activeGameId,
      currentGameId,
    },
  };
}

async function runSingleGame({
  provider,
  owner,
  gameReader,
  gameAddress,
  scenario,
  gameIndex,
  players,
  causeCount,
  config,
  concurrency,
  seed,
  skipCommitRate,
  skipRevealRate,
  underfilledRate,
  invalidRevealRate,
  probeRate,
  choiceWeights,
  claimWinners,
  expectedFailures,
  tracker,
  runDir,
}) {
  const gameStartedAtMs = Date.now();
  const startBlock = await provider.getBlockNumber();
  const scenarioType = scenario.type;
  const skippedExpectedFailures = [];
  const skippedProbes = [];
  const notes = [scenario.description];
  const enableAdversarialProbes = scenarioType === "adversarial-random";
  const claimDrainIntended = enableAdversarialProbes ? true : claimWinners;
  const preCreateActiveGameId = toNumber(
    await gameReader.activeGameId(),
    "preCreate.activeGameId"
  );

  const createResult = await trackedTx(
    tracker,
    provider,
    {
      action: "createGame",
      phase: "create",
      scenarioType,
      gameIndex,
      wallet: owner.address,
    },
    async () =>
      createGameAction({
        provider,
        game: gameAddress,
        wallet: owner.address,
        walletPrivateKey: owner.privateKey,
        allowUnsafePrivateKey: true,
      })
  );

  const gameId = createResult.gameId;
  const postCreateActiveGameId = toNumber(
    await gameReader.activeGameId(),
    "postCreate.activeGameId"
  );
  const createEntry = tracker.entries.find(
    (entry) => entry.txHash === createResult.txHash
  );
  if (createEntry) {
    createEntry.gameId = gameId;
  }

  const gamePlan = buildGameExecutionPlan({
    players,
    scenarioType,
    config,
    gameIndex,
    seed,
    underfilledRate,
  });
  const joinedPlayers = gamePlan.joinedPlayers;
  const joinOrder = gamePlan.joinOrder;
  const nonJoinedPlayers = gamePlan.nonJoinedPlayers;
  const causeAssignments = joinedPlayers.map((player) => ({
    wallet: player.wallet.address,
    causeId: assignCauseId(player.index, gameIndex, causeCount),
  }));

  const joinStartedMs = Date.now();
  await runGameBatch({
    items: joinOrder,
    concurrency,
    actionName: "join",
    provider,
    tracker,
    buildMeta: (player) => ({
      action: "join",
      phase: "joining",
      scenarioType,
      gameIndex,
      gameId,
      wallet: player.wallet.address,
      causeId: assignCauseId(player.index, gameIndex, causeCount),
    }),
    operation: (player) =>
      joinGameAction({
        provider,
        game: gameAddress,
        gameId,
        causeId: assignCauseId(player.index, gameIndex, causeCount),
        wallet: player.wallet.address,
        walletPrivateKey: player.wallet.privateKey,
        allowUnsafePrivateKey: true,
      }),
  });

  if (expectedFailures) {
    if (joinedPlayers.length > 0) {
      const duplicateJoinPlayer = joinedPlayers[0];
      await trackedExpectedFailure(
        tracker,
        provider,
        {
          action: "join",
          phase: "joining",
          scenarioType,
          failureLabel: "duplicate-join",
          gameIndex,
          gameId,
          wallet: duplicateJoinPlayer.wallet.address,
          causeId: assignCauseId(
            duplicateJoinPlayer.index,
            gameIndex,
            causeCount
          ),
        },
        async () =>
          sendRawGameTx({
            gameAddress,
            wallet: duplicateJoinPlayer.wallet,
            method: "join",
            args: [gameId, assignCauseId(duplicateJoinPlayer.index, gameIndex, causeCount)],
            overrides: {
              value: config.entryFeeWei,
            },
          })
      );
    } else {
      skippedExpectedFailures.push("duplicate-join(no joined player)");
    }
  }

  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      shouldSample({
        seed,
        stage: "probe-early-advance-from-joining",
        gameIndex,
        round: 0,
        playerIndex: 0,
        wallet: owner.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "advanceFromJoining",
      phase: "joining",
      scenarioType,
      gameIndex,
      gameId,
      wallet: owner.address,
      failureLabel: "advance-from-joining-before-deadline",
      probeKind: "invalid-timing",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: owner,
        method: "advancePhase",
        args: [gameId],
      }),
    skippedProbes,
    skipReason: "joining:early advance probe skipped",
  });

  await provider.send("evm_increaseTime", [config.joinDurationSeconds + 1]);
  await provider.send("evm_mine", []);
  let manualBlocksMined = 1;

  await maybeTrackProbe({
    enabled:
      enableAdversarialProbes &&
      nonJoinedPlayers.length > 0 &&
      shouldSample({
        seed,
        stage: "probe-late-join",
        gameIndex,
        round: 0,
        playerIndex: nonJoinedPlayers[0].index,
        wallet: nonJoinedPlayers[0].wallet.address,
        rate: probeRate,
      }),
    tracker,
    provider,
    meta: {
      action: "join",
      phase: "joining",
      scenarioType,
      gameIndex,
      gameId,
      wallet: nonJoinedPlayers[0]?.wallet.address ?? null,
      causeId: nonJoinedPlayers[0]
        ? assignCauseId(nonJoinedPlayers[0].index, gameIndex, causeCount)
        : null,
      failureLabel: "late-join-after-deadline",
      probeKind: "late-action",
    },
    operation: async () =>
      sendRawGameTx({
        gameAddress,
        wallet: nonJoinedPlayers[0].wallet,
        method: "join",
        args: [
          gameId,
          assignCauseId(nonJoinedPlayers[0].index, gameIndex, causeCount),
        ],
        overrides: {
          value: config.entryFeeWei,
        },
      }),
    skippedProbes,
    skipReason: "joining:late join probe skipped",
  });

  const roundReports = [];
  let totalSkippedCommits = 0;
  let totalSkippedReveals = 0;
  let commitDeadlineRounds = 0;
  let revealDeadlineRounds = 0;
  let joinDurationMs = 0;
  const shouldCancel =
    scenarioType === "cancelled-underfilled" ||
    (enableAdversarialProbes && gamePlan.plan.underfilledIntent);

  if (shouldCancel) {
    await trackedTx(
      tracker,
      provider,
      {
        action: "cancelIfInsufficientPlayers",
        phase: "joining",
        scenarioType,
        gameIndex,
        gameId,
        wallet: owner.address,
      },
      async () =>
        cancelIfInsufficientPlayersAction({
          provider,
          game: gameAddress,
          gameId,
          wallet: owner.address,
          walletPrivateKey: owner.privateKey,
          allowUnsafePrivateKey: true,
        })
    );
    joinDurationMs = Date.now() - joinStartedMs;
  } else {
    await trackedTx(
      tracker,
      provider,
      {
        action: "advanceFromJoining",
        phase: "joining",
        scenarioType,
        gameIndex,
        gameId,
        wallet: owner.address,
      },
      async () =>
        advancePhaseAction({
          provider,
          game: gameAddress,
          gameId,
          wallet: owner.address,
          walletPrivateKey: owner.privateKey,
          allowUnsafePrivateKey: true,
        })
    );
    joinDurationMs = Date.now() - joinStartedMs;

    if (scenarioType === "winner-all-share") {
      while (true) {
        const snapshotBeforeRound = normalizeSnapshot(
          await gameReader.getGame(gameId)
        );
        if (snapshotBeforeRound.phase !== "Commit") {
          break;
        }

        const alivePlayers = await loadAlivePlayers(gameReader, gameId, joinedPlayers);
        const roundResult = await runPlannedRound({
          provider,
          owner,
          gameReader,
          gameAddress,
          gameIndex,
          gameId,
          playerPlans: buildRoundPlayerPlans({
            players: alivePlayers,
            scenarioType,
            gameIndex,
            round: snapshotBeforeRound.round,
            seed,
            fixedChoice: "share",
            choiceWeights,
            skipCommitRate,
            skipRevealRate,
            invalidRevealRate: 0,
          }),
          concurrency,
          seed,
          tracker,
          scenarioType,
          expectedFailures,
          skippedExpectedFailures,
        });
        roundReports.push(roundResult.roundReport);
        manualBlocksMined += roundResult.manualBlocksMined;
        totalSkippedCommits += roundResult.skippedCommits;
        totalSkippedReveals += roundResult.skippedReveals;
        if (roundResult.commitDeadlineHit) {
          commitDeadlineRounds += 1;
        }
        if (roundResult.revealDeadlineHit) {
          revealDeadlineRounds += 1;
        }
        if (roundResult.revealAdvanceResult.outcome !== "Unset") {
          break;
        }
      }
    } else if (scenarioType === "no-winner-all-catch") {
      const alivePlayers = await loadAlivePlayers(gameReader, gameId, joinedPlayers);
      const roundResult = await runPlannedRound({
        provider,
        owner,
        gameReader,
        gameAddress,
        gameIndex,
        gameId,
        playerPlans: buildRoundPlayerPlans({
          players: alivePlayers,
          scenarioType,
          gameIndex,
          round: normalizeSnapshot(await gameReader.getGame(gameId)).round,
          seed,
          fixedChoice: "catch",
          choiceWeights,
          skipCommitRate: 0,
          skipRevealRate: 0,
          invalidRevealRate: 0,
        }),
        concurrency,
        seed,
        tracker,
        scenarioType,
        expectedFailures,
        skippedExpectedFailures,
      });
      roundReports.push(roundResult.roundReport);
      manualBlocksMined += roundResult.manualBlocksMined;
      totalSkippedCommits += roundResult.skippedCommits;
      totalSkippedReveals += roundResult.skippedReveals;
      if (roundResult.commitDeadlineHit) {
        commitDeadlineRounds += 1;
      }
      if (roundResult.revealDeadlineHit) {
        revealDeadlineRounds += 1;
      }
      if (roundResult.revealAdvanceResult.outcome !== "NoWinners") {
        throw new Error(
          `No-winner scenario resolved to ${roundResult.revealAdvanceResult.outcome} instead of NoWinners.`
        );
      }
    } else if (scenarioType === "adversarial-random") {
      while (true) {
        const snapshotBeforeRound = normalizeSnapshot(
          await gameReader.getGame(gameId)
        );
        if (snapshotBeforeRound.phase !== "Commit") {
          break;
        }

        const alivePlayers = await loadAlivePlayers(gameReader, gameId, joinedPlayers);
        if (alivePlayers.length === 0) {
          throw new Error(
            `Adversarial game ${gameId} entered Commit with zero alive players.`
          );
        }

        const roundResult = await runPlannedRound({
          provider,
          owner,
          gameReader,
          gameAddress,
          gameIndex,
          gameId,
          playerPlans: buildRoundPlayerPlans({
            players: alivePlayers,
            scenarioType,
            gameIndex,
            round: snapshotBeforeRound.round,
            seed,
            choiceWeights,
            skipCommitRate,
            skipRevealRate,
            invalidRevealRate,
          }),
          concurrency,
          seed,
          tracker,
          scenarioType,
          expectedFailures,
          skippedExpectedFailures,
          enableAdversarialProbes: true,
          probeRate,
          skippedProbes,
        });
        roundReports.push(roundResult.roundReport);
        manualBlocksMined += roundResult.manualBlocksMined;
        totalSkippedCommits += roundResult.skippedCommits;
        totalSkippedReveals += roundResult.skippedReveals;
        if (roundResult.commitDeadlineHit) {
          commitDeadlineRounds += 1;
        }
        if (roundResult.revealDeadlineHit) {
          revealDeadlineRounds += 1;
        }
        if (roundResult.revealAdvanceResult.outcome !== "Unset") {
          break;
        }
      }
    } else {
      throw new Error(`Unsupported scenario type '${scenarioType}'.`);
    }
  }

  const settlementStartedMs = Date.now();
  let claimResults = [];
  let refundResults = [];
  let treasuryWithdrawal = null;
  let causeWithdrawalResults = [];

  const terminalSnapshot = normalizeSnapshot(await gameReader.getGame(gameId));
  const causeIds = causeAssignments.map((entry) => entry.causeId);

  if (terminalSnapshot.phase === "Cancelled") {
    if (enableAdversarialProbes) {
      ({
        claimResults,
        refundResults,
        treasuryWithdrawal,
        causeWithdrawalResults,
      } = await runCancelledSettlement({
        provider,
        owner,
        gameAddress,
        gameIndex,
        gameId,
        joinedPlayers,
        concurrency,
        tracker,
        expectedFailures,
        skippedExpectedFailures,
        seed,
        enableAdversarialProbes,
        probeRate,
        skippedProbes,
      }));
    } else {
      refundResults = await runGameBatch({
        items: joinedPlayers,
        concurrency,
        actionName: "refund",
        provider,
        tracker,
        buildMeta: (player) => ({
          action: "refund",
          phase: "settlement",
          scenarioType,
          gameIndex,
          gameId,
          wallet: player.wallet.address,
        }),
        operation: (player) =>
          refundAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: player.wallet.address,
            walletPrivateKey: player.wallet.privateKey,
            allowUnsafePrivateKey: true,
          }),
      });

      if (expectedFailures) {
        if (joinedPlayers.length > 0) {
          const duplicateRefundPlayer = joinedPlayers[0];
          await trackedExpectedFailure(
            tracker,
            provider,
            {
              action: "refund",
              phase: "settlement",
              scenarioType,
              failureLabel: "duplicate-refund",
              gameIndex,
              gameId,
              wallet: duplicateRefundPlayer.wallet.address,
            },
            async () =>
              sendRawGameTx({
                gameAddress,
                wallet: duplicateRefundPlayer.wallet,
                method: "claimRefund",
                args: [gameId],
              })
          );
        } else {
          skippedExpectedFailures.push("duplicate-refund(no refunded player)");
        }
      }
    }
  } else if (terminalSnapshot.outcome === "Winners") {
    if (enableAdversarialProbes) {
      ({
        claimResults,
        refundResults,
        treasuryWithdrawal,
        causeWithdrawalResults,
      } = await runWinnerSettlement({
        provider,
        owner,
        gameReader,
        gameAddress,
        gameIndex,
        gameId,
        joinedPlayers,
        causeIds,
        concurrency,
        tracker,
        expectedFailures,
        skippedExpectedFailures,
        seed,
        enableAdversarialProbes,
        probeRate,
        skippedProbes,
      }));
    } else {
      if (claimDrainIntended) {
        claimResults = await runGameBatch({
          items: joinedPlayers,
          concurrency,
          actionName: "claim",
          provider,
          tracker,
          buildMeta: (player) => ({
            action: "claim",
            phase: "settlement",
            scenarioType,
            gameIndex,
            gameId,
            wallet: player.wallet.address,
          }),
          operation: (player) =>
            claimAction({
              provider,
              game: gameAddress,
              gameId,
              wallet: player.wallet.address,
              walletPrivateKey: player.wallet.privateKey,
              allowUnsafePrivateKey: true,
            }),
        });

        if (expectedFailures) {
          if (joinedPlayers.length > 0) {
            const duplicateClaimPlayer = joinedPlayers[0];
            await trackedExpectedFailure(
              tracker,
              provider,
              {
                action: "claim",
                phase: "settlement",
                scenarioType,
                failureLabel: "duplicate-claim",
                gameIndex,
                gameId,
                wallet: duplicateClaimPlayer.wallet.address,
              },
              async () =>
                sendRawGameTx({
                  gameAddress,
                  wallet: duplicateClaimPlayer.wallet,
                  method: "claim",
                  args: [gameId],
                })
            );
          } else {
            skippedExpectedFailures.push("duplicate-claim(no winner)");
          }
        }
      } else if (expectedFailures) {
        skippedExpectedFailures.push(
          "duplicate-claim(skipped because winner claims disabled)"
        );
      }

      ({ treasuryWithdrawal, causeWithdrawalResults } =
        await runAvailableWithdrawals({
          provider,
          owner,
          gameReader,
          gameAddress,
          gameIndex,
          gameId,
          scenarioType,
          causeIds,
          concurrency,
          tracker,
          expectedFailures,
          skippedExpectedFailures,
        }));
    }
  } else if (terminalSnapshot.outcome === "NoWinners") {
    if (enableAdversarialProbes) {
      ({
        claimResults,
        refundResults,
        treasuryWithdrawal,
        causeWithdrawalResults,
      } = await runNoWinnerSettlement({
        provider,
        owner,
        gameReader,
        gameAddress,
        gameIndex,
        gameId,
        joinedPlayers,
        causeIds,
        concurrency,
        tracker,
        expectedFailures,
        skippedExpectedFailures,
        seed,
        enableAdversarialProbes,
        probeRate,
        skippedProbes,
      }));
    } else {
      ({ treasuryWithdrawal, causeWithdrawalResults } =
        await runAvailableWithdrawals({
          provider,
          owner,
          gameReader,
          gameAddress,
          gameIndex,
          gameId,
          scenarioType,
          causeIds,
          concurrency,
          tracker,
          expectedFailures,
          skippedExpectedFailures,
        }));
    }
  } else {
    throw new Error(
      `Game ${gameId} reached unsupported terminal snapshot ${terminalSnapshot.phase}/${terminalSnapshot.outcome}.`
    );
  }
  const settlementDurationMs = Date.now() - settlementStartedMs;

  const exportStartedMs = Date.now();
  const evidenceOutputDir = join(runDir, `game-${gameId}`, "evidence");
  const exported = await exportGameEvidence({
    provider,
    game: gameAddress,
    registry: await gameReader.authRegistry(),
    gameId,
    out: evidenceOutputDir,
    fromBlock: createResult.blockNumber,
  });
  const exportDurationMs = Date.now() - exportStartedMs;

  const claimSummary = aggregateClaims(claimResults);
  const refundSummary = aggregateRefunds(refundResults);
  const causeWithdrawalSummary = aggregateCauseWithdrawals(
    causeWithdrawalResults
  );
  const withdrawalSummary = {
    treasury: summarizeTreasuryWithdrawal(treasuryWithdrawal),
    causes: causeWithdrawalSummary,
  };
  const postRunOutstanding = buildPostRunOutstanding(exported.evidence);
  const replayConsistency = enableAdversarialProbes
    ? buildObservedReplayConsistency({
        evidence: exported.evidence,
        config,
        claimSummary,
        refundSummary,
        withdrawalSummary,
      })
    : buildReplayConsistency({
        scenarioType,
        evidence: exported.evidence,
        config,
        causeAssignments,
        claimSummary,
        claimWinners: claimDrainIntended,
        refundSummary,
        withdrawalSummary,
      });
  const breakageChecks = await buildBreakageChecks({
    gameReader,
    gameId,
    evidence: exported.evidence,
    claimDrainIntended,
  });

  const endBlock = await provider.getBlockNumber();
  const gameEntries = tracker.entries.filter(
    (entry) => entry.gameId === gameId
  );
  const gameTxSummary = buildTxSummary(gameEntries);
  const probeSummary = buildProbeSummary(gameEntries);

  if (
    scenarioType !== "winner-all-share" &&
    scenarioType !== "adversarial-random" &&
    (skipCommitRate > 0 || skipRevealRate > 0)
  ) {
    notes.push(
      "skipCommitRate/skipRevealRate were ignored for this game so the requested scenario terminal outcome stayed deterministic."
    );
  }
  if (scenarioType === "winner-all-share") {
    notes.push(
      "Missed commits/reveals, when configured, rely on the contract's current default-to-SHARE behavior rather than injecting invalid move payloads."
    );
    notes.push(
      "Winner-path runs now withdraw the settled creator-fee treasury balance and any routed cause balances after claims when those pull-based amounts are claimable."
    );
    if (!claimDrainIntended) {
      notes.push(
        "Winner claims were skipped for this run, so claimed-count and payout reconciliation checks are intentionally incomplete even though the creator-fee treasury withdrawal may still execute."
      );
    }
  }
  if (enableAdversarialProbes) {
    notes.push(
      "This game used seeded synthetic adversarial local stress only: randomized valid and invalid action ordering, omissions, and follow-up probes aimed at surfacing contract or harness breakage."
    );
    notes.push(
      `Adversarial knobs for this game: underfilledIntent=${gamePlan.plan.underfilledIntent}, probeRate=${probeRate}, invalidRevealRate=${invalidRevealRate}, choiceWeights=${choiceWeights.share}/${choiceWeights.catch}/${choiceWeights.steal}.`
    );
  }
  if (expectedFailures && skippedExpectedFailures.length > 0) {
    notes.push(
      `Expected-failure mode skipped some duplicate checks because the prerequisite successful action never happened: ${skippedExpectedFailures.join(
        ", "
      )}.`
    );
  }
  if (skippedProbes.length > 0) {
    notes.push(
      `Some adversarial probes were skipped because a prerequisite target or timing window was unavailable: ${skippedProbes.join(
        ", "
      )}.`
    );
  }

  return {
    index: gameIndex,
    gameId,
    scenario: {
      type: scenario.type,
      family: scenario.family,
      description: scenario.description,
      terminalPath: exported.evidence.summary.game.terminalOutcome.terminalPath,
      expectedFailuresEnabled: expectedFailures,
      adversarialProbeModeEnabled: enableAdversarialProbes,
      registeredPlayers: players.length,
      plannedJoinedPlayers: joinedPlayers.length,
      nonJoiningRegisteredPlayers: players.length - joinedPlayers.length,
    },
    adversarialPlan: enableAdversarialProbes
      ? {
          underfilledIntent: gamePlan.plan.underfilledIntent,
          joinedPlayerIndexes: gamePlan.plan.selectedPlayerIndexes ?? joinedPlayers.map((player) => player.index),
          nonJoinedPlayerCount: nonJoinedPlayers.length,
          preCreateActiveGameId,
          postCreateActiveGameId,
          probeRate,
          invalidRevealRate,
          choiceWeights,
          claimDrainIntended,
        }
      : null,
    wallClockMs: Date.now() - gameStartedAtMs,
    blocks: {
      start: startBlock,
      end: endBlock,
      mined: endBlock - startBlock,
      manualMined: manualBlocksMined,
    },
    playerCount: players.length,
    joinedPlayerCount: joinedPlayers.length,
    causeCount,
    causeDistribution: buildCauseDistribution(causeAssignments),
    phaseTimingMs: {
      joining: joinDurationMs,
      settlement: settlementDurationMs,
      exportEvidence: exportDurationMs,
    },
    deadlineMisses: {
      commitRounds: commitDeadlineRounds,
      revealRounds: revealDeadlineRounds,
      skippedCommits: totalSkippedCommits,
      skippedReveals: totalSkippedReveals,
    },
    rounds: roundReports,
    claims: claimSummary,
    refunds: refundSummary,
    withdrawals: withdrawalSummary,
    terminalActions: {
      path: exported.evidence.summary.game.terminalOutcome.terminalPath,
      winnerClaimsExecuted: claimSummary.succeeded,
      refundsExecuted: refundSummary.succeeded,
      treasuryWithdrawalExecuted: withdrawalSummary.treasury.executed,
      causeWithdrawalsExecuted: causeWithdrawalSummary.succeeded,
    },
    expectedFailures: {
      enabled: expectedFailures,
      attempted: gameEntries.filter(
        (entry) => entry.expectation === "expected-failure"
      ).length,
      failedAsExpected: gameEntries.filter(
        (entry) =>
          entry.expectation === "expected-failure" &&
          entry.status === "failed" &&
          entry.failureClass === "expected"
      ).length,
      unexpectedSuccesses: gameEntries.filter(
        (entry) =>
          entry.expectation === "expected-failure" &&
          entry.failureClass === "unexpected-success"
      ).length,
    },
    probes: probeSummary,
    txSummary: gameTxSummary,
    resultState: {
      phase: exported.evidence.summary.game.phase,
      outcome: exported.evidence.summary.game.outcome,
      terminalPath: exported.evidence.summary.game.terminalOutcome.terminalPath,
      round: exported.evidence.summary.game.round,
      shareStreak: exported.evidence.summary.game.shareStreak,
      counts: exported.evidence.summary.game.counts,
      settlement: exported.evidence.summary.game.settlement,
    },
    postRunOutstanding,
    replayConsistency,
    breakageChecks,
    evidence: {
      outputDir: exported.manifest.outputDir,
      manifestPath: exported.manifest.produced.find(
        (artifact) => artifact.artifact === "export-manifest.json"
      )?.path,
      produced: exported.manifest.produced,
      skipped: exported.manifest.skipped,
    },
    notes,
  };
}

function buildGasAndLatencyHotspots(entries) {
  const byAction = {};
  let highestGasEntry = null;
  let highestLatencyEntry = null;

  function normalizeEntry(entry) {
    return {
      action: entry.action,
      phase: entry.phase,
      scenarioType: entry.scenarioType,
      gameIndex: entry.gameIndex,
      gameId: entry.gameId,
      round: entry.round,
      wallet: entry.wallet,
      causeId: entry.causeId,
      txHash: entry.txHash,
      blockNumber: entry.blockNumber,
      gasUsed: entry.gasUsed,
      durationMs: entry.durationMs,
    };
  }

  for (const entry of entries) {
    if (
      !highestLatencyEntry ||
      entry.durationMs > highestLatencyEntry.durationMs
    ) {
      highestLatencyEntry = entry;
    }

    if (entry.status !== "succeeded" || entry.gasUsed === null) {
      continue;
    }

    const currentGasUsed = bigintFrom(entry.gasUsed, "entry.gasUsed");
    if (
      !highestGasEntry ||
      currentGasUsed >
        bigintFrom(highestGasEntry.gasUsed, "highestGasEntry.gasUsed")
    ) {
      highestGasEntry = entry;
    }

    const existing = byAction[entry.action];
    if (
      !existing ||
      currentGasUsed >
        bigintFrom(existing.gasUsed, `byAction.${entry.action}.gasUsed`)
    ) {
      byAction[entry.action] = normalizeEntry(entry);
    }
  }

  return {
    highestGasTx: highestGasEntry ? normalizeEntry(highestGasEntry) : null,
    highestLatencyTx: highestLatencyEntry
      ? normalizeEntry(highestLatencyEntry)
      : null,
    byAction,
  };
}

function buildLocalScaleReadiness({
  games,
  txEntries,
  txSummary,
  wallClockMs,
  options,
}) {
  const totalGames = games.length;
  const maxJoinedPlayersInSingleGame = games.length
    ? Math.max(...games.map((game) => game.joinedPlayerCount))
    : 0;
  const maxUsedCausesInSingleGame = games.length
    ? Math.max(...games.map((game) => game.resultState.counts.usedCauses))
    : 0;
  const totalJoinedPlayersAcrossRun = games.reduce(
    (sum, game) => sum + game.joinedPlayerCount,
    0
  );
  const gamesHittingRequestedPlayerTarget = games.filter(
    (game) => game.joinedPlayerCount === options.playerCount
  ).length;
  const gamesHittingProfileMaxPlayers = games.filter(
    (game) => game.joinedPlayerCount === options.profileConfig.maxPlayers
  ).length;
  const fullyDrainedGames = games.filter(
    (game) => game.postRunOutstanding.fullyDrainedByHarness
  ).length;
  const replayConsistentGames = games.filter(
    (game) => game.replayConsistency.ok
  ).length;
  const gamesWithoutUnexpectedFailures = games.filter(
    (game) =>
      game.txSummary.failedUnexpected === 0 &&
      game.txSummary.unexpectedSuccesses === 0
  ).length;
  const txsPerSecond = (count) =>
    wallClockMs > 0 ? Number(((count * 1000) / wallClockMs).toFixed(3)) : null;

  return {
    requestedPlayerTarget: options.playerCount,
    profileMaxPlayers: options.profileConfig.maxPlayers,
    sequentialGamesCompleted: totalGames,
    maxJoinedPlayersInSingleGame,
    maxUsedCausesInSingleGame,
    totalJoinedPlayersAcrossRun,
    gamesHittingRequestedPlayerTarget,
    gamesHittingProfileMaxPlayers,
    fullyDrainedGames,
    replayConsistentGames,
    gamesWithoutUnexpectedFailures,
    totalTerminalActions: {
      winnerClaimsExecuted: games.reduce(
        (sum, game) => sum + game.terminalActions.winnerClaimsExecuted,
        0
      ),
      refundsExecuted: games.reduce(
        (sum, game) => sum + game.terminalActions.refundsExecuted,
        0
      ),
      treasuryWithdrawalsExecuted: games.reduce(
        (sum, game) =>
          sum + (game.terminalActions.treasuryWithdrawalExecuted ? 1 : 0),
        0
      ),
      causeWithdrawalsExecuted: games.reduce(
        (sum, game) => sum + game.terminalActions.causeWithdrawalsExecuted,
        0
      ),
    },
    throughput: {
      attemptedTxPerSecond: txsPerSecond(txSummary.attempted),
      successfulTxPerSecond: txsPerSecond(txSummary.succeeded),
      failedTxPerSecond: txsPerSecond(txSummary.failed),
    },
    hotspots: buildGasAndLatencyHotspots(txEntries),
  };
}

function buildBreakageSummary({ games, txEntries }) {
  const probeEntries = txEntries.filter((entry) => entry.expectation === "probe");
  const unexpectedFailures = txEntries.filter(
    (entry) => entry.status === "failed" && entry.failureClass === "unexpected"
  );

  return {
    gamesChecked: games.length,
    gamesWithWedgedActiveSlot: games.filter(
      (game) => game.breakageChecks?.categories?.slot?.ok === false
    ).length,
    gamesWithTerminalStateMismatch: games.filter(
      (game) => game.breakageChecks?.categories?.terminal?.ok === false
    ).length,
    gamesWithAccountingMismatch: games.filter(
      (game) => game.breakageChecks?.categories?.accounting?.ok === false
    ).length,
    gamesWithPreviewMismatch: games.filter(
      (game) => game.breakageChecks?.categories?.preview?.ok === false
    ).length,
    gamesWithDrainMismatch: games.filter(
      (game) => game.breakageChecks?.categories?.drain?.ok === false
    ).length,
    gamesWithReplayInconsistency: games.filter(
      (game) => game.replayConsistency?.ok === false
    ).length,
    gamesWithUnexpectedFailures: games.filter(
      (game) => game.txSummary.failedUnexpected > 0
    ).length,
    totalUnexpectedFailures: unexpectedFailures.length,
    probeSummary: {
      attempted: probeEntries.length,
      failedAsExpected: probeEntries.filter(
        (entry) => entry.status === "failed" && entry.failureClass === "expected"
      ).length,
      unexpectedSuccesses: probeEntries.filter(
        (entry) => entry.failureClass === "unexpected-success"
      ).length,
      onchainReverts: probeEntries.filter(
        (entry) => entry.status === "failed" && entry.failureTransport === "onchain-revert"
      ).length,
      localRejections: probeEntries.filter(
        (entry) => entry.status === "failed" && entry.failureTransport === "local-rejection"
      ).length,
    },
    unexpectedFailureClusters: buildFailureClusters(txEntries, {
      onlyUnexpected: true,
    }),
    probeFailureClusters: buildFailureClusters(probeEntries),
  };
}

function buildFailureReport({ baseReport, tracker, error, startedAt }) {
  const finishedAt = new Date().toISOString();
  return {
    ...baseReport,
    status: "failed",
    startedAt,
    finishedAt,
    wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
    error: describeError(error),
    txSummary: buildTxSummary(tracker.entries),
  };
}

export async function runLoadHarness(rawOptions = {}) {
  const options = buildResolvedConfig(rawOptions);
  ensureDir(options.runDir);

  const tracker = createEmptyTxTracker();
  const startedAt = new Date().toISOString();
  const baseReport = {
    schemaVersion: LOAD_HARNESS_SCHEMA_VERSION,
    boundaryNote: LOAD_HARNESS_BOUNDARY_NOTE,
    mode: options.games === 1 ? "single-game" : "sequential",
    profile: {
      name: options.profileName,
      source: options.profile.source,
      notes: options.notes,
      strategy:
        "scenario-driven local flows: deterministic winner/cancelled/no-winner paths plus a seeded adversarial-random mode that mixes started vs underfilled games, random round choices, omissions, invalid follow-ups, and settlement-order probes for local breakage hunting.",
    },
    options: {
      playerCount: options.playerCount,
      causeCount: options.causeCount,
      games: options.games,
      concurrency: options.concurrency,
      skipCommitRate: options.skipCommitRate,
      skipRevealRate: options.skipRevealRate,
      underfilledRate: options.underfilledRate,
      invalidRevealRate: options.invalidRevealRate,
      probeRate: options.probeRate,
      choiceWeights: options.choiceWeights,
      claimWinners: options.claimWinners,
      expectedFailures: options.expectedFailures,
      requestedScenario: options.requestedScenario,
      selectedScenarioTypes: options.selectedScenarioTypes,
      seed: options.seed,
    },
    scenarios: {
      requested: options.requestedScenario,
      selectedTypes: options.selectedScenarioTypes,
      plan: options.scenarioPlan.map((scenario) => scenario.type),
    },
    config: options.profileConfig,
    paths: {
      runDir: options.runDir,
      report: join(options.runDir, "report.json"),
      txLog: join(options.runDir, "txs.jsonl"),
    },
    limitations: [
      "This harness currently drives verifier-approved permit/register directly for speed; it does not rehearse the full SIWA nonce/sign/verify wrapper.",
      "The adversarial-random mode is synthetic local breakage hunting only. Invalid probes and random action mixes come from one seeded local harness, not autonomous independent agents or real network adversaries.",
      "The included automated smoke test proves only small local runs. Larger many-game or high-player stress still needs to be produced intentionally by running the harness with a larger local profile; it is not CI-proven by this patch alone.",
      "Transactions come from one local process with bounded concurrency. That is useful for contract/tooling stress, but it is not a realistic model of network latency, mempool behavior, or fully independent agents.",
    ],
  };

  let anvilProcess = null;

  try {
    const chain = options.spawnAnvil
      ? await startAnvil({
          port: options.anvilPort,
          chainId: options.chainId,
          accounts: options.playerCount + 2,
          mnemonic: options.mnemonic,
        })
      : {
          anvilProcess: null,
          provider: new ethers.providers.JsonRpcProvider(options.rpcUrl),
          rpcUrl: options.rpcUrl,
        };

    anvilProcess = chain.anvilProcess;
    const provider = chain.provider;
    await waitForProvider(provider);

    const owner = deriveWallet(options.mnemonic, 0, provider);
    const verifier = deriveWallet(options.mnemonic, 1, provider);
    const players = Array.from({ length: options.playerCount }, (_, index) => ({
      index: index + 1,
      wallet: deriveWallet(options.mnemonic, index + 2, provider),
    }));

    const causeDefinitions = buildCauseDefinitions({
      mnemonic: options.mnemonic,
      playerCount: options.playerCount,
      causeCount: options.causeCount,
    });
    const treasuryRecipient = deriveWallet(
      options.mnemonic,
      options.playerCount + options.causeCount + 50
    ).address;

    const bootstrapStartedMs = Date.now();
    const initialBlock = await provider.getBlockNumber();
    const initialBlockData = await readLatestBlock(provider);

    const deployments = await deployContracts({
      provider,
      owner,
      verifier,
      treasuryRecipient,
      config: options.profileConfig,
      tracker,
    });
    await whitelistCauses({
      provider,
      game: deployments.game,
      causeDefinitions,
      tracker,
    });
    await registerPlayers({
      provider,
      authRegistry: deployments.authRegistry,
      verifier,
      players,
      concurrency: options.concurrency,
      tracker,
    });

    const bootstrapDurationMs = Date.now() - bootstrapStartedMs;
    const gameReader = new ethers.Contract(
      deployments.game.address,
      gameArtifact.abi,
      provider
    );

    const games = [];
    for (let gameIndex = 1; gameIndex <= options.games; gameIndex += 1) {
      games.push(
        await runSingleGame({
          provider,
          owner,
          gameReader,
          gameAddress: deployments.game.address,
          scenario: options.scenarioPlan[gameIndex - 1],
          gameIndex,
          players,
          causeCount: options.causeCount,
          config: options.profileConfig,
          concurrency: options.concurrency,
          seed: options.seed,
          skipCommitRate: options.skipCommitRate,
          skipRevealRate: options.skipRevealRate,
          underfilledRate: options.underfilledRate,
          invalidRevealRate: options.invalidRevealRate,
          probeRate: options.probeRate,
          choiceWeights: options.choiceWeights,
          claimWinners: options.claimWinners,
          expectedFailures: options.expectedFailures,
          tracker,
          runDir: options.runDir,
        })
      );
    }

    const finalBlock = await provider.getBlockNumber();
    const finalBlockData = await readLatestBlock(provider);
    const finishedAt = new Date().toISOString();
    const wallClockMs = Date.parse(finishedAt) - Date.parse(startedAt);
    const txSummary = buildTxSummary(tracker.entries);

    const report = {
      ...baseReport,
      status: "ok",
      startedAt,
      finishedAt,
      wallClockMs,
      environment: {
        chainId: toNumber((await provider.getNetwork()).chainId, "chainId"),
        rpcUrl: chain.rpcUrl,
        spawnedAnvil: options.spawnAnvil,
        anvilPort: options.spawnAnvil ? options.anvilPort : null,
        initialBlock: initialBlockData.number,
        finalBlock: finalBlockData.number,
        blocksMined: finalBlock - initialBlock,
        initialTimestamp: initialBlockData.timestamp,
        finalTimestamp: finalBlockData.timestamp,
      },
      deployment: {
        owner: owner.address,
        verifier: verifier.address,
        authRegistry: deployments.authRegistry.address,
        game: deployments.game.address,
        treasury: deployments.treasuryRecipient,
        causes: causeDefinitions,
      },
      bootstrap: {
        wallClockMs: bootstrapDurationMs,
        playersRegistered: players.length,
        initialBlock,
        finalBlockAfterBootstrap: tracker.entries
          .filter(
            (entry) => entry.phase === "bootstrap" || entry.phase === "deploy"
          )
          .map((entry) => entry.blockNumber)
          .filter((value) => value !== null)
          .reduce((max, value) => Math.max(max, value), initialBlock),
      },
      chaos: {
        skipCommitRate: options.skipCommitRate,
        skipRevealRate: options.skipRevealRate,
        underfilledRate: options.underfilledRate,
        invalidRevealRate: options.invalidRevealRate,
        probeRate: options.probeRate,
        choiceWeights: options.choiceWeights,
        expectedFailuresEnabled: options.expectedFailures,
        skippedCommitCount: games.reduce(
          (sum, game) => sum + game.deadlineMisses.skippedCommits,
          0
        ),
        skippedRevealCount: games.reduce(
          (sum, game) => sum + game.deadlineMisses.skippedReveals,
          0
        ),
        commitDeadlineRounds: games.reduce(
          (sum, game) => sum + game.deadlineMisses.commitRounds,
          0
        ),
        revealDeadlineRounds: games.reduce(
          (sum, game) => sum + game.deadlineMisses.revealRounds,
          0
        ),
        expectedFailureAttempts: games.reduce(
          (sum, game) => sum + game.expectedFailures.attempted,
          0
        ),
        expectedFailureCount: games.reduce(
          (sum, game) => sum + game.expectedFailures.failedAsExpected,
          0
        ),
        probeAttempts: games.reduce(
          (sum, game) => sum + (game.probes?.attempted ?? 0),
          0
        ),
        probeFailuresAsExpected: games.reduce(
          (sum, game) => sum + (game.probes?.failedAsExpected ?? 0),
          0
        ),
        probeUnexpectedSuccesses: games.reduce(
          (sum, game) => sum + (game.probes?.unexpectedSuccesses ?? 0),
          0
        ),
      },
      scenarioSummary: {
        byType: groupCount(games, (game) => game.scenario.type),
        byTerminalOutcome: groupCount(
          games,
          (game) => game.resultState.outcome
        ),
        byTerminalPath: groupCount(
          games,
          (game) => game.resultState.terminalPath
        ),
      },
      txSummary,
      localScaleReadiness: buildLocalScaleReadiness({
        games,
        txEntries: tracker.entries,
        txSummary,
        wallClockMs,
        options,
      }),
      breakageSummary: buildBreakageSummary({
        games,
        txEntries: tracker.entries,
      }),
      games,
    };

    writeJsonFile(baseReport.paths.report, report);
    writeJsonlFile(baseReport.paths.txLog, tracker.entries);

    return {
      report,
      reportPath: baseReport.paths.report,
      txLogPath: baseReport.paths.txLog,
    };
  } catch (error) {
    const failureReport = buildFailureReport({
      baseReport,
      tracker,
      error,
      startedAt,
    });
    writeJsonFile(baseReport.paths.report, failureReport);
    writeJsonlFile(baseReport.paths.txLog, tracker.entries);
    throw error;
  } finally {
    await stopProcess(anvilProcess);
  }
}

export function printLoadHarnessSummary(report) {
  console.log("\n🏋️ Prisoners DAOllema load harness summary");
  console.log(`Status:         ${report.status}`);
  console.log(`Mode:           ${report.mode}`);
  console.log(
    `Profile:        ${report.profile.name} (${report.profile.source})`
  );
  console.log(`Run dir:        ${report.paths.runDir}`);
  console.log(`Players:        ${report.options.playerCount}`);
  console.log(`Causes:         ${report.options.causeCount}`);
  console.log(`Games:          ${report.options.games}`);
  console.log(`Concurrency:    ${report.options.concurrency}`);
  console.log(
    `Scenario req:   ${
      report.scenarios?.requested ??
      report.options.requestedScenario ??
      "winner-all-share"
    }`
  );
  console.log(
    `Scenario plan:  ${(
      report.scenarios?.plan ??
      report.options.selectedScenarioTypes ?? ["winner-all-share"]
    ).join(", ")}`
  );
  console.log(`Skip commit:    ${report.options.skipCommitRate}`);
  console.log(`Skip reveal:    ${report.options.skipRevealRate}`);
  console.log(`Probe rate:     ${report.options.probeRate ?? 0}`);
  console.log(`Underfilled:    ${report.options.underfilledRate ?? 0}`);
  console.log(
    `Exp failures:   ${
      report.options.expectedFailures ? "enabled" : "disabled"
    }`
  );
  if (report.environment) {
    console.log(`RPC URL:        ${report.environment.rpcUrl}`);
    console.log(`Chain ID:       ${report.environment.chainId}`);
    console.log(`Blocks mined:   ${report.environment.blocksMined}`);
  }
  console.log(`Tx attempted:   ${report.txSummary.attempted}`);
  console.log(`Tx succeeded:   ${report.txSummary.succeeded}`);
  console.log(`Tx failed:      ${report.txSummary.failed}`);
  console.log(`  expected:     ${report.txSummary.failedExpected ?? 0}`);
  console.log(`  unexpected:   ${report.txSummary.failedUnexpected ?? 0}`);
  console.log(`  unexp succ:   ${report.txSummary.unexpectedSuccesses ?? 0}`);
  console.log(`Gas total:      ${report.txSummary.gasUsed.total}`);
  console.log(`Wall clock ms:  ${report.wallClockMs}`);
  if (Array.isArray(report.profile?.notes) && report.profile.notes.length > 0) {
    console.log("Notes:");
    for (const note of report.profile.notes) {
      console.log(`  - ${note}`);
    }
  }
  if (report.localScaleReadiness) {
    console.log(
      `Max joined:     ${report.localScaleReadiness.maxJoinedPlayersInSingleGame}/${report.localScaleReadiness.profileMaxPlayers}`
    );
    console.log(
      `Target-hit:     ${report.localScaleReadiness.gamesHittingRequestedPlayerTarget}/${report.localScaleReadiness.sequentialGamesCompleted}`
    );
    console.log(
      `Fully drained:  ${report.localScaleReadiness.fullyDrainedGames}/${report.localScaleReadiness.sequentialGamesCompleted}`
    );
    console.log(
      `Replay-ok:      ${report.localScaleReadiness.replayConsistentGames}/${report.localScaleReadiness.sequentialGamesCompleted}`
    );
    console.log(
      `Succ tx/s:      ${report.localScaleReadiness.throughput.successfulTxPerSecond}`
    );
  }
  if (report.breakageSummary) {
    console.log(
      `Breakage ok:    ${report.breakageSummary.gamesWithUnexpectedFailures === 0 && report.breakageSummary.gamesWithWedgedActiveSlot === 0 && report.breakageSummary.gamesWithDrainMismatch === 0 ? "clean" : "issues detected"}`
    );
    console.log(
      `Probe fails:    ${report.breakageSummary.probeSummary.failedAsExpected}/${report.breakageSummary.probeSummary.attempted}`
    );
    console.log(
      `Unexp fails:    ${report.breakageSummary.totalUnexpectedFailures}`
    );
  }

  if (Array.isArray(report.games)) {
    for (const game of report.games) {
      console.log(`\nGame ${game.gameId} (run #${game.index})`);
      console.log(
        `  Scenario:     ${game.scenario?.type ?? "winner-all-share"}`
      );
      console.log(`  Outcome:      ${game.resultState.outcome}`);
      console.log(`  Path:         ${game.resultState.terminalPath}`);
      console.log(`  Phase:        ${game.resultState.phase}`);
      console.log(`  Round:        ${game.resultState.round}`);
      console.log(`  Share streak: ${game.resultState.shareStreak}`);
      console.log(`  Joined:       ${game.resultState.counts.joined}`);
      console.log(`  Claimed:      ${game.resultState.counts.claimed}`);
      console.log(`  Refunded:     ${game.resultState.counts.refunded}`);
      console.log(
        `  Exp fails:    ${game.expectedFailures?.failedAsExpected ?? 0}/${
          game.expectedFailures?.attempted ?? 0
        }`
      );
      console.log(
        `  Probes:       ${game.probes?.failedAsExpected ?? 0}/${game.probes?.attempted ?? 0}`
      );
      console.log(`  Unexp fails:  ${game.txSummary.failedUnexpected ?? 0}`);
      console.log(`  Manual blocks:${game.blocks.manualMined}`);
      console.log(`  Replay ok:    ${game.replayConsistency.ok}`);
      console.log(
        `  Breakage ok:  ${game.breakageChecks?.ok ?? false}`
      );
      console.log(
        `  Drained:      ${
          game.postRunOutstanding?.fullyDrainedByHarness ?? false
        }`
      );
      console.log(`  Evidence dir: ${game.evidence.outputDir}`);
    }
  }

  console.log(`\nReport:         ${report.paths.report}`);
  console.log(`Tx log:         ${report.paths.txLog}`);
  console.log(`\nBoundary note: ${report.boundaryNote}`);
}
