// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";

import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDaollema } from "../contracts/PrisonersDaollema.sol";

contract PrisonersDaollemaFuzzTest is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;
    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry internal registry;
    PrisonersDaollema internal game;

    address internal owner;
    address internal verifier;
    address internal treasury;
    address internal causeARecipient;
    address internal causeBRecipient;

    address[4] internal players;
    bytes32[4] internal agentKeys;

    function setUp() public {
        owner = vm.addr(ownerPk);
        verifier = vm.addr(verifierPk);
        treasury = makeAddr("fuzz-treasury");
        causeARecipient = makeAddr("fuzz-cause-a");
        causeBRecipient = makeAddr("fuzz-cause-b");

        players[0] = makeAddr("fuzz-player-0");
        players[1] = makeAddr("fuzz-player-1");
        players[2] = makeAddr("fuzz-player-2");
        players[3] = makeAddr("fuzz-player-3");

        agentKeys[0] = keccak256("fuzz-agent-0");
        agentKeys[1] = keccak256("fuzz-agent-1");
        agentKeys[2] = keccak256("fuzz-agent-2");
        agentKeys[3] = keccak256("fuzz-agent-3");

        for (uint256 index = 0; index < players.length; ++index) {
            vm.deal(players[index], 10 ether);
        }

        registry = new AgentAuthRegistry(owner, verifier);
        game = new PrisonersDaollema(owner, treasury, address(registry), _defaultConfig());

        vm.startPrank(owner);
        game.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        game.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        vm.stopPrank();

        for (uint256 index = 0; index < players.length; ++index) {
            _registerWallet(players[index], agentKeys[index], keccak256(abi.encodePacked("fuzz-nonce-", index)));
        }
    }

    function testFuzz_WinnerSettlementConservesValueAcrossClaimSubsets(
        uint8 playerCountSeed,
        uint256 causeMask,
        uint256 claimMask
    ) public {
        uint256 playerCount = bound(uint256(playerCountSeed), 2, 4);
        uint256 gameId = _createAndFillGame(playerCount, causeMask);

        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, 1);
        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, 2);
        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, 3);

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDaollema.SettlementState memory settlement = game.getSettlement(gameId);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDaollema.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Winners));
        assertEq(settlement.winnerCount, playerCount);
        assertEq(
            settlement.winnerShareWei * uint256(settlement.winnerCount) + settlement.treasuryAccruedWei,
            settlement.totalPotWei
        );

        uint256 claimedNetWei;
        uint256 totalClaims;

        for (uint256 index = 0; index < playerCount; ++index) {
            address wallet = players[index];
            (, uint256 causeCutWei, uint256 netPrizeWei, bool availableNow) = game.previewWinnerClaim(gameId, wallet);

            assertTrue(availableNow);
            assertEq(causeCutWei + netPrizeWei, settlement.winnerShareWei);

            if ((claimMask & (1 << index)) == 0) {
                continue;
            }

            claimedNetWei += netPrizeWei;
            totalClaims += 1;

            vm.prank(wallet);
            game.claim(gameId);

            vm.expectRevert(PrisonersDaollema.AlreadyClaimed.selector);
            vm.prank(wallet);
            game.claim(gameId);

            (, uint256 previewCauseCutWei, uint256 previewNetPrizeWei, bool stillAvailable) =
                game.previewWinnerClaim(gameId, wallet);
            assertEq(previewCauseCutWei, causeCutWei);
            assertEq(previewNetPrizeWei, netPrizeWei);
            assertFalse(stillAvailable);
        }

        uint256 totalCauseRoutedWei =
            game.gameCauseRoutedAmount(gameId, CAUSE_A) + game.gameCauseRoutedAmount(gameId, CAUSE_B);

        assertLe(totalClaims, settlement.winnerCount);
        assertLe(claimedNetWei + totalCauseRoutedWei + settlement.treasuryAccruedWei, settlement.totalPotWei);
        assertEq(game.treasuryClaimableAmount(gameId), settlement.treasuryAccruedWei);

        for (uint256 index = 0; index < playerCount; ++index) {
            (uint256 refundWei, bool refundAvailable) = game.previewRefund(gameId, players[index]);
            assertEq(refundWei, 0);
            assertFalse(refundAvailable);
        }
    }

    function testFuzz_NoWinnerSettlementConservesValueAcrossCauseSplits(uint8 playerCountSeed, uint256 causeMask)
        public
    {
        uint256 playerCount = bound(uint256(playerCountSeed), 2, 4);
        uint256 gameId = _createAndFillGame(playerCount, causeMask);

        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Catch, 9);

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDaollema.SettlementState memory settlement = game.getSettlement(gameId);

        uint256 causeAEntrants;
        uint256 causeBEntrants;
        for (uint256 index = 0; index < playerCount; ++index) {
            if (_causeForIndex(causeMask, index) == CAUSE_A) {
                causeAEntrants += 1;
            } else {
                causeBEntrants += 1;
            }
        }

        uint256 expectedCauseAWei = settlement.noWinnerCausePoolWei * causeAEntrants / playerCount;
        uint256 expectedCauseBWei = settlement.noWinnerCausePoolWei * causeBEntrants / playerCount;
        uint256 totalCauseRoutedWei =
            game.gameCauseRoutedAmount(gameId, CAUSE_A) + game.gameCauseRoutedAmount(gameId, CAUSE_B);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDaollema.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.NoWinners));
        assertEq(snapshot.aliveCount, 0);
        assertEq(settlement.winnerCount, 0);
        assertEq(settlement.winnerShareWei, 0);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), expectedCauseAWei);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_B), expectedCauseBWei);
        assertEq(totalCauseRoutedWei, settlement.noWinnerCauseDistributedWei);
        assertEq(totalCauseRoutedWei + settlement.treasuryAccruedWei, settlement.totalPotWei);

        _assertNoPayoutPreviews(gameId, playerCount);
    }

    function testFuzz_SequentialWinnerGamesKeepSnapshottedFeesAndRecipients(
        uint256 game1Seed,
        uint256 game2Seed,
        uint96 game1EntryFeeSeed,
        uint96 game2EntryFeeSeed
    ) public {
        uint256 gameId1 = _createAndAssertWinnerGame(game1Seed, game1EntryFeeSeed, treasury, 11);

        address updatedTreasury = makeAddr("fuzz-snapshot-updated-treasury");
        address updatedCauseARecipient = makeAddr("fuzz-snapshot-updated-cause-a");
        address updatedCauseBRecipient = makeAddr("fuzz-snapshot-updated-cause-b");

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.whitelistCause(CAUSE_A, updatedCauseARecipient, keccak256("fuzz-updated-cause-a"));
        game.whitelistCause(CAUSE_B, updatedCauseBRecipient, keccak256("fuzz-updated-cause-b"));
        vm.stopPrank();

        uint256 gameId2 = _createAndAssertWinnerGame(game2Seed, game2EntryFeeSeed, updatedTreasury, 21);

        _assertUsedCauseRecipients(gameId1, causeARecipient, causeBRecipient);
        _assertUsedCauseRecipients(gameId2, updatedCauseARecipient, updatedCauseBRecipient);

        (uint256 game1CauseARoutedWei, uint256 game1CauseBRoutedWei) = _claimAllWinnersAndAssertClaims(gameId1);
        (uint256 game2CauseARoutedWei, uint256 game2CauseBRoutedWei) = _claimAllWinnersAndAssertClaims(gameId2);

        _withdrawAndAssertWinnerSettlementRecipients(
            gameId1, treasury, causeARecipient, causeBRecipient, game1CauseARoutedWei, game1CauseBRoutedWei
        );
        _withdrawAndAssertWinnerSettlementRecipients(
            gameId2,
            updatedTreasury,
            updatedCauseARecipient,
            updatedCauseBRecipient,
            game2CauseARoutedWei,
            game2CauseBRoutedWei
        );
    }

    function _createAndAssertWinnerGame(uint256 gameSeed, uint96 entryFeeSeed, address expectedTreasury, uint256 saltBase)
        internal
        returns (uint256 gameId)
    {
        uint256 playerCount = bound(gameSeed & 0xff, 2, 4);
        uint256 causeMask = gameSeed >> 8;
        uint256 entryFeeWei = bound(uint256(entryFeeSeed), 1, 1 ether);
        uint16 creatorFeeBps = uint16(bound((gameSeed >> 40) & 0xffff, 0, 500));
        uint16 causeFeeBps = uint16(bound((gameSeed >> 56) & 0xffff, 0, 500));

        vm.prank(owner);
        game.configureDefaults(_configWithFees(entryFeeWei, creatorFeeBps, causeFeeBps));

        gameId = _createAndFillGame(playerCount, causeMask);
        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, saltBase);
        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, saltBase + 1);
        _resolveUniformRound(gameId, playerCount, PrisonersDaollema.Choice.Share, saltBase + 2);

        _assertWinnerGameSnapshotAndSettlement(
            gameId, entryFeeWei, creatorFeeBps, causeFeeBps, expectedTreasury, playerCount
        );
    }

    function _assertUsedCauseRecipients(uint256 gameId, address expectedCauseARecipient, address expectedCauseBRecipient)
        internal
        view
    {
        if (game.getGameCause(gameId, CAUSE_A).used) {
            assertEq(game.gameCauseRecipient(gameId, CAUSE_A), expectedCauseARecipient);
        }
        if (game.getGameCause(gameId, CAUSE_B).used) {
            assertEq(game.gameCauseRecipient(gameId, CAUSE_B), expectedCauseBRecipient);
        }
    }

    function _claimAllWinnersAndAssertClaims(uint256 gameId)
        internal
        returns (uint256 causeARoutedWei, uint256 causeBRoutedWei)
    {
        PrisonersDaollema.SettlementState memory settlement = game.getSettlement(gameId);
        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);

        for (uint256 index = 0; index < snapshot.joinedCount; ++index) {
            address wallet = game.playerAt(gameId, index);
            uint16 causeId = game.getPlayer(gameId, wallet).causeId;
            (uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, bool availableNow) =
                game.previewWinnerClaim(gameId, wallet);

            assertEq(grossPrizeWei, settlement.winnerShareWei);
            assertEq(causeCutWei, settlement.winnerShareWei * uint256(snapshot.causeFeeBps) / 10_000);
            assertEq(netPrizeWei + causeCutWei, grossPrizeWei);
            assertTrue(availableNow);

            vm.prank(wallet);
            game.claim(gameId);

            (,,, bool stillAvailable) = game.previewWinnerClaim(gameId, wallet);
            assertFalse(stillAvailable);

            if (causeId == CAUSE_A) {
                causeARoutedWei += causeCutWei;
            } else {
                causeBRoutedWei += causeCutWei;
            }
        }

        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), causeARoutedWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), causeBRoutedWei);
    }

    function _withdrawAndAssertWinnerSettlementRecipients(
        uint256 gameId,
        address expectedTreasury,
        address expectedCauseARecipient,
        address expectedCauseBRecipient,
        uint256 causeARoutedWei,
        uint256 causeBRoutedWei
    ) internal {
        uint256 treasuryAccruedWei = game.getSettlement(gameId).treasuryAccruedWei;
        uint256 treasuryBalanceBefore = expectedTreasury.balance;
        if (treasuryAccruedWei != 0) {
            vm.prank(expectedTreasury);
            game.withdrawTreasury(gameId);
        }
        assertEq(expectedTreasury.balance, treasuryBalanceBefore + treasuryAccruedWei);
        assertEq(game.treasuryClaimableAmount(gameId), 0);

        uint256 causeABalanceBefore = expectedCauseARecipient.balance;
        if (causeARoutedWei != 0) {
            vm.prank(expectedCauseARecipient);
            game.withdrawCause(gameId, CAUSE_A);
        }
        assertEq(expectedCauseARecipient.balance, causeABalanceBefore + causeARoutedWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), 0);

        uint256 causeBBalanceBefore = expectedCauseBRecipient.balance;
        if (causeBRoutedWei != 0) {
            vm.prank(expectedCauseBRecipient);
            game.withdrawCause(gameId, CAUSE_B);
        }
        assertEq(expectedCauseBRecipient.balance, causeBBalanceBefore + causeBRoutedWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), 0);
    }

    function _assertWinnerGameSnapshotAndSettlement(
        uint256 gameId,
        uint256 expectedEntryFeeWei,
        uint16 expectedCreatorFeeBps,
        uint16 expectedCauseFeeBps,
        address expectedTreasury,
        uint256 expectedPlayerCount
    ) internal view {
        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDaollema.SettlementState memory settlement = game.getSettlement(gameId);

        uint256 totalPotWei = expectedEntryFeeWei * expectedPlayerCount;
        uint256 creatorFeeWei = totalPotWei * uint256(expectedCreatorFeeBps) / 10_000;
        uint256 postCreatorPotWei = totalPotWei - creatorFeeWei;
        uint256 winnerShareWei = postCreatorPotWei / expectedPlayerCount;
        uint256 treasuryAccruedWei = creatorFeeWei + (postCreatorPotWei - (winnerShareWei * expectedPlayerCount));

        assertEq(snapshot.entryFeeWei, expectedEntryFeeWei);
        assertEq(snapshot.creatorFeeBps, expectedCreatorFeeBps);
        assertEq(snapshot.causeFeeBps, expectedCauseFeeBps);
        assertEq(snapshot.treasury, expectedTreasury);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDaollema.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Winners));
        assertEq(uint256(snapshot.joinedCount), expectedPlayerCount);
        assertEq(uint256(snapshot.aliveCount), expectedPlayerCount);
        assertEq(settlement.totalPotWei, totalPotWei);
        assertEq(settlement.creatorFeeWei, creatorFeeWei);
        assertEq(uint256(settlement.winnerCount), expectedPlayerCount);
        assertEq(settlement.winnerShareWei, winnerShareWei);
        assertEq(settlement.treasuryAccruedWei, treasuryAccruedWei);
    }

    function _assertNoPayoutPreviews(uint256 gameId, uint256 playerCount) internal view {
        for (uint256 index = 0; index < playerCount; ++index) {
            (uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, bool claimAvailable) =
                game.previewWinnerClaim(gameId, players[index]);
            (uint256 refundWei, bool refundAvailable) = game.previewRefund(gameId, players[index]);

            assertEq(grossPrizeWei, 0);
            assertEq(causeCutWei, 0);
            assertEq(netPrizeWei, 0);
            assertFalse(claimAvailable);
            assertEq(refundWei, 0);
            assertFalse(refundAvailable);
        }
    }

    function _createAndFillGame(uint256 playerCount, uint256 causeMask) internal returns (uint256 gameId) {
        vm.prank(owner);
        gameId = game.createGame();

        uint256 entryFeeWei = game.getGame(gameId).entryFeeWei;
        for (uint256 index = 0; index < playerCount; ++index) {
            vm.prank(players[index]);
            game.join{ value: entryFeeWei }(gameId, _causeForIndex(causeMask, index));
        }

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);
    }

    function _resolveUniformRound(
        uint256 gameId,
        uint256 playerCount,
        PrisonersDaollema.Choice choice,
        uint256 saltDomain
    ) internal {
        for (uint256 index = 0; index < playerCount; ++index) {
            bytes32 salt = keccak256(abi.encodePacked("fuzz-salt", saltDomain, index));
            bytes32 commitment =
                game.computeCommitment(gameId, game.getGame(gameId).round, players[index], choice, salt);

            vm.prank(players[index]);
            game.commit(gameId, commitment);
        }

        game.advancePhase(gameId);

        for (uint256 index = 0; index < playerCount; ++index) {
            bytes32 salt = keccak256(abi.encodePacked("fuzz-salt", saltDomain, index));

            vm.prank(players[index]);
            game.reveal(gameId, choice, salt);
        }

        game.advancePhase(gameId);
    }

    function _causeForIndex(uint256 causeMask, uint256 index) internal pure returns (uint16) {
        return ((causeMask >> index) & 1) == 0 ? CAUSE_A : CAUSE_B;
    }

    function _configWithFees(uint256 entryFeeWei, uint16 creatorFeeBps, uint16 causeFeeBps)
        internal
        pure
        returns (PrisonersDaollema.GameConfig memory)
    {
        PrisonersDaollema.GameConfig memory config = _defaultConfig();
        config.entryFeeWei = entryFeeWei;
        config.creatorFeeBps = creatorFeeBps;
        config.causeFeeBps = causeFeeBps;
        return config;
    }

    function _defaultConfig() internal pure returns (PrisonersDaollema.GameConfig memory) {
        return PrisonersDaollema.GameConfig({
            entryFeeWei: 0.001 ether,
            creatorFeeBps: 100,
            causeFeeBps: 100,
            joinDurationSeconds: 1 hours,
            commitDurationBlocks: 20,
            revealDurationBlocks: 20,
            minPlayers: 2,
            maxPlayers: 4,
            maxCauses: 2
        });
    }

    function _registerWallet(address wallet, bytes32 agentKey, bytes32 nonce) internal {
        AgentAuthRegistry.AuthPermit memory permit = AgentAuthRegistry.AuthPermit({
            wallet: wallet,
            agentKey: agentKey,
            manifestHash: keccak256(abi.encodePacked("manifest://", agentKey)),
            chainId: block.chainid,
            gameNamespace: registry.gameNamespace(),
            issuedAt: uint64(block.timestamp),
            expiresAt: type(uint64).max,
            nonce: nonce
        });

        bytes32 digest = registry.hashAuthPermit(permit);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, digest);

        vm.prank(wallet);
        registry.registerAuth(permit, abi.encodePacked(r, s, v));
    }
}
