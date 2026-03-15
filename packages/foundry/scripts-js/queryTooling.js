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
  "This evidence/query tooling exports the settlement surface the current contracts actually expose onchain today: auth records/events, game snapshots/rosters/causes, commit/reveal activity, round-resolution and terminal outcomes, settlement snapshots, winner/refund preview state, no-winner cause routing, per-game treasury/cause claimable and withdrawn balances, and optional GameChat messages.";

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
  "function getSettlement(uint256 gameId) view returns ((uint256 totalPotWei,uint256 creatorFeeWei,uint256 treasuryAccruedWei,uint256 treasuryWithdrawnWei,uint256 winnerShareWei,uint256 refundPerPlayerWei,uint256 noWinnerCausePoolWei,uint256 noWinnerCauseDistributedWei,uint16 winnerCount,bool finalized))",
  "function previewWinnerClaim(uint256 gameId, address wallet) view returns (uint256 grossPrizeWei,uint256 causeCutWei,uint256 netPrizeWei,bool availableNow)",
  "function previewRefund(uint256 gameId, address wallet) view returns (uint256 refundWei,bool availableNow)",
  "function treasuryClaimableAmount(uint256 gameId) view returns (uint256)",
  "function gameCauseClaimableAmount(uint256 gameId, uint16 causeId) view returns (uint256)",
  "function gameCauseRoutedAmount(uint256 gameId, uint16 causeId) view returns (uint256)",
  "function gameCauseWithdrawnAmount(uint256 gameId, uint16 causeId) view returns (uint256)",
  "function getPlayer(uint256 gameId, address wallet) view returns ((bool joined,bool alive,bool claimed,bool refunded,bool committedThisRound,bool revealedThisRound,address wallet,bytes32 agentKey,uint16 causeId,bytes32 commitment,uint8 revealedChoice,uint8 effectiveChoice,uint32 lastChoiceRound))",
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
  "event EffectiveChoiceMaterialized(uint256 indexed gameId, uint32 indexed round, address indexed wallet, uint8 choice, bool defaultedCommit, bool defaultedReveal)",
  "event PlayerEliminated(uint256 indexed gameId, uint32 indexed round, address indexed wallet, uint8 choice)",
  "event RoundResolved(uint256 indexed gameId, uint32 indexed round, uint16 sharers, uint16 catchers, uint16 stealers, uint16 eliminatedCount, uint16 aliveCount, uint32 shareStreak)",
  "event GameEnded(uint256 indexed gameId, uint8 outcome, uint32 round, uint16 winnerCount, uint32 shareStreak)",
  "event SettlementFinalized(uint256 indexed gameId, uint8 outcome, uint256 totalPotWei, uint256 creatorFeeWei, uint16 winnerCount, uint256 winnerShareWei, uint256 refundPerPlayerWei, uint256 noWinnerCausePoolWei, uint256 treasuryAccruedWei)",
  "event PrizeClaimed(uint256 indexed gameId, address indexed wallet, uint16 indexed causeId, uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, address causeRecipient)",
  "event RefundClaimed(uint256 indexed gameId, address indexed wallet, uint256 refundWei)",
  "event NoWinnerDistributed(uint256 indexed gameId, uint16 indexed causeId, address indexed recipient, uint256 amountWei)",
  "event TreasuryAccrued(uint256 indexed gameId, address indexed treasury, uint256 amountWei)",
  "event TreasuryWithdrawal(uint256 indexed gameId, address indexed recipient, uint256 amountWei)",
  "event CauseWithdrawal(uint256 indexed gameId, uint16 indexed causeId, address indexed recipient, uint256 amountWei)",
];

export const REGISTRY_QUERY_ABI = [
  "function verifier() view returns (address)",
  "function isAuthorized(address wallet) view returns (bool)",
  "function authRecordOf(address wallet) view returns ((bytes32 agentKey, bytes32 manifestHash, uint64 issuedAt, uint64 expiresAt, address issuer, bool active))",
  "event AuthRegistered(address indexed wallet, bytes32 indexed agentKey, bytes32 manifestHash, uint64 expiresAt, address indexed issuer)",
  "event AuthRevoked(address indexed wallet, bytes32 indexed agentKey)",
];

