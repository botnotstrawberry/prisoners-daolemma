import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { collectGameEvidence, parseMessagesJsonl } from "./queryTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const registryArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "AgentAuthRegistry.sol", "AgentAuthRegistry.json"),
    "utf8"
  )
);
const gameArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "PrisonersDaollema.sol", "PrisonersDaollema.json"),
    "utf8"
  )
);
const chatArtifact = JSON.parse(
  readFileSync(join(packageDir, "out", "GameChat.sol", "GameChat.json"), "utf8")
);

const RPC_URL = "http://127.0.0.1:8548";
const ANVIL_PORT = "8548";
const ANVIL_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
];
const AUTH_DOMAIN = {
  name: "PrisonersDaollemaAgentAuthRegistry",
  version: "1",
};
const AUTH_TYPES = {
  AuthPermit: [
    { name: "wallet", type: "address" },
    { name: "agentKey", type: "bytes32" },
    { name: "manifestHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "gameNamespace", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
};

let anvilProcess;

before(async () => {
  anvilProcess = spawn(
    "anvil",
    [
      "--port",
      ANVIL_PORT,
      "--chain-id",
      "31337",
      "--code-size-limit",
      "131072",
    ],
    {
      cwd: packageDir,
      stdio: "ignore",
    }
  );

  await waitForAnvil();
});

after(async () => {
  if (!anvilProcess) {
    return;
  }

  await new Promise((resolve) => {
    anvilProcess.once("exit", resolve);
    anvilProcess.kill("SIGTERM");
  });
});

test(
  "query export writes honest evidence artifacts for current auth/game/chat state",
  { concurrency: false },
  async () => {
    const { owner, registry, game, chat } = await setupEvidenceFixture();

    const outputDir = mkdtempSync(join(tmpdir(), "pd-query-export-"));
    const manifest = JSON.parse(
      runCli([
        "export",
        "--rpc-url",
        RPC_URL,
        "--game",
        game.address,
        "--registry",
        registry.address,
        "--chat",
        chat.address,
        "--game-id",
        "1",
        "--out",
        outputDir,
        "--json",
      ])
    );

    const summary = JSON.parse(
      readFileSync(join(outputDir, "game-summary.json"), "utf8")
    );
    const roster = JSON.parse(
      readFileSync(join(outputDir, "roster.json"), "utf8")
    );
    const causes = JSON.parse(
      readFileSync(join(outputDir, "causes.json"), "utf8")
    );
    const rounds = JSON.parse(
      readFileSync(join(outputDir, "rounds.json"), "utf8")
    );
    const auth = JSON.parse(readFileSync(join(outputDir, "auth.json"), "utf8"));
    const payouts = JSON.parse(
      readFileSync(join(outputDir, "payouts.json"), "utf8")
    );
    const messages = parseMessagesJsonl(
      readFileSync(join(outputDir, "messages.jsonl"), "utf8")
    );

    assert.equal(manifest.gameId, 1);
    assert.ok(
      manifest.produced.some(
        (artifact) => artifact.artifact === "messages.jsonl"
      )
    );
    assert.ok(
      manifest.produced.some((artifact) => artifact.artifact === "payouts.json")
    );
    assert.equal(
      manifest.evidenceWindow.logRange.coversFullHistoryToStateSnapshot,
      true
    );
    assert.equal(
      manifest.evidenceWindow.logRange.isHybridAgainstStateSnapshot,
      false
    );

    assert.equal(summary.game.phase, "Reveal");
    assert.equal(summary.game.round, 1);
    assert.equal(summary.game.counts.joined, 2);
    assert.equal(summary.game.counts.messages, 2);
    assert.equal(
      summary.evidenceWindow.logRange.coversFullHistoryToStateSnapshot,
      true
    );
    assert.equal(
      summary.evidenceWindow.logRange.isHybridAgainstStateSnapshot,
      false
    );
    assert.ok(
      summary.capabilities.available.includes("round-resolution-outcomes")
    );
    assert.ok(
      summary.capabilities.available.includes("claim-refund-settlement-data")
    );
    assert.ok(
      summary.capabilities.available.includes("payout-destination-audit")
    );
    assert.deepEqual(summary.capabilities.unavailable, []);

    assert.deepEqual(manifest.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(roster.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(causes.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(rounds.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(auth.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(payouts.evidenceWindow, summary.evidenceWindow);

    assert.equal(roster.participants.length, 2);
    assert.deepEqual(
      roster.participants.map((participant) => participant.auth.status),
      ["active", "active"]
    );
    assert.deepEqual(
      roster.participants.map((participant) => participant.causeId),
      [1, 2]
    );

    assert.equal(causes.usedCauses.length, 2);
    assert.deepEqual(
      causes.usedCauses.map((cause) => cause.causeId),
      [1, 2]
    );

    assert.equal(rounds.rounds.length, 1);
    assert.equal(rounds.rounds[0].round, 1);
    assert.equal(rounds.rounds[0].resolutionAvailable, false);
    assert.equal(rounds.rounds[0].settlementAvailable, false);
    assert.equal(rounds.rounds[0].commits.length, 1);
    assert.equal(rounds.rounds[0].reveals.length, 1);

    assert.equal(payouts.settlement.finalized, false);
    assert.equal(payouts.settlement.totalPotWei, "0");
    assert.equal(
      payouts.settlement.treasuryRecipient.toLowerCase(),
      owner.address.toLowerCase()
    );
    assert.equal(payouts.participants.length, 2);
    assert.ok(
      payouts.participants.every((participant) => participant.claim.availableNow === false)
    );
    assert.ok(
      payouts.participants.every((participant) => participant.refund.availableNow === false)
    );
    assert.equal(payouts.causes.length, 2);
    assert.ok(
      payouts.causes.every((cause) => cause.routedFromGameWei === "0")
    );
    assert.ok(
      payouts.causes.every((cause) => cause.claimableFromGameWei === "0")
    );

    assert.equal(auth.participants.length, 2);
    assert.ok(
      auth.participants.every((participant) =>
        participant.events.some((event) => event.type === "AuthRegistered")
      )
    );

    assert.equal(messages.length, 2);
    assert.equal(messages[0].scope, "global");
    assert.equal(messages[0].isParticipant, true);
    assert.equal(messages[1].scope, "cause");
    assert.equal(messages[1].causeId, 2);
    assert.equal(messages[1].isActualCauseSpeaker, true);
    assert.equal(messages[1].senderCause, 2);
  }
);

test(
  "bounded query export reads state at numeric toBlock when historical calls are available",
  { concurrency: false },
  async () => {
    const { provider, registry, game, chat, causeMessageReceipt } =
      await setupEvidenceFixture();
    const outputDir = mkdtempSync(join(tmpdir(), "pd-query-bounded-export-"));
    const boundedBlock = String(causeMessageReceipt.blockNumber);
    const causeMessageBlock = await provider.getBlock(causeMessageReceipt.blockNumber);

    const manifest = JSON.parse(
      runCli([
        "export",
        "--rpc-url",
        RPC_URL,
        "--game",
        game.address,
        "--registry",
        registry.address,
        "--chat",
        chat.address,
        "--game-id",
        "1",
        "--from-block",
        boundedBlock,
        "--to-block",
        boundedBlock,
        "--out",
        outputDir,
        "--json",
      ])
    );

    const summary = JSON.parse(
      readFileSync(join(outputDir, "game-summary.json"), "utf8")
    );
    const roster = JSON.parse(
      readFileSync(join(outputDir, "roster.json"), "utf8")
    );
    const causes = JSON.parse(
      readFileSync(join(outputDir, "causes.json"), "utf8")
    );
    const rounds = JSON.parse(
      readFileSync(join(outputDir, "rounds.json"), "utf8")
    );
    const auth = JSON.parse(readFileSync(join(outputDir, "auth.json"), "utf8"));
    const payouts = JSON.parse(
      readFileSync(join(outputDir, "payouts.json"), "utf8")
    );
    const messages = parseMessagesJsonl(
      readFileSync(join(outputDir, "messages.jsonl"), "utf8")
    );

    assert.equal(
      summary.evidenceWindow.logRange.requestedFromBlock,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      summary.evidenceWindow.logRange.requestedToBlock,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      summary.evidenceWindow.logRange.resolvedFromBlock,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      summary.evidenceWindow.logRange.resolvedToBlock,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      summary.evidenceWindow.stateSnapshot.blockNumber,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      summary.evidenceWindow.stateSnapshot.timestamp,
      causeMessageBlock.timestamp
    );
    assert.equal(
      summary.evidenceWindow.logRange.coversFullHistoryToStateSnapshot,
      false
    );
    assert.equal(
      summary.evidenceWindow.logRange.isHybridAgainstStateSnapshot,
      false
    );
    assert.deepEqual(manifest.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(roster.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(causes.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(rounds.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(auth.evidenceWindow, summary.evidenceWindow);
    assert.deepEqual(payouts.evidenceWindow, summary.evidenceWindow);

    assert.equal(summary.game.counts.messages, 1);
    assert.equal(summary.game.counts.committed, 1);
    assert.equal(summary.game.counts.revealed, 1);
    assert.equal(roster.participants[0].revealedThisRound, true);
    assert.equal(rounds.rounds.length, 1);
    assert.equal(rounds.rounds[0].commits.length, 0);
    assert.equal(rounds.rounds[0].reveals.length, 0);
    assert.equal(rounds.rounds[0].phaseWindows.commitStartBlock, null);
    assert.equal(rounds.rounds[0].phaseWindows.revealStartBlock, null);
    assert.ok(
      rounds.rounds[0].notes.some((note) => note.includes("commitStartBlock is null"))
    );
    assert.ok(
      rounds.rounds[0].notes.some((note) => note.includes("revealStartBlock is null"))
    );
    assert.equal(payouts.settlement.finalized, false);
    assert.equal(payouts.events.prizeClaims.length, 0);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].scope, "cause");
    assert.equal(messages[0].causeId, 2);
    assert.ok(
      summary.notes.some((note) => note.includes("bounded evidence slice"))
    );
    assert.equal(
      summary.notes.some((note) => note.includes("intentionally hybrid")),
      false
    );
  }
);

test(
  "bounded query evidence falls back to latest hybrid state when provider lacks historical eth_call",
  { concurrency: false },
  async () => {
    const { registry, game, chat, causeMessageReceipt, revealReceipt } =
      await setupEvidenceFixture();
    const provider = new NoHistoricalStateProvider(RPC_URL);

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      chat: chat.address,
      gameId: 1,
      fromBlock: revealReceipt.blockNumber,
      toBlock: revealReceipt.blockNumber,
    });

    assert.equal(
      evidence.summary.evidenceWindow.stateSnapshot.blockNumber,
      causeMessageReceipt.blockNumber
    );
    assert.equal(
      evidence.summary.evidenceWindow.logRange.isHybridAgainstStateSnapshot,
      true
    );
    assert.equal(evidence.summary.game.counts.messages, 0);
    assert.equal(evidence.summary.game.counts.revealed, 1);
    assert.ok(
      evidence.summary.notes.some((note) =>
        note.includes("could not serve them")
      )
    );
    assert.ok(
      evidence.summary.notes.some((note) => note.includes("intentionally hybrid"))
    );
  }
);

test(
  "bounded multi-round exports attribute phase starts by round identity",
  { concurrency: false },
  async () => {
    const {
      provider,
      registry,
      game,
      round2CommitReceipt,
      round2RevealReceipt,
      round3CommitReceipt,
      round3RevealReceipt,
    } = await setupBoundedMultiRoundEvidenceFixture();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      gameId: 1,
      fromBlock: round2CommitReceipt.blockNumber,
    });

    assert.deepEqual(
      evidence.rounds.rounds.map((roundExport) => roundExport.round),
      [1, 2, 3]
    );

    const round1 = evidence.rounds.rounds.find(
      (roundExport) => roundExport.round === 1
    );
    const round2 = evidence.rounds.rounds.find(
      (roundExport) => roundExport.round === 2
    );
    const round3 = evidence.rounds.rounds.find(
      (roundExport) => roundExport.round === 3
    );

    assert.ok(round1);
    assert.ok(round2);
    assert.ok(round3);
    assert.equal(round1.phaseWindows.commitStartBlock, null);
    assert.equal(round1.phaseWindows.revealStartBlock, null);
    assert.ok(
      round1.notes.some((note) => note.includes("commitStartBlock is null"))
    );
    assert.ok(
      round1.notes.some((note) => note.includes("revealStartBlock is null"))
    );

    assert.equal(
      round2.phaseWindows.commitStartBlock,
      round2CommitReceipt.blockNumber
    );
    assert.equal(
      round2.phaseWindows.revealStartBlock,
      round2RevealReceipt.blockNumber
    );
    assert.equal(
      round3.phaseWindows.commitStartBlock,
      round3CommitReceipt.blockNumber
    );
    assert.equal(
      round3.phaseWindows.revealStartBlock,
      round3RevealReceipt.blockNumber
    );
    assert.equal(round2.resolution.shareStreak, 2);
    assert.equal(round3.resolution.shareStreak, 3);
    assert.equal(
      round2.notes.some((note) => note.includes("can be safely attributed")),
      false
    );
    assert.equal(
      round3.notes.some((note) => note.includes("can be safely attributed")),
      false
    );
  }
);

test(
  "query tooling exports settled no-winner payout data honestly",
  { concurrency: false },
  async () => {
    const { owner, provider, registry, game } =
      await setupSettledNoWinnerEvidenceFixture();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      gameId: 1,
    });

    assert.equal(evidence.summary.game.phase, "Ended");
    assert.equal(evidence.summary.game.outcome, "NoWinners");
    assert.equal(evidence.summary.game.terminalOutcome.terminalPath, "no-winner-routing");
    assert.equal(evidence.summary.game.settlement.finalized, true);
    assert.equal(evidence.payouts.settlement.finalized, true);
    assert.equal(evidence.payouts.settlement.noWinnerPathAvailable, true);
    assert.equal(evidence.payouts.settlement.treasuryAccruedWei, "218000000000000");
    assert.equal(evidence.payouts.treasury.claimableWei, "0");
    assert.equal(evidence.payouts.treasury.withdrawnWei, "218000000000000");
    assert.equal(evidence.payouts.noWinner.applicable, true);
    assert.equal(evidence.payouts.noWinner.distributedWei, "1782000000000000");
    assert.equal(evidence.payouts.noWinner.undistributedWei, "0");
    assert.equal(
      evidence.payouts.settlement.treasuryRecipient.toLowerCase(),
      owner.address.toLowerCase()
    );
    assert.equal(evidence.payouts.causes.length, 2);
    assert.ok(
      evidence.payouts.causes.every(
        (cause) => cause.routedFromGameWei === "891000000000000"
      )
    );
    assert.ok(
      evidence.payouts.causes.every(
        (cause) => cause.claimableFromGameWei === "0"
      )
    );
    assert.ok(
      evidence.payouts.causes.every(
        (cause) => cause.withdrawnFromGameWei === "891000000000000"
      )
    );
    assert.equal(evidence.payouts.events.settlementFinalized.length, 1);
    assert.equal(evidence.payouts.events.noWinnerDistributions.length, 2);
    assert.equal(evidence.payouts.events.treasuryAccruals.length, 1);
    assert.equal(evidence.payouts.events.treasuryWithdrawals.length, 1);
    assert.equal(evidence.payouts.events.causeWithdrawals.length, 2);
  }
);

test(
  "query tooling exports winner claims and winner-path withdrawals honestly",
  { concurrency: false },
  async () => {
    const { owner, player1, provider, registry, game } =
      await setupSettledWinnerEvidenceFixture();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      gameId: 1,
    });

    assert.equal(evidence.summary.game.phase, "Ended");
    assert.equal(evidence.summary.game.outcome, "Winners");
    assert.equal(evidence.summary.game.terminalOutcome.terminalPath, "winner-claims");
    assert.equal(evidence.summary.game.counts.claimed, 1);
    assert.equal(evidence.payouts.settlement.claimPathAvailable, true);
    assert.equal(evidence.payouts.claims.winners.eligibleWinnerCount, 1);
    assert.equal(evidence.payouts.claims.winners.claimedWinnerCount, 1);
    assert.equal(evidence.payouts.claims.winners.unclaimedWinnerCount, 0);
    assert.equal(
      evidence.payouts.claims.winners.grossPrizePerWinnerWei,
      "1980000000000000"
    );
    assert.equal(
      evidence.payouts.claims.winners.causeCutPerWinnerWei,
      "19800000000000"
    );
    assert.equal(
      evidence.payouts.claims.winners.netPrizePerWinnerWei,
      "1960200000000000"
    );
    assert.equal(
      evidence.payouts.treasury.recipient.toLowerCase(),
      owner.address.toLowerCase()
    );
    assert.equal(evidence.payouts.treasury.claimableWei, "0");
    assert.equal(evidence.payouts.treasury.withdrawnWei, "20000000000000");
    assert.equal(evidence.payouts.events.prizeClaims.length, 1);
    assert.equal(evidence.payouts.events.treasuryWithdrawals.length, 1);
    assert.equal(evidence.payouts.events.causeWithdrawals.length, 1);

    const winnerParticipant = evidence.payouts.participants.find(
      (participant) =>
        participant.wallet.toLowerCase() === player1.address.toLowerCase()
    );
    assert.equal(winnerParticipant.terminalStatus, "winner-claimed");

    const causeOne = evidence.payouts.causes.find((cause) => cause.causeId === 1);
    assert.equal(causeOne.winnerCount, 1);
    assert.equal(causeOne.claimedWinnerCount, 1);
    assert.equal(causeOne.pendingWinnerCauseCutWei, "0");
    assert.equal(causeOne.withdrawnFromGameWei, "19800000000000");
  }
);

test(
  "query tooling exports cancelled refund evidence honestly",
  { concurrency: false },
  async () => {
    const { player1, provider, registry, game } =
      await setupCancelledRefundEvidenceFixture();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      gameId: 1,
    });

    assert.equal(evidence.summary.game.phase, "Cancelled");
    assert.equal(evidence.summary.game.outcome, "Cancelled");
    assert.equal(
      evidence.summary.game.terminalOutcome.terminalPath,
      "cancelled-refunds"
    );
    assert.equal(
      evidence.summary.game.terminalOutcome.gameCancelledEvent !== null,
      true
    );
    assert.ok(
      evidence.summary.notes.some((note) => note.includes("GameCancelled"))
    );
    assert.equal(evidence.summary.game.counts.refunded, 1);
    assert.equal(evidence.payouts.settlement.refundPathAvailable, true);
    assert.equal(evidence.payouts.claims.refunds.eligibleRefundCount, 1);
    assert.equal(evidence.payouts.claims.refunds.refundedCount, 1);
    assert.equal(evidence.payouts.claims.refunds.pendingRefundCount, 0);
    assert.equal(evidence.payouts.claims.refunds.totalRefundedWei, "1000000000000000");
    assert.equal(evidence.payouts.events.refundClaims.length, 1);

    const refundedParticipant = evidence.payouts.participants.find(
      (participant) =>
        participant.wallet.toLowerCase() === player1.address.toLowerCase()
    );
    assert.equal(refundedParticipant.terminalStatus, "refunded");
  }
);

