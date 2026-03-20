import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { parseMessagesJsonl } from "./queryTooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");
const authRegistryArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "AgentAuthRegistry.sol", "AgentAuthRegistry.json"),
    "utf8"
  )
);
const identityRegistryArtifact = JSON.parse(
  readFileSync(
    join(
      packageDir,
      "out",
      "MockAgentIdentityRegistry.sol",
      "MockAgentIdentityRegistry.json"
    ),
    "utf8"
  )
);
const gameArtifact = JSON.parse(
  readFileSync(
    join(packageDir, "out", "PrisonersDAOlemma.sol", "PrisonersDAOlemma.json"),
    "utf8"
  )
);
const chatArtifact = JSON.parse(
  readFileSync(join(packageDir, "out", "GameChat.sol", "GameChat.json"), "utf8")
);

const RPC_URL = "http://127.0.0.1:8550";
const ANVIL_PORT = "8550";
const CHAIN_ID = 31337;
const OWNER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AUTH_FLOW_STEPS = [
  "siwa-nonce",
  "siwa-sign",
  "siwa-verify",
  "auth:permit",
  "auth:register",
  "auth:status",
];
const KEYSTORE_OPTIONS = {
  scrypt: {
    N: 1 << 12,
    r: 8,
    p: 1,
  },
};
const PHASE = {
  Idle: 0,
  Joining: 1,
  Commit: 2,
  Reveal: 3,
  Ended: 4,
  Cancelled: 5,
};
const OUTCOME = {
  Unset: 0,
  Winners: 1,
  NoWinners: 2,
  Cancelled: 3,
};
const CHOICE = {
  Share: 1,
  Catch: 2,
  Steal: 3,
};

let anvilProcess;

