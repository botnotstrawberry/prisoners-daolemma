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

export const LOAD_HARNESS_SCHEMA_VERSION =
  "prisoners-daollema/load-harness-v1";
export const LOAD_HARNESS_BOUNDARY_NOTE =
  "This is a local Anvil-focused load/chaos harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs scenario-driven gameplay flows with bounded chaos knobs, and writes machine-readable reports plus evidence exports. It does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation.";
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
  mixed: "mixed",
};

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

function parseInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
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
      succeeded: groupEntries.filter((entry) => entry.status === "succeeded").length,
      failed: groupEntries.filter((entry) => entry.status === "failed").length,
      failedExpected: groupEntries.filter(
        (entry) => entry.status === "failed" && entry.failureClass === "expected"
      ).length,
      failedUnexpected: groupEntries.filter(
        (entry) => entry.status === "failed" && entry.failureClass === "unexpected"
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
      (entry) => entry.status === "failed" && entry.failureClass === "unexpected"
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
  };
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
    usedCauseCount: toNumber(snapshot.usedCauseCount, "snapshot.usedCauseCount"),
    committedCount: toNumber(snapshot.committedCount, "snapshot.committedCount"),
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
    outcome: OUTCOME_NAMES[toNumber(snapshot.outcome, "snapshot.outcome")] ?? "Unknown",
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
      `Unsupported scenario '${rawScenario}'. Use winner-all-share, cancelled-underfilled, no-winner-all-catch, a comma-separated list of those, or mixed.`
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
    const scenarioType = selectedScenarioTypes[index % selectedScenarioTypes.length];
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
  const profileName = String(rawOptions.profile ?? "smoke").trim().toLowerCase();
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
  const games = parseInteger(rawOptions.games ?? 1, "games", { min: 1, max: 100 });
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
    rawOptions.scenario !== undefined ? String(rawOptions.scenario) : "winner-all-share";
  const selectedScenarioTypes = parseScenarioSelection(requestedScenario);
  const scenarioPlan = expandScenarioPlan(selectedScenarioTypes, games);

  if (selectedScenarioTypes.length < games && selectedScenarioTypes.length > 0) {
    notes.push(
      `Scenario list ${selectedScenarioTypes.join(", ")} is shorter than games=${games}, so the harness cycles that list across the sequential run.`
    );
  }

  if (
    (skipCommitRate > 0 || skipRevealRate > 0) &&
    scenarioPlan.some((scenario) => scenario.type !== "winner-all-share")
  ) {
    notes.push(
      "skipCommitRate and skipRevealRate only affect winner-all-share games. Cancelled and no-winner scenarios ignore those knobs so their terminal outcomes stay deterministic."
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
      joinDurationSeconds: profile.joinDurationSeconds,
      commitDurationBlocks: profile.commitDurationBlocks,
      revealDurationBlocks: profile.revealDurationBlocks,
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
    failureClass,
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

  if (outcome?.deployTransaction?.hash && typeof outcome.deployTransaction.wait === "function") {
    const receipt = await outcome.deployTransaction.wait();
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: bigintFrom(receipt.gasUsed, "receipt.gasUsed").toString(),
    };
  }

  throw new Error("Tracked transaction result did not expose a transaction hash.");
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
    pushTrackedEntry(tracker, meta, {
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      error: describeError(error),
      failureClass: "unexpected",
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
        expectation: "expected-failure",
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
      `${meta.failureLabel ?? meta.action} unexpectedly succeeded even though the harness expected it to fail.`
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
        expectation: "expected-failure",
      },
      {
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        error: describeError(error),
        failureClass: "expected",
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

function shouldSample({ seed, stage, gameIndex, round, playerIndex, wallet, rate }) {
  if (rate <= 0) {
    return false;
  }
  if (rate >= 1) {
    return true;
  }

  const digest = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
      `${seed}:${stage}:game-${gameIndex}:round-${round}:player-${playerIndex}:${wallet}`
    )
  );
  const sample = Number(BigInt(digest) % 1_000_000n) / 1_000_000;
  return sample < rate;
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

function buildReplayConsistency({
  scenarioType,
  evidence,
  config,
  causeAssignments,
  claimSummary,
  claimWinners,
  refundSummary,
  noWinnerSummary,
}) {
  const summary = evidence.summary;
  const payouts = evidence.payouts;
  const settlement = summary.game.settlement;
  const checks = [];
  const joinedCount = causeAssignments.length;
  const usedCauseCount = uniqueCauseCount(causeAssignments);
  const totalPotWei = (bigintFrom(config.entryFeeWei) * BigInt(joinedCount)).toString();

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
    addCheck("phase", "Ended", summary.game.phase);
    addCheck("outcome", "Winners", summary.game.outcome);
    addCheck("terminalPath", "winner-claims", summary.game.terminalOutcome.terminalPath);
    addCheck("shareStreak", 3, summary.game.shareStreak);
    addCheck("aliveCount", joinedCount, summary.game.counts.alive);
    addCheck("winnerCount", joinedCount, settlement.winnerCount);
    addCheck("claimPathAvailable", true, payouts.settlement.claimPathAvailable);
    if (claimWinners) {
      addCheck("claimedCount", joinedCount, summary.game.counts.claimed);
      addCheck("claimedWinnerCount", joinedCount, payouts.claims.winners.claimedWinnerCount);
      addCheck("grossClaimsVsWinnerShare", (bigintFrom(settlement.winnerShareWei) * BigInt(joinedCount)).toString(), claimSummary.totalGrossPrizeWei);
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
      addCheck("claimedWinnerCount", 0, payouts.claims.winners.claimedWinnerCount);
    }
  } else if (scenarioType === "cancelled-underfilled") {
    addCheck("phase", "Cancelled", summary.game.phase);
    addCheck("outcome", "Cancelled", summary.game.outcome);
    addCheck("terminalPath", "cancelled-refunds", summary.game.terminalOutcome.terminalPath);
    addCheck("round", 0, summary.game.round);
    addCheck("aliveCount", joinedCount, summary.game.counts.alive);
    addCheck("refundedCount", joinedCount, summary.game.counts.refunded);
    addCheck("refundPathAvailable", true, payouts.settlement.refundPathAvailable);
    addCheck("refundPerPlayerWei", config.entryFeeWei, settlement.refundPerPlayerWei);
    addCheck(
      "totalRefundedWei",
      (bigintFrom(config.entryFeeWei) * BigInt(joinedCount)).toString(),
      payouts.claims.refunds.totalRefundedWei
    );
    if (refundSummary) {
      addCheck("refundsAgreeWithEvidence", refundSummary.totalRefundWei, payouts.claims.refunds.totalRefundedWei);
    }
  } else if (scenarioType === "no-winner-all-catch") {
    const totalPot = bigintFrom(config.entryFeeWei) * BigInt(joinedCount);
    const creatorFee = (totalPot * BigInt(config.creatorFeeBps)) / 10_000n;
    const postCreatorPot = totalPot - creatorFee;
    const noWinnerCausePool = (postCreatorPot * NO_WINNER_CAUSE_BPS) / 10_000n;
    const distributedCauseWei = buildCauseDistribution(causeAssignments).reduce(
      (sum, entry) =>
        sum + (noWinnerCausePool * BigInt(entry.entrantCount)) / BigInt(joinedCount),
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
    addCheck("terminalPath", "no-winner-routing", summary.game.terminalOutcome.terminalPath);
    addCheck("round", 1, summary.game.round);
    addCheck("aliveCount", 0, summary.game.counts.alive);
    addCheck("winnerCount", 0, settlement.winnerCount);
    addCheck("noWinnerPathAvailable", true, payouts.settlement.noWinnerPathAvailable);
    addCheck("noWinnerCausePoolWei", noWinnerCausePool.toString(), settlement.noWinnerCausePoolWei);
    addCheck(
      "noWinnerCauseDistributedWei",
      distributedCauseWei.toString(),
      settlement.noWinnerCauseDistributedWei
    );
    addCheck("treasuryAccruedWei", treasuryAccruedWei.toString(), settlement.treasuryAccruedWei);
    addCheck("treasuryWithdrawnWei", treasuryAccruedWei.toString(), payouts.treasury.withdrawnWei);
    addCheck("treasuryClaimableWei", "0", payouts.treasury.claimableWei);
    addCheck("causeClaimableWeiAfterWithdrawals", "0", totalCauseClaimableWei.toString());
    addCheck("causeWithdrawnWei", distributedCauseWei.toString(), totalCauseWithdrawnWei.toString());
    if (noWinnerSummary) {
      addCheck(
        "treasuryWithdrawnAgreeWithHarness",
        noWinnerSummary.treasuryWithdrawal.amountWei,
        payouts.treasury.withdrawnWei
      );
      addCheck(
        "causeWithdrawalsAgreeWithHarness",
        noWinnerSummary.causeWithdrawals.totalAmountWei,
        totalCauseWithdrawnWei.toString()
      );
    }
  } else {
    throw new Error(`Unsupported scenarioType '${scenarioType}' for replay consistency.`);
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
  const authRegistry = await authRegistryFactory.deploy(owner.address, verifier.address);
  await trackedTx(tracker, provider, {
    action: "deployAuthRegistry",
    phase: "deploy",
  }, async () => authRegistry.deployTransaction);
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
  await trackedTx(tracker, provider, {
    action: "deployGame",
    phase: "deploy",
  }, async () => game.deployTransaction);
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
      async () => game.whitelistCause(cause.causeId, cause.recipient, cause.metadataHash)
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

  const registrationResults = await mapConcurrent(players, concurrency, async (player, index) =>
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
      `Auth registration failed for ${failures.length} player(s). First failure: ${describeError(
        failures[0].error
      )}`
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
  const batchResults = await mapConcurrent(items, concurrency, async (item, index) =>
    trackedTx(tracker, provider, buildMeta(item, index), async () => operation(item, index))
  );

  const failures = batchResults.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(
      `${actionName} batch failed for ${failures.length} item(s). First failure: ${describeError(
        failures[0].error
      )}`
    );
  }

  return batchResults.map((result) => result.value);
}

function selectScenarioPlayers(players, scenarioType, config) {
  if (scenarioType === "cancelled-underfilled") {
    const joinedPlayers = Math.min(players.length, Math.max(1, config.minPlayers - 1));
    return players.slice(0, joinedPlayers);
  }

  return [...players];
}

async function runPlannedRound({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  gameId,
  joinedPlayers,
  concurrency,
  seed,
  choice,
  skipCommitRate,
  skipRevealRate,
  tracker,
  scenarioType,
  expectedFailures,
  skippedExpectedFailures,
}) {
  const snapshotBeforeRound = normalizeSnapshot(await gameReader.getGame(gameId));
  if (snapshotBeforeRound.phase !== "Commit") {
    throw new Error(
      `Game ${gameId} is in phase ${snapshotBeforeRound.phase}, not Commit.`
    );
  }

  const round = snapshotBeforeRound.round;
  const roundStartedMs = Date.now();

  const committedPlayers = [];
  const skippedCommitWallets = [];
  for (const player of joinedPlayers) {
    if (
      shouldSample({
        seed,
        stage: "skip-commit",
        gameIndex,
        round,
        playerIndex: player.index,
        wallet: player.wallet.address,
        rate: skipCommitRate,
      })
    ) {
      skippedCommitWallets.push(player.wallet.address);
    } else {
      committedPlayers.push(player);
    }
  }

  const preparedBundles = await Promise.all(
    committedPlayers.map((player) =>
      prepareCommitAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: player.wallet.address,
        choice,
        saltText: `game-${gameIndex}-round-${round}-player-${player.index}`,
      })
    )
  );
  const bundleByWallet = new Map(
    preparedBundles.map((bundle) => [bundle.wallet.toLowerCase(), bundle])
  );

  const commitStartedMs = Date.now();
  await runGameBatch({
    items: committedPlayers,
    concurrency,
    actionName: "commit",
    provider,
    tracker,
    buildMeta: (player) => ({
      action: "commit",
      phase: "commit",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: player.wallet.address,
    }),
    operation: (player) =>
      commitAction({
        provider,
        game: gameAddress,
        gameId,
        commitment: bundleByWallet.get(player.wallet.address.toLowerCase()).commitment,
        wallet: player.wallet.address,
        walletPrivateKey: player.wallet.privateKey,
        allowUnsafePrivateKey: true,
      }),
  });

  if (expectedFailures) {
    if (committedPlayers.length > 0) {
      const duplicateCommitPlayer = committedPlayers[0];
      const bundle = bundleByWallet.get(duplicateCommitPlayer.wallet.address.toLowerCase());
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
          wallet: duplicateCommitPlayer.wallet.address,
        },
        async () =>
          commitAction({
            provider,
            game: gameAddress,
            gameId,
            commitment: bundle.commitment,
            wallet: duplicateCommitPlayer.wallet.address,
            walletPrivateKey: duplicateCommitPlayer.wallet.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
    } else {
      skippedExpectedFailures.push(`round-${round}:duplicate-commit(no committed player)`);
    }
  }

  let manualBlocksMined = 0;
  let commitDeadlineHit = false;
  if (skippedCommitWallets.length > 0) {
    const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
    manualBlocksMined += await minePastBlock(provider, snapshot.commitDeadlineBlock);
    commitDeadlineHit = true;
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

  const revealCandidates = committedPlayers.filter(
    (player) =>
      !shouldSample({
        seed,
        stage: "skip-reveal",
        gameIndex,
        round,
        playerIndex: player.index,
        wallet: player.wallet.address,
        rate: skipRevealRate,
      })
  );
  const revealCandidateWallets = new Set(
    revealCandidates.map((player) => player.wallet.address.toLowerCase())
  );
  const skippedRevealWallets = committedPlayers
    .filter((player) => !revealCandidateWallets.has(player.wallet.address.toLowerCase()))
    .map((player) => player.wallet.address);

  const revealStartedMs = Date.now();
  await runGameBatch({
    items: revealCandidates,
    concurrency,
    actionName: "reveal",
    provider,
    tracker,
    buildMeta: (player) => ({
      action: "reveal",
      phase: "reveal",
      scenarioType,
      gameIndex,
      gameId,
      round,
      wallet: player.wallet.address,
    }),
    operation: (player) => {
      const bundle = bundleByWallet.get(player.wallet.address.toLowerCase());
      return revealAction({
        provider,
        game: gameAddress,
        gameId,
        wallet: player.wallet.address,
        walletPrivateKey: player.wallet.privateKey,
        allowUnsafePrivateKey: true,
        choice: bundle.choice,
        salt: bundle.salt,
      });
    },
  });

  if (expectedFailures) {
    if (revealCandidates.length > 0) {
      const duplicateRevealPlayer = revealCandidates[0];
      const bundle = bundleByWallet.get(duplicateRevealPlayer.wallet.address.toLowerCase());
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
          wallet: duplicateRevealPlayer.wallet.address,
        },
        async () =>
          revealAction({
            provider,
            game: gameAddress,
            gameId,
            wallet: duplicateRevealPlayer.wallet.address,
            walletPrivateKey: duplicateRevealPlayer.wallet.privateKey,
            allowUnsafePrivateKey: true,
            choice: bundle.choice,
            salt: bundle.salt,
          })
      );
    } else {
      skippedExpectedFailures.push(`round-${round}:duplicate-reveal(no revealed player)`);
    }
  }

  let revealDeadlineHit = false;
  if (skippedRevealWallets.length > 0) {
    const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
    manualBlocksMined += await minePastBlock(provider, snapshot.revealDeadlineBlock);
    revealDeadlineHit = true;
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
        choice: choice[0].toUpperCase() + choice.slice(1),
        intendedPlayers: joinedPlayers.length,
      },
      commit: {
        submitted: committedPlayers.length,
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
        submitted: revealCandidates.length,
        skipped: skippedRevealWallets.length,
        skippedWallets: skippedRevealWallets,
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
  claimWinners,
  expectedFailures,
  tracker,
  runDir,
}) {
  const gameStartedAtMs = Date.now();
  const startBlock = await provider.getBlockNumber();
  const scenarioType = scenario.type;
  const skippedExpectedFailures = [];

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
  const createEntry = tracker.entries.find(
    (entry) => entry.txHash === createResult.txHash
  );
  if (createEntry) {
    createEntry.gameId = gameId;
  }

  const joinedPlayers = selectScenarioPlayers(players, scenarioType, config);
  const causeAssignments = joinedPlayers.map((player) => ({
    wallet: player.wallet.address,
    causeId: assignCauseId(player.index, gameIndex, causeCount),
  }));

  const joinStartedMs = Date.now();
  await runGameBatch({
    items: joinedPlayers,
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
          causeId: assignCauseId(duplicateJoinPlayer.index, gameIndex, causeCount),
        },
        async () =>
          joinGameAction({
            provider,
            game: gameAddress,
            gameId,
            causeId: assignCauseId(duplicateJoinPlayer.index, gameIndex, causeCount),
            wallet: duplicateJoinPlayer.wallet.address,
            walletPrivateKey: duplicateJoinPlayer.wallet.privateKey,
            allowUnsafePrivateKey: true,
          })
      );
    } else {
      skippedExpectedFailures.push("duplicate-join(no joined player)");
    }
  }

  await provider.send("evm_increaseTime", [config.joinDurationSeconds + 1]);
  await provider.send("evm_mine", []);
  let manualBlocksMined = 1;

  const roundReports = [];
  let totalSkippedCommits = 0;
  let totalSkippedReveals = 0;
  let commitDeadlineRounds = 0;
  let revealDeadlineRounds = 0;
  let joinDurationMs = 0;

  if (scenarioType === "cancelled-underfilled") {
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
        const snapshotBeforeRound = normalizeSnapshot(await gameReader.getGame(gameId));
        if (snapshotBeforeRound.phase !== "Commit") {
          break;
        }

        const roundResult = await runPlannedRound({
          provider,
          owner,
          gameReader,
          gameAddress,
          gameIndex,
          gameId,
          joinedPlayers,
          concurrency,
          seed,
          choice: "share",
          skipCommitRate,
          skipRevealRate,
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
      const roundResult = await runPlannedRound({
        provider,
        owner,
        gameReader,
        gameAddress,
        gameIndex,
        gameId,
        joinedPlayers,
        concurrency,
        seed,
        choice: "catch",
        skipCommitRate: 0,
        skipRevealRate: 0,
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
    } else {
      throw new Error(`Unsupported scenario type '${scenarioType}'.`);
    }
  }

  const settlementStartedMs = Date.now();
  let claimResults = [];
  let refundResults = [];
  let treasuryWithdrawal = null;
  let causeWithdrawalResults = [];

  if (scenarioType === "winner-all-share") {
    if (claimWinners) {
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
              claimAction({
                provider,
                game: gameAddress,
                gameId,
                wallet: duplicateClaimPlayer.wallet.address,
                walletPrivateKey: duplicateClaimPlayer.wallet.privateKey,
                allowUnsafePrivateKey: true,
              })
          );
        } else {
          skippedExpectedFailures.push("duplicate-claim(no winner)");
        }
      }
    } else if (expectedFailures) {
      skippedExpectedFailures.push("duplicate-claim(skipped because winner claims disabled)");
    }
  } else if (scenarioType === "cancelled-underfilled") {
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
            refundAction({
              provider,
              game: gameAddress,
              gameId,
              wallet: duplicateRefundPlayer.wallet.address,
              walletPrivateKey: duplicateRefundPlayer.wallet.privateKey,
              allowUnsafePrivateKey: true,
            })
        );
      } else {
        skippedExpectedFailures.push("duplicate-refund(no refunded player)");
      }
    }
  } else if (scenarioType === "no-winner-all-catch") {
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

    const usedCauseDistribution = buildCauseDistribution(causeAssignments);
    for (const causeEntry of usedCauseDistribution) {
      const claimableWei = bigintFrom(
        await gameReader.gameCauseClaimableAmount(gameId, causeEntry.causeId),
        `cause-${causeEntry.causeId}.claimableWei`
      );
      if (claimableWei === 0n) {
        continue;
      }
      causeWithdrawalResults.push(
        await trackedTx(
          tracker,
          provider,
          {
            action: "withdrawCause",
            phase: "settlement",
            scenarioType,
            gameIndex,
            gameId,
            wallet: owner.address,
            causeId: causeEntry.causeId,
          },
          async () =>
            withdrawCauseAction({
              provider,
              game: gameAddress,
              gameId,
              causeId: causeEntry.causeId,
              wallet: owner.address,
              walletPrivateKey: owner.privateKey,
              allowUnsafePrivateKey: true,
            })
        )
      );
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
        skippedExpectedFailures.push("duplicate-withdraw-treasury(no treasury withdrawal)");
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
        skippedExpectedFailures.push("duplicate-withdraw-cause(no cause withdrawal)");
      }
    }
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
  const causeWithdrawalSummary = aggregateCauseWithdrawals(causeWithdrawalResults);
  const noWinnerSummary = {
    treasuryWithdrawal: treasuryWithdrawal
      ? {
          executed: true,
          amountWei: treasuryWithdrawal.amountWei,
          recipient: treasuryWithdrawal.recipient,
        }
      : {
          executed: false,
          amountWei: "0",
          recipient: null,
        },
    causeWithdrawals: causeWithdrawalSummary,
  };

  const replayConsistency = buildReplayConsistency({
    scenarioType,
    evidence: exported.evidence,
    config,
    causeAssignments,
    claimSummary,
    claimWinners,
    refundSummary,
    noWinnerSummary,
  });

  const endBlock = await provider.getBlockNumber();
  const gameEntries = tracker.entries.filter((entry) => entry.gameId === gameId);
  const gameTxSummary = buildTxSummary(gameEntries);

  const notes = [scenario.description];
  if (scenarioType !== "winner-all-share" && (skipCommitRate > 0 || skipRevealRate > 0)) {
    notes.push(
      "skipCommitRate/skipRevealRate were ignored for this game so the requested scenario terminal outcome stayed deterministic."
    );
  }
  if (scenarioType === "winner-all-share") {
    notes.push(
      "Missed commits/reveals, when configured, rely on the contract's current default-to-SHARE behavior rather than injecting invalid move payloads."
    );
    if (!claimWinners) {
      notes.push(
        "Winner claims were skipped for this run, so claimed-count and payout reconciliation checks are intentionally incomplete."
      );
    }
  }
  if (expectedFailures && skippedExpectedFailures.length > 0) {
    notes.push(
      `Expected-failure mode skipped some duplicate checks because the prerequisite successful action never happened: ${skippedExpectedFailures.join(", ")}.`
    );
  }

  return {
    index: gameIndex,
    gameId,
    scenario: {
      type: scenario.type,
      family: scenario.family,
      description: scenario.description,
      terminalPath: scenario.terminalPath,
      expectedFailuresEnabled: expectedFailures,
      registeredPlayers: players.length,
      plannedJoinedPlayers: joinedPlayers.length,
      nonJoiningRegisteredPlayers: players.length - joinedPlayers.length,
    },
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
    withdrawals: {
      treasury: noWinnerSummary.treasuryWithdrawal,
      causes: causeWithdrawalSummary,
    },
    terminalActions: {
      path: scenario.terminalPath,
      winnerClaimsExecuted: claimSummary.succeeded,
      refundsExecuted: refundSummary.succeeded,
      treasuryWithdrawalExecuted: noWinnerSummary.treasuryWithdrawal.executed,
      causeWithdrawalsExecuted: causeWithdrawalSummary.succeeded,
    },
    expectedFailures: {
      enabled: expectedFailures,
      attempted: gameEntries.filter((entry) => entry.expectation === "expected-failure").length,
      failedAsExpected: gameTxSummary.failedExpected,
      unexpectedSuccesses: gameTxSummary.unexpectedSuccesses,
    },
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
    replayConsistency,
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
        "scenario-driven local flows: winner-all-share, cancelled-underfilled, and no-winner-all-catch, with optional winner-path deadline misses and deterministic expected-failure injection.",
    },
    options: {
      playerCount: options.playerCount,
      causeCount: options.causeCount,
      games: options.games,
      concurrency: options.concurrency,
      skipCommitRate: options.skipCommitRate,
      skipRevealRate: options.skipRevealRate,
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
      "The harness now covers winner, cancelled/underfilled, and all-catch no-winner local flows plus deterministic duplicate-operation checks when expected-failure mode is enabled, but it still does not cover auth expiry, multi-instance parallel deployments, or broader invalid-op fuzzing.",
      "The included automated smoke test proves only small local runs. A 250-player result still needs to be produced intentionally by running the harness with a larger profile; it is not CI-proven by this patch alone.",
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

    const report = {
      ...baseReport,
      status: "ok",
      startedAt,
      finishedAt,
      wallClockMs: Date.parse(finishedAt) - Date.parse(startedAt),
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
          .filter((entry) => entry.phase === "bootstrap" || entry.phase === "deploy")
          .map((entry) => entry.blockNumber)
          .filter((value) => value !== null)
          .reduce((max, value) => Math.max(max, value), initialBlock),
      },
      chaos: {
        skipCommitRate: options.skipCommitRate,
        skipRevealRate: options.skipRevealRate,
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
      },
      scenarioSummary: {
        byType: groupCount(games, (game) => game.scenario.type),
        byTerminalOutcome: groupCount(games, (game) => game.resultState.outcome),
        byTerminalPath: groupCount(games, (game) => game.resultState.terminalPath),
      },
      txSummary: buildTxSummary(tracker.entries),
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
  console.log(`Profile:        ${report.profile.name} (${report.profile.source})`);
  console.log(`Run dir:        ${report.paths.runDir}`);
  console.log(`Players:        ${report.options.playerCount}`);
  console.log(`Causes:         ${report.options.causeCount}`);
  console.log(`Games:          ${report.options.games}`);
  console.log(`Concurrency:    ${report.options.concurrency}`);
  console.log(`Scenario req:   ${report.scenarios?.requested ?? report.options.requestedScenario ?? "winner-all-share"}`);
  console.log(`Scenario plan:  ${(report.scenarios?.plan ?? report.options.selectedScenarioTypes ?? ["winner-all-share"]).join(", ")}`);
  console.log(`Skip commit:    ${report.options.skipCommitRate}`);
  console.log(`Skip reveal:    ${report.options.skipRevealRate}`);
  console.log(`Exp failures:   ${report.options.expectedFailures ? "enabled" : "disabled"}`);
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

  if (Array.isArray(report.games)) {
    for (const game of report.games) {
      console.log(`\nGame ${game.gameId} (run #${game.index})`);
      console.log(`  Scenario:     ${game.scenario?.type ?? "winner-all-share"}`);
      console.log(`  Outcome:      ${game.resultState.outcome}`);
      console.log(`  Path:         ${game.resultState.terminalPath}`);
      console.log(`  Phase:        ${game.resultState.phase}`);
      console.log(`  Round:        ${game.resultState.round}`);
      console.log(`  Share streak: ${game.resultState.shareStreak}`);
      console.log(`  Joined:       ${game.resultState.counts.joined}`);
      console.log(`  Claimed:      ${game.resultState.counts.claimed}`);
      console.log(`  Refunded:     ${game.resultState.counts.refunded}`);
      console.log(`  Exp fails:    ${game.expectedFailures?.failedAsExpected ?? 0}/${game.expectedFailures?.attempted ?? 0}`);
      console.log(`  Unexp fails:  ${game.txSummary.failedUnexpected ?? 0}`);
      console.log(`  Manual blocks:${game.blocks.manualMined}`);
      console.log(`  Replay ok:    ${game.replayConsistency.ok}`);
      console.log(`  Evidence dir: ${game.evidence.outputDir}`);
    }
  }

  console.log(`\nReport:         ${report.paths.report}`);
  console.log(`Tx log:         ${report.paths.txLog}`);
  console.log(`\nBoundary note: ${report.boundaryNote}`);
}
