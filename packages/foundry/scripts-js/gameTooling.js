import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join } from "path";
import { ethers } from "ethers";
import {
  GAMEPLAY_PK_ENV,
  bytes32FromUtf8,
  createProvider,
  loadJsonFile,
  normalizeAddress,
  normalizeBytes32,
  normalizePrivateKey,
  parsePositiveDecimalString,
  parsePositiveInteger,
  printJson,
  resolveFromPackageRoot,
  resolveSignerWallet,
} from "./authTooling.js";

export const GAMEPLAY_BOUNDARY_NOTE =
  "This gameplay/operator CLI only submits the current onchain game/chat actions and locally prepares commit preimages. It does not replace the separate auth boundary, does not invent offchain game state, and does not replace queryCli.js for honest state/evidence export.";
export const PREPARED_COMMIT_SCHEMA_VERSION =
  "prisoners-daollema/commit-bundle-v0";
export const PREPARED_COMMIT_SECRET_NOTE =
  "Prepared commit bundles include the salt needed for reveal. Treat the bundle as round-secret material until reveal is submitted.";

export const PHASE_NAMES = [
  "Idle",
  "Joining",
  "Commit",
  "Reveal",
  "Ended",
  "Cancelled",
];
export const OUTCOME_NAMES = ["Unset", "Winners", "NoWinners", "Cancelled"];
export const CHOICE_NAMES = ["Unset", "Share", "Catch", "Steal"];

export const GAMEPLAY_ABI = [
  "function owner() view returns (address)",
  "function authRegistry() view returns (address)",
  "function currentGameId() view returns (uint256)",
  "function activeGameId() view returns (uint256)",
  "function gameExists(uint256 gameId) view returns (bool)",
  "function getGame(uint256 gameId) view returns ((uint256 entryFeeWei,uint16 creatorFeeBps,uint16 causeFeeBps,uint32 joinDurationSeconds,uint32 commitDurationBlocks,uint32 revealDurationBlocks,uint16 minPlayers,uint16 maxPlayers,uint16 maxCauses,uint16 joinedCount,uint16 aliveCount,uint16 usedCauseCount,uint16 committedCount,uint16 revealedCount,uint64 createdAt,uint64 joinDeadline,uint64 commitDeadlineBlock,uint64 revealDeadlineBlock,uint32 round,uint32 shareStreak,uint8 phase,uint8 outcome,address treasury))",
  "function getPlayer(uint256 gameId, address wallet) view returns ((bool joined,bool alive,bool claimed,bool refunded,bool committedThisRound,bool revealedThisRound,address wallet,bytes32 agentKey,uint16 causeId,bytes32 commitment,uint8 revealedChoice,uint8 effectiveChoice,uint32 lastChoiceRound))",
  "function getCause(uint16 causeId) view returns ((bool active,address recipient,bytes32 metadataHash))",
  "function getGameCause(uint256 gameId, uint16 causeId) view returns ((bool used,uint16 entrantCount,address recipient,bytes32 metadataHash))",
  "function causeCount() view returns (uint256)",
  "function causeAt(uint256 index) view returns (uint16)",
  "function createGame() returns (uint256 gameId)",
  "function whitelistCause(uint16 causeId, address recipient, bytes32 metadataHash)",
  "function advancePhase(uint256 gameId)",
  "function cancelIfInsufficientPlayers(uint256 gameId)",
  "function join(uint256 gameId, uint16 causeId) payable",
  "function commit(uint256 gameId, bytes32 commitment)",
  "function reveal(uint256 gameId, uint8 choice, bytes32 salt)",
  "function claim(uint256 gameId)",
  "function claimRefund(uint256 gameId)",
  "function withdrawTreasury(uint256 gameId)",
  "function withdrawCause(uint256 gameId, uint16 causeId)",
  "function previewWinnerClaim(uint256 gameId, address wallet) view returns (uint256 grossPrizeWei,uint256 causeCutWei,uint256 netPrizeWei,bool availableNow)",
  "function previewRefund(uint256 gameId, address wallet) view returns (uint256 refundWei,bool availableNow)",
  "function treasuryClaimableAmount(uint256 gameId) view returns (uint256)",
  "function gameCauseClaimableAmount(uint256 gameId, uint16 causeId) view returns (uint256)",
  "function canAdvancePhase(uint256 gameId) view returns (bool)",
  "function isRoundReadyForResolution(uint256 gameId) view returns (bool)",
  "function computeCommitment(uint256 gameId, uint32 round, address wallet, uint8 choice, bytes32 salt) view returns (bytes32)",
  "event CauseWhitelisted(uint16 indexed causeId, address indexed recipient, bytes32 metadataHash)",
  "event GameCreated(uint256 indexed gameId, uint64 joinDeadline, uint256 entryFeeWei, uint16 minPlayers, uint16 maxPlayers, uint16 maxCauses)",
  "event PhaseAdvanced(uint256 indexed gameId, uint8 newPhase)",
  "event GameCancelled(uint256 indexed gameId)",
  "event GameEnded(uint256 indexed gameId, uint8 outcome, uint32 round, uint16 winnerCount, uint32 shareStreak)",
  "event PlayerJoined(uint256 indexed gameId, address indexed wallet, bytes32 indexed agentKey, uint16 causeId, uint16 joinedCount)",
  "event Committed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, bytes32 commitment)",
  "event Revealed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, uint8 choice)",
  "event PrizeClaimed(uint256 indexed gameId, address indexed wallet, uint16 indexed causeId, uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, address causeRecipient)",
  "event RefundClaimed(uint256 indexed gameId, address indexed wallet, uint256 refundWei)",
  "event TreasuryWithdrawal(uint256 indexed gameId, address indexed recipient, uint256 amountWei)",
  "event CauseWithdrawal(uint256 indexed gameId, uint16 indexed causeId, address indexed recipient, uint256 amountWei)",
];

