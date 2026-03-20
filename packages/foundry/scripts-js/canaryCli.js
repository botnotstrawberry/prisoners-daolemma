import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import {
  createProvider,
  normalizeAddress,
  parseCliArgs,
  printJson,
  resolveFromPackageRoot,
} from "./authTooling.js";

const moduleFilePath = fileURLToPath(import.meta.url);
const __dirname = dirname(moduleFilePath);
loadEnv({ path: join(__dirname, "..", ".env") });

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_NETWORK_NAME = "baseSepolia";
export const CANARY_PROFILE_SCHEMA =
  "prisoners-daolemma/base-sepolia-canary-profile-v0";
export const CANARY_PREFLIGHT_SCHEMA =
  "prisoners-daolemma/base-sepolia-canary-preflight-v0";
export const CANARY_DEPLOYMENT_SCHEMA =
  "prisoners-daolemma/base-sepolia-canary-deployment-v0";

export const RECOMMENDED_CANARY_PROFILE = Object.freeze({
  entryFeeWei: ethers.utils.parseEther("0.001").toString(),
  creatorFeeBps: 100,
  causeFeeBps: 100,
  joinDurationSeconds: 900,
  commitDurationBlocks: 20,
  revealDurationBlocks: 20,
  minPlayers: 3,
  maxPlayers: 32,
  maxCauses: 8,
});

const GAME_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function authRegistry() view returns (address)",
  "function getDefaultConfig() view returns ((uint256 entryFeeWei,uint16 creatorFeeBps,uint16 causeFeeBps,uint32 joinDurationSeconds,uint32 commitDurationBlocks,uint32 revealDurationBlocks,uint16 minPlayers,uint16 maxPlayers,uint16 maxCauses))",
  "function causeCount() view returns (uint256)",
  "function causeAt(uint256 index) view returns (uint16)",
  "function getCause(uint16 causeId) view returns ((bool active,address recipient,bytes32 metadataHash))",
  "function activeGameId() view returns (uint256)",
  "function currentGameId() view returns (uint256)",
];

const REGISTRY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function verifier() view returns (address)",
  "function gameNamespace() view returns (bytes32)",
];

const CHAT_ADMIN_ABI = [
  "function game() view returns (address)",
  "function messageCount() view returns (uint256)",
];

function printMainHelp() {
  console.log(`
Prisoners DAOlemma Base Sepolia canary helper

Usage:
  node scripts-js/canaryCli.js <command> [options]

Commands:
  preflight   Check Base Sepolia canary inputs before deployment.
  deployment  Inspect a deployed Base Sepolia canary deployment and its current admin wiring.

Run a command with --help for details.
`);
}

function printPreflightHelp() {
  console.log(`
Usage:
  node scripts-js/canaryCli.js preflight [--rpc-url <url|network>] [--deployer-keystore <name|path>] [--out <file>] [--json]

Options:
  --rpc-url <url|network>         Optional. Defaults to baseSepolia.
  --deployer-keystore <name|path> Optional explicit deployer keystore to validate.
  --out <file>                    Optional JSON output path.
  --json                          Print machine-readable JSON.

What it checks:
  - connected chain is Base Sepolia (84532)
  - deployer keystore exists when provided
  - expected owner / treasury / auth verifier env values or deployer fallbacks
  - current PRISONERS_* deploy env against the recommended Base Sepolia canary profile
  - BaseScan API key presence for explorer verification

Notes:
  - Missing PRISONERS_OWNER / PRISONERS_TREASURY / PRISONERS_AUTH_VERIFIER are warnings, not hard failures, because the deploy script falls back to deployer/owner defaults.
  - Missing BASESCAN_API_KEY is a warning because it blocks repo-native verification later.
  - This command never prints secrets.

Example:
  node scripts-js/canaryCli.js preflight --rpc-url baseSepolia --deployer-keystore deployer-sepolia --json
`);
}

