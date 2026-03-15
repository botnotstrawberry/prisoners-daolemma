import { ethers } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  createProvider,
  normalizeAddress,
  parsePositiveInteger,
  printJson,
  resolveFromPackageRoot,
} from "./authTooling.js";

export const QUERY_BOUNDARY_NOTE =
  "This evidence/query tooling only exports what the current contracts actually expose onchain today: auth records/events, game snapshots/rosters/causes, commit/reveal activity, and optional GameChat messages. It does not invent missing round-resolution, elimination, winner, refund, or payout data.";

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
export const SCOPE_NAMES = ["global", "cause"];

export const GAME_QUERY_ABI = [
  "function authRegistry() view returns (address)",
  "function currentGameId() view returns (uint256)",
  "function activeGameId() view returns (uint256)",
  "function gameExists(uint256 gameId) view returns (bool)",
  "function getGame(uint256 gameId) view returns ((uint256 entryFeeWei,uint16 creatorFeeBps,uint16 causeFeeBps,uint32 joinDurationSeconds,uint32 commitDurationBlocks,uint32 revealDurationBlocks,uint16 minPlayers,uint16 maxPlayers,uint16 maxCauses,uint16 joinedCount,uint16 aliveCount,uint16 usedCauseCount,uint16 committedCount,uint16 revealedCount,uint64 createdAt,uint64 joinDeadline,uint64 commitDeadlineBlock,uint64 revealDeadlineBlock,uint32 round,uint32 shareStreak,uint8 phase,uint8 outcome,address treasury))",
  "function getPlayer(uint256 gameId, address wallet) view returns ((bool joined,bool alive,bool claimed,bool refunded,bool committedThisRound,bool revealedThisRound,address wallet,bytes32 agentKey,uint16 causeId,bytes32 commitment,uint8 revealedChoice))",
  "function getCause(uint16 causeId) view returns ((bool active,address recipient,bytes32 metadataHash))",
  "function getGameCause(uint256 gameId, uint16 causeId) view returns ((bool used,uint16 entrantCount,address recipient,bytes32 metadataHash))",
  "function causeCount() view returns (uint256)",
  "function causeAt(uint256 index) view returns (uint16)",
  "function playerCount(uint256 gameId) view returns (uint256)",
  "function playerAt(uint256 gameId, uint256 index) view returns (address)",
  "function gameCauseCount(uint256 gameId) view returns (uint256)",
  "function gameCauseAt(uint256 gameId, uint256 index) view returns (uint16)",
  "event GameCreated(uint256 indexed gameId, uint64 joinDeadline, uint256 entryFeeWei, uint16 minPlayers, uint16 maxPlayers, uint16 maxCauses)",
  "event PhaseAdvanced(uint256 indexed gameId, uint8 newPhase)",
  "event GameCancelled(uint256 indexed gameId)",
  "event PlayerJoined(uint256 indexed gameId, address indexed wallet, bytes32 indexed agentKey, uint16 causeId, uint16 joinedCount)",
  "event Committed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, bytes32 commitment)",
  "event Revealed(uint256 indexed gameId, uint32 indexed round, address indexed wallet, uint8 choice)",
];

export const REGISTRY_QUERY_ABI = [
  "function verifier() view returns (address)",
  "function isAuthorized(address wallet) view returns (bool)",
  "function authRecordOf(address wallet) view returns ((bytes32 agentKey, bytes32 manifestHash, uint64 issuedAt, uint64 expiresAt, address issuer, bool active))",
  "event AuthRegistered(address indexed wallet, bytes32 indexed agentKey, bytes32 manifestHash, uint64 expiresAt, address indexed issuer)",
  "event AuthRevoked(address indexed wallet, bytes32 indexed agentKey)",
];

export const CHAT_QUERY_ABI = [
  "function messageCount() view returns (uint256)",
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

function normalizeCauseId(value) {
  return value === null || value === undefined ? null : toNumber(value, "causeId");
}

function parseNonNegativeInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return numeric;
}