export const CHAT_ABI = [
  "function game() view returns (address)",
  "function messageCount() view returns (uint256)",
  "function postGlobal(uint256 gameId, string text) returns (uint256 messageId)",
  "function postCause(uint256 gameId, uint16 causeId, string text) returns (uint256 messageId)",
  "event MessagePosted(uint256 indexed gameId, uint256 indexed messageId, address indexed sender, uint32 round, uint8 phase, uint8 scope, uint16 causeId, uint64 createdAt, string text)",
];

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

function toDecimalString(value) {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

function enumName(names, value, label) {
  const numeric = toNumber(value, label);
  return names[numeric] ?? `Unknown(${numeric})`;
}

function normalizeGameSnapshot(snapshot) {
  return {
    entryFeeWei: toDecimalString(snapshot.entryFeeWei),
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
    phase: enumName(PHASE_NAMES, snapshot.phase, "snapshot.phase"),
    phaseCode: toNumber(snapshot.phase, "snapshot.phase"),
    outcome: enumName(OUTCOME_NAMES, snapshot.outcome, "snapshot.outcome"),
    outcomeCode: toNumber(snapshot.outcome, "snapshot.outcome"),
    treasury: snapshot.treasury,
  };
}

function normalizePlayerState(player) {
  return {
    joined: player.joined,
    alive: player.alive,
    claimed: player.claimed,
    refunded: player.refunded,
    committedThisRound: player.committedThisRound,
    revealedThisRound: player.revealedThisRound,
    wallet: player.wallet,
    agentKey: player.agentKey,
    causeId: toNumber(player.causeId, "player.causeId"),
    commitment: player.commitment,
    revealedChoice: enumName(
      CHOICE_NAMES,
      player.revealedChoice,
      "player.revealedChoice"
    ),
    revealedChoiceCode: toNumber(
      player.revealedChoice,
      "player.revealedChoice"
    ),
    effectiveChoice: enumName(
      CHOICE_NAMES,
      player.effectiveChoice,
      "player.effectiveChoice"
    ),
    effectiveChoiceCode: toNumber(
      player.effectiveChoice,
      "player.effectiveChoice"
    ),
    lastChoiceRound: toNumber(player.lastChoiceRound, "player.lastChoiceRound"),
  };
}

function normalizeWinnerClaimPreview(preview) {
  return {
    grossPrizeWei: toDecimalString(preview.grossPrizeWei),
    causeCutWei: toDecimalString(preview.causeCutWei),
    netPrizeWei: toDecimalString(preview.netPrizeWei),
    availableNow: preview.availableNow,
  };
}

function normalizeRefundPreview(preview) {
  return {
    refundWei: toDecimalString(preview.refundWei),
    availableNow: preview.availableNow,
  };
}

function normalizeGameCauseState(causeState, causeId) {
  return {
    causeId,
    used: causeState.used,
    entrantCount: toNumber(causeState.entrantCount, "gameCause.entrantCount"),
    recipient: causeState.recipient,
    metadataHash: causeState.metadataHash,
  };
}

function normalizeMessagePostedEvent(event) {
  return {
    gameId: toNumber(event.args.gameId, "message.gameId"),
    messageId: toNumber(event.args.messageId, "message.messageId"),
    sender: event.args.sender,
    round: toNumber(event.args.round, "message.round"),
    phase: enumName(PHASE_NAMES, event.args.phase, "message.phase"),
    phaseCode: toNumber(event.args.phase, "message.phase"),
    scope:
      toNumber(event.args.scope, "message.scope") === 0 ? "global" : "cause",
    causeId:
      toNumber(event.args.scope, "message.scope") === 0
        ? null
        : toNumber(event.args.causeId, "message.causeId"),
    createdAt: toNumber(event.args.createdAt, "message.createdAt"),
    text: event.args.text,
  };
}

function loadDeployments(chainId) {
  const deploymentsPath = resolveFromPackageRoot(`deployments/${chainId}.json`);
  if (!existsSync(deploymentsPath)) {
    return null;
  }
  return JSON.parse(readFileSync(deploymentsPath, "utf8"));
}

function resolveDeploymentAddress(chainId, name) {
  const deployments = loadDeployments(chainId);
  if (!deployments) {
    return null;
  }

  for (const [address, deployedName] of Object.entries(deployments)) {
    if (address === "networkName") {
      continue;
    }
    if (deployedName === name) {
      return normalizeAddress(address, `${name} deployment address`);
    }
  }

  return null;
}

function resolveContractRef(ref, { chainId, defaultName, required, label }) {
  if (typeof ref === "string" && ref.trim().length > 0) {
    const trimmed = ref.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      return normalizeAddress(trimmed, label);
    }

    const resolved = resolveDeploymentAddress(chainId, trimmed);
    if (!resolved) {
      throw new Error(
        `${label} '${trimmed}' is not a valid address and was not found in deployments/${chainId}.json.`
      );
    }
    return resolved;
  }

  if (defaultName) {
    const resolved = resolveDeploymentAddress(chainId, defaultName);
    if (resolved) {
      return resolved;
    }
  }

  if (required) {
    throw new Error(
      `Missing ${label}. Provide an address or a deployment name${
        defaultName ? ` (for example ${defaultName})` : ""
      }.`
    );
  }

  return null;
}