function printDeploymentHelp() {
  console.log(`
Usage:
  node scripts-js/canaryCli.js deployment [--rpc-url <url|network>] [--deployment-file <path>] [--out <file>] [--json]

Options:
  --rpc-url <url|network>         Optional. Defaults to baseSepolia.
  --deployment-file <path>        Optional. Defaults to deployments/84532.json.
  --out <file>                    Optional JSON output path.
  --json                          Print machine-readable JSON.

What it checks:
  - deployed AgentAuthRegistry / PrisonersDAOlemma / GameChat addresses from the repo deployment file
  - owner / treasury / verifier wiring onchain
  - default config against the recommended Base Sepolia canary profile
  - chat->game and game->registry linkage
  - current game counters and current known cause whitelist state

Notes:
  - If active cause count is zero, createGame() will revert until causes are whitelisted.
  - If currentGameId or messageCount are already non-zero, this is not a fresh canary deployment anymore.

Example:
  node scripts-js/canaryCli.js deployment --rpc-url baseSepolia --out canary/base-sepolia/deployment-summary.json --json
`);
}

function parsePositiveIntegerFromEnv(env, key, defaultValue) {
  const raw = env[key];
  if (raw === undefined || raw === null || String(raw).trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer when set.`);
  }
  return parsed;
}

function parseNonNegativeIntegerFromEnv(env, key, defaultValue) {
  const raw = env[key];
  if (raw === undefined || raw === null || String(raw).trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer when set.`);
  }
  return parsed;
}

function parseAddressFromEnv(env, key) {
  const raw = env[key];
  if (raw === undefined || raw === null || String(raw).trim().length === 0) {
    return null;
  }
  return normalizeAddress(String(raw).trim(), key);
}

function normalizeConfigTuple(rawConfig) {
  return {
    entryFeeWei: rawConfig.entryFeeWei.toString(),
    creatorFeeBps: Number(rawConfig.creatorFeeBps),
    causeFeeBps: Number(rawConfig.causeFeeBps),
    joinDurationSeconds: Number(rawConfig.joinDurationSeconds),
    commitDurationBlocks: Number(rawConfig.commitDurationBlocks),
    revealDurationBlocks: Number(rawConfig.revealDurationBlocks),
    minPlayers: Number(rawConfig.minPlayers),
    maxPlayers: Number(rawConfig.maxPlayers),
    maxCauses: Number(rawConfig.maxCauses),
  };
}

export function resolveCanaryProfile(env = process.env) {
  return {
    schemaVersion: CANARY_PROFILE_SCHEMA,
    entryFeeWei:
      env.PRISONERS_ENTRY_FEE_WEI &&
      String(env.PRISONERS_ENTRY_FEE_WEI).trim().length > 0
        ? ethers.BigNumber.from(
            String(env.PRISONERS_ENTRY_FEE_WEI).trim()
          ).toString()
        : RECOMMENDED_CANARY_PROFILE.entryFeeWei,
    creatorFeeBps: parseNonNegativeIntegerFromEnv(
      env,
      "PRISONERS_CREATOR_FEE_BPS",
      RECOMMENDED_CANARY_PROFILE.creatorFeeBps
    ),
    causeFeeBps: parseNonNegativeIntegerFromEnv(
      env,
      "PRISONERS_CAUSE_FEE_BPS",
      RECOMMENDED_CANARY_PROFILE.causeFeeBps
    ),
    joinDurationSeconds: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_JOIN_DURATION_SECONDS",
      RECOMMENDED_CANARY_PROFILE.joinDurationSeconds
    ),
    commitDurationBlocks: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_COMMIT_DURATION_BLOCKS",
      RECOMMENDED_CANARY_PROFILE.commitDurationBlocks
    ),
    revealDurationBlocks: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_REVEAL_DURATION_BLOCKS",
      RECOMMENDED_CANARY_PROFILE.revealDurationBlocks
    ),
    minPlayers: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_MIN_PLAYERS",
      RECOMMENDED_CANARY_PROFILE.minPlayers
    ),
    maxPlayers: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_MAX_PLAYERS",
      RECOMMENDED_CANARY_PROFILE.maxPlayers
    ),
    maxCauses: parsePositiveIntegerFromEnv(
      env,
      "PRISONERS_MAX_CAUSES",
      RECOMMENDED_CANARY_PROFILE.maxCauses
    ),
  };
}