test(
  "query tooling derives message-time liveness from elimination timing instead of final state",
  { concurrency: false },
  async () => {
    const { provider, registry, game, chat, player3 } =
      await setupHistoricalMessageLivenessFixture();

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      chat: chat.address,
      gameId: 1,
    });

    const player3Messages = evidence.messages.filter(
      (message) =>
        message.senderWallet.toLowerCase() === player3.address.toLowerCase()
    );
    assert.equal(player3Messages.length, 3);

    const causeBeforeElimination = player3Messages.find(
      (message) => message.scope === "cause"
    );
    assert.equal(causeBeforeElimination.isAliveAtMessageTime, true);
    assert.equal(causeBeforeElimination.isActualCauseSpeaker, true);
    assert.equal(
      causeBeforeElimination.livenessEvidence,
      "cause-message-gated-onchain"
    );

    const globalBeforeElimination = player3Messages.find(
      (message) => message.content === "before elimination global"
    );
    assert.equal(globalBeforeElimination.isAliveAtMessageTime, true);
    assert.equal(globalBeforeElimination.isEliminatedSpeaker, false);
    assert.equal(
      globalBeforeElimination.livenessEvidence,
      "eliminated-after-message"
    );

    const globalAfterElimination = player3Messages.find(
      (message) => message.content === "after elimination global"
    );
    assert.equal(globalAfterElimination.isAliveAtMessageTime, false);
    assert.equal(globalAfterElimination.isEliminatedSpeaker, true);
    assert.equal(
      globalAfterElimination.livenessEvidence,
      "eliminated-before-message"
    );
  }
);