function resolveKeystoreLookupPath(keystore) {
  const explicitPath =
    keystore.startsWith(".") ||
    keystore.startsWith("~") ||
    keystore.includes("/") ||
    keystore.includes("\\");

  if (!explicitPath) {
    return join(
      process.env.HOME ?? homedir(),
      ".foundry",
      "keystores",
      keystore
    );
  }

  if (keystore === "~") {
    return homedir();
  }

  if (keystore.startsWith("~/")) {
    return join(homedir(), keystore.slice(2));
  }

  if (isAbsolute(keystore)) {
    return keystore;
  }

  return resolveFromPackageRoot(keystore);
}

function deriveWalletAddressFromKeystore(keystore) {
  if (typeof keystore !== "string" || keystore.trim().length === 0) {
    return null;
  }

  const resolvedPath = resolveKeystoreLookupPath(keystore.trim());
  if (!existsSync(resolvedPath)) {
    throw new Error(`wallet keystore not found: ${resolvedPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse wallet keystore JSON at ${resolvedPath}: ${error.message}`
    );
  }

  const rawAddress = parsed?.address;
  if (typeof rawAddress !== "string" || rawAddress.length === 0) {
    throw new Error(
      `wallet keystore at ${resolvedPath} does not expose an address field.`
    );
  }

  const prefixed = rawAddress.startsWith("0x") ? rawAddress : `0x${rawAddress}`;
  return normalizeAddress(prefixed, "wallet keystore address");
}

function deriveWalletAddressFromPrivateKey(privateKey) {
  if (privateKey === undefined) {
    return null;
  }

  return new ethers.Wallet(normalizePrivateKey(privateKey)).address;
}

function deriveWalletAddressFromEnv(envName) {
  if (!process.env[envName]) {
    return null;
  }

  return new ethers.Wallet(normalizePrivateKey(undefined, envName)).address;
}

function resolveExpectedWalletAddress(
  options = {},
  { allowMissing = false } = {}
) {
  if (
    options.walletPrivateKey !== undefined &&
    !options.allowUnsafePrivateKey
  ) {
    throw new Error(
      `Raw wallet private keys on the command line are disabled. Prefer --wallet-keystore with a password env/file (or the interactive prompt), or set ${GAMEPLAY_PK_ENV} for local automation. If you absolutely need the old behavior for an ephemeral local test, repeat the command with --allow-unsafe-private-key.`
    );
  }

  const explicitWallet =
    options.wallet !== undefined
      ? normalizeAddress(options.wallet, "wallet")
      : null;
  const derivedWallet =
    deriveWalletAddressFromKeystore(options.walletKeystore) ??
    deriveWalletAddressFromPrivateKey(options.walletPrivateKey) ??
    deriveWalletAddressFromEnv(GAMEPLAY_PK_ENV);

  if (explicitWallet && derivedWallet) {
    if (explicitWallet.toLowerCase() !== derivedWallet.toLowerCase()) {
      throw new Error(
        `Wallet mismatch. --wallet resolved to ${explicitWallet}, but the supplied gameplay signer resolves to ${derivedWallet}.`
      );
    }
  }

  if (explicitWallet) {
    return explicitWallet;
  }

  if (derivedWallet) {
    return derivedWallet;
  }

  if (allowMissing) {
    return null;
  }

  throw new Error(
    `Missing wallet. Provide --wallet, --wallet-keystore, --wallet-private-key with --allow-unsafe-private-key, or set ${GAMEPLAY_PK_ENV}.`
  );
}

async function resolveWalletSigner(options = {}, provider) {
  const signerWallet = await resolveSignerWallet({
    purpose: "wallet",
    privateKey: options.walletPrivateKey,
    privateKeyEnv: GAMEPLAY_PK_ENV,
    keystore: options.walletKeystore,
    keystorePasswordEnv: options.walletKeystorePasswordEnv,
    keystorePasswordFile: options.walletKeystorePasswordFile,
    allowUnsafePrivateKey: Boolean(options.allowUnsafePrivateKey),
  });
  const signer = signerWallet.connect(provider);
  const expectedWallet = resolveExpectedWalletAddress(options, {
    allowMissing: true,
  });

  if (
    expectedWallet &&
    signer.address.toLowerCase() !== expectedWallet.toLowerCase()
  ) {
    throw new Error(
      `Wallet mismatch. --wallet resolved to ${expectedWallet}, but the supplied gameplay signer resolves to ${signer.address}.`
    );
  }

  return signer;
}

async function validateChatLink(chat, chatAddress, gameAddress) {
  let linkedGameAddress;
  try {
    linkedGameAddress = normalizeAddress(await chat.game(), "chat.game()");
  } catch {
    throw new Error(
      `Chat ${chatAddress} does not expose the expected GameChat.game() linkage needed for honest gameplay/chat tooling.`
    );
  }

  if (linkedGameAddress.toLowerCase() !== gameAddress.toLowerCase()) {
    throw new Error(
      `Chat ${chatAddress} is linked to game ${linkedGameAddress}, not selected game ${gameAddress}. Refusing to mix gameplay/chat actions across contracts.`
    );
  }
}