function normalizeBlockTag(value, fallback, label) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === "latest" || value === "earliest" || value === "pending") {
    return value;
  }
  return parseNonNegativeInteger(value, label);
}

function sortEvents(events = []) {
  return [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber;
    }
    if (a.transactionIndex !== b.transactionIndex) {
      return a.transactionIndex - b.transactionIndex;
    }
    return a.logIndex - b.logIndex;
  });
}

function deriveAuthStatus(record, isAuthorizedNow, latestTimestamp) {
  const hasRecord = record.agentKey !== ethers.constants.HashZero;

  if (!hasRecord) {
    return "missing";
  }
  if (!record.active) {
    return "revoked";
  }
  if (record.expiresAt !== 0 && record.expiresAt < latestTimestamp) {
    return "expired";
  }
  if (isAuthorizedNow) {
    return "active";
  }
  return "inactive";
}

function normalizeAuthRecord(rawRecord) {
  return {
    agentKey: rawRecord.agentKey,
    manifestHash: rawRecord.manifestHash,
    issuedAt: toNumber(rawRecord.issuedAt, "authRecord.issuedAt"),
    expiresAt: toNumber(rawRecord.expiresAt, "authRecord.expiresAt"),
    issuer: rawRecord.issuer,
    active: rawRecord.active,
  };
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
    phase: enumName(PHASE_NAMES, snapshot.phase, "snapshot.phase"),
    phaseCode: toNumber(snapshot.phase, "snapshot.phase"),
    outcome: enumName(OUTCOME_NAMES, snapshot.outcome, "snapshot.outcome"),
    outcomeCode: toNumber(snapshot.outcome, "snapshot.outcome"),
    treasury: snapshot.treasury,
  };
}

function normalizePlayerState(rawPlayer, auth, latestTimestamp) {
  const authRecord = normalizeAuthRecord(auth.record);
  const isAuthorizedNow = auth.isAuthorizedNow;
  const authStatus = deriveAuthStatus(authRecord, isAuthorizedNow, latestTimestamp);

  return {
    wallet: rawPlayer.wallet,
    agentKey: rawPlayer.agentKey,
    causeId: toNumber(rawPlayer.causeId, "player.causeId"),
    joined: rawPlayer.joined,
    alive: rawPlayer.alive,
    claimed: rawPlayer.claimed,
    refunded: rawPlayer.refunded,
    committedThisRound: rawPlayer.committedThisRound,
    revealedThisRound: rawPlayer.revealedThisRound,
    commitment: rawPlayer.commitment,
    revealedChoice: enumName(CHOICE_NAMES, rawPlayer.revealedChoice, "player.revealedChoice"),
    revealedChoiceCode: toNumber(rawPlayer.revealedChoice, "player.revealedChoice"),
    auth: {
      status: authStatus,
      isAuthorizedNow,
      record: authRecord,
    },
  };
}

function normalizeCauseDefinition(causeId, rawCause) {
  return {
    causeId,
    active: rawCause.active,
    recipient: rawCause.recipient,
    metadataHash: rawCause.metadataHash,
  };
}

function normalizeGameCause(causeId, rawCause, members) {
  return {
    causeId,
    used: rawCause.used,
    entrantCount: toNumber(rawCause.entrantCount, "gameCause.entrantCount"),
    recipient: rawCause.recipient,
    metadataHash: rawCause.metadataHash,
    members,
  };
}

function buildEvidenceNotes({ chatConfigured }) {
  const notes = [
    "Round resolution, eliminations, winner determination, refunds, and payout settlement are not implemented in the current onchain game slice.",
    "Any elimination, payout, or claim-oriented replay fields remain intentionally absent until the contracts emit real resolution and settlement truth.",
  ];

  if (!chatConfigured) {
    notes.push(
      "No GameChat address was provided or discovered for this chain, so message export was skipped rather than guessing that no chat exists."
    );
  }

  return notes;
}