export const CHAT_QUERY_ABI = [
  "function game() view returns (address)",
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
  return value === null || value === undefined
    ? null
    : toNumber(value, "causeId");
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

function resolveBlockTag(value, stateSnapshotBlock) {
  if (typeof value === "number") {
    return value;
  }
  if (value === "earliest") {
    return 0;
  }
  if (value === "latest" || value === "pending") {
    return stateSnapshotBlock;
  }
  throw new Error(`Unsupported block tag '${value}'.`);
}

function formatBlockTag(value) {
  return typeof value === "number" ? value.toString() : value;
}

function buildEvidenceWindow({
  requestedFromBlock,
  requestedToBlock,
  resolvedFromBlock,
  resolvedToBlock,
  stateSnapshotBlock,
  stateSnapshotTimestamp,
}) {
  return {
    stateSnapshot: {
      blockNumber: stateSnapshotBlock,
      timestamp: stateSnapshotTimestamp,
    },
    logRange: {
      requestedFromBlock,
      requestedToBlock,
      resolvedFromBlock,
      resolvedToBlock,
      coversFullHistoryToStateSnapshot:
        resolvedFromBlock === 0 && resolvedToBlock === stateSnapshotBlock,
      isHybridAgainstStateSnapshot: resolvedToBlock !== stateSnapshotBlock,
    },
  };
}

function describeProviderError(error) {
  if (!error) {
    return "Unknown provider error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error.reason === "string" && error.reason.length > 0) {
    return error.reason;
  }
  if (typeof error.body === "string" && error.body.length > 0) {
    try {
      const parsed = JSON.parse(error.body);
      const nestedMessage =
        parsed?.error?.message ?? parsed?.message ?? parsed?.error;
      if (typeof nestedMessage === "string" && nestedMessage.length > 0) {
        return nestedMessage;
      }
    } catch {
      return error.body;
    }
  }
  if (error.error) {
    const nestedMessage = describeProviderError(error.error);
    if (typeof nestedMessage === "string" && nestedMessage.length > 0) {
      return nestedMessage;
    }
  }
  if (typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function isHistoricalStateReadSupportError(error) {
  const message = describeProviderError(error).toLowerCase();
  return [
    "missing trie node",
    "archive",
    "historical state",
    "historical eth_call",
    "header not found",
    "state is not available",
    "old state",
    "pruned",
    "missing block or state",
  ].some((fragment) => message.includes(fragment));
}

async function readBlockOrThrow(provider, blockTag, label) {
  const block = await provider.getBlock(blockTag);
  if (!block) {
    throw new Error(
      `Unable to read ${label} ${formatBlockTag(blockTag)} from the current RPC provider.`
    );
  }
  return block;
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

function normalizeSettlementState(rawSettlement) {
  return {
    totalPotWei: toDecimalString(rawSettlement.totalPotWei),
    creatorFeeWei: toDecimalString(rawSettlement.creatorFeeWei),
    treasuryAccruedWei: toDecimalString(rawSettlement.treasuryAccruedWei),
    treasuryWithdrawnWei: toDecimalString(rawSettlement.treasuryWithdrawnWei),
    winnerShareWei: toDecimalString(rawSettlement.winnerShareWei),
    refundPerPlayerWei: toDecimalString(rawSettlement.refundPerPlayerWei),
    noWinnerCausePoolWei: toDecimalString(rawSettlement.noWinnerCausePoolWei),
    noWinnerCauseDistributedWei: toDecimalString(
      rawSettlement.noWinnerCauseDistributedWei
    ),
    winnerCount: toNumber(rawSettlement.winnerCount, "settlement.winnerCount"),
    finalized: rawSettlement.finalized,
  };
}

function normalizePlayerState(rawPlayer, auth, latestTimestamp) {
  const authRecord = normalizeAuthRecord(auth.record);
  const isAuthorizedNow = auth.isAuthorizedNow;
  const authStatus = deriveAuthStatus(
    authRecord,
    isAuthorizedNow,
    latestTimestamp
  );

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
    revealedChoice: enumName(
      CHOICE_NAMES,
      rawPlayer.revealedChoice,
      "player.revealedChoice"
    ),
    revealedChoiceCode: toNumber(
      rawPlayer.revealedChoice,
      "player.revealedChoice"
    ),
    effectiveChoice: enumName(
      CHOICE_NAMES,
      rawPlayer.effectiveChoice,
      "player.effectiveChoice"
    ),
    effectiveChoiceCode: toNumber(
      rawPlayer.effectiveChoice,
      "player.effectiveChoice"
    ),
    lastChoiceRound: toNumber(rawPlayer.lastChoiceRound, "player.lastChoiceRound"),
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

function normalizeGameCause(
  causeId,
  rawCause,
  members,
  routedFromGameWei,
  claimableFromGameWei,
  withdrawnFromGameWei
) {
  return {
    causeId,
    used: rawCause.used,
    entrantCount: toNumber(rawCause.entrantCount, "gameCause.entrantCount"),
    recipient: rawCause.recipient,
    metadataHash: rawCause.metadataHash,
    members,
    routedFromGameWei: toDecimalString(routedFromGameWei),
    claimableFromGameWei: toDecimalString(claimableFromGameWei),
    withdrawnFromGameWei: toDecimalString(withdrawnFromGameWei),
  };
}

function buildEvidenceNotes({
  chatConfigured,
  evidenceWindow,
  historicalStateBlockRequested,
  historicalStateFallbackReason,
}) {
  const notes = [];

  if (historicalStateFallbackReason) {
    notes.push(
      `Historical state reads were requested at block ${historicalStateBlockRequested}, but the current RPC provider could not serve them (${historicalStateFallbackReason}). State snapshots fell back to block ${evidenceWindow.stateSnapshot.blockNumber}.`
    );
  }

  if (!evidenceWindow.logRange.coversFullHistoryToStateSnapshot) {
    notes.push(
      `Event-derived sections only cover logs from block ${evidenceWindow.logRange.resolvedFromBlock} through ${evidenceWindow.logRange.resolvedToBlock}. Treat this as a bounded evidence slice, not a complete replay export for the whole game.`
    );
  }

  if (evidenceWindow.logRange.isHybridAgainstStateSnapshot) {
    notes.push(
      `State snapshots were read at block ${evidenceWindow.stateSnapshot.blockNumber}, but logs stop at block ${evidenceWindow.logRange.resolvedToBlock}. This export is intentionally hybrid and should only be used with that boundary in mind.`
    );
  }

  notes.push(
    "Round resolution, eliminations, terminal outcomes, and per-game settlement snapshots are exported when their onchain events/state exist inside the selected evidence window.",
    "Per-game routed, claimable, and withdrawn payout amounts are exported from the contract's own settlement counters and events rather than inferred from generic recipient balances."
  );

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
    "round-resolution-outcomes",
    "elimination-history",
    "winner-no-winner-terminal-state",
    "claim-refund-settlement-data",
    "payout-destination-audit",
  ];

  if (chatConfigured) {
    available.push("game-chat-message-export");
  }

  return {
    available,
    unavailable: [],
  };
}

function normalizeWinnerClaimPreview(rawPreview) {
  return {
    grossPrizeWei: toDecimalString(rawPreview.grossPrizeWei),
    causeCutWei: toDecimalString(rawPreview.causeCutWei),
    netPrizeWei: toDecimalString(rawPreview.netPrizeWei),
    availableNow: rawPreview.availableNow,
  };
}

function normalizeRefundPreview(rawPreview) {
  return {
    refundWei: toDecimalString(rawPreview.refundWei),
    availableNow: rawPreview.availableNow,
  };
}

async function buildPayoutExports({
  gameId,
  snapshot,
  settlement,
  participants,
  usedCauses,
  treasuryClaimableWei,
  settlementEvents,
  prizeClaimEvents,
  refundClaimEvents,
  noWinnerDistributionEvents,
  treasuryAccrualEvents,
  treasuryWithdrawalEvents,
  causeWithdrawalEvents,
  getBlockTimestamp,
}) {
  const [
    normalizedSettlementEvents,
    normalizedPrizeClaims,
    normalizedRefundClaims,
    normalizedNoWinnerDistributions,
    normalizedTreasuryAccruals,
    normalizedTreasuryWithdrawals,
    normalizedCauseWithdrawals,
  ] = await Promise.all([
    Promise.all(
      sortEvents(settlementEvents).map(async (event) => ({
        outcome: enumName(
          OUTCOME_NAMES,
          event.args.outcome,
          "settlementFinalized.outcome"
        ),
        outcomeCode: toNumber(
          event.args.outcome,
          "settlementFinalized.outcome"
        ),
        totalPotWei: toDecimalString(event.args.totalPotWei),
        creatorFeeWei: toDecimalString(event.args.creatorFeeWei),
        winnerCount: toNumber(
          event.args.winnerCount,
          "settlementFinalized.winnerCount"
        ),
        winnerShareWei: toDecimalString(event.args.winnerShareWei),
        refundPerPlayerWei: toDecimalString(event.args.refundPerPlayerWei),
        noWinnerCausePoolWei: toDecimalString(event.args.noWinnerCausePoolWei),
        treasuryAccruedWei: toDecimalString(event.args.treasuryAccruedWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(prizeClaimEvents).map(async (event) => ({
        wallet: event.args.wallet,
        causeId: toNumber(event.args.causeId, "prizeClaim.causeId"),
        grossPrizeWei: toDecimalString(event.args.grossPrizeWei),
        causeCutWei: toDecimalString(event.args.causeCutWei),
        netPrizeWei: toDecimalString(event.args.netPrizeWei),
        causeRecipient: event.args.causeRecipient,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(refundClaimEvents).map(async (event) => ({
        wallet: event.args.wallet,
        refundWei: toDecimalString(event.args.refundWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(noWinnerDistributionEvents).map(async (event) => ({
        causeId: toNumber(
          event.args.causeId,
          "noWinnerDistribution.causeId"
        ),
        recipient: event.args.recipient,
        amountWei: toDecimalString(event.args.amountWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(treasuryAccrualEvents).map(async (event) => ({
        treasury: event.args.treasury,
        amountWei: toDecimalString(event.args.amountWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(treasuryWithdrawalEvents).map(async (event) => ({
        recipient: event.args.recipient,
        amountWei: toDecimalString(event.args.amountWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
    Promise.all(
      sortEvents(causeWithdrawalEvents).map(async (event) => ({
        causeId: toNumber(event.args.causeId, "causeWithdrawal.causeId"),
        recipient: event.args.recipient,
        amountWei: toDecimalString(event.args.amountWei),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: await getBlockTimestamp(event.blockNumber),
      }))
    ),
  ]);

  const notes = [
    "routedFromGameWei fields are game-specific lifetime routing totals exposed by the current contract state.",
    "claimableFromGameWei and treasuryClaimableWei fields are the selected game's current outstanding pull-based amounts at the chosen state snapshot block.",
    "withdrawnFromGameWei and withdrawal events are per-game counters/events, so they remain attributable even after recipients pull funds later.",
  ];

  if (!settlement.finalized) {
    notes.push(
      "This game is not yet terminal at the selected state snapshot, so settlement values remain zero/unfinalized and claim/refund paths are not yet live."
    );
  }

  return {
    gameId,
    settlement: {
      finalized: settlement.finalized,
      totalPotWei: settlement.totalPotWei,
      creatorFeeWei: settlement.creatorFeeWei,
      treasuryRecipient: snapshot.treasury,
      treasuryAccruedWei: settlement.treasuryAccruedWei,
      treasuryWithdrawnWei: settlement.treasuryWithdrawnWei,
      treasuryClaimableWei,
      winnerCount: settlement.winnerCount,
      winnerShareWei: settlement.winnerShareWei,
      refundPerPlayerWei: settlement.refundPerPlayerWei,
      noWinnerCausePoolWei: settlement.noWinnerCausePoolWei,
      noWinnerCauseDistributedWei: settlement.noWinnerCauseDistributedWei,
      claimPathAvailable:
        settlement.finalized &&
        snapshot.phase === "Ended" &&
        snapshot.outcome === "Winners",
      refundPathAvailable:
        settlement.finalized &&
        snapshot.phase === "Cancelled" &&
        snapshot.outcome === "Cancelled",
    },
    participants: participants.map((player) => ({
      wallet: player.wallet,
      causeId: player.causeId,
      joined: player.joined,
      alive: player.alive,
      claimed: player.claimed,
      refunded: player.refunded,
      claim: player.claimPreview,
      refund: player.refundPreview,
    })),
    causes: usedCauses.map((cause) => ({
      causeId: cause.causeId,
      entrantCount: cause.entrantCount,
      recipient: cause.recipient,
      routedFromGameWei: cause.routedFromGameWei,
      claimableFromGameWei: cause.claimableFromGameWei,
      withdrawnFromGameWei: cause.withdrawnFromGameWei,
    })),
    events: {
      settlementFinalized: normalizedSettlementEvents,
      prizeClaims: normalizedPrizeClaims,
      refundClaims: normalizedRefundClaims,
      noWinnerDistributions: normalizedNoWinnerDistributions,
      treasuryAccruals: normalizedTreasuryAccruals,
      treasuryWithdrawals: normalizedTreasuryWithdrawals,
      causeWithdrawals: normalizedCauseWithdrawals,
    },
    notes,
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
      phase: enumName(
        PHASE_NAMES,
        event.args.newPhase,
        "phaseHistory.newPhase"
      ),
      phaseCode: toNumber(event.args.newPhase, "phaseHistory.newPhase"),
      blockNumber: event.blockNumber,
      txHash: event.transactionHash,
      timestamp: await getBlockTimestamp(event.blockNumber),
    });
  }

  return history;
}

function buildRoundExports({
  snapshot,
  settlement,
  phaseHistory,
  commitEvents,
  revealEvents,
  effectiveChoiceEvents,
  eliminatedEvents,
  roundResolvedEvents,
  gameEndedEvents,
  participants,
}) {
  const commitPhaseTransitions = phaseHistory.filter(
    (item) => item.phase === "Commit"
  );
  const revealPhaseTransitions = phaseHistory.filter(
    (item) => item.phase === "Reveal"
  );
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
  const effectiveChoicesByRound = groupByRound(
    effectiveChoiceEvents,
    (event) => ({
      wallet: event.args.wallet,
      choice: enumName(CHOICE_NAMES, event.args.choice, "effective.choice"),
      choiceCode: toNumber(event.args.choice, "effective.choice"),
      defaultedCommit: event.args.defaultedCommit,
      defaultedReveal: event.args.defaultedReveal,
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
    })
  );
  const eliminatedByRound = groupByRound(eliminatedEvents, (event) => ({
    wallet: event.args.wallet,
    choice: enumName(CHOICE_NAMES, event.args.choice, "eliminated.choice"),
    choiceCode: toNumber(event.args.choice, "eliminated.choice"),
    txHash: event.transactionHash,
    blockNumber: event.blockNumber,
  }));
  const resolvedByRound = groupByRound(roundResolvedEvents, (event) => ({
    sharers: toNumber(event.args.sharers, "roundResolved.sharers"),
    catchers: toNumber(event.args.catchers, "roundResolved.catchers"),
    stealers: toNumber(event.args.stealers, "roundResolved.stealers"),
    eliminatedCount: toNumber(
      event.args.eliminatedCount,
      "roundResolved.eliminatedCount"
    ),
    aliveCount: toNumber(event.args.aliveCount, "roundResolved.aliveCount"),
    shareStreak: toNumber(event.args.shareStreak, "roundResolved.shareStreak"),
    txHash: event.transactionHash,
    blockNumber: event.blockNumber,
  }));
  const endedByRound = groupByRound(gameEndedEvents, (event) => ({
    outcome: enumName(OUTCOME_NAMES, event.args.outcome, "gameEnded.outcome"),
    outcomeCode: toNumber(event.args.outcome, "gameEnded.outcome"),
    winnerCount: toNumber(event.args.winnerCount, "gameEnded.winnerCount"),
    shareStreak: toNumber(event.args.shareStreak, "gameEnded.shareStreak"),
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
  for (const round of effectiveChoicesByRound.keys()) {
    roundNumbers.add(round);
  }
  for (const round of eliminatedByRound.keys()) {
    roundNumbers.add(round);
  }
  for (const round of resolvedByRound.keys()) {
    roundNumbers.add(round);
  }
  for (const round of endedByRound.keys()) {
    roundNumbers.add(round);
  }
  if (snapshot.round > 0) {
    roundNumbers.add(snapshot.round);
  }

  return [...roundNumbers]
    .sort((a, b) => a - b)
    .map((round) => {
      const isCurrentRound = round === snapshot.round;
      const effectiveChoices = effectiveChoicesByRound.get(round) ?? [];
      const activePlayers =
        effectiveChoices.length > 0
          ? effectiveChoices.map((entry) => entry.wallet)
          : participants
              .filter((player) => player.alive)
              .map((player) => player.wallet);
      const resolution = (resolvedByRound.get(round) ?? [])[0] ?? null;
      const terminalState = (endedByRound.get(round) ?? [])[0] ?? null;
      const notes = [];

      if (!resolution) {
        notes.push(
          "No round-resolution events were observed inside the selected evidence window for this round."
        );
      }

      if (!isCurrentRound) {
        notes.push(
          "Only the current round carries onchain deadline counters in game snapshot state; earlier round deadlines are not backfilled."
        );
      }

      return {
        gameId: null,
        round,
        phaseWindows: {
          commitStartBlock:
            commitPhaseTransitions[round - 1]?.blockNumber ?? null,
          commitDeadlineBlock: isCurrentRound
            ? snapshot.commitDeadlineBlock
            : null,
          revealStartBlock:
            revealPhaseTransitions[round - 1]?.blockNumber ?? null,
          revealDeadlineBlock: isCurrentRound
            ? snapshot.revealDeadlineBlock
            : null,
        },
        phaseAtExport: snapshot.phase,
        activePlayers,
        commits: commitEventsByRound.get(round) ?? [],
        reveals: revealEventsByRound.get(round) ?? [],
        effectiveChoices,
        eliminated: eliminatedByRound.get(round) ?? [],
        resolution,
        terminalState,
        shareStreak:
          resolution?.shareStreak ?? (isCurrentRound ? snapshot.shareStreak : null),
        resolutionAvailable: Boolean(resolution),
        settlementAvailable: Boolean(terminalState) && settlement.finalized,
        notes,
      };
    });
}

async function loadWalletAuthEvents({
  registry,
  wallet,
  fromBlock,
  toBlock,
  getBlockTimestamp,
}) {
  const [registeredEvents, revokedEvents] = await Promise.all([
    registry.queryFilter(
      registry.filters.AuthRegistered(wallet, null, null),
      fromBlock,
      toBlock
    ),
    registry.queryFilter(
      registry.filters.AuthRevoked(wallet, null),
      fromBlock,
      toBlock
    ),
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
      `Missing ${label}. Provide an address or a deployment name${
        defaultName ? ` (for example ${defaultName})` : ""
      }.`
    );
  }

  return null;
}

async function validateChatLink(chat, chatAddress, gameAddress) {
  if (!chat) {
    return;
  }

  let linkedGameAddress;
  try {
    linkedGameAddress = normalizeAddress(await chat.game(), "chat.game()");
  } catch {
    throw new Error(
      `Chat ${chatAddress} does not expose the expected GameChat.game() linkage needed for honest evidence export.`
    );
  }

  if (linkedGameAddress.toLowerCase() !== gameAddress.toLowerCase()) {
    throw new Error(
      `Chat ${chatAddress} is linked to game ${linkedGameAddress}, not selected game ${gameAddress}. Refusing to mix evidence across contracts.`
    );
  }
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
  await validateChatLink(chat, chatAddress, gameAddress);
  const registryAddress = options.registry
    ? resolveContractRef(options.registry, {
        chainId,
        defaultName: "AgentAuthRegistry",
        required: true,
        label: "registry",
      })
    : normalizeAddress(await game.authRegistry(), "registry");
  const registry = new ethers.Contract(
    registryAddress,
    REGISTRY_QUERY_ABI,
    provider
  );

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

async function collectStateAtBlock({
  context,
  stateSnapshotBlock,
  stateSnapshotTimestamp,
  fromBlock,
  toBlock,
  phaseHistory,
  getBlockTimestamp,
}) {
  const stateReadOptions = { blockTag: stateSnapshotBlock };
  const [
    rawSnapshot,
    rawSettlement,
    rawPlayerCount,
    rawKnownCauseCount,
    rawUsedCauseCount,
    verifier,
  ] = await Promise.all([
    context.game.getGame(context.gameId, stateReadOptions),
    context.game.getSettlement(context.gameId, stateReadOptions),
    context.game.playerCount(context.gameId, stateReadOptions),
    context.game.causeCount(stateReadOptions),
    context.game.gameCauseCount(context.gameId, stateReadOptions),
    context.registry.verifier(stateReadOptions),
  ]);

  const snapshot = normalizeGameSnapshot(rawSnapshot);
  const settlement = normalizeSettlementState(rawSettlement);
  const playerCount = toNumber(rawPlayerCount, "playerCount");
  const knownCauseCount = toNumber(rawKnownCauseCount, "knownCauseCount");
  const usedCauseCount = toNumber(rawUsedCauseCount, "usedCauseCount");

  const [wallets, knownCauseIds, usedCauseIds] = await Promise.all([
    Promise.all(
      Array.from({ length: playerCount }, (_, index) =>
        context.game.playerAt(context.gameId, index, stateReadOptions)
      )
    ),
    Promise.all(
      Array.from({ length: knownCauseCount }, (_, index) =>
        context.game.causeAt(index, stateReadOptions)
      )
    ),
    Promise.all(
      Array.from({ length: usedCauseCount }, (_, index) =>
        context.game.gameCauseAt(context.gameId, index, stateReadOptions)
      )
    ),
  ]);

  const [
    rawPlayers,
    authResults,
    rawKnownCauses,
    rawUsedCauses,
    rawUsedCauseRoutedAmounts,
    rawUsedCauseClaimableAmounts,
    rawUsedCauseWithdrawnAmounts,
    rawWinnerClaimPreviews,
    rawRefundPreviews,
    rawTreasuryClaimableAmount,
  ] = await Promise.all([
    Promise.all(
      wallets.map((wallet) =>
        context.game.getPlayer(context.gameId, wallet, stateReadOptions)
      )
    ),
    Promise.all(
      wallets.map(async (wallet) => ({
        isAuthorizedNow: await context.registry.isAuthorized(
          wallet,
          stateReadOptions
        ),
        record: await context.registry.authRecordOf(wallet, stateReadOptions),
      }))
    ),
    Promise.all(
      knownCauseIds.map((causeId) =>
        context.game.getCause(normalizeCauseId(causeId), stateReadOptions)
      )
    ),
    Promise.all(
      usedCauseIds.map((causeId) =>
        context.game.getGameCause(
          context.gameId,
          normalizeCauseId(causeId),
          stateReadOptions
        )
      )
    ),
    Promise.all(
      usedCauseIds.map((causeId) =>
        context.game.gameCauseRoutedAmount(
          context.gameId,
          normalizeCauseId(causeId),
          stateReadOptions
        )
      )
    ),
    Promise.all(
      usedCauseIds.map((causeId) =>
        context.game.gameCauseClaimableAmount(
          context.gameId,
          normalizeCauseId(causeId),
          stateReadOptions
        )
      )
    ),
    Promise.all(
      usedCauseIds.map((causeId) =>
        context.game.gameCauseWithdrawnAmount(
          context.gameId,
          normalizeCauseId(causeId),
          stateReadOptions
        )
      )
    ),
    Promise.all(
      wallets.map((wallet) =>
        context.game.previewWinnerClaim(
          context.gameId,
          wallet,
          stateReadOptions
        )
      )
    ),
    Promise.all(
      wallets.map((wallet) =>
        context.game.previewRefund(context.gameId, wallet, stateReadOptions)
      )
    ),
    context.game.treasuryClaimableAmount(context.gameId, stateReadOptions),
  ]);

  const participants = rawPlayers.map((rawPlayer, index) => ({
    ...normalizePlayerState(rawPlayer, authResults[index], stateSnapshotTimestamp),
    claimPreview: normalizeWinnerClaimPreview(rawWinnerClaimPreviews[index]),
    refundPreview: normalizeRefundPreview(rawRefundPreviews[index]),
  }));
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
    return normalizeGameCause(
      causeId,
      rawCause,
      members,
      rawUsedCauseRoutedAmounts[index],
      rawUsedCauseClaimableAmounts[index],
      rawUsedCauseWithdrawnAmounts[index]
    );
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

  return {
    snapshot,
    settlement,
    participants,
    participantMap,
    knownCauses,
    usedCauses,
    authParticipants,
    phaseHistory,
    verifier,
    treasuryClaimableWei: toDecimalString(rawTreasuryClaimableAmount),
  };
}

export async function collectGameEvidence(options = {}) {
  const context = await resolveGameContext(options);
  const requestedFromBlock = normalizeBlockTag(
    options.fromBlock,
    0,
    "fromBlock"
  );
  const requestedToBlock = normalizeBlockTag(
    options.toBlock,
    "latest",
    "toBlock"
  );
  const latestBlock = await readBlockOrThrow(
    context.provider,
    "latest",
    "latest block"
  );
  const fromBlock = resolveBlockTag(requestedFromBlock, latestBlock.number);
  const toBlock = resolveBlockTag(requestedToBlock, latestBlock.number);

  if (fromBlock > toBlock) {
    throw new Error(
      `fromBlock ${formatBlockTag(
        requestedFromBlock
      )} resolves above toBlock ${formatBlockTag(requestedToBlock)}.`
    );
  }

  const requestedHistoricalStateBlock =
    typeof requestedToBlock === "number" && toBlock < latestBlock.number
      ? toBlock
      : null;

  let stateSnapshotBlock = latestBlock.number;
  let stateSnapshotTimestamp = latestBlock.timestamp;

  if (requestedHistoricalStateBlock !== null) {
    const historicalStateBlock = await readBlockOrThrow(
      context.provider,
      requestedHistoricalStateBlock,
      "state snapshot block"
    );
    stateSnapshotBlock = historicalStateBlock.number;
    stateSnapshotTimestamp = historicalStateBlock.timestamp;
  }

  const blockTimestampCache = new Map([[latestBlock.number, latestBlock.timestamp]]);
  if (stateSnapshotBlock !== latestBlock.number) {
    blockTimestampCache.set(stateSnapshotBlock, stateSnapshotTimestamp);
  }

  async function getBlockTimestamp(blockNumber) {
    if (!blockTimestampCache.has(blockNumber)) {
      const block = await readBlockOrThrow(
        context.provider,
        blockNumber,
        "event block"
      );
      blockTimestampCache.set(blockNumber, block.timestamp);
    }
    return blockTimestampCache.get(blockNumber);
  }

  const [
    createdEvents,
    phaseEvents,
    commitEvents,
    revealEvents,
    effectiveChoiceEvents,
    eliminatedEvents,
    roundResolvedEvents,
    gameEndedEvents,
    settlementEvents,
    prizeClaimEvents,
    refundClaimEvents,
    noWinnerDistributionEvents,
    treasuryAccrualEvents,
    treasuryWithdrawalEvents,
    causeWithdrawalEvents,
    messageEvents,
  ] = await Promise.all([
    context.game.queryFilter(
      context.game.filters.GameCreated(context.gameId),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.PhaseAdvanced(context.gameId),
      fromBlock,
      toBlock
    ),
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
    context.game.queryFilter(
      context.game.filters.EffectiveChoiceMaterialized(
        context.gameId,
        null,
        null
      ),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.PlayerEliminated(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.RoundResolved(context.gameId, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.GameEnded(context.gameId),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.SettlementFinalized(context.gameId),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.PrizeClaimed(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.RefundClaimed(context.gameId, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.NoWinnerDistributed(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.TreasuryAccrued(context.gameId, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.TreasuryWithdrawal(context.gameId, null),
      fromBlock,
      toBlock
    ),
    context.game.queryFilter(
      context.game.filters.CauseWithdrawal(context.gameId, null, null),
      fromBlock,
      toBlock
    ),
    context.chat
      ? context.chat.queryFilter(
          context.chat.filters.MessagePosted(context.gameId, null, null),
          fromBlock,
          toBlock
        )
      : Promise.resolve([]),
  ]);

  const phaseHistory = await buildPhaseHistory(phaseEvents, getBlockTimestamp);

  let historicalStateFallbackReason = null;
  let stateData;

  try {
    stateData = await collectStateAtBlock({
      context,
      stateSnapshotBlock,
      stateSnapshotTimestamp,
      fromBlock,
      toBlock,
      phaseHistory,
      getBlockTimestamp,
    });
  } catch (error) {
    if (
      requestedHistoricalStateBlock === null ||
      !isHistoricalStateReadSupportError(error)
    ) {
      throw error;
    }

    historicalStateFallbackReason = describeProviderError(error);
    stateSnapshotBlock = latestBlock.number;
    stateSnapshotTimestamp = latestBlock.timestamp;
    blockTimestampCache.set(stateSnapshotBlock, stateSnapshotTimestamp);

    stateData = await collectStateAtBlock({
      context,
      stateSnapshotBlock,
      stateSnapshotTimestamp,
      fromBlock,
      toBlock,
      phaseHistory,
      getBlockTimestamp,
    });
  }

  const evidenceWindow = buildEvidenceWindow({
    requestedFromBlock,
    requestedToBlock,
    resolvedFromBlock: fromBlock,
    resolvedToBlock: toBlock,
    stateSnapshotBlock,
    stateSnapshotTimestamp,
  });

  const {
    snapshot,
    settlement,
    participants,
    participantMap,
    knownCauses,
    usedCauses,
    authParticipants,
    verifier,
    treasuryClaimableWei,
  } = stateData;

  let messages = [];
  if (context.chat) {
    messages = sortEvents(messageEvents).map((event) => {
      const senderWallet = normalizeAddress(
        event.args.sender,
        "message.sender"
      );
      const participant =
        participantMap.get(senderWallet.toLowerCase()) ?? null;
      const scope = enumName(SCOPE_NAMES, event.args.scope, "message.scope");
      const causeId =
        scope === "cause" ? normalizeCauseId(event.args.causeId) : null;
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
            ? Boolean(
                participant &&
                  participant.alive &&
                  participant.causeId === causeId
              )
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
    settlement,
    phaseHistory,
    commitEvents,
    revealEvents,
    effectiveChoiceEvents,
    eliminatedEvents,
    roundResolvedEvents,
    gameEndedEvents,
    participants,
  }).map((roundExport) => ({
    ...roundExport,
    gameId: context.gameId,
  }));

  const payouts = await buildPayoutExports({
    gameId: context.gameId,
    snapshot,
    settlement,
    participants,
    usedCauses,
    treasuryClaimableWei,
    settlementEvents,
    prizeClaimEvents,
    refundClaimEvents,
    noWinnerDistributionEvents,
    treasuryAccrualEvents,
    treasuryWithdrawalEvents,
    causeWithdrawalEvents,
    getBlockTimestamp,
  });

  const createdEvent = sortEvents(createdEvents)[0] ?? null;
  const notes = buildEvidenceNotes({
    chatConfigured: Boolean(context.chat),
    evidenceWindow,
    historicalStateBlockRequested: requestedHistoricalStateBlock,
    historicalStateFallbackReason,
  });
  const capabilities = buildCapabilities({
    chatConfigured: Boolean(context.chat),
  });

  const summary = {
    schemaVersion: "prisoners-daollema/evidence-v0",
    boundaryNote: QUERY_BOUNDARY_NOTE,
    gameId: context.gameId,
    chainId: context.chainId,
    evidenceWindow,
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
      settlement: {
        finalized: settlement.finalized,
        totalPotWei: settlement.totalPotWei,
        creatorFeeWei: settlement.creatorFeeWei,
        treasuryAccruedWei: settlement.treasuryAccruedWei,
        treasuryWithdrawnWei: settlement.treasuryWithdrawnWei,
        treasuryClaimableWei,
        winnerCount: settlement.winnerCount,
        winnerShareWei: settlement.winnerShareWei,
        refundPerPlayerWei: settlement.refundPerPlayerWei,
        noWinnerCausePoolWei: settlement.noWinnerCausePoolWei,
        noWinnerCauseDistributedWei: settlement.noWinnerCauseDistributedWei,
      },
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
    evidenceWindow,
    summary,
    roster: {
      gameId: context.gameId,
      evidenceWindow,
      participants,
    },
    causes: {
      gameId: context.gameId,
      evidenceWindow,
      usedCauses,
      whitelist: knownCauses,
    },
    rounds: {
      gameId: context.gameId,
      evidenceWindow,
      rounds,
    },
    auth: {
      gameId: context.gameId,
      evidenceWindow,
      registry: context.registryAddress,
      verifier,
      participants: authParticipants,
    },
    payouts: {
      gameId: context.gameId,
      evidenceWindow,
      ...payouts,
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
  produced.push({
    artifact: "payouts.json",
    path: writeJsonArtifact(outputDir, "payouts.json", evidence.payouts),
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

  const manifest = {
    schemaVersion: "prisoners-daollema/evidence-v0",
    boundaryNote: QUERY_BOUNDARY_NOTE,
    evidenceWindow: evidence.evidenceWindow,
    outputDir,
    gameId: evidence.summary.gameId,
    chainId: evidence.summary.chainId,
    produced,
    skipped,
  };

  const manifestPath = writeJsonArtifact(
    outputDir,
    "export-manifest.json",
    manifest
  );
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
  console.log(
    `Chat:           ${summary.addresses.chat ?? "(not configured)"}`
  );
  console.log(
    `State block:    ${summary.evidenceWindow.stateSnapshot.blockNumber}`
  );
  console.log(
    `Log range:      ${formatBlockTag(
      summary.evidenceWindow.logRange.requestedFromBlock
    )} -> ${formatBlockTag(
      summary.evidenceWindow.logRange.requestedToBlock
    )} (resolved ${summary.evidenceWindow.logRange.resolvedFromBlock} -> ${
      summary.evidenceWindow.logRange.resolvedToBlock
    })`
  );
  console.log(`Phase:          ${summary.game.phase}`);
  console.log(`Outcome:        ${summary.game.outcome}`);
  console.log(`Settlement:     ${summary.game.settlement.finalized ? "finalized" : "pending"}`);
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
  console.log(
    `State block:    ${result.manifest.evidenceWindow.stateSnapshot.blockNumber}`
  );
  console.log(
    `Log range:      ${formatBlockTag(
      result.manifest.evidenceWindow.logRange.requestedFromBlock
    )} -> ${formatBlockTag(
      result.manifest.evidenceWindow.logRange.requestedToBlock
    )} (resolved ${
      result.manifest.evidenceWindow.logRange.resolvedFromBlock
    } -> ${result.manifest.evidenceWindow.logRange.resolvedToBlock})`
  );
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