async function resolveGameId(game, options = {}) {
  const requestedGameId =
    options.gameId !== undefined &&
    options.gameId !== null &&
    options.gameId !== ""
      ? parsePositiveInteger(options.gameId, "gameId")
      : null;

  const [activeGameIdRaw, currentGameIdRaw] = await Promise.all([
    game.activeGameId(),
    game.currentGameId(),
  ]);
  const activeGameId = toNumber(activeGameIdRaw, "activeGameId");
  const currentGameId = toNumber(currentGameIdRaw, "currentGameId");
  const fallbackGameId = activeGameId !== 0 ? activeGameId : currentGameId;
  const gameId = requestedGameId ?? fallbackGameId;

  if (!gameId) {
    throw new Error(
      "No gameId was provided and the contract has no active/current game to fall back to."
    );
  }

  const exists = await game.gameExists(gameId);
  if (!exists) {
    throw new Error(`Game ${gameId} does not exist.`);
  }

  return {
    gameId,
    activeGameId,
    currentGameId,
  };
}

async function resolveGameContext(options = {}, config = {}) {
  const {
    requireSigner = true,
    requireGameId = true,
    requireChat = false,
  } = config;
  const provider = options.provider ?? createProvider(options);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const gameAddress = resolveContractRef(options.game, {
    chainId,
    defaultName: "PrisonersDaollema",
    required: true,
    label: "game",
  });
  const gameReader = new ethers.Contract(gameAddress, GAMEPLAY_ABI, provider);
  const signer = requireSigner
    ? await resolveWalletSigner(options, provider)
    : null;
  const walletAddress = signer
    ? signer.address
    : resolveExpectedWalletAddress(options, { allowMissing: false });
  const game = signer ? gameReader.connect(signer) : gameReader;

  let selectedGame = null;
  if (requireGameId) {
    selectedGame = await resolveGameId(gameReader, options);
  }

  let chatAddress = null;
  let chat = null;
  if (requireChat) {
    chatAddress = resolveContractRef(options.chat, {
      chainId,
      defaultName: "GameChat",
      required: true,
      label: "chat",
    });
    const chatReader = new ethers.Contract(chatAddress, CHAT_ABI, provider);
    await validateChatLink(chatReader, chatAddress, gameAddress);
    chat = signer ? chatReader.connect(signer) : chatReader;
  }

  return {
    provider,
    chainId,
    gameAddress,
    game,
    gameReader,
    walletAddress,
    signer,
    gameId: selectedGame?.gameId ?? null,
    activeGameId: selectedGame?.activeGameId ?? null,
    currentGameId: selectedGame?.currentGameId ?? null,
    chatAddress,
    chat,
  };
}

function parseChoice(choice) {
  if (choice === undefined || choice === null || choice === "") {
    throw new Error(
      "Missing choice. Provide --choice <share|catch|steal|1|2|3>."
    );
  }

  const normalized = String(choice).trim().toLowerCase();
  const code =
    normalized === "1" || normalized === "share"
      ? 1
      : normalized === "2" || normalized === "catch"
      ? 2
      : normalized === "3" || normalized === "steal"
      ? 3
      : null;

  if (!code) {
    throw new Error(
      `Unsupported choice '${choice}'. Use share, catch, steal, 1, 2, or 3.`
    );
  }

  return {
    code,
    name: CHOICE_NAMES[code],
    input: normalized,
  };
}