function buildCapabilities({ chatConfigured }) {
  const available = [
    "game-parameter-snapshot",
    "current-phase-and-round-context",
    "player-roster-and-cause-selection",
    "used-cause-team-state",
    "auth-records-for-participants",
    "commit-and-reveal-event-inspection",
  ];

  if (chatConfigured) {
    available.push("game-chat-message-export");
  }

  return {
    available,
    unavailable: [
      "round-resolution-outcomes",
      "elimination-history",
      "winner-no-winner-terminal-state",
      "claim-refund-settlement-data",
      "payout-destination-audit",
    ],
  };
}

function groupByRound(events, mapper) {
  const grouped = new Map();

  for (const event of events) {
    const round = toNumber(event.args.round, "event.round");
    if (!grouped.has(round)) {
      grouped.set(round, []);
    }
    grouped.get(round).push(mapper(event));
  }

  return grouped;
}

async function buildPhaseHistory(phaseEvents, getBlockTimestamp) {
  const ordered = sortEvents(phaseEvents);
  const history = [];

  for (const event of ordered) {
    history.push({
      phase: enumName(PHASE_NAMES, event.args.newPhase, "phaseHistory.newPhase"),
      phaseCode: toNumber(event.args.newPhase, "phaseHistory.newPhase"),
      blockNumber: event.blockNumber,
      txHash: event.transactionHash,
      timestamp: await getBlockTimestamp(event.blockNumber),
    });
  }

  return history;
}

function buildRoundExports({ snapshot, phaseHistory, commitEvents, revealEvents, participants }) {
  const commitPhaseTransitions = phaseHistory.filter((item) => item.phase === "Commit");
  const revealPhaseTransitions = phaseHistory.filter((item) => item.phase === "Reveal");
  const commitEventsByRound = groupByRound(commitEvents, (event) => ({
    wallet: event.args.wallet,
    commitment: event.args.commitment,
    txHash: event.transactionHash,
    blockNumber: event.blockNumber,
  }));
  const revealEventsByRound = groupByRound(revealEvents, (event) => ({
    wallet: event.args.wallet,
    choice: enumName(CHOICE_NAMES, event.args.choice, "reveal.choice"),
    choiceCode: toNumber(event.args.choice, "reveal.choice"),
    txHash: event.transactionHash,
    blockNumber: event.blockNumber,
  }));

  const roundNumbers = new Set();

  for (let index = 0; index < commitPhaseTransitions.length; index += 1) {
    roundNumbers.add(index + 1);
  }
  for (const round of commitEventsByRound.keys()) {
    roundNumbers.add(round);
  }
  for (const round of revealEventsByRound.keys()) {
    roundNumbers.add(round);
  }
  if (snapshot.round > 0) {
    roundNumbers.add(snapshot.round);
  }

  return [...roundNumbers]
    .sort((a, b) => a - b)
    .map((round) => {
      const isCurrentRound = round === snapshot.round;
      const activePlayers = participants.filter((player) => player.alive).map((player) => player.wallet);
      const notes = [
        "Current contract slice does not emit round-resolution or elimination events yet.",
      ];

      if (!isCurrentRound) {
        notes.push(
          "Only the current round carries onchain deadline counters in game snapshot state; earlier round deadlines are not backfilled."
        );
      }

      return {
        gameId: null,
        round,
        phaseWindows: {
          commitStartBlock: commitPhaseTransitions[round - 1]?.blockNumber ?? null,
          commitDeadlineBlock: isCurrentRound ? snapshot.commitDeadlineBlock : null,
          revealStartBlock: revealPhaseTransitions[round - 1]?.blockNumber ?? null,
          revealDeadlineBlock: isCurrentRound ? snapshot.revealDeadlineBlock : null,
        },
        phaseAtExport: snapshot.phase,
        activePlayers,
        commits: commitEventsByRound.get(round) ?? [],
        reveals: revealEventsByRound.get(round) ?? [],
        eliminated: [],
        shareStreak: snapshot.shareStreak,
        resolutionAvailable: false,
        settlementAvailable: false,
        notes,
      };
    });
}