test(
  "query tooling leaves global-message liveness null when elimination timing falls outside the selected log window",
  { concurrency: false },
  async () => {
    const { registry, game, chat, beforeEliminationGlobalReceipt } =
      await setupHistoricalMessageLivenessFixture();
    const provider = new NoHistoricalStateProvider(RPC_URL);

    const evidence = await collectGameEvidence({
      provider,
      game: game.address,
      registry: registry.address,
      chat: chat.address,
      gameId: 1,
      fromBlock: beforeEliminationGlobalReceipt.blockNumber,
      toBlock: beforeEliminationGlobalReceipt.blockNumber,
    });

    assert.equal(evidence.messages.length, 1);
    assert.equal(evidence.messages[0].content, "before elimination global");
    assert.equal(evidence.messages[0].isAliveAtMessageTime, null);
    assert.equal(evidence.messages[0].isEliminatedSpeaker, null);
    assert.equal(
      evidence.messages[0].livenessEvidence,
      "unknown-elimination-outside-selected-window"
    );
    assert.ok(
      evidence.summary.notes.some((note) =>
        note.includes("isAliveAtMessageTime/isEliminatedSpeaker are null")
      )
    );
  }
);

test(
  "query tooling rejects a GameChat contract linked to a different game",
  { concurrency: false },
  async () => {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
    const verifier = ethers.Wallet.createRandom();
    const registry = await deployRegistry(owner, verifier.address);
    const selectedGame = await deployGame(owner, registry.address);
    const otherGame = await deployGame(owner, registry.address);
    const wrongChat = await deployChat(owner, otherGame.address);

    await assert.rejects(
      collectGameEvidence({
        provider,
        game: selectedGame.address,
        chat: wrongChat.address,
        gameId: 1,
      }),
      /Refusing to mix evidence across contracts/
    );
  }
);