function resolvePrepareSalt(options = {}) {
  const provided = [
    options.salt !== undefined,
    options.saltText !== undefined,
  ].filter(Boolean).length;

  if (provided > 1) {
    throw new Error("Provide either --salt or --salt-text, not both.");
  }

  if (options.salt !== undefined) {
    return normalizeBytes32(options.salt, "salt");
  }

  if (options.saltText !== undefined) {
    return bytes32FromUtf8(String(options.saltText));
  }

  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

function resolveRevealSalt(options = {}) {
  const provided = [
    options.salt !== undefined,
    options.saltText !== undefined,
  ].filter(Boolean).length;

  if (provided > 1) {
    throw new Error("Provide either --salt or --salt-text, not both.");
  }

  if (options.salt !== undefined) {
    return normalizeBytes32(options.salt, "salt");
  }

  if (options.saltText !== undefined) {
    return bytes32FromUtf8(String(options.saltText));
  }

  throw new Error(
    "Missing reveal salt. Provide --salt <bytes32>, --salt-text <text>, or --input <prepared-commit.json>."
  );
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writePreparedCommitBundle(outPath, value) {
  const resolvedPath = resolveFromPackageRoot(outPath);
  ensureParentDir(resolvedPath);
  writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

function normalizePreparedCommitBundle(bundle = {}) {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("Prepared commit input must be a JSON object.");
  }

  if (
    bundle.schemaVersion !== undefined &&
    bundle.schemaVersion !== PREPARED_COMMIT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported prepared commit schemaVersion '${bundle.schemaVersion}'. Expected ${PREPARED_COMMIT_SCHEMA_VERSION}.`
    );
  }

  const resolvedChoice = parseChoice(bundle.choiceCode ?? bundle.choice);

  return {
    schemaVersion: bundle.schemaVersion ?? PREPARED_COMMIT_SCHEMA_VERSION,
    chainId: parsePositiveInteger(bundle.chainId, "bundle.chainId"),
    game: normalizeAddress(bundle.game, "bundle.game"),
    gameId: parsePositiveInteger(bundle.gameId, "bundle.gameId"),
    round: parsePositiveInteger(bundle.round, "bundle.round"),
    wallet: normalizeAddress(bundle.wallet, "bundle.wallet"),
    choice: resolvedChoice.name,
    choiceCode: resolvedChoice.code,
    salt: normalizeBytes32(bundle.salt, "bundle.salt"),
    commitment: normalizeBytes32(bundle.commitment, "bundle.commitment"),
  };
}

function loadPreparedCommitBundle(inputPath) {
  const bundle = loadJsonFile(inputPath, "prepared commit bundle");
  return normalizePreparedCommitBundle(bundle);
}

function validateBundleAgainstContext(bundle, context) {
  if (bundle.chainId !== context.chainId) {
    throw new Error(
      `Prepared commit chain mismatch. Bundle targets chain ${bundle.chainId}, but the connected chain is ${context.chainId}.`
    );
  }

  if (bundle.game.toLowerCase() !== context.gameAddress.toLowerCase()) {
    throw new Error(
      `Prepared commit game mismatch. Bundle targets ${bundle.game}, but the command targets ${context.gameAddress}.`
    );
  }

  if (bundle.gameId !== context.gameId) {
    throw new Error(
      `Prepared commit gameId mismatch. Bundle targets ${bundle.gameId}, but the command targets ${context.gameId}.`
    );
  }

  if (bundle.wallet.toLowerCase() !== context.walletAddress.toLowerCase()) {
    throw new Error(
      `Prepared commit wallet mismatch. Bundle targets ${bundle.wallet}, but the connected signer is ${context.walletAddress}.`
    );
  }
}

function findReceiptEvent(receipt, contractInterface, eventName) {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed.name === eventName) {
        return parsed;
      }
    } catch {
      // ignore logs from unrelated contracts/interfaces
    }
  }

  return null;
}

function normalizeTextInput(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function resolveCauseMetadataHash(options = {}) {
  const provided = [
    options.metadataHash !== undefined,
    options.metadataText !== undefined,
  ].filter(Boolean).length;

  if (provided !== 1) {
    throw new Error(
      "Provide exactly one of --metadata-hash <bytes32> or --metadata-text <text>."
    );
  }

  if (options.metadataHash !== undefined) {
    return normalizeBytes32(options.metadataHash, "metadataHash");
  }

  return bytes32FromUtf8(
    normalizeTextInput(options.metadataText, "metadataText")
  );
}

function buildCounts(snapshot) {
  return {
    joined: snapshot.joinedCount,
    alive: snapshot.aliveCount,
    usedCauses: snapshot.usedCauseCount,
    committed: snapshot.committedCount,
    revealed: snapshot.revealedCount,
  };
}

export async function createGameAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: false,
  });
  const tx = await context.game.createGame();
  const receipt = await tx.wait();
  const createdEvent = findReceiptEvent(
    receipt,
    context.game.interface,
    "GameCreated"
  );
  const gameId = createdEvent
    ? toNumber(createdEvent.args.gameId, "gameCreated.gameId")
    : toNumber(await context.gameReader.currentGameId(), "currentGameId");
  const snapshot = normalizeGameSnapshot(
    await context.gameReader.getGame(gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "create",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    phase: snapshot.phase,
    outcome: snapshot.outcome,
    round: snapshot.round,
    joinDeadline: snapshot.joinDeadline,
    entryFeeWei: snapshot.entryFeeWei,
    minPlayers: snapshot.minPlayers,
    maxPlayers: snapshot.maxPlayers,
    maxCauses: snapshot.maxCauses,
  };
}

export async function whitelistCauseAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: false,
  });
  const causeId = parsePositiveInteger(options.causeId, "causeId");
  if (causeId > 65_535) {
    throw new Error("causeId must fit into uint16.");
  }
  const recipient = normalizeAddress(options.recipient, "recipient");
  const metadataHash = resolveCauseMetadataHash(options);
  const owner = normalizeAddress(
    await context.gameReader.owner(),
    "game.owner()"
  );

  if (context.walletAddress.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(
      `Connected wallet ${context.walletAddress} is not the game owner ${owner}. whitelist-cause is owner-only.`
    );
  }

  const tx = await context.game.whitelistCause(
    causeId,
    recipient,
    metadataHash
  );
  const receipt = await tx.wait();
  const cause = await context.gameReader.getCause(causeId);
  const knownCauseCount = toNumber(
    await context.gameReader.causeCount(),
    "causeCount"
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "whitelist-cause",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    causeId,
    recipient: cause.recipient,
    metadataHash: cause.metadataHash,
    active: cause.active,
    knownCauseCount,
  };
}

export async function advancePhaseAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const snapshotBefore = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );
  const canAdvanceBefore = await context.gameReader.canAdvancePhase(
    context.gameId
  );

  if (!canAdvanceBefore) {
    throw new Error(
      `Game ${context.gameId} is not advance-ready while in phase ${snapshotBefore.phase}.`
    );
  }

  const tx = await context.game.advancePhase(context.gameId);
  const receipt = await tx.wait();
  const snapshotAfter = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "advance",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    phaseBefore: snapshotBefore.phase,
    phase: snapshotAfter.phase,
    outcome: snapshotAfter.outcome,
    round: snapshotAfter.round,
    shareStreak: snapshotAfter.shareStreak,
    canAdvanceNow: await context.gameReader.canAdvancePhase(context.gameId),
    isRoundReadyForResolution:
      await context.gameReader.isRoundReadyForResolution(context.gameId),
    counts: buildCounts(snapshotAfter),
  };
}

export async function cancelIfInsufficientPlayersAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const snapshotBefore = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  if (snapshotBefore.phase !== "Joining") {
    throw new Error(
      `Game ${context.gameId} is in phase ${snapshotBefore.phase}, not Joining.`
    );
  }

  const tx = await context.game.cancelIfInsufficientPlayers(context.gameId);
  const receipt = await tx.wait();
  const snapshotAfter = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "cancel-if-insufficient",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    phaseBefore: snapshotBefore.phase,
    phase: snapshotAfter.phase,
    outcome: snapshotAfter.outcome,
    round: snapshotAfter.round,
    counts: buildCounts(snapshotAfter),
  };
}

export async function joinGameAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const causeId = parsePositiveInteger(options.causeId, "causeId");
  const snapshotBefore = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  if (snapshotBefore.phase !== "Joining") {
    throw new Error(
      `Game ${context.gameId} is in phase ${snapshotBefore.phase}, not Joining.`
    );
  }

  const valueWei =
    options.valueWei !== undefined
      ? parsePositiveDecimalString(options.valueWei, "valueWei")
      : snapshotBefore.entryFeeWei;

  if (valueWei !== snapshotBefore.entryFeeWei) {
    throw new Error(
      `valueWei ${valueWei} does not match the current entry fee ${snapshotBefore.entryFeeWei}.`
    );
  }

  const tx = await context.game.join(context.gameId, causeId, {
    value: valueWei,
  });
  const receipt = await tx.wait();
  const player = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );
  const snapshotAfter = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "join",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    causeId: player.causeId,
    agentKey: player.agentKey,
    entryFeeWei: valueWei,
    phase: snapshotAfter.phase,
    counts: buildCounts(snapshotAfter),
  };
}

export async function prepareCommitAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: false,
    requireGameId: true,
  });
  const snapshot = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  if (snapshot.phase !== "Commit") {
    throw new Error(
      `Game ${context.gameId} is in phase ${snapshot.phase}, not Commit.`
    );
  }

  const choice = parseChoice(options.choice);
  const salt = resolvePrepareSalt(options);
  const commitment = normalizeBytes32(
    await context.gameReader.computeCommitment(
      context.gameId,
      snapshot.round,
      context.walletAddress,
      choice.code,
      salt
    ),
    "commitment"
  );

  const bundle = {
    schemaVersion: PREPARED_COMMIT_SCHEMA_VERSION,
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    secretHandlingNote: PREPARED_COMMIT_SECRET_NOTE,
    preparedAt: new Date().toISOString(),
    command: "prepare-commit",
    chainId: context.chainId,
    game: context.gameAddress,
    gameId: context.gameId,
    round: snapshot.round,
    phase: snapshot.phase,
    wallet: context.walletAddress,
    choice: choice.name,
    choiceCode: choice.code,
    salt,
    commitment,
  };

  const outputFile = options.out
    ? writePreparedCommitBundle(options.out, bundle)
    : null;

  return {
    ...bundle,
    outputFile,
  };
}

export async function commitAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const snapshot = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  if (snapshot.phase !== "Commit") {
    throw new Error(
      `Game ${context.gameId} is in phase ${snapshot.phase}, not Commit.`
    );
  }

  if (options.input && options.commitment) {
    throw new Error("Provide either --input or --commitment, not both.");
  }

  let commitment;
  if (options.input) {
    const bundle = loadPreparedCommitBundle(options.input);
    validateBundleAgainstContext(bundle, context);
    if (bundle.round !== snapshot.round) {
      throw new Error(
        `Prepared commit round mismatch. Bundle targets round ${bundle.round}, but the current game round is ${snapshot.round}.`
      );
    }
    commitment = bundle.commitment;
  } else if (options.commitment) {
    commitment = normalizeBytes32(options.commitment, "commitment");
  } else {
    throw new Error(
      "Missing commitment. Provide --commitment <bytes32> or --input <prepared-commit.json>."
    );
  }

  const tx = await context.game.commit(context.gameId, commitment);
  const receipt = await tx.wait();
  const player = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );
  const snapshotAfter = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "commit",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    round: snapshot.round,
    commitment,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    phase: snapshotAfter.phase,
    committedThisRound: player.committedThisRound,
    committedCount: snapshotAfter.committedCount,
  };
}

export async function revealAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const snapshot = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  if (snapshot.phase !== "Reveal") {
    throw new Error(
      `Game ${context.gameId} is in phase ${snapshot.phase}, not Reveal.`
    );
  }

  let choice;
  let salt;
  let bundle = null;

  if (options.input) {
    bundle = loadPreparedCommitBundle(options.input);
    validateBundleAgainstContext(bundle, context);
    if (bundle.round !== snapshot.round) {
      throw new Error(
        `Prepared commit round mismatch. Bundle targets round ${bundle.round}, but the current game round is ${snapshot.round}.`
      );
    }
    choice = parseChoice(bundle.choiceCode);
    salt = bundle.salt;
  } else {
    choice = parseChoice(options.choice);
    salt = resolveRevealSalt(options);
  }

  const expectedCommitment = normalizeBytes32(
    await context.gameReader.computeCommitment(
      context.gameId,
      snapshot.round,
      context.walletAddress,
      choice.code,
      salt
    ),
    "expectedCommitment"
  );
  const playerBefore = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );

  if (playerBefore.commitment === ethers.constants.HashZero) {
    throw new Error(
      `Wallet ${context.walletAddress} has no stored commitment for game ${context.gameId}.`
    );
  }

  if (
    playerBefore.commitment.toLowerCase() !== expectedCommitment.toLowerCase()
  ) {
    throw new Error(
      `Reveal preimage does not match the stored onchain commitment. Stored ${playerBefore.commitment}, computed ${expectedCommitment}.`
    );
  }

  if (
    bundle &&
    bundle.commitment.toLowerCase() !== expectedCommitment.toLowerCase()
  ) {
    throw new Error(
      `Prepared commit bundle mismatch. Bundle commitment ${bundle.commitment} does not match the computed commitment ${expectedCommitment}.`
    );
  }

  const tx = await context.game.reveal(context.gameId, choice.code, salt);
  const receipt = await tx.wait();
  const playerAfter = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );
  const snapshotAfter = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "reveal",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    round: snapshot.round,
    choice: choice.name,
    choiceCode: choice.code,
    salt,
    commitment: expectedCommitment,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    phase: snapshotAfter.phase,
    revealedThisRound: playerAfter.revealedThisRound,
    revealedCount: snapshotAfter.revealedCount,
  };
}

export async function claimAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const previewBefore = normalizeWinnerClaimPreview(
    await context.gameReader.previewWinnerClaim(
      context.gameId,
      context.walletAddress
    )
  );

  if (!previewBefore.availableNow) {
    throw new Error(
      `Winner claim is not currently available for ${context.walletAddress} on game ${context.gameId}.`
    );
  }

  const tx = await context.game.claim(context.gameId);
  const receipt = await tx.wait();
  const event = findReceiptEvent(
    receipt,
    context.game.interface,
    "PrizeClaimed"
  );
  const playerAfter = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );
  const previewAfter = normalizeWinnerClaimPreview(
    await context.gameReader.previewWinnerClaim(
      context.gameId,
      context.walletAddress
    )
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "claim",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    causeId: event
      ? toNumber(event.args.causeId, "prizeClaimed.causeId")
      : playerAfter.causeId,
    grossPrizeWei: event
      ? toDecimalString(event.args.grossPrizeWei)
      : previewBefore.grossPrizeWei,
    causeCutWei: event
      ? toDecimalString(event.args.causeCutWei)
      : previewBefore.causeCutWei,
    netPrizeWei: event
      ? toDecimalString(event.args.netPrizeWei)
      : previewBefore.netPrizeWei,
    availableBefore: previewBefore.availableNow,
    availableAfter: previewAfter.availableNow,
    claimed: playerAfter.claimed,
  };
}

export async function refundAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const previewBefore = normalizeRefundPreview(
    await context.gameReader.previewRefund(
      context.gameId,
      context.walletAddress
    )
  );

  if (!previewBefore.availableNow) {
    throw new Error(
      `Refund is not currently available for ${context.walletAddress} on game ${context.gameId}.`
    );
  }

  const tx = await context.game.claimRefund(context.gameId);
  const receipt = await tx.wait();
  const event = findReceiptEvent(
    receipt,
    context.game.interface,
    "RefundClaimed"
  );
  const playerAfter = normalizePlayerState(
    await context.gameReader.getPlayer(context.gameId, context.walletAddress)
  );
  const previewAfter = normalizeRefundPreview(
    await context.gameReader.previewRefund(
      context.gameId,
      context.walletAddress
    )
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "refund",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    refundWei: event
      ? toDecimalString(event.args.refundWei)
      : previewBefore.refundWei,
    availableBefore: previewBefore.availableNow,
    availableAfter: previewAfter.availableNow,
    refunded: playerAfter.refunded,
  };
}

export async function withdrawTreasuryAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const amountWei = toDecimalString(
    await context.gameReader.treasuryClaimableAmount(context.gameId)
  );

  if (amountWei === "0") {
    throw new Error(
      `Treasury has nothing claimable for game ${context.gameId} right now.`
    );
  }

  const snapshot = normalizeGameSnapshot(
    await context.gameReader.getGame(context.gameId)
  );
  const tx = await context.game.withdrawTreasury(context.gameId);
  const receipt = await tx.wait();
  const event = findReceiptEvent(
    receipt,
    context.game.interface,
    "TreasuryWithdrawal"
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "withdraw-treasury",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    recipient: event ? event.args.recipient : snapshot.treasury,
    amountWei: event ? toDecimalString(event.args.amountWei) : amountWei,
    remainingClaimableWei: toDecimalString(
      await context.gameReader.treasuryClaimableAmount(context.gameId)
    ),
  };
}

export async function withdrawCauseAction(options = {}) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
  });
  const causeId = parsePositiveInteger(options.causeId, "causeId");
  const amountWei = toDecimalString(
    await context.gameReader.gameCauseClaimableAmount(context.gameId, causeId)
  );

  if (amountWei === "0") {
    throw new Error(
      `Cause ${causeId} has nothing claimable from game ${context.gameId} right now.`
    );
  }

  const causeBefore = normalizeGameCauseState(
    await context.gameReader.getGameCause(context.gameId, causeId),
    causeId
  );
  const tx = await context.game.withdrawCause(context.gameId, causeId);
  const receipt = await tx.wait();
  const event = findReceiptEvent(
    receipt,
    context.game.interface,
    "CauseWithdrawal"
  );

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: "withdraw-cause",
    chainId: context.chainId,
    game: context.gameAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    causeId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    recipient: event ? event.args.recipient : causeBefore.recipient,
    amountWei: event ? toDecimalString(event.args.amountWei) : amountWei,
    remainingClaimableWei: toDecimalString(
      await context.gameReader.gameCauseClaimableAmount(context.gameId, causeId)
    ),
  };
}

async function postMessageAction(options = {}, scope) {
  const context = await resolveGameContext(options, {
    requireSigner: true,
    requireGameId: true,
    requireChat: true,
  });
  const text = normalizeTextInput(options.text, "text");

  let tx;
  if (scope === "global") {
    tx = await context.chat.postGlobal(context.gameId, text);
  } else {
    const causeId = parsePositiveInteger(options.causeId, "causeId");
    tx = await context.chat.postCause(context.gameId, causeId, text);
  }

  const receipt = await tx.wait();
  const event = findReceiptEvent(
    receipt,
    context.chat.interface,
    "MessagePosted"
  );
  const normalizedEvent = event
    ? normalizeMessagePostedEvent(event)
    : {
        gameId: context.gameId,
        messageId: toNumber(await context.chat.messageCount(), "messageCount"),
        sender: context.walletAddress,
        round: null,
        phase: null,
        phaseCode: null,
        scope,
        causeId:
          scope === "global"
            ? null
            : parsePositiveInteger(options.causeId, "causeId"),
        createdAt: null,
        text,
      };

  return {
    boundaryNote: GAMEPLAY_BOUNDARY_NOTE,
    command: scope === "global" ? "post-global" : "post-cause",
    chainId: context.chainId,
    game: context.gameAddress,
    chat: context.chatAddress,
    wallet: context.walletAddress,
    gameId: context.gameId,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    messageId: normalizedEvent.messageId,
    round: normalizedEvent.round,
    phase: normalizedEvent.phase,
    phaseCode: normalizedEvent.phaseCode,
    scope: normalizedEvent.scope,
    causeId: normalizedEvent.causeId,
    createdAt: normalizedEvent.createdAt,
    text: normalizedEvent.text,
  };
}

export async function postGlobalAction(options = {}) {
  return postMessageAction(options, "global");
}

export async function postCauseAction(options = {}) {
  return postMessageAction(options, "cause");
}

export function printGameplayResult(result) {
  const command = result.command;

  if (command === "whitelist-cause") {
    console.log("\n✅ Whitelisted cause.");
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Cause ID:       ${result.causeId}`);
    console.log(`Recipient:      ${result.recipient}`);
    console.log(`Metadata hash:  ${result.metadataHash}`);
    console.log(`Known causes:   ${result.knownCauseCount}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "create") {
    console.log("\n✅ Created game.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Phase:          ${result.phase}`);
    console.log(`Join deadline:  ${result.joinDeadline}`);
    console.log(`Entry fee wei:  ${result.entryFeeWei}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "advance" || command === "cancel-if-insufficient") {
    console.log(
      `\n✅ ${
        command === "advance"
          ? "Advanced game phase."
          : "Cancelled underfilled joining game."
      }`
    );
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Phase:          ${result.phaseBefore} -> ${result.phase}`);
    console.log(`Outcome:        ${result.outcome}`);
    console.log(`Round:          ${result.round}`);
    console.log(`Joined:         ${result.counts.joined}`);
    console.log(`Alive:          ${result.counts.alive}`);
    console.log(`Committed:      ${result.counts.committed ?? 0}`);
    console.log(`Revealed:       ${result.counts.revealed ?? 0}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "join") {
    console.log("\n✅ Joined game.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Cause ID:       ${result.causeId}`);
    console.log(`Agent key:      ${result.agentKey}`);
    console.log(`Entry fee wei:  ${result.entryFeeWei}`);
    console.log(`Joined count:   ${result.counts.joined}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "prepare-commit") {
    console.log("\n🧾 Prepared commit bundle.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Round:          ${result.round}`);
    console.log(`Choice:         ${result.choice}`);
    console.log(`Salt:           ${result.salt}`);
    console.log(`Commitment:     ${result.commitment}`);
    console.log(
      `Saved:          ${
        result.outputFile ?? "(not written; use --out to save)"
      }`
    );
    console.log(`Note:           ${PREPARED_COMMIT_SECRET_NOTE}`);
    return;
  }

  if (command === "commit") {
    console.log("\n✅ Submitted commit.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Round:          ${result.round}`);
    console.log(`Commitment:     ${result.commitment}`);
    console.log(`Committed:      ${result.committedThisRound}`);
    console.log(`Committed ct:   ${result.committedCount}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "reveal") {
    console.log("\n✅ Submitted reveal.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Round:          ${result.round}`);
    console.log(`Choice:         ${result.choice}`);
    console.log(`Revealed:       ${result.revealedThisRound}`);
    console.log(`Revealed ct:    ${result.revealedCount}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "claim") {
    console.log("\n✅ Claimed winner payout.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Cause ID:       ${result.causeId}`);
    console.log(`Gross prize:    ${result.grossPrizeWei}`);
    console.log(`Cause cut:      ${result.causeCutWei}`);
    console.log(`Net prize:      ${result.netPrizeWei}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "refund") {
    console.log("\n✅ Claimed refund.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Refund wei:     ${result.refundWei}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "withdraw-treasury") {
    console.log("\n✅ Withdrew treasury balance.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Recipient:      ${result.recipient}`);
    console.log(`Amount wei:     ${result.amountWei}`);
    console.log(`Remaining wei:  ${result.remainingClaimableWei}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "withdraw-cause") {
    console.log("\n✅ Withdrew cause balance.");
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Cause ID:       ${result.causeId}`);
    console.log(`Recipient:      ${result.recipient}`);
    console.log(`Amount wei:     ${result.amountWei}`);
    console.log(`Remaining wei:  ${result.remainingClaimableWei}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  if (command === "post-global" || command === "post-cause") {
    console.log(`\n✅ Posted ${result.scope} chat message.`);
    console.log(`Game ID:        ${result.gameId}`);
    console.log(`Game:           ${result.game}`);
    console.log(`Chat:           ${result.chat}`);
    console.log(`Wallet:         ${result.wallet}`);
    console.log(`Message ID:     ${result.messageId}`);
    console.log(`Round:          ${result.round ?? "(unavailable)"}`);
    console.log(`Phase:          ${result.phase ?? "(unavailable)"}`);
    if (result.causeId !== null) {
      console.log(`Cause ID:       ${result.causeId}`);
    }
    console.log(`Text:           ${result.text}`);
    console.log(`Tx:             ${result.txHash}`);
    return;
  }

  printJson(result);
}