export function compareProfiles(actual, expected = RECOMMENDED_CANARY_PROFILE) {
  const mismatches = [];
  for (const key of Object.keys(expected)) {
    const actualValue = String(actual[key]);
    const expectedValue = String(expected[key]);
    if (actualValue !== expectedValue) {
      mismatches.push({
        field: key,
        actual: actualValue,
        expected: expectedValue,
      });
    }
  }

  return {
    matchesRecommendedProfile: mismatches.length === 0,
    mismatches,
  };
}

function resolveKeystorePath(keystore) {
  if (typeof keystore !== "string" || keystore.trim().length === 0) {
    return null;
  }

  const trimmed = keystore.trim();
  const explicitPath =
    trimmed.startsWith(".") ||
    trimmed.startsWith("~") ||
    trimmed.includes("/") ||
    trimmed.includes("\\");

  if (!explicitPath) {
    return join(
      process.env.HOME ?? homedir(),
      ".foundry",
      "keystores",
      trimmed
    );
  }

  if (trimmed === "~") {
    return homedir();
  }

  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }

  if (isAbsolute(trimmed)) {
    return trimmed;
  }

  return resolveFromPackageRoot(trimmed);
}

export function readDeployerAddressFromKeystore(keystore) {
  const resolvedPath = resolveKeystorePath(keystore);
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return { resolvedPath, address: null, exists: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse deployer keystore JSON at ${resolvedPath}: ${error.message}`
    );
  }

  const rawAddress = parsed?.address;
  if (typeof rawAddress !== "string" || rawAddress.length === 0) {
    throw new Error(
      `Deployer keystore at ${resolvedPath} does not expose an address field.`
    );
  }

  const prefixed = rawAddress.startsWith("0x") ? rawAddress : `0x${rawAddress}`;
  return {
    resolvedPath,
    exists: true,
    address: normalizeAddress(prefixed, "deployerKeystore.address"),
  };
}

function resolveExpectedRoles(env, deployerAddress) {
  const explicitOwner = parseAddressFromEnv(env, "PRISONERS_OWNER");
  const explicitTreasury = parseAddressFromEnv(env, "PRISONERS_TREASURY");
  const explicitVerifier = parseAddressFromEnv(env, "PRISONERS_AUTH_VERIFIER");

  const owner = explicitOwner ?? deployerAddress ?? null;
  const treasury = explicitTreasury ?? deployerAddress ?? null;
  const authVerifier = explicitVerifier ?? owner ?? deployerAddress ?? null;

  return {
    owner: {
      value: owner,
      source: explicitOwner
        ? "env"
        : deployerAddress
        ? "deployer-default"
        : "unresolved-default",
    },
    treasury: {
      value: treasury,
      source: explicitTreasury
        ? "env"
        : deployerAddress
        ? "deployer-default"
        : "unresolved-default",
    },
    authVerifier: {
      value: authVerifier,
      source: explicitVerifier
        ? "env"
        : owner
        ? explicitOwner
          ? "owner-default"
          : deployerAddress
          ? "owner/deployer-default"
          : "owner-default"
        : "unresolved-default",
    },
  };
}

function resolveDeploymentFilePath(filePath, chainId) {
  return resolveFromPackageRoot(
    filePath && String(filePath).trim().length > 0
      ? String(filePath).trim()
      : `deployments/${chainId}.json`
  );
}

export function extractNamedDeployments(deployments) {
  const named = {};

  for (const [address, contractName] of Object.entries(deployments ?? {})) {
    if (address === "networkName") {
      continue;
    }
    named[contractName] = normalizeAddress(
      address,
      `${contractName} deployment address`
    );
  }

  return named;
}

function writeOutput(outPath, value) {
  if (!outPath) {
    return null;
  }

  const resolvedPath = resolveFromPackageRoot(outPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

async function connectBaseSepoliaProvider(args = {}) {
  const targetLabel =
    args.rpcUrl ?? args.network ?? args.rpc ?? BASE_SEPOLIA_NETWORK_NAME;
  const provider = createProvider({ ...args, rpcUrl: targetLabel });
  const [network, latestBlock] = await Promise.all([
    provider.getNetwork(),
    provider.getBlock("latest"),
  ]);

  if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Connected chain ${network.chainId} is not Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}).`
    );
  }

  return {
    provider,
    targetLabel,
    chainId: Number(network.chainId),
    latestBlock: {
      number: latestBlock.number,
      timestamp: latestBlock.timestamp,
    },
  };
}