class NoHistoricalStateProvider extends ethers.providers.JsonRpcProvider {
  async call(transaction, blockTag) {
    const numericBlockTag = parseNumericBlockTag(blockTag);

    if (numericBlockTag !== null) {
      const latestBlockNumber = await this.getBlockNumber();
      if (numericBlockTag < latestBlockNumber) {
        throw new Error(
          `archive state unavailable at block ${numericBlockTag}: historical eth_call disabled for test`
        );
      }
    }

    return super.call(transaction, blockTag);
  }
}

function parseNumericBlockTag(blockTag) {
  if (typeof blockTag === "number") {
    return blockTag;
  }
  if (typeof blockTag === "string" && /^0x[0-9a-f]+$/i.test(blockTag)) {
    return Number.parseInt(blockTag, 16);
  }
  return null;
}

async function setupEvidenceFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);
  const chat = await deployChat(owner, game.address);

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (
    await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha",
    nonceText: "nonce-alpha",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player2,
    agentKeyText: "agent-beta",
    nonceText: "nonce-beta",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const globalMessageReceipt = await (
    await chat.connect(player1).postGlobal(1, "hello judges")
  ).wait();

  const snapshotAfterCommitStart = await game.getGame(1);
  const round = Number(snapshotAfterCommitStart.round);
  const shareChoice = 1;
  const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-alpha"));
  const commitment = await game.computeCommitment(
    1,
    round,
    player1.address,
    shareChoice,
    salt
  );
  const commitReceipt = await (
    await game.connect(player1).commit(1, commitment)
  ).wait();

  await provider.send("evm_mine", []);
  await provider.send("evm_mine", []);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const revealReceipt = await (
    await game.connect(player1).reveal(1, shareChoice, salt)
  ).wait();
  const causeMessageReceipt = await (
    await chat.connect(player2).postCause(1, 2, "cause two reporting in")
  ).wait();

  return {
    provider,
    owner,
    verifier,
    player1,
    player2,
    registry,
    game,
    chat,
    globalMessageReceipt,
    commitReceipt,
    causeMessageReceipt,
    revealReceipt,
  };
}

async function setupSettledNoWinnerEvidenceFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (
    await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha-terminal",
    nonceText: "nonce-alpha-terminal",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player2,
    agentKeyText: "agent-beta-terminal",
    nonceText: "nonce-beta-terminal",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const round = Number((await game.getGame(1)).round);
  const catchChoice = 2;
  const salt1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-catch-1"));
  const salt2 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-catch-2"));
  const commitment1 = await game.computeCommitment(
    1,
    round,
    player1.address,
    catchChoice,
    salt1
  );
  const commitment2 = await game.computeCommitment(
    1,
    round,
    player2.address,
    catchChoice,
    salt2
  );

  await (await game.connect(player1).commit(1, commitment1)).wait();
  await (await game.connect(player2).commit(1, commitment2)).wait();
  await (await game.advancePhase(1)).wait();
  await (await game.connect(player1).reveal(1, catchChoice, salt1)).wait();
  await (await game.connect(player2).reveal(1, catchChoice, salt2)).wait();
  await (await game.advancePhase(1)).wait();
  await (await game.connect(owner).withdrawTreasury(1)).wait();
  await (await game.connect(owner).withdrawCause(1, 1)).wait();
  await (await game.connect(owner).withdrawCause(1, 2)).wait();

  return {
    provider,
    owner,
    registry,
    game,
  };
}

async function setupSettledWinnerEvidenceFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (
    await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha-winner",
    nonceText: "nonce-alpha-winner",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player2,
    agentKeyText: "agent-beta-loser",
    nonceText: "nonce-beta-loser",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const round = Number((await game.getGame(1)).round);
  const shareChoice = 1;
  const catchChoice = 2;
  const salt1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-share"));
  const salt2 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-catch"));
  const commitment1 = await game.computeCommitment(
    1,
    round,
    player1.address,
    shareChoice,
    salt1
  );
  const commitment2 = await game.computeCommitment(
    1,
    round,
    player2.address,
    catchChoice,
    salt2
  );

  await (await game.connect(player1).commit(1, commitment1)).wait();
  await (await game.connect(player2).commit(1, commitment2)).wait();
  await (await game.advancePhase(1)).wait();
  await (await game.connect(player1).reveal(1, shareChoice, salt1)).wait();
  await (await game.connect(player2).reveal(1, catchChoice, salt2)).wait();
  await (await game.advancePhase(1)).wait();
  await (await game.connect(player1).claim(1)).wait();
  await (await game.connect(owner).withdrawTreasury(1)).wait();
  await (await game.connect(owner).withdrawCause(1, 1)).wait();

  return {
    provider,
    owner,
    player1,
    registry,
    game,
  };
}

async function setupCancelledRefundEvidenceFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha-refund",
    nonceText: "nonce-alpha-refund",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.cancelIfInsufficientPlayers(1)).wait();
  await (await game.connect(player1).claimRefund(1)).wait();

  return {
    provider,
    player1,
    registry,
    game,
  };
}

async function setupHistoricalMessageLivenessFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);
  const player3 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");
  await fundWallet(owner, player3.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);
  const chat = await deployChat(owner, game.address);

  await (
    await game.configureDefaults({
      entryFeeWei: ethers.utils.parseEther("0.001"),
      creatorFeeBps: 100,
      causeFeeBps: 100,
      joinDurationSeconds: 1,
      commitDurationBlocks: 10,
      revealDurationBlocks: 10,
      minPlayers: 2,
      maxPlayers: 4,
      maxCauses: 2,
    })
  ).wait();

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (
    await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha-live",
    nonceText: "nonce-alpha-live",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player2,
    agentKeyText: "agent-beta-live",
    nonceText: "nonce-beta-live",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player3,
    agentKeyText: "agent-gamma-live",
    nonceText: "nonce-gamma-live",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();
  await (await game.connect(player3).join(1, 1, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const causeBeforeEliminationReceipt = await (
    await chat.connect(player3).postCause(1, 1, "before elimination cause")
  ).wait();
  const beforeEliminationGlobalReceipt = await (
    await chat.connect(player3).postGlobal(1, "before elimination global")
  ).wait();

  const round = Number((await game.getGame(1)).round);
  const shareChoice = 1;
  const catchChoice = 2;
  const stealChoice = 3;
  const salt1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-live-1"));
  const salt2 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-live-2"));
  const salt3 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-live-3"));
  const commitment1 = await game.computeCommitment(
    1,
    round,
    player1.address,
    shareChoice,
    salt1
  );
  const commitment2 = await game.computeCommitment(
    1,
    round,
    player2.address,
    catchChoice,
    salt2
  );
  const commitment3 = await game.computeCommitment(
    1,
    round,
    player3.address,
    stealChoice,
    salt3
  );

  await (await game.connect(player1).commit(1, commitment1)).wait();
  await (await game.connect(player2).commit(1, commitment2)).wait();
  await (await game.connect(player3).commit(1, commitment3)).wait();
  await (await game.advancePhase(1)).wait();
  await (await game.connect(player1).reveal(1, shareChoice, salt1)).wait();
  await (await game.connect(player2).reveal(1, catchChoice, salt2)).wait();
  await (await game.connect(player3).reveal(1, stealChoice, salt3)).wait();
  await (await game.advancePhase(1)).wait();

  const afterEliminationGlobalReceipt = await (
    await chat.connect(player3).postGlobal(1, "after elimination global")
  ).wait();

  return {
    provider,
    player3,
    registry,
    game,
    chat,
    causeBeforeEliminationReceipt,
    beforeEliminationGlobalReceipt,
    afterEliminationGlobalReceipt,
  };
}

function salt(label) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(label));
}

async function commitRoundEntries(game, gameId, entries) {
  const round = Number((await game.getGame(gameId)).round);

  for (const entry of entries) {
    const commitment = await game.computeCommitment(
      gameId,
      round,
      entry.wallet.address,
      entry.choice,
      entry.salt
    );
    await (await game.connect(entry.wallet).commit(gameId, commitment)).wait();
  }
}

async function revealRoundEntries(game, gameId, entries) {
  for (const entry of entries) {
    await (
      await game.connect(entry.wallet).reveal(gameId, entry.choice, entry.salt)
    ).wait();
  }
}

async function playEvidenceRound(game, gameId, entries) {
  await commitRoundEntries(game, gameId, entries);
  const revealReceipt = await (await game.advancePhase(gameId)).wait();
  await revealRoundEntries(game, gameId, entries);
  const resolutionReceipt = await (await game.advancePhase(gameId)).wait();

  return {
    revealReceipt,
    resolutionReceipt,
  };
}