async function loadWalletAuthEvents({ registry, wallet, fromBlock, toBlock, getBlockTimestamp }) {
  const [registeredEvents, revokedEvents] = await Promise.all([
    registry.queryFilter(
      registry.filters.AuthRegistered(wallet, null, null),
      fromBlock,
      toBlock
    ),
    registry.queryFilter(registry.filters.AuthRevoked(wallet, null), fromBlock, toBlock),
  ]);

  const combined = sortEvents([...registeredEvents, ...revokedEvents]);

  const normalized = [];
  for (const event of combined) {
    if (event.event === "AuthRegistered") {
      normalized.push({
        type: "AuthRegistered",
        wallet: event.args.wallet,
        agentKey: event.args.agentKey,
        manifestHash: event.args.manifestHash,
        expiresAt: toNumber(event.args.expiresAt, "authEvent.expiresAt"),
        issuer: event.args.issuer,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      });
      continue;
    }

    normalized.push({
      type: "AuthRevoked",
      wallet: event.args.wallet,
      agentKey: event.args.agentKey,
      blockNumber: event.blockNumber,
      txHash: event.transactionHash,
      timestamp: await getBlockTimestamp(event.blockNumber),
    });
  }

  return normalized;
}

function parseMessagesJsonl(lines) {
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
      `Missing ${label}. Provide an address or a deployment name${defaultName ? ` (for example ${defaultName})` : ""}.`
    );
  }

  return null;
}

async function resolveGameContext(options = {}) {
  const provider = options.provider ?? createProvider(options);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const gameAddress = resolveContractRef(options.game, {
    chainId,
    defaultName: "PrisonersDaollema",
    required: true,
    label: "game",
  });
  const game = new ethers.Contract(gameAddress, GAME_QUERY_ABI, provider);
  const chatAddress = resolveContractRef(options.chat, {
    chainId,
    defaultName: "GameChat",
    required: false,
    label: "chat",
  });
  const chat = chatAddress
    ? new ethers.Contract(chatAddress, CHAT_QUERY_ABI, provider)
    : null;
  const registryAddress = options.registry
    ? resolveContractRef(options.registry, {
        chainId,
        defaultName: "AgentAuthRegistry",
        required: true,
        label: "registry",
      })
    : normalizeAddress(await game.authRegistry(), "registry");
  const registry = new ethers.Contract(registryAddress, REGISTRY_QUERY_ABI, provider);

  const requestedGameId =
    options.gameId !== undefined && options.gameId !== null && options.gameId !== ""
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
    throw new Error(`Game ${gameId} does not exist on ${gameAddress}.`);
  }

  return {
    provider,
    chainId,
    gameAddress,
    registryAddress,
    chatAddress,
    game,
    registry,
    chat,
    gameId,
    activeGameId,
    currentGameId,
  };
}