before(async () => {
  anvilProcess = spawn(
    "anvil",
    [
      "--port",
      ANVIL_PORT,
      "--chain-id",
      String(CHAIN_ID),
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
  "integration smoke covers local auth wrapper plus winner claims, cancelled refunds, no-winner withdrawals, and evidence export",
  { concurrency: false },
  async () => {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const owner = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    const verifier = ethers.Wallet.createRandom();
    const treasuryRecipient = ethers.Wallet.createRandom();
    const causeARecipient = ethers.Wallet.createRandom();
    const causeBRecipient = ethers.Wallet.createRandom();
    const player1 = ethers.Wallet.createRandom().connect(provider);
    const player2 = ethers.Wallet.createRandom().connect(provider);
    const player3 = ethers.Wallet.createRandom().connect(provider);

    await fundWallet(owner, player1.address, "2");
    await fundWallet(owner, player2.address, "2");
    await fundWallet(owner, player3.address, "2");

    const authRegistry = await deployAuthRegistry(owner, verifier.address);
    const identityRegistry = await deployIdentityRegistry(owner);
    const game = await deployGame(owner, {
      authRegistryAddress: authRegistry.address,
      treasuryAddress: treasuryRecipient.address,
    });
    const chat = await deployChat(owner, game.address);

    await (await identityRegistry.setOwner("101", player1.address)).wait();
    await (await identityRegistry.setOwner("202", player2.address)).wait();
    await (await identityRegistry.setOwner("303", player3.address)).wait();

    await (
      await game.whitelistCause(
        1,
        causeARecipient.address,
        ethers.utils.id("cause-a")
      )
    ).wait();
    await (
      await game.whitelistCause(
        2,
        causeBRecipient.address,
        ethers.utils.id("cause-b")
      )
    ).wait();

    const tempDir = mkdtempSync(join(tmpdir(), "pd-integration-smoke-"));
    const ownerSetup = await writeKeystoreFixture(tempDir, "owner", owner);
    const verifierSetup = await writeKeystoreFixture(tempDir, "verifier", verifier);
    const player1Setup = await writeKeystoreFixture(tempDir, "player-1", player1);
    const player2Setup = await writeKeystoreFixture(tempDir, "player-2", player2);
    const player3Setup = await writeKeystoreFixture(tempDir, "player-3", player3);
    const gameplayCli = {
      provider,
      tempDir,
      gameAddress: game.address,
      chatAddress: chat.address,
      ownerSetup,
      walletSetupsByAddress: new Map([
        [owner.address.toLowerCase(), ownerSetup],
        [player1.address.toLowerCase(), player1Setup],
        [player2.address.toLowerCase(), player2Setup],
        [player3.address.toLowerCase(), player3Setup],
      ]),
    };
    const agentRegistry = `eip155:${CHAIN_ID}:${identityRegistry.address}`;

    const authFlows = [
      {
        wallet: player1,
        flow: runAuthFlow({
          authRegistry: authRegistry.address,
          agentRegistry,
          agentId: "101",
          manifestUri: "manifest://agent-alpha",
          verifierSetup,
          walletSetup: player1Setup,
          workDir: join(tempDir, "player-1-auth"),
        }),
      },
      {
        wallet: player2,
        flow: runAuthFlow({
          authRegistry: authRegistry.address,
          agentRegistry,
          agentId: "202",
          manifestUri: "manifest://agent-beta",
          verifierSetup,
          walletSetup: player2Setup,
          workDir: join(tempDir, "player-2-auth"),
        }),
      },
      {
        wallet: player3,
        flow: runAuthFlow({
          authRegistry: authRegistry.address,
          agentRegistry,
          agentId: "303",
          manifestUri: "manifest://agent-gamma",
          verifierSetup,
          walletSetup: player3Setup,
          workDir: join(tempDir, "player-3-auth"),
        }),
      },
    ];

    for (const { wallet, flow } of authFlows) {
      assertAuthFlow(flow, wallet);
    }

    const entryFee = ethers.utils.parseEther("0.001");

    // Scenario 1: two winners after three all-share rounds, followed by both claims.
    const winnerGameId = await createGame(gameplayCli);
    await joinPlayers(gameplayCli, winnerGameId, [
      { wallet: player1, causeId: 1 },
      { wallet: player2, causeId: 2 },
    ]);
    await advanceJoinWindow(gameplayCli, winnerGameId);

    await postGlobal(
      gameplayCli,
      winnerGameId,
      player1.address,
      "round one global check-in"
    );

    const winnerRound1 = [
      { wallet: player1, choice: CHOICE.Share, salt: salt("winner-r1-p1") },
      { wallet: player2, choice: CHOICE.Share, salt: salt("winner-r1-p2") },
    ];
    await commitChoices(gameplayCli, winnerGameId, winnerRound1);
    await advancePhase(gameplayCli, winnerGameId);
    await postCause(
      gameplayCli,
      winnerGameId,
      player2.address,
      2,
      "cause two staying aligned"
    );
    await revealChoices(gameplayCli, winnerGameId, winnerRound1);
    assert.equal(await game.isRoundReadyForResolution(winnerGameId), true);
    await advancePhase(gameplayCli, winnerGameId);

    let winnerSnapshot = await game.getGame(winnerGameId);
    assert.equal(toNumber(winnerSnapshot.phase), PHASE.Commit);
    assert.equal(toNumber(winnerSnapshot.outcome), OUTCOME.Unset);
    assert.equal(toNumber(winnerSnapshot.round), 2);
    assert.equal(toNumber(winnerSnapshot.shareStreak), 1);

    await playRound(gameplayCli, winnerGameId, [
      { wallet: player1, choice: CHOICE.Share, salt: salt("winner-r2-p1") },
      { wallet: player2, choice: CHOICE.Share, salt: salt("winner-r2-p2") },
    ]);

    winnerSnapshot = await game.getGame(winnerGameId);
    assert.equal(toNumber(winnerSnapshot.phase), PHASE.Commit);
    assert.equal(toNumber(winnerSnapshot.round), 3);
    assert.equal(toNumber(winnerSnapshot.shareStreak), 2);

    await playRound(gameplayCli, winnerGameId, [
      { wallet: player1, choice: CHOICE.Share, salt: salt("winner-r3-p1") },
      { wallet: player2, choice: CHOICE.Share, salt: salt("winner-r3-p2") },
    ]);

    winnerSnapshot = await game.getGame(winnerGameId);
    assert.equal(toNumber(winnerSnapshot.phase), PHASE.Ended);
    assert.equal(toNumber(winnerSnapshot.outcome), OUTCOME.Winners);
    assert.equal(toNumber(winnerSnapshot.round), 3);
    assert.equal(toNumber(winnerSnapshot.aliveCount), 2);
    assert.equal(toNumber(winnerSnapshot.shareStreak), 3);
    assert.equal(toNumber(await game.activeGameId()), 0);

    const winnerTotalPotWei = entryFee.mul(2);
    const winnerCreatorFeeWei = winnerTotalPotWei.mul(100).div(10_000);
    const winnerShareWei = winnerTotalPotWei.sub(winnerCreatorFeeWei).div(2);
    const winnerCauseCutWei = winnerShareWei.mul(100).div(10_000);
    const winnerNetPrizeWei = winnerShareWei.sub(winnerCauseCutWei);

    const player1PreviewBeforeClaim = await game.previewWinnerClaim(
      winnerGameId,
      player1.address
    );
    const player2PreviewBeforeClaim = await game.previewWinnerClaim(
      winnerGameId,
      player2.address
    );
    assert.equal(player1PreviewBeforeClaim.availableNow, true);
    assert.equal(player2PreviewBeforeClaim.availableNow, true);
    assert.equal(
      player1PreviewBeforeClaim.grossPrizeWei.toString(),
      winnerShareWei.toString()
    );
    assert.equal(
      player1PreviewBeforeClaim.causeCutWei.toString(),
      winnerCauseCutWei.toString()
    );
    assert.equal(
      player1PreviewBeforeClaim.netPrizeWei.toString(),
      winnerNetPrizeWei.toString()
    );

    const player1BalanceBeforeClaim = await provider.getBalance(player1.address);
    const player1ClaimReceipt = await claimWinner(
      gameplayCli,
      winnerGameId,
      player1.address
    );
    const player1BalanceAfterClaim = await provider.getBalance(player1.address);
    assert.equal(
      player1BalanceAfterClaim
        .add(receiptGasCost(player1ClaimReceipt))
        .sub(player1BalanceBeforeClaim)
        .toString(),
      winnerNetPrizeWei.toString()
    );

    const player2BalanceBeforeClaim = await provider.getBalance(player2.address);
    const player2ClaimReceipt = await claimWinner(
      gameplayCli,
      winnerGameId,
      player2.address
    );
    const player2BalanceAfterClaim = await provider.getBalance(player2.address);
    assert.equal(
      player2BalanceAfterClaim
        .add(receiptGasCost(player2ClaimReceipt))
        .sub(player2BalanceBeforeClaim)
        .toString(),
      winnerNetPrizeWei.toString()
    );

    assert.equal(
      (await game.gameCauseClaimableAmount(winnerGameId, 1)).toString(),
      winnerCauseCutWei.toString()
    );
    assert.equal(
      (await game.gameCauseClaimableAmount(winnerGameId, 2)).toString(),
      winnerCauseCutWei.toString()
    );
    assert.equal(
      (await game.treasuryClaimableAmount(winnerGameId)).toString(),
      winnerCreatorFeeWei.toString()
    );

    const player1PreviewAfterClaim = await game.previewWinnerClaim(
      winnerGameId,
      player1.address
    );
    const player2PreviewAfterClaim = await game.previewWinnerClaim(
      winnerGameId,
      player2.address
    );
    assert.equal(player1PreviewAfterClaim.availableNow, false);
    assert.equal(player2PreviewAfterClaim.availableNow, false);

    const winnerExport = exportEvidence({
      exportDir: join(tempDir, "winner-claims-export"),
      gameAddress: game.address,
      registryAddress: authRegistry.address,
      chatAddress: chat.address,
      gameId: winnerGameId,
    });

    assertProducedArtifacts(winnerExport.manifest, [
      "game-summary.json",
      "roster.json",
      "causes.json",
      "rounds.json",
      "auth.json",
      "payouts.json",
      "messages.jsonl",
      "export-manifest.json",
    ]);
    assert.equal(winnerExport.manifest.gameId, winnerGameId);
    assert.equal(winnerExport.summary.game.phase, "Ended");
    assert.equal(winnerExport.summary.game.outcome, "Winners");
    assert.equal(
      winnerExport.summary.game.terminalOutcome.terminalPath,
      "winner-claims"
    );
    assert.equal(winnerExport.summary.game.counts.joined, 2);
    assert.equal(winnerExport.summary.game.counts.alive, 2);
    assert.equal(winnerExport.summary.game.counts.claimed, 2);
    assert.equal(winnerExport.summary.game.counts.refunded, 0);
    assert.equal(winnerExport.summary.game.counts.messages, 2);
    assert.ok(
      winnerExport.summary.capabilities.available.includes(
        "game-chat-message-export"
      )
    );
    assert.ok(
      winnerExport.summary.capabilities.available.includes(
        "claim-refund-settlement-data"
      )
    );

    assert.equal(winnerExport.roster.participants.length, 2);
    assert.deepEqual(
      winnerExport.roster.participants.map((participant) => participant.causeId),
      [1, 2]
    );
    assert.ok(
      winnerExport.auth.participants.every((participant) =>
        participant.events.some((event) => event.type === "AuthRegistered")
      )
    );

    assert.equal(winnerExport.rounds.rounds.length, 3);
    assert.equal(winnerExport.rounds.rounds[0].resolution.shareStreak, 1);
    assert.equal(winnerExport.rounds.rounds[0].settlementAvailable, false);
    assert.equal(winnerExport.rounds.rounds[1].resolution.shareStreak, 2);
    assert.equal(winnerExport.rounds.rounds[1].settlementAvailable, false);
    assert.equal(winnerExport.rounds.rounds[2].resolution.shareStreak, 3);
    assert.equal(winnerExport.rounds.rounds[2].settlementAvailable, true);
    assert.equal(
      winnerExport.rounds.rounds[2].terminalState.outcome,
      "Winners"
    );

    assert.equal(winnerExport.payouts.settlement.finalized, true);
    assert.equal(winnerExport.payouts.settlement.claimPathAvailable, true);
    assert.equal(winnerExport.payouts.settlement.refundPathAvailable, false);
    assert.equal(winnerExport.payouts.settlement.noWinnerPathAvailable, false);
    assert.equal(
      winnerExport.payouts.settlement.totalPotWei,
      winnerTotalPotWei.toString()
    );
    assert.equal(
      winnerExport.payouts.settlement.creatorFeeWei,
      winnerCreatorFeeWei.toString()
    );
    assert.equal(
      winnerExport.payouts.settlement.winnerShareWei,
      winnerShareWei.toString()
    );
    assert.equal(winnerExport.payouts.claims.winners.eligibleWinnerCount, 2);
    assert.equal(winnerExport.payouts.claims.winners.claimedWinnerCount, 2);
    assert.equal(winnerExport.payouts.claims.winners.unclaimedWinnerCount, 0);
    assert.equal(
      winnerExport.payouts.claims.winners.netPrizePerWinnerWei,
      winnerNetPrizeWei.toString()
    );
    assert.equal(
      winnerExport.payouts.treasury.claimableWei,
      winnerCreatorFeeWei.toString()
    );
    assert.equal(
      winnerExport.payouts.events.prizeClaims.length,
      2
    );
    assert.equal(
      winnerExport.payouts.events.treasuryWithdrawals.length,
      0
    );
    assert.equal(winnerExport.payouts.events.causeWithdrawals.length, 0);

    const winnerCause1 = findByCause(winnerExport.payouts.causes, 1);
    const winnerCause2 = findByCause(winnerExport.payouts.causes, 2);
    assert.equal(winnerCause1.winnerCount, 1);
    assert.equal(winnerCause1.claimedWinnerCount, 1);
    assert.equal(winnerCause1.claimableFromGameWei, winnerCauseCutWei.toString());
    assert.equal(winnerCause2.winnerCount, 1);
    assert.equal(winnerCause2.claimedWinnerCount, 1);
    assert.equal(winnerCause2.claimableFromGameWei, winnerCauseCutWei.toString());

    const winnerParticipant1 = findByWallet(
      winnerExport.payouts.participants,
      player1.address
    );
    const winnerParticipant2 = findByWallet(
      winnerExport.payouts.participants,
      player2.address
    );
    assert.equal(winnerParticipant1.terminalStatus, "winner-claimed");
    assert.equal(winnerParticipant1.claim.availableNow, false);
    assert.equal(winnerParticipant2.terminalStatus, "winner-claimed");
    assert.equal(winnerParticipant2.claim.availableNow, false);

    assert.equal(winnerExport.messages.length, 2);
    assert.equal(winnerExport.messages[0].scope, "global");
    assert.equal(winnerExport.messages[0].phase, "Commit");
    assert.equal(
      winnerExport.messages[0].senderWallet.toLowerCase(),
      player1.address.toLowerCase()
    );
    assert.equal(winnerExport.messages[1].scope, "cause");
    assert.equal(winnerExport.messages[1].phase, "Reveal");
    assert.equal(winnerExport.messages[1].causeId, 2);
    assert.equal(winnerExport.messages[1].senderCause, 2);
    assert.equal(winnerExport.messages[1].isActualCauseSpeaker, true);
    assert.equal(
      winnerExport.messages[1].senderWallet.toLowerCase(),
      player2.address.toLowerCase()
    );

    // Scenario 2: underfilled game cancels and a joined player claims a refund.
    const cancelledGameId = await createGame(gameplayCli);
    await joinPlayers(gameplayCli, cancelledGameId, [{ wallet: player1, causeId: 1 }]);
    await expireJoinWindow(provider);
    await cancelIfInsufficientPlayers(gameplayCli, cancelledGameId);

    const cancelledSnapshot = await game.getGame(cancelledGameId);
    assert.equal(toNumber(cancelledSnapshot.phase), PHASE.Cancelled);
    assert.equal(toNumber(cancelledSnapshot.outcome), OUTCOME.Cancelled);
    assert.equal(toNumber(cancelledSnapshot.round), 0);
    assert.equal(toNumber(await game.activeGameId()), 0);

    const refundPreviewBeforeClaim = await game.previewRefund(
      cancelledGameId,
      player1.address
    );
    assert.equal(refundPreviewBeforeClaim.availableNow, true);
    assert.equal(refundPreviewBeforeClaim.refundWei.toString(), entryFee.toString());

    const player1BalanceBeforeRefund = await provider.getBalance(player1.address);
    const refundReceipt = await claimRefund(
      gameplayCli,
      cancelledGameId,
      player1.address
    );
    const player1BalanceAfterRefund = await provider.getBalance(player1.address);
    assert.equal(
      player1BalanceAfterRefund
        .add(receiptGasCost(refundReceipt))
        .sub(player1BalanceBeforeRefund)
        .toString(),
      entryFee.toString()
    );

    const refundPreviewAfterClaim = await game.previewRefund(
      cancelledGameId,
      player1.address
    );
    assert.equal(refundPreviewAfterClaim.availableNow, false);

    const cancelledExport = exportEvidence({
      exportDir: join(tempDir, "cancelled-refunds-export"),
      gameAddress: game.address,
      registryAddress: authRegistry.address,
      chatAddress: chat.address,
      gameId: cancelledGameId,
    });

    assertProducedArtifacts(cancelledExport.manifest, [
      "game-summary.json",
      "roster.json",
      "causes.json",
      "rounds.json",
      "auth.json",
      "payouts.json",
      "messages.jsonl",
      "export-manifest.json",
    ]);
    assert.equal(cancelledExport.summary.game.phase, "Cancelled");
    assert.equal(cancelledExport.summary.game.outcome, "Cancelled");
    assert.equal(
      cancelledExport.summary.game.terminalOutcome.terminalPath,
      "cancelled-refunds"
    );
    assert.equal(cancelledExport.summary.game.counts.joined, 1);
    assert.equal(cancelledExport.summary.game.counts.refunded, 1);
    assert.equal(cancelledExport.rounds.rounds.length, 0);
    assert.equal(cancelledExport.messages.length, 0);
    assert.ok(
      cancelledExport.summary.notes.some((note) => note.includes("GameCancelled"))
    );
    assert.equal(cancelledExport.payouts.settlement.finalized, true);
    assert.equal(cancelledExport.payouts.settlement.refundPathAvailable, true);
    assert.equal(cancelledExport.payouts.settlement.claimPathAvailable, false);
    assert.equal(
      cancelledExport.payouts.claims.refunds.eligibleRefundCount,
      1
    );
    assert.equal(cancelledExport.payouts.claims.refunds.refundedCount, 1);
    assert.equal(cancelledExport.payouts.claims.refunds.pendingRefundCount, 0);
    assert.equal(
      cancelledExport.payouts.claims.refunds.refundPerPlayerWei,
      entryFee.toString()
    );
    assert.equal(cancelledExport.payouts.events.refundClaims.length, 1);

    const refundedParticipant = findByWallet(
      cancelledExport.payouts.participants,
      player1.address
    );
    assert.equal(refundedParticipant.terminalStatus, "refunded");
    assert.equal(refundedParticipant.refund.availableNow, false);

    // Scenario 3: no-winner outcome routes funds to treasury + causes, then all pull-based withdrawals execute.
    const noWinnerGameId = await createGame(gameplayCli);
    await joinPlayers(gameplayCli, noWinnerGameId, [
      { wallet: player1, causeId: 1 },
      { wallet: player2, causeId: 2 },
      { wallet: player3, causeId: 1 },
    ]);
    await advanceJoinWindow(gameplayCli, noWinnerGameId);
    await playRound(gameplayCli, noWinnerGameId, [
      { wallet: player1, choice: CHOICE.Catch, salt: salt("no-winner-p1") },
      { wallet: player2, choice: CHOICE.Catch, salt: salt("no-winner-p2") },
      { wallet: player3, choice: CHOICE.Catch, salt: salt("no-winner-p3") },
    ]);

    const noWinnerSnapshot = await game.getGame(noWinnerGameId);
    assert.equal(toNumber(noWinnerSnapshot.phase), PHASE.Ended);
    assert.equal(toNumber(noWinnerSnapshot.outcome), OUTCOME.NoWinners);
    assert.equal(toNumber(noWinnerSnapshot.round), 1);
    assert.equal(toNumber(noWinnerSnapshot.aliveCount), 0);
    assert.equal(toNumber(await game.activeGameId()), 0);

    const noWinnerTotalPotWei = entryFee.mul(3);
    const noWinnerCreatorFeeWei = noWinnerTotalPotWei.mul(100).div(10_000);
    const noWinnerCausePoolWei = noWinnerTotalPotWei
      .sub(noWinnerCreatorFeeWei)
      .mul(9_000)
      .div(10_000);
    const causeARoutedWei = noWinnerCausePoolWei.mul(2).div(3);
    const causeBRoutedWei = noWinnerCausePoolWei.div(3);
    const noWinnerDistributedWei = causeARoutedWei.add(causeBRoutedWei);
    const noWinnerTreasuryWei = noWinnerTotalPotWei.sub(noWinnerDistributedWei);

    assert.equal(
      (await game.treasuryClaimableAmount(noWinnerGameId)).toString(),
      noWinnerTreasuryWei.toString()
    );
    assert.equal(
      (await game.gameCauseClaimableAmount(noWinnerGameId, 1)).toString(),
      causeARoutedWei.toString()
    );
    assert.equal(
      (await game.gameCauseClaimableAmount(noWinnerGameId, 2)).toString(),
      causeBRoutedWei.toString()
    );

    const treasuryBalanceBefore = await provider.getBalance(treasuryRecipient.address);
    const causeABalanceBefore = await provider.getBalance(causeARecipient.address);
    const causeBBalanceBefore = await provider.getBalance(causeBRecipient.address);

    await withdrawTreasury(gameplayCli, noWinnerGameId);
    await withdrawCause(gameplayCli, noWinnerGameId, 1);
    await withdrawCause(gameplayCli, noWinnerGameId, 2);

    const treasuryBalanceAfter = await provider.getBalance(treasuryRecipient.address);
    const causeABalanceAfter = await provider.getBalance(causeARecipient.address);
    const causeBBalanceAfter = await provider.getBalance(causeBRecipient.address);

    assert.equal(
      treasuryBalanceAfter.sub(treasuryBalanceBefore).toString(),
      noWinnerTreasuryWei.toString()
    );
    assert.equal(
      causeABalanceAfter.sub(causeABalanceBefore).toString(),
      causeARoutedWei.toString()
    );
    assert.equal(
      causeBBalanceAfter.sub(causeBBalanceBefore).toString(),
      causeBRoutedWei.toString()
    );
    assert.equal((await game.treasuryClaimableAmount(noWinnerGameId)).toString(), "0");
    assert.equal((await game.gameCauseClaimableAmount(noWinnerGameId, 1)).toString(), "0");
    assert.equal((await game.gameCauseClaimableAmount(noWinnerGameId, 2)).toString(), "0");

    const noWinnerExport = exportEvidence({
      exportDir: join(tempDir, "no-winner-routing-export"),
      gameAddress: game.address,
      registryAddress: authRegistry.address,
      chatAddress: chat.address,
      gameId: noWinnerGameId,
    });

    assertProducedArtifacts(noWinnerExport.manifest, [
      "game-summary.json",
      "roster.json",
      "causes.json",
      "rounds.json",
      "auth.json",
      "payouts.json",
      "messages.jsonl",
      "export-manifest.json",
    ]);
    assert.equal(noWinnerExport.summary.game.phase, "Ended");
    assert.equal(noWinnerExport.summary.game.outcome, "NoWinners");
    assert.equal(
      noWinnerExport.summary.game.terminalOutcome.terminalPath,
      "no-winner-routing"
    );
    assert.equal(noWinnerExport.summary.game.counts.joined, 3);
    assert.equal(noWinnerExport.summary.game.counts.alive, 0);
    assert.equal(noWinnerExport.summary.game.counts.claimed, 0);
    assert.equal(noWinnerExport.summary.game.counts.refunded, 0);
    assert.equal(noWinnerExport.messages.length, 0);
    assert.equal(noWinnerExport.roster.participants.length, 3);
    assert.deepEqual(
      noWinnerExport.roster.participants.map((participant) => participant.causeId),
      [1, 2, 1]
    );
    assert.equal(noWinnerExport.rounds.rounds.length, 1);
    assert.equal(noWinnerExport.rounds.rounds[0].resolutionAvailable, true);
    assert.equal(noWinnerExport.rounds.rounds[0].settlementAvailable, true);
    assert.equal(
      noWinnerExport.rounds.rounds[0].terminalState.outcome,
      "NoWinners"
    );

    assert.equal(noWinnerExport.payouts.settlement.finalized, true);
    assert.equal(noWinnerExport.payouts.settlement.noWinnerPathAvailable, true);
    assert.equal(noWinnerExport.payouts.settlement.claimPathAvailable, false);
    assert.equal(noWinnerExport.payouts.settlement.refundPathAvailable, false);
    assert.equal(
      noWinnerExport.payouts.settlement.totalPotWei,
      noWinnerTotalPotWei.toString()
    );
    assert.equal(
      noWinnerExport.payouts.settlement.creatorFeeWei,
      noWinnerCreatorFeeWei.toString()
    );
    assert.equal(
      noWinnerExport.payouts.settlement.noWinnerCausePoolWei,
      noWinnerCausePoolWei.toString()
    );
    assert.equal(
      noWinnerExport.payouts.settlement.noWinnerCauseDistributedWei,
      noWinnerDistributedWei.toString()
    );
    assert.equal(
      noWinnerExport.payouts.treasury.withdrawnWei,
      noWinnerTreasuryWei.toString()
    );
    assert.equal(noWinnerExport.payouts.treasury.claimableWei, "0");
    assert.equal(noWinnerExport.payouts.noWinner.applicable, true);
    assert.equal(
      noWinnerExport.payouts.noWinner.distributedWei,
      noWinnerDistributedWei.toString()
    );
    assert.equal(noWinnerExport.payouts.noWinner.undistributedWei, "0");
    assert.equal(
      noWinnerExport.payouts.events.noWinnerDistributions.length,
      2
    );
    assert.equal(
      noWinnerExport.payouts.events.treasuryAccruals.length,
      1
    );
    assert.equal(
      noWinnerExport.payouts.events.treasuryWithdrawals.length,
      1
    );
    assert.equal(noWinnerExport.payouts.events.causeWithdrawals.length, 2);

    const noWinnerCause1 = findByCause(noWinnerExport.payouts.causes, 1);
    const noWinnerCause2 = findByCause(noWinnerExport.payouts.causes, 2);
    assert.equal(noWinnerCause1.entrantCount, 2);
    assert.equal(noWinnerCause1.routedFromGameWei, causeARoutedWei.toString());
    assert.equal(noWinnerCause1.claimableFromGameWei, "0");
    assert.equal(noWinnerCause1.withdrawnFromGameWei, causeARoutedWei.toString());
    assert.equal(noWinnerCause2.entrantCount, 1);
    assert.equal(noWinnerCause2.routedFromGameWei, causeBRoutedWei.toString());
    assert.equal(noWinnerCause2.claimableFromGameWei, "0");
    assert.equal(noWinnerCause2.withdrawnFromGameWei, causeBRoutedWei.toString());

    assert.ok(
      noWinnerExport.payouts.participants.every(
        (participant) => participant.terminalStatus === "no-winner-eliminated"
      )
    );
    assert.ok(
      noWinnerExport.auth.participants.every((participant) =>
        participant.events.some((event) => event.type === "AuthRegistered")
      )
    );
  }
);

function assertAuthFlow(flow, wallet) {
  assert.equal(flow.localOnly, true);
  assert.equal(flow.results.status.isAuthorized, true);
  assert.equal(
    flow.results.registration.wallet.toLowerCase(),
    wallet.address.toLowerCase()
  );
  assert.deepEqual(
    flow.steps.map((step) => step.name),
    AUTH_FLOW_STEPS
  );

  for (const filePath of Object.values(flow.files)) {
    assert.equal(existsSync(filePath), true);
  }
}

function exportEvidence({
  exportDir,
  gameAddress,
  registryAddress,
  chatAddress,
  gameId,
}) {
  const manifest = JSON.parse(
    runQueryCli([
      "export",
      "--rpc-url",
      RPC_URL,
      "--game",
      gameAddress,
      "--registry",
      registryAddress,
      "--chat",
      chatAddress,
      "--game-id",
      String(gameId),
      "--out",
      exportDir,
      "--json",
    ])
  );

  return {
    manifest,
    summary: readJson(join(exportDir, "game-summary.json")),
    roster: readJson(join(exportDir, "roster.json")),
    causes: readJson(join(exportDir, "causes.json")),
    rounds: readJson(join(exportDir, "rounds.json")),
    auth: readJson(join(exportDir, "auth.json")),
    payouts: readJson(join(exportDir, "payouts.json")),
    messages: parseMessagesJsonl(readFileSync(join(exportDir, "messages.jsonl"), "utf8")),
  };
}

function assertProducedArtifacts(manifest, artifactNames) {
  for (const artifactName of artifactNames) {
    const produced = manifest.produced.find(
      (artifact) => artifact.artifact === artifactName
    );
    assert.ok(produced, `Missing ${artifactName} in export manifest.`);
    assert.equal(existsSync(produced.path), true);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function findByWallet(entries, walletAddress) {
  const normalizedWallet = walletAddress.toLowerCase();
  const match = entries.find(
    (entry) => entry.wallet.toLowerCase() === normalizedWallet
  );
  assert.ok(match, `Missing wallet ${walletAddress} in exported evidence.`);
  return match;
}

function findByCause(entries, causeId) {
  const match = entries.find((entry) => entry.causeId === causeId);
  assert.ok(match, `Missing cause ${causeId} in exported evidence.`);
  return match;
}

function salt(label) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(label));
}

function toNumber(value) {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toNumber();
  }
  return Number(value);
}

function receiptGasCost(receipt) {
  const gasPrice =
    receipt.effectiveGasPrice ?? receipt.gasPrice ?? ethers.constants.Zero;
  return receipt.gasUsed.mul(gasPrice);
}

function runAuthFlow({
  authRegistry,
  agentRegistry,
  agentId,
  manifestUri,
  verifierSetup,
  walletSetup,
  workDir,
}) {
  return JSON.parse(
    runFlowCli([
      "--rpc-url",
      RPC_URL,
      "--registry",
      authRegistry,
      "--agent-registry",
      agentRegistry,
      "--agent-id",
      agentId,
      "--manifest-uri",
      manifestUri,
      "--domain",
      "prisoners.local",
      "--wallet-keystore",
      walletSetup.keystorePath,
      "--wallet-keystore-password-file",
      walletSetup.passwordFile,
      "--verifier-keystore",
      verifierSetup.keystorePath,
      "--verifier-keystore-password-file",
      verifierSetup.passwordFile,
      "--work-dir",
      workDir,
      "--json",
    ])
  );
}

async function deployAuthRegistry(owner, verifierAddress) {
  const factory = new ethers.ContractFactory(
    authRegistryArtifact.abi,
    authRegistryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(owner.address, verifierAddress);
  await contract.deployed();
  return contract;
}

async function deployIdentityRegistry(owner) {
  const factory = new ethers.ContractFactory(
    identityRegistryArtifact.abi,
    identityRegistryArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy();
  await contract.deployed();
  return contract;
}

async function deployGame(owner, { authRegistryAddress, treasuryAddress }) {
  const factory = new ethers.ContractFactory(
    gameArtifact.abi,
    gameArtifact.bytecode.object,
    owner
  );
  const contract = await factory.deploy(
    owner.address,
    treasuryAddress,
    authRegistryAddress,
    {
      entryFeeWei: ethers.utils.parseEther("0.001"),
      creatorFeeBps: 100,
      causeFeeBps: 100,
      joinDurationSeconds: 30,
      commitDurationBlocks: 5,
      revealDurationBlocks: 5,
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

async function createGame(gameplayCli) {
  const result = runGameCliJson([
    "create",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    ...buildOwnerSignerArgs(gameplayCli),
  ]);
  return result.gameId;
}

async function joinPlayers(gameplayCli, gameId, entrants) {
  for (const entrant of entrants) {
    const result = runGameCliJson([
      "join",
      "--rpc-url",
      RPC_URL,
      "--game",
      gameplayCli.gameAddress,
      "--game-id",
      String(gameId),
      "--cause-id",
      String(entrant.causeId),
      "--wallet",
      entrant.wallet.address,
      ...buildWalletSignerArgs(gameplayCli, entrant.wallet.address),
    ]);
    assert.equal(result.gameId, gameId);
    assert.equal(result.wallet.toLowerCase(), entrant.wallet.address.toLowerCase());
    assert.equal(result.causeId, entrant.causeId);
  }
}

async function expireJoinWindow(provider) {
  await provider.send("evm_increaseTime", [31]);
  await provider.send("evm_mine", []);
}

async function advanceJoinWindow(gameplayCli, gameId) {
  await expireJoinWindow(gameplayCli.provider);
  const result = await advancePhase(gameplayCli, gameId);
  assert.equal(result.gameId, gameId);
}

async function advancePhase(gameplayCli, gameId) {
  return runGameCliJson([
    "advance",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    ...buildOwnerSignerArgs(gameplayCli),
  ]);
}

async function cancelIfInsufficientPlayers(gameplayCli, gameId) {
  const result = runGameCliJson([
    "cancel-if-insufficient",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    ...buildOwnerSignerArgs(gameplayCli),
  ]);
  assert.equal(result.gameId, gameId);
  return result;
}

async function postGlobal(gameplayCli, gameId, walletAddress, text) {
  const result = runGameCliJson([
    "post-global",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--chat",
    gameplayCli.chatAddress,
    "--game-id",
    String(gameId),
    "--text",
    text,
    "--wallet",
    walletAddress,
    ...buildWalletSignerArgs(gameplayCli, walletAddress),
  ]);
  assert.equal(result.scope, "global");
  return result;
}

async function postCause(gameplayCli, gameId, walletAddress, causeId, text) {
  const result = runGameCliJson([
    "post-cause",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--chat",
    gameplayCli.chatAddress,
    "--game-id",
    String(gameId),
    "--cause-id",
    String(causeId),
    "--text",
    text,
    "--wallet",
    walletAddress,
    ...buildWalletSignerArgs(gameplayCli, walletAddress),
  ]);
  assert.equal(result.scope, "cause");
  assert.equal(result.causeId, causeId);
  return result;
}

async function commitChoices(gameplayCli, gameId, entries) {
  let round = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const bundlePath = join(
      gameplayCli.tempDir,
      "commit-bundles",
      `game-${gameId}-wallet-${entry.wallet.address.toLowerCase()}-${index}.json`
    );
    const prepared = runGameCliJson([
      "prepare-commit",
      "--rpc-url",
      RPC_URL,
      "--game",
      gameplayCli.gameAddress,
      "--game-id",
      String(gameId),
      "--choice",
      choiceName(entry.choice),
      "--salt",
      entry.salt,
      "--out",
      bundlePath,
      "--wallet",
      entry.wallet.address,
      ...buildWalletSignerArgs(gameplayCli, entry.wallet.address),
    ]);
    const committed = runGameCliJson([
      "commit",
      "--rpc-url",
      RPC_URL,
      "--game",
      gameplayCli.gameAddress,
      "--game-id",
      String(gameId),
      "--input",
      prepared.outputFile,
      "--wallet",
      entry.wallet.address,
      ...buildWalletSignerArgs(gameplayCli, entry.wallet.address),
    ]);

    entry.bundlePath = prepared.outputFile;
    round = prepared.round;

    assert.equal(prepared.choiceCode, entry.choice);
    assert.equal(committed.round, prepared.round);
    assert.equal(committed.wallet.toLowerCase(), entry.wallet.address.toLowerCase());
    assert.equal(committed.commitment, prepared.commitment);
  }

  return round;
}

async function revealChoices(gameplayCli, gameId, entries) {
  for (const entry of entries) {
    assert.ok(entry.bundlePath, `Missing prepared bundle for ${entry.wallet.address}.`);
    const result = runGameCliJson([
      "reveal",
      "--rpc-url",
      RPC_URL,
      "--game",
      gameplayCli.gameAddress,
      "--game-id",
      String(gameId),
      "--input",
      entry.bundlePath,
      "--wallet",
      entry.wallet.address,
      ...buildWalletSignerArgs(gameplayCli, entry.wallet.address),
    ]);
    assert.equal(result.choiceCode, entry.choice);
    assert.equal(result.wallet.toLowerCase(), entry.wallet.address.toLowerCase());
  }
}

async function playRound(gameplayCli, gameId, entries) {
  await commitChoices(gameplayCli, gameId, entries);
  await advancePhase(gameplayCli, gameId);
  await revealChoices(gameplayCli, gameId, entries);
  await advancePhase(gameplayCli, gameId);
}

async function claimWinner(gameplayCli, gameId, walletAddress) {
  const result = runGameCliJson([
    "claim",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    "--wallet",
    walletAddress,
    ...buildWalletSignerArgs(gameplayCli, walletAddress),
  ]);
  return await readReceipt(gameplayCli.provider, result.txHash);
}

async function claimRefund(gameplayCli, gameId, walletAddress) {
  const result = runGameCliJson([
    "refund",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    "--wallet",
    walletAddress,
    ...buildWalletSignerArgs(gameplayCli, walletAddress),
  ]);
  return await readReceipt(gameplayCli.provider, result.txHash);
}

async function withdrawTreasury(gameplayCli, gameId) {
  const result = runGameCliJson([
    "withdraw-treasury",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    ...buildOwnerSignerArgs(gameplayCli),
  ]);
  assert.equal(result.gameId, gameId);
  return result;
}

async function withdrawCause(gameplayCli, gameId, causeId) {
  const result = runGameCliJson([
    "withdraw-cause",
    "--rpc-url",
    RPC_URL,
    "--game",
    gameplayCli.gameAddress,
    "--game-id",
    String(gameId),
    "--cause-id",
    String(causeId),
    ...buildOwnerSignerArgs(gameplayCli),
  ]);
  assert.equal(result.gameId, gameId);
  assert.equal(result.causeId, causeId);
  return result;
}

function buildOwnerSignerArgs(gameplayCli) {
  return [
    "--wallet-keystore",
    gameplayCli.ownerSetup.keystorePath,
    "--wallet-keystore-password-file",
    gameplayCli.ownerSetup.passwordFile,
  ];
}

function buildWalletSignerArgs(gameplayCli, walletAddress) {
  const setup = gameplayCli.walletSetupsByAddress.get(walletAddress.toLowerCase());
  assert.ok(setup, `Missing keystore fixture for ${walletAddress}.`);
  return [
    "--wallet-keystore",
    setup.keystorePath,
    "--wallet-keystore-password-file",
    setup.passwordFile,
  ];
}

function choiceName(choiceCode) {
  if (choiceCode === CHOICE.Share) {
    return "share";
  }
  if (choiceCode === CHOICE.Catch) {
    return "catch";
  }
  if (choiceCode === CHOICE.Steal) {
    return "steal";
  }
  throw new Error(`Unsupported choice code ${choiceCode}.`);
}

async function readReceipt(provider, txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  assert.ok(receipt, `Missing receipt for ${txHash}.`);
  return receipt;
}

async function fundWallet(owner, target, amountEth) {
  await (
    await owner.sendTransaction({
      to: target,
      value: ethers.utils.parseEther(amountEth),
    })
  ).wait();
}

async function writeKeystoreFixture(tempDir, label, wallet) {
  const password = `${label}-password`;
  const keystorePath = join(tempDir, `${label}.keystore.json`);
  const passwordFile = join(tempDir, `${label}.pass`);
  writeFileSync(passwordFile, `${password}\n`, "utf8");
  writeFileSync(
    keystorePath,
    `${await wallet.encrypt(password, KEYSTORE_OPTIONS)}\n`,
    "utf8"
  );

  return { keystorePath, passwordFile, password };
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

  throw new Error(`Timed out waiting for anvil to start at ${RPC_URL}.`);
}

function runFlowCli(args) {
  return execFileSync("node", ["scripts-js/authFlowCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}

function runQueryCli(args) {
  return execFileSync("node", ["scripts-js/queryCli.js", ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}

function runGameCli(args) {
  return execFileSync("node", ["scripts-js/gameCli.js", ...args, "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
    },
  });
}

function runGameCliJson(args) {
  return JSON.parse(runGameCli(args));
}