async function buildPreflightReport(args = {}) {
  const connection = await connectBaseSepoliaProvider(args);
  const warnings = [];
  const deployerKeystore = args.deployerKeystore
    ? readDeployerAddressFromKeystore(args.deployerKeystore)
    : { resolvedPath: null, exists: false, address: null };

  if (!args.deployerKeystore) {
    warnings.push(
      "No --deployer-keystore was provided, so this preflight could not independently confirm which deployer address the deploy command will use."
    );
  } else if (!deployerKeystore.exists) {
    warnings.push(
      `Deployer keystore was requested but not found at ${deployerKeystore.resolvedPath}.`
    );
  } else if (args.deployerKeystore === "scaffold-eth-default") {
    warnings.push(
      "Using scaffold-eth-default on a live network is unsafe and the deploy CLI will reject it."
    );
  }

  const expectedRoles = resolveExpectedRoles(
    process.env,
    deployerKeystore.address
  );
  if (expectedRoles.owner.source !== "env") {
    warnings.push(
      "PRISONERS_OWNER is not set explicitly; deployment will fall back to the deployer address."
    );
  }
  if (expectedRoles.treasury.source !== "env") {
    warnings.push(
      "PRISONERS_TREASURY is not set explicitly; deployment will fall back to the deployer address."
    );
  }
  if (expectedRoles.authVerifier.source !== "env") {
    warnings.push(
      "PRISONERS_AUTH_VERIFIER is not set explicitly; deployment will fall back to owner/deployer defaults."
    );
  }

  const profile = resolveCanaryProfile(process.env);
  const profileComparison = compareProfiles(profile);
  for (const mismatch of profileComparison.mismatches) {
    warnings.push(
      `Deploy config ${mismatch.field}=${mismatch.actual} differs from the recommended Base Sepolia canary value ${mismatch.expected}.`
    );
  }

  if (
    !process.env.BASESCAN_API_KEY ||
    String(process.env.BASESCAN_API_KEY).trim().length === 0
  ) {
    warnings.push(
      "BASESCAN_API_KEY is not set, so repo-native contract verification will fail until you add it."
    );
  }

  return {
    schemaVersion: CANARY_PREFLIGHT_SCHEMA,
    target: {
      rpcTarget: connection.targetLabel,
      chainId: connection.chainId,
      latestBlock: connection.latestBlock,
    },
    deployerKeystore: {
      provided: args.deployerKeystore ?? null,
      resolvedPath: deployerKeystore.resolvedPath,
      exists: deployerKeystore.exists,
      address: deployerKeystore.address,
    },
    expectedRoles,
    profile,
    profileComparison,
    verification: {
      baseScanApiKeyPresent:
        Boolean(process.env.BASESCAN_API_KEY) &&
        String(process.env.BASESCAN_API_KEY).trim().length > 0,
    },
    warnings,
  };
}