export async function collectGameEvidence(options = {}) {
  const context = await resolveGameContext(options);
  const fromBlock = normalizeBlockTag(options.fromBlock, 0, "fromBlock");
  const toBlock = normalizeBlockTag(options.toBlock, "latest", "toBlock");
  const latestBlock = await context.provider.getBlock("latest");
  const blockTimestampCache = new Map();

  async function getBlockTimestamp(blockNumber) {
    if (!blockTimestampCache.has(blockNumber)) {
      const block = await context.provider.getBlock(blockNumber);
      blockTimestampCache.set(blockNumber, block.timestamp);
    }
    return blockTimestampCache.get(blockNumber);
  }

  const [
    rawSnapshot,
    rawPlayerCount,
    rawKnownCauseCount,
    rawUsedCauseCount,
    createdEvents,
    phaseEvents,
    commitEvents,
    revealEvents,
  ] = await Promise.all([
    context.game.getGame(context.gameId),
    context.game.playerCount(context.gameId),
    context.game.causeCount(),
    context.game.gameCauseCount(context.gameId),
    context.game.queryFilter(context.game.filters.GameCreated(context.gameId), fromBlock, toBlock),
    context.game.queryFilter(context.game.filters.PhaseAdvanced(context.gameId), fromBlock, toBlock),
    context.game.queryFilter(
      context.game.filters.Committed(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.Revealed(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
  ]);

  const snapshot = normalizeGameSnapshot(rawSnapshot);
  const playerCount = toNumber(rawPlayerCount, "playerCount");
  const knownCauseCount = toNumber(rawKnownCauseCount, "knownCauseCount");
  const usedCauseCount = toNumber(rawUsedCauseCount, "usedCauseCount");

  const [wallets, knownCauseIds, usedCauseIds] = await Promise.all([
    Promise.all(
      Array.from({ length: playerCount }, (_, index) =>
        context.game.playerAt(context.gameId, index)
      )
    ),
    Promise.all(
      Array.from({ length: knownCauseCount }, (_, index) => context.game.causeAt(index))
    ),
    Promise.all(
      Array.from({ length: usedCauseCount }, (_, index) =>
        context.game.gameCauseAt(context.gameId, index)
      )
    ),
  ]);

  const [rawPlayers, authResults, rawKnownCauses, rawUsedCauses, phaseHistory] =
    await Promise.all([
      Promise.all(wallets.map((wallet) => context.game.getPlayer(context.gameId, wallet))),
      Promise.all(
        wallets.map(async (wallet) => ({
          isAuthorizedNow: await context.registry.isAuthorized(wallet),
          record: await context.registry.authRecordOf(wallet),
        }))
      ),
      Promise.all(
        knownCauseIds.map((causeId) => context.game.getCause(normalizeCauseId(causeId)))
      ),
      Promise.all(
        usedCauseIds.map((causeId) =>
          context.game.getGameCause(context.gameId, normalizeCauseId(causeId))
        )
      ),
      buildPhaseHistory(phaseEvents, getBlockTimestamp),
    ]);

  const participants = rawPlayers.map((rawPlayer, index) =>
    normalizePlayerState(rawPlayer, authResults[index], latestBlock.timestamp)
  );
  const participantMap = new Map(
    participants.map((player) => [player.wallet.toLowerCase(), player])
  );

  const knownCauses = rawKnownCauses.map((rawCause, index) =>
    normalizeCauseDefinition(normalizeCauseId(knownCauseIds[index]), rawCause)
  );
  const usedCauses = rawUsedCauses.map((rawCause, index) => {
    const causeId = normalizeCauseId(usedCauseIds[index]);
    const members = participants
      .filter((player) => player.causeId === causeId)
      .map((player) => player.wallet);
    return normalizeGameCause(causeId, rawCause, members);
  });

  const authParticipants = [];
  for (const participant of participants) {
    const events = await loadWalletAuthEvents({
      registry: context.registry,
      wallet: participant.wallet,
      fromBlock,
      toBlock,
      getBlockTimestamp,
    });
    authParticipants.push({
      wallet: participant.wallet,
      agentKey: participant.agentKey,
      authStatus: participant.auth.status,
      isAuthorizedNow: participant.auth.isAuthorizedNow,
      record: participant.auth.record,
      events,
    });
  }

  let messages = [];
  if (context.chat) {
    const messageEvents = await context.chat.queryFilter(
      context.chat.filters.MessagePosted(context.gameId, null, null),
      fromBlock,
      toBlock
    );

    messages = sortEvents(messageEvents).map((event) => {
      const senderWallet = normalizeAddress(event.args.sender, "message.sender");
      const participant = participantMap.get(senderWallet.toLowerCase()) ?? null;
      const scope = enumName(SCOPE_NAMES, event.args.scope, "message.scope");
      const causeId = scope === "cause" ? normalizeCauseId(event.args.causeId) : null;
      const isParticipant = Boolean(participant?.joined);
      const isAliveAtMessageTime = participant ? participant.alive : null;

      return {
        gameId: context.gameId,
        messageId: toNumber(event.args.messageId, "message.messageId"),
        round: toNumber(event.args.round, "message.round"),
        phase: enumName(PHASE_NAMES, event.args.phase, "message.phase"),
        phaseCode: toNumber(event.args.phase, "message.phase"),
        scope,
        causeId,
        senderWallet,
        senderAgentKey: participant?.agentKey ?? null,
        senderCause: participant?.causeId ?? null,
        content: event.args.text,
        isParticipant,
        isAliveAtMessageTime,
        isActualCauseSpeaker:
          scope === "cause"
            ? Boolean(participant && participant.alive && participant.causeId === causeId)
            : null,
        isEliminatedSpeaker:
          isAliveAtMessageTime === null ? null : !isAliveAtMessageTime,
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: toNumber(event.args.createdAt, "message.createdAt"),
      };
    });
  }

  const rounds = buildRoundExports({
    snapshot,
    phaseHistory,
    commitEvents,
    revealEvents,
    participants,
  }).map((roundExport) => ({
    ...roundExport,
    gameId: context.gameId,
  }));

  const createdEvent = sortEvents(createdEvents)[0] ?? null;
  const notes = buildEvidenceNotes({ chatConfigured: Boolean(context.chat) });
  const capabilities = buildCapabilities({ chatConfigured: Boolean(context.chat) });

  const summary = {
    schemaVersion: "prisoners-daollema/evidence-v0",
    boundaryNote: QUERY_BOUNDARY_NOTE,
    gameId: context.gameId,
    chainId: context.chainId,
    addresses: {
      game: context.gameAddress,
      registry: context.registryAddress,
      chat: context.chatAddress,
    },
    game: {
      currentGameId: context.currentGameId,
      activeGameId: context.activeGameId,
      createdAt: snapshot.createdAt,
      createdAtBlock: createdEvent?.blockNumber ?? null,
      parameterSnapshot: {
        entryFeeWei: snapshot.entryFeeWei,
        creatorFeeBps: snapshot.creatorFeeBps,
        causeFeeBps: snapshot.causeFeeBps,
        joinDurationSeconds: snapshot.joinDurationSeconds,
        commitDurationBlocks: snapshot.commitDurationBlocks,
        revealDurationBlocks: snapshot.revealDurationBlocks,
        minPlayers: snapshot.minPlayers,
        maxPlayers: snapshot.maxPlayers,
        maxCauses: snapshot.maxCauses,
      },
      treasury: snapshot.treasury,
      phase: snapshot.phase,
      phaseCode: snapshot.phaseCode,
      outcome: snapshot.outcome,
      outcomeCode: snapshot.outcomeCode,
      round: snapshot.round,
      shareStreak: snapshot.shareStreak,
      counts: {
        joined: snapshot.joinedCount,
        alive: snapshot.aliveCount,
        usedCauses: snapshot.usedCauseCount,
        committed: snapshot.committedCount,
        revealed: snapshot.revealedCount,
        messages: messages.length,
      },
      phaseHistory,
    },
    capabilities,
    notes,
  };

  return {
    summary,
    roster: {
      gameId: context.gameId,
      participants,
    },
    causes: {
      gameId: context.gameId,
      usedCauses,
      whitelist: knownCauses,
    },
    rounds: {
      gameId: context.gameId,
      rounds,
    },
    auth: {
      gameId: context.gameId,
      registry: context.registryAddress,
      verifier: await context.registry.verifier(),
      participants: authParticipants,
    },
    messages,
  };
}

function resolveOutputDir(outputDir) {
  const resolved = resolveFromPackageRoot(
    outputDir ?? `exports/game-${Date.now().toString()}`
  );
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

function writeJsonArtifact(outputDir, fileName, value) {
  const filePath = join(outputDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function writeJsonlArtifact(outputDir, fileName, values) {
  const filePath = join(outputDir, fileName);
  const content = values.length
    ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n`
    : "";
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

export async function exportGameEvidence(options = {}) {
  const evidence = await collectGameEvidence(options);
  const outputDir = resolveOutputDir(options.out);
  const produced = [];
  const skipped = [];

  produced.push({
    artifact: "game-summary.json",
    path: writeJsonArtifact(outputDir, "game-summary.json", evidence.summary),
  });
  produced.push({
    artifact: "roster.json",
    path: writeJsonArtifact(outputDir, "roster.json", evidence.roster),
  });
  produced.push({
    artifact: "causes.json",
    path: writeJsonArtifact(outputDir, "causes.json", evidence.causes),
  });
  produced.push({
    artifact: "rounds.json",
    path: writeJsonArtifact(outputDir, "rounds.json", evidence.rounds),
  });
  produced.push({
    artifact: "auth.json",
    path: writeJsonArtifact(outputDir, "auth.json", evidence.auth),
  });

  if (evidence.summary.addresses.chat) {
    produced.push({
      artifact: "messages.jsonl",
      path: writeJsonlArtifact(outputDir, "messages.jsonl", evidence.messages),
      count: evidence.messages.length,
    });
  } else {
    skipped.push({
      artifact: "messages.jsonl",
      reason:
        "No GameChat address was provided or discovered for this chain, so message export was skipped.",
    });
  }

  skipped.push({
    artifact: "payouts.json",
    reason:
      "Current contracts do not implement winner/no-winner settlement, refund claims, or payout routing outputs yet.",
  });

  const manifest = {
    schemaVersion: "prisoners-daollema/evidence-v0",
    boundaryNote: QUERY_BOUNDARY_NOTE,
    outputDir,
    gameId: evidence.summary.gameId,
    chainId: evidence.summary.chainId,
    produced,
    skipped,
  };

  const manifestPath = writeJsonArtifact(outputDir, "export-manifest.json", manifest);
  manifest.produced = [
    ...manifest.produced,
    {
      artifact: "export-manifest.json",
      path: manifestPath,
    },
  ];
  writeJsonArtifact(outputDir, "export-manifest.json", manifest);

  return {
    manifest,
    evidence,
  };
}

export function printEvidenceSummary(summary) {
  console.log("\n🔎 Prisoners DAOllema evidence summary");
  console.log(`Game ID:        ${summary.gameId}`);
  console.log(`Chain ID:       ${summary.chainId}`);
  console.log(`Game:           ${summary.addresses.game}`);
  console.log(`Registry:       ${summary.addresses.registry}`);
  console.log(`Chat:           ${summary.addresses.chat ?? "(not configured)"}`);
  console.log(`Phase:          ${summary.game.phase}`);
  console.log(`Outcome:        ${summary.game.outcome}`);
  console.log(`Round:          ${summary.game.round}`);
  console.log(`Joined:         ${summary.game.counts.joined}`);
  console.log(`Alive:          ${summary.game.counts.alive}`);
  console.log(`Used causes:    ${summary.game.counts.usedCauses}`);
  console.log(`Committed:      ${summary.game.counts.committed}`);
  console.log(`Revealed:       ${summary.game.counts.revealed}`);
  console.log(`Messages:       ${summary.game.counts.messages}`);
  console.log(`\nBoundary note: ${summary.boundaryNote}`);
  if (summary.notes.length > 0) {
    console.log("Notes:");
    for (const note of summary.notes) {
      console.log(`  - ${note}`);
    }
  }
}

export function printExportSummary(result) {
  console.log("\n✅ Evidence export written.");
  console.log(`Output dir:     ${result.manifest.outputDir}`);
  console.log(`Game ID:        ${result.manifest.gameId}`);
  console.log(`Chain ID:       ${result.manifest.chainId}`);
  console.log("Produced:");
  for (const artifact of result.manifest.produced) {
    console.log(`  - ${artifact.artifact}: ${artifact.path}`);
  }
  if (result.manifest.skipped.length > 0) {
    console.log("Skipped:");
    for (const artifact of result.manifest.skipped) {
      console.log(`  - ${artifact.artifact}: ${artifact.reason}`);
    }
  }
  console.log(`\nBoundary note: ${result.manifest.boundaryNote}`);
}

export function printMessagesJsonl(messages) {
  process.stdout.write(
    messages.length
      ? `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
      : ""
  );
}

export { parseMessagesJsonl, printJson };
