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
  claimAction,
  commitAction,
  createGameAction,
  joinGameAction,
  prepareCommitAction,
  revealAction,
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
  "prisoners-daollema/load-harness-v0";
export const LOAD_HARNESS_BOUNDARY_NOTE =
  "This is a local Anvil-focused load/chaos harness for the current repo-native auth/game/query surface. It deploys fresh contracts, registers synthetic wallets through verifier-approved permit/register, runs deterministic gameplay flows with bounded chaos knobs, and writes machine-readable reports plus evidence exports. It does not claim live-network realism, does not run the full SIWA wrapper, and does not replace broader Foundry/Sepolia validation.";
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
  const summary = {
    attempted: entries.length,
    succeeded: entries.filter((entry) => entry.status === "succeeded").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    reverted: entries.filter(
      (entry) => entry.status === "failed" && looksLikeRevert(entry.error)
    ).length,
  };

  function summarizeBy(groupSelector) {
    const grouped = new Map();
    for (const entry of entries) {
      const key = groupSelector(entry);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(entry);
    }

    const result = {};
    for (const [key, groupEntries] of [...grouped.entries()].sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]))
    )) {
      const gasValues = groupEntries
        .filter((entry) => entry.status === "succeeded" && entry.gasUsed !== null)
        .map((entry) => bigintFrom(entry.gasUsed, `${key}.gasUsed`));
      const latencyValues = groupEntries.map((entry) => entry.durationMs);

      result[key] = {
        attempted: groupEntries.length,
        succeeded: groupEntries.filter((entry) => entry.status === "succeeded").length,
        failed: groupEntries.filter((entry) => entry.status === "failed").length,
        reverted: groupEntries.filter(
          (entry) => entry.status === "failed" && looksLikeRevert(entry.error)
        ).length,
        gasUsed: bigintStats(gasValues),
        latencyMs: numberStats(latencyValues),
      };
    }

    return result;
  }

  const totalGasValues = entries
    .filter((entry) => entry.status === "succeeded" && entry.gasUsed !== null)
    .map((entry) => bigintFrom(entry.gasUsed, "entry.gasUsed"));
  const latencyValues = entries.map((entry) => entry.durationMs);

  return {
    ...summary,
    gasUsed: bigintStats(totalGasValues),
    latencyMs: numberStats(latencyValues),
    byAction: summarizeBy((entry) => entry.action),
    byPhase: summarizeBy((entry) => entry.phase),
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
    const finishedAt = new Date().toISOString();
    tracker.entries.push({
      index: tracker.nextIndex++,
      status: "succeeded",
      action: meta.action,
      phase: meta.phase,
      gameIndex: meta.gameIndex ?? null,
      gameId: meta.gameId ?? null,
      round: meta.round ?? null,
      wallet: meta.wallet ?? null,
      causeId: meta.causeId ?? null,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      error: null,
    });
    return outcome;
  } catch (error) {
    tracker.entries.push({
      index: tracker.nextIndex++,
      status: "failed",
      action: meta.action,
      phase: meta.phase,
      gameIndex: meta.gameIndex ?? null,
      gameId: meta.gameId ?? null,
      round: meta.round ?? null,
      wallet: meta.wallet ?? null,
      causeId: meta.causeId ?? null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      txHash: null,
      blockNumber: null,
      gasUsed: null,
      error: describeError(error),
    });
    throw error;
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

function buildReplayConsistency({
  evidence,
  playerCount,
  causeCount,
  entryFeeWei,
  claimSummary,
  claimWinners,
}) {
  const summary = evidence.summary;
  const settlement = summary.game.settlement;
  const checks = [];

  function addCheck(name, expected, actual) {
    checks.push({
      name,
      expected,
      actual,
      ok: expected === actual,
    });
  }

  addCheck("phase", "Ended", summary.game.phase);
  addCheck("outcome", "Winners", summary.game.outcome);
  addCheck("shareStreak", 3, summary.game.shareStreak);
  addCheck("joinedCount", playerCount, summary.game.counts.joined);
  addCheck("aliveCount", playerCount, summary.game.counts.alive);
  if (claimWinners) {
    addCheck("claimedCount", playerCount, summary.game.counts.claimed);
  }
  addCheck("usedCauses", causeCount, summary.game.counts.usedCauses);
  addCheck("settlementFinalized", true, settlement.finalized);
  addCheck(
    "winnerCount",
    playerCount,
    settlement.winnerCount
  );
  addCheck(
    "totalPotWei",
    (bigintFrom(entryFeeWei) * BigInt(playerCount)).toString(),
    settlement.totalPotWei
  );
  if (claimWinners) {
    addCheck(
      "grossClaimsVsWinnerShare",
      (bigintFrom(settlement.winnerShareWei) * BigInt(playerCount)).toString(),
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

async function runSingleGame({
  provider,
  owner,
  gameReader,
  gameAddress,
  gameIndex,
  players,
  causeCount,
  config,
  concurrency,
  seed,
  skipCommitRate,
  skipRevealRate,
  claimWinners,
  tracker,
  runDir,
}) {
  const gameStartedAtMs = Date.now();
  const startBlock = await provider.getBlockNumber();

  const createResult = await trackedTx(
    tracker,
    provider,
    {
      action: "createGame",
      phase: "create",
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

  const causeAssignments = players.map((player) => ({
    wallet: player.wallet.address,
    causeId: assignCauseId(player.index, gameIndex, causeCount),
  }));

  const joinStartedMs = Date.now();
  await runGameBatch({
    items: players,
    concurrency,
    actionName: "join",
    provider,
    tracker,
    buildMeta: (player) => ({
      action: "join",
      phase: "joining",
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

  await provider.send("evm_increaseTime", [config.joinDurationSeconds + 1]);
  await provider.send("evm_mine", []);
  await trackedTx(
    tracker,
    provider,
    {
      action: "advanceFromJoining",
      phase: "joining",
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
  const joinDurationMs = Date.now() - joinStartedMs;

  const roundReports = [];
  let totalSkippedCommits = 0;
  let totalSkippedReveals = 0;
  let commitDeadlineRounds = 0;
  let revealDeadlineRounds = 0;
  let manualBlocksMined = 1;

  while (true) {
    const snapshotBeforeRound = normalizeSnapshot(await gameReader.getGame(gameId));
    if (snapshotBeforeRound.phase !== "Commit") {
      break;
    }

    const round = snapshotBeforeRound.round;
    const roundStartedMs = Date.now();

    const committedPlayers = [];
    const skippedCommitWallets = [];
    for (const player of players) {
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
          choice: "share",
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

    let commitDeadlineHit = false;
    if (skippedCommitWallets.length > 0) {
      const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
      manualBlocksMined += await minePastBlock(provider, snapshot.commitDeadlineBlock);
      commitDeadlineHit = true;
      commitDeadlineRounds += 1;
    }

    const commitAdvanceResult = await trackedTx(
      tracker,
      provider,
      {
        action: "advanceFromCommit",
        phase: "commit",
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
    const skippedRevealWallets = committedPlayers
      .filter(
        (player) =>
          !revealCandidates.some(
            (candidate) =>
              candidate.wallet.address.toLowerCase() === player.wallet.address.toLowerCase()
          )
      )
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

    let revealDeadlineHit = false;
    if (skippedRevealWallets.length > 0) {
      const snapshot = normalizeSnapshot(await gameReader.getGame(gameId));
      manualBlocksMined += await minePastBlock(provider, snapshot.revealDeadlineBlock);
      revealDeadlineHit = true;
      revealDeadlineRounds += 1;
    }

    const revealAdvanceResult = await trackedTx(
      tracker,
      provider,
      {
        action: "advanceFromReveal",
        phase: "reveal",
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

    totalSkippedCommits += skippedCommitWallets.length;
    totalSkippedReveals += skippedRevealWallets.length;

    roundReports.push({
      round,
      wallClockMs: Date.now() - roundStartedMs,
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
    });

    if (revealAdvanceResult.outcome !== "Unset") {
      break;
    }
  }

  const settlementStartedMs = Date.now();
  let claimResults = [];
  if (claimWinners) {
    const claimBatchResults = await runGameBatch({
      items: players,
      concurrency,
      actionName: "claim",
      provider,
      tracker,
      buildMeta: (player) => ({
        action: "claim",
        phase: "settlement",
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
    claimResults = claimBatchResults;
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
  const replayConsistency = buildReplayConsistency({
    evidence: exported.evidence,
    playerCount: players.length,
    causeCount,
    entryFeeWei: config.entryFeeWei,
    claimSummary,
    claimWinners,
  });

  const endBlock = await provider.getBlockNumber();
  const gameEntries = tracker.entries.filter((entry) => entry.gameId === gameId);

  return {
    index: gameIndex,
    gameId,
    wallClockMs: Date.now() - gameStartedAtMs,
    blocks: {
      start: startBlock,
      end: endBlock,
      mined: endBlock - startBlock,
      manualMined: manualBlocksMined,
    },
    playerCount: players.length,
    causeCount,
    causeDistribution: groupCount(causeAssignments, (entry) => `cause-${entry.causeId}`)
      .map((entry) => ({
        causeId: Number(entry.key.replace("cause-", "")),
        entrantCount: entry.count,
      }))
      .sort((a, b) => a.causeId - b.causeId),
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
    txSummary: buildTxSummary(gameEntries),
    resultState: {
      phase: exported.evidence.summary.game.phase,
      outcome: exported.evidence.summary.game.outcome,
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
    notes: [
      "Gameplay plan currently uses a deterministic all-share winner path. Missed commits/reveals, when configured, rely on the contract's current default-to-SHARE behavior instead of injecting invalid tx attempts.",
      ...(claimWinners
        ? []
        : [
            "Winner claims were skipped for this run, so claimed-count and payout reconciliation checks are intentionally incomplete.",
          ]),
    ],
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
      strategy: "all-share winner path with optional missed commit/reveal chaos",
    },
    options: {
      playerCount: options.playerCount,
      causeCount: options.causeCount,
      games: options.games,
      concurrency: options.concurrency,
      skipCommitRate: options.skipCommitRate,
      skipRevealRate: options.skipRevealRate,
      claimWinners: options.claimWinners,
      seed: options.seed,
    },
    config: options.profileConfig,
    paths: {
      runDir: options.runDir,
      report: join(options.runDir, "report.json"),
      txLog: join(options.runDir, "txs.jsonl"),
    },
    limitations: [
      "This harness currently drives verifier-approved permit/register directly for speed; it does not rehearse the full SIWA nonce/sign/verify wrapper.",
      "The gameplay plan currently covers the deterministic all-share winner path, plus missed commit/reveal deadline pressure. It does not yet cover no-winner settlement, refund flow, invalid-attempt chaos, auth expiry, or multi-instance parallel deployments.",
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
          gameIndex,
          players,
          causeCount: options.causeCount,
          config: options.profileConfig,
          concurrency: options.concurrency,
          seed: options.seed,
          skipCommitRate: options.skipCommitRate,
          skipRevealRate: options.skipRevealRate,
          claimWinners: options.claimWinners,
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
  console.log(`Skip commit:    ${report.options.skipCommitRate}`);
  console.log(`Skip reveal:    ${report.options.skipRevealRate}`);
  if (report.environment) {
    console.log(`RPC URL:        ${report.environment.rpcUrl}`);
    console.log(`Chain ID:       ${report.environment.chainId}`);
    console.log(`Blocks mined:   ${report.environment.blocksMined}`);
  }
  console.log(`Tx attempted:   ${report.txSummary.attempted}`);
  console.log(`Tx succeeded:   ${report.txSummary.succeeded}`);
  console.log(`Tx failed:      ${report.txSummary.failed}`);
  console.log(`Gas total:      ${report.txSummary.gasUsed.total}`);
  console.log(`Wall clock ms:  ${report.wallClockMs}`);

  if (Array.isArray(report.games)) {
    for (const game of report.games) {
      console.log(`\nGame ${game.gameId} (run #${game.index})`);
      console.log(`  Outcome:      ${game.resultState.outcome}`);
      console.log(`  Phase:        ${game.resultState.phase}`);
      console.log(`  Round:        ${game.resultState.round}`);
      console.log(`  Share streak: ${game.resultState.shareStreak}`);
      console.log(`  Joined:       ${game.resultState.counts.joined}`);
      console.log(`  Claimed:      ${game.resultState.counts.claimed}`);
      console.log(`  Manual blocks:${game.blocks.manualMined}`);
      console.log(`  Replay ok:    ${game.replayConsistency.ok}`);
      console.log(`  Evidence dir: ${game.evidence.outputDir}`);
    }
  }

  console.log(`\nReport:         ${report.paths.report}`);
  console.log(`Tx log:         ${report.paths.txLog}`);
  console.log(`\nBoundary note: ${report.boundaryNote}`);
}