async function buildDeploymentReport(args = {}) {
  const connection = await connectBaseSepoliaProvider(args);
  const deploymentFile = resolveDeploymentFilePath(
    args.deploymentFile,
    connection.chainId
  );

  if (!existsSync(deploymentFile)) {
    throw new Error(
      `Deployment file not found: ${deploymentFile}. Run the repo deployment first or pass --deployment-file <path>.`
    );
  }

  const deployments = JSON.parse(readFileSync(deploymentFile, "utf8"));
  const namedDeployments = extractNamedDeployments(deployments);
  const registryAddress = namedDeployments.AgentAuthRegistry;
  const gameAddress = namedDeployments.PrisonersDAOlemma;
  const chatAddress = namedDeployments.GameChat;

  if (!registryAddress || !gameAddress || !chatAddress) {
    throw new Error(
      `Deployment file ${deploymentFile} must include AgentAuthRegistry, PrisonersDAOlemma, and GameChat addresses.`
    );
  }

  const registry = new ethers.Contract(
    registryAddress,
    REGISTRY_ADMIN_ABI,
    connection.provider
  );
  const game = new ethers.Contract(
    gameAddress,
    GAME_ADMIN_ABI,
    connection.provider
  );
  const chat = new ethers.Contract(
    chatAddress,
    CHAT_ADMIN_ABI,
    connection.provider
  );

  const [
    registryOwner,
    verifier,
    gameNamespace,
    gameOwner,
    treasury,
    authRegistry,
    rawDefaultConfig,
    currentGameId,
    activeGameId,
    rawCauseCount,
    linkedGame,
    rawMessageCount,
  ] = await Promise.all([
    registry.owner(),
    registry.verifier(),
    registry.gameNamespace(),
    game.owner(),
    game.treasury(),
    game.authRegistry(),
    game.getDefaultConfig(),
    game.currentGameId(),
    game.activeGameId(),
    game.causeCount(),
    chat.game(),
    chat.messageCount(),
  ]);

  const causeCount = Number(rawCauseCount);
  const causeIds = await Promise.all(
    Array.from({ length: causeCount }, (_, index) => game.causeAt(index))
  );
  const rawCauses = await Promise.all(
    causeIds.map((causeId) => game.getCause(Number(causeId)))
  );
  const causes = rawCauses.map((cause, index) => ({
    causeId: Number(causeIds[index]),
    active: cause.active,
    recipient: cause.recipient,
    metadataHash: cause.metadataHash,
  }));
  const activeCauses = causes.filter((cause) => cause.active);

  const defaultConfig = normalizeConfigTuple(rawDefaultConfig);
  const profileComparison = compareProfiles(defaultConfig);
  const expectedRoles = resolveExpectedRoles(process.env, null);
  const warnings = [];

  if (authRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
    warnings.push(
      `PrisonersDAOlemma.authRegistry() points to ${authRegistry}, not deployment-file registry ${registryAddress}.`
    );
  }
  if (linkedGame.toLowerCase() !== gameAddress.toLowerCase()) {
    warnings.push(
      `GameChat.game() points to ${linkedGame}, not deployment-file game ${gameAddress}.`
    );
  }

  for (const mismatch of profileComparison.mismatches) {
    warnings.push(
      `Onchain default config ${mismatch.field}=${mismatch.actual} differs from the recommended Base Sepolia canary value ${mismatch.expected}.`
    );
  }

  if (
    expectedRoles.owner.value &&
    expectedRoles.owner.value.toLowerCase() !== registryOwner.toLowerCase()
  ) {
    warnings.push(
      `Onchain registry owner ${registryOwner} does not match expected owner ${expectedRoles.owner.value}.`
    );
  }
  if (
    expectedRoles.owner.value &&
    expectedRoles.owner.value.toLowerCase() !== gameOwner.toLowerCase()
  ) {
    warnings.push(
      `Onchain game owner ${gameOwner} does not match expected owner ${expectedRoles.owner.value}.`
    );
  }
  if (
    expectedRoles.treasury.value &&
    expectedRoles.treasury.value.toLowerCase() !== treasury.toLowerCase()
  ) {
    warnings.push(
      `Onchain treasury ${treasury} does not match expected treasury ${expectedRoles.treasury.value}.`
    );
  }
  if (
    expectedRoles.authVerifier.value &&
    expectedRoles.authVerifier.value.toLowerCase() !== verifier.toLowerCase()
  ) {
    warnings.push(
      `Onchain auth verifier ${verifier} does not match expected auth verifier ${expectedRoles.authVerifier.value}.`
    );
  }

  if (registryOwner.toLowerCase() !== gameOwner.toLowerCase()) {
    warnings.push(
      `Registry owner ${registryOwner} and game owner ${gameOwner} differ; this is allowed but increases operator coordination burden.`
    );
  }
  if (activeCauses.length === 0) {
    warnings.push(
      "No active causes are currently whitelisted, so createGame() will revert until the owner whitelists at least one cause."
    );
  }
  if (Number(currentGameId) !== 0) {
    warnings.push(
      `currentGameId is already ${Number(
        currentGameId
      )}, so this deployment is no longer a pristine pre-game canary instance.`
    );
  }
  if (Number(activeGameId) !== 0) {
    warnings.push(
      `activeGameId is already ${Number(
        activeGameId
      )}, so there is a live game on this deployment right now.`
    );
  }
  if (Number(rawMessageCount) !== 0) {
    warnings.push(
      `GameChat.messageCount is already ${Number(
        rawMessageCount
      )}, so this deployment already has chat history.`
    );
  }

  return {
    schemaVersion: CANARY_DEPLOYMENT_SCHEMA,
    target: {
      rpcTarget: connection.targetLabel,
      chainId: connection.chainId,
      latestBlock: connection.latestBlock,
    },
    deploymentFile,
    deploymentNetworkName: deployments.networkName ?? null,
    addresses: {
      registry: registryAddress,
      game: gameAddress,
      chat: chatAddress,
    },
    expectedRoles,
    onchain: {
      registryOwner,
      verifier,
      gameNamespace,
      gameOwner,
      treasury,
      authRegistry,
      linkedGame,
      defaultConfig,
      currentGameId: Number(currentGameId),
      activeGameId: Number(activeGameId),
      messageCount: Number(rawMessageCount),
      knownCauseCount: causeCount,
      activeCauseCount: activeCauses.length,
      causes,
    },
    profileComparison,
    warnings,
  };
}