async function setupBoundedMultiRoundEvidenceFixture() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const owner = new ethers.Wallet(ANVIL_PRIVATE_KEYS[0], provider);
  const verifier = ethers.Wallet.createRandom();
  const player1 = ethers.Wallet.createRandom().connect(provider);
  const player2 = ethers.Wallet.createRandom().connect(provider);

  await fundWallet(owner, player1.address, "2");
  await fundWallet(owner, player2.address, "2");

  const registry = await deployRegistry(owner, verifier.address);
  const game = await deployGame(owner, registry.address);

  await (
    await game.whitelistCause(1, owner.address, ethers.utils.id("cause-a"))
  ).wait();
  await (
    await game.whitelistCause(2, owner.address, ethers.utils.id("cause-b"))
  ).wait();
  await (await game.createGame()).wait();

  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player1,
    agentKeyText: "agent-alpha-bounded-rounds",
    nonceText: "nonce-alpha-bounded-rounds",
  });
  await registerWallet({
    provider,
    registry,
    verifier,
    wallet: player2,
    agentKeyText: "agent-beta-bounded-rounds",
    nonceText: "nonce-beta-bounded-rounds",
  });

  const entryFee = ethers.utils.parseEther("0.001");
  await (await game.connect(player1).join(1, 1, { value: entryFee })).wait();
  await (await game.connect(player2).join(1, 2, { value: entryFee })).wait();

  await provider.send("evm_increaseTime", [2]);
  await provider.send("evm_mine", []);
  await (await game.advancePhase(1)).wait();

  const shareChoice = 1;
  const round1 = await playEvidenceRound(game, 1, [
    { wallet: player1, choice: shareChoice, salt: salt("bounded-rounds-r1-p1") },
    { wallet: player2, choice: shareChoice, salt: salt("bounded-rounds-r1-p2") },
  ]);
  const round2CommitReceipt = round1.resolutionReceipt;

  const round2 = await playEvidenceRound(game, 1, [
    { wallet: player1, choice: shareChoice, salt: salt("bounded-rounds-r2-p1") },
    { wallet: player2, choice: shareChoice, salt: salt("bounded-rounds-r2-p2") },
  ]);
  const round3CommitReceipt = round2.resolutionReceipt;

  const round3 = await playEvidenceRound(game, 1, [
    { wallet: player1, choice: shareChoice, salt: salt("bounded-rounds-r3-p1") },
    { wallet: player2, choice: shareChoice, salt: salt("bounded-rounds-r3-p2") },
  ]);

  return {
    provider,
    registry,
    game,
    round2CommitReceipt,
    round2RevealReceipt: round2.revealReceipt,
    round3CommitReceipt,
    round3RevealReceipt: round3.revealReceipt,
  };
}

async function deployRegistry(owner, verifierAddress) {
  const factory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(owner.address, verifierAddress);
  await contract.deployed();
  return contract;
}

async function deployGame(owner, registryAddress) {
  const factory = new ethers.ContractFactory(
    gameArtifact.abi,
    gameArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(
    owner.address,
    owner.address,
    registryAddress,
    {
      entryFeeWei: ethers.utils.parseEther("0.001"),
      creatorFeeBps: 100,
      causeFeeBps: 100,
      joinDurationSeconds: 1,
      commitDurationBlocks: 2,
      revealDurationBlocks: 2,
      minPlayers: 2,
      maxPlayers: 4,
      maxCauses: 2,
    }
  );
  await contract.deployed();
  return contract;
}

async function deployChat(owner, gameAddress) {
  const factory = new ethers.ContractFactory(
    chatArtifact.abi,
    chatArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(gameAddress);
  await contract.deployed();
  return contract;
}

async function registerWallet({
  provider,
  registry,
  verifier,
  wallet,
  agentKeyText,
  nonceText,
}) {
  const latestBlock = await provider.getBlock("latest");
  const network = await provider.getNetwork();
  const permit = {
    wallet: wallet.address,
    agentKey: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(agentKeyText)),
    manifestHash: ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(`manifest://${agentKeyText}`)
    ),
    chainId: network.chainId,
    gameNamespace: await registry.gameNamespace(),
    issuedAt: latestBlock.timestamp,
    expiresAt: latestBlock.timestamp + 3600,
    nonce: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(nonceText)),
  };
  const signature = await verifier._signTypedData(
    {
      ...AUTH_DOMAIN,
      chainId: network.chainId,
      verifyingContract: registry.address,
    },
    AUTH_TYPES,
    permit
  );

  await (await registry.connect(wallet).registerAuth(permit, signature)).wait();
}

async function fundWallet(owner, target, amountEth) {
  await (
    await owner.sendTransaction({
      to: target,
      value: ethers.utils.parseEther(amountEth),
    })
  ).wait();
}

async function waitForAnvil() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error("Timed out waiting for anvil to start.");
}

function runCli(args) {
  return execFileSync("node", ["scripts-js/queryCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}