function formatProfileLine(profile) {
  return [
    `entryFeeWei=${profile.entryFeeWei}`,
    `creatorFeeBps=${profile.creatorFeeBps}`,
    `causeFeeBps=${profile.causeFeeBps}`,
    `join=${profile.joinDurationSeconds}s`,
    `commit=${profile.commitDurationBlocks} blocks`,
    `reveal=${profile.revealDurationBlocks} blocks`,
    `min=${profile.minPlayers}`,
    `max=${profile.maxPlayers}`,
    `maxCauses=${profile.maxCauses}`,
  ].join(" | ");
}

function printWarnings(warnings = []) {
  if (warnings.length === 0) {
    return;
  }

  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

function printPreflightSummary(report) {
  console.log("\n🧪 Base Sepolia canary preflight");
  console.log(`RPC target:     ${report.target.rpcTarget}`);
  console.log(`Chain ID:       ${report.target.chainId}`);
  console.log(`Latest block:   ${report.target.latestBlock.number}`);
  console.log(
    `Deployer:       ${report.deployerKeystore.address ?? "(not resolved)"}`
  );
  console.log(
    `Keystore:       ${report.deployerKeystore.provided ?? "(not provided)"}`
  );
  console.log(
    `Owner:          ${report.expectedRoles.owner.value ?? "(unresolved)"}`
  );
  console.log(
    `Treasury:       ${report.expectedRoles.treasury.value ?? "(unresolved)"}`
  );
  console.log(
    `Auth verifier:  ${
      report.expectedRoles.authVerifier.value ?? "(unresolved)"
    }`
  );
  console.log(`Profile:        ${formatProfileLine(report.profile)}`);
  console.log(
    `Recommended:    ${
      report.profileComparison.matchesRecommendedProfile ? "yes" : "no"
    }`
  );
  console.log(
    `BaseScan key:   ${
      report.verification.baseScanApiKeyPresent ? "present" : "missing"
    }`
  );
  printWarnings(report.warnings);
}

function printDeploymentSummary(report) {
  console.log("\n🧪 Base Sepolia canary deployment summary");
  console.log(`RPC target:     ${report.target.rpcTarget}`);
  console.log(`Chain ID:       ${report.target.chainId}`);
  console.log(`Latest block:   ${report.target.latestBlock.number}`);
  console.log(`Deployment:     ${report.deploymentFile}`);
  console.log(`Registry:       ${report.addresses.registry}`);
  console.log(`Game:           ${report.addresses.game}`);
  console.log(`Chat:           ${report.addresses.chat}`);
  console.log(`Registry owner: ${report.onchain.registryOwner}`);
  console.log(`Game owner:     ${report.onchain.gameOwner}`);
  console.log(`Treasury:       ${report.onchain.treasury}`);
  console.log(`Verifier:       ${report.onchain.verifier}`);
  console.log(
    `Default config: ${formatProfileLine(report.onchain.defaultConfig)}`
  );
  console.log(
    `Recommended:    ${
      report.profileComparison.matchesRecommendedProfile ? "yes" : "no"
    }`
  );
  console.log(`currentGameId:  ${report.onchain.currentGameId}`);
  console.log(`activeGameId:   ${report.onchain.activeGameId}`);
  console.log(`messageCount:   ${report.onchain.messageCount}`);
  console.log(`Known causes:   ${report.onchain.knownCauseCount}`);
  console.log(`Active causes:  ${report.onchain.activeCauseCount}`);
  if (report.onchain.causes.length > 0) {
    console.log("Causes:");
    for (const cause of report.onchain.causes) {
      console.log(
        `  - ${cause.causeId}: ${cause.active ? "active" : "inactive"} -> ${
          cause.recipient
        } (${cause.metadataHash})`
      );
    }
  }
  printWarnings(report.warnings);
}

export async function main() {
  const { subcommand, args } = parseCliArgs();

  if (
    !subcommand ||
    subcommand === "--help" ||
    subcommand === "-h" ||
    args.help
  ) {
    if (subcommand === "preflight") {
      printPreflightHelp();
      return;
    }
    if (subcommand === "deployment") {
      printDeploymentHelp();
      return;
    }
    printMainHelp();
    return;
  }

  let report;
  if (subcommand === "preflight") {
    report = await buildPreflightReport(args);
  } else if (subcommand === "deployment") {
    report = await buildDeploymentReport(args);
  } else {
    throw new Error(
      `Unknown canary command '${subcommand}'. Use preflight or deployment.`
    );
  }

  const outputPath = writeOutput(args.out, report);
  if (outputPath) {
    report.outputPath = outputPath;
  }

  if (args.json) {
    printJson(report);
    return;
  }

  if (subcommand === "preflight") {
    printPreflightSummary(report);
  } else {
    printDeploymentSummary(report);
  }

  if (outputPath) {
    console.log(`Output:         ${outputPath}`);
  }
}

if (process.argv[1] === moduleFilePath) {
  main().catch((error) => {
    console.error(`\n❌ ${error.message}`);
    process.exit(1);
  });
}
