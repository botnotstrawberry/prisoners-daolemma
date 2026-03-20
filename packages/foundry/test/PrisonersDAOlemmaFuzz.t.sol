// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";

import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDAOlemma } from "../contracts/PrisonersDAOlemma.sol";

contract PrisonersDAOlemmaFuzzTest is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;
    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry internal registry;
    PrisonersDAOlemma internal game;

    address internal owner;
    address internal verifier;
    address internal treasury;
    address internal causeARecipient;
    address internal causeBRecipient;

    address[4] internal players;
    bytes32[4] internal agentKeys;

    struct GameAdmin {
        uint256 entryFeeWei;
        uint16 creatorFeeBps;
        uint16 causeFeeBps;
        address treasury;
        address causeARecipient;
        address causeBRecipient;
    }

    struct GameExpectation {
        uint256 gameId;
        PrisonersDAOlemma.Outcome outcome;
        uint256 entryFeeWei;
        uint16 creatorFeeBps;
        uint16 causeFeeBps;
        address treasury;
        address causeARecipient;
        address causeBRecipient;
        uint256 treasuryClaimableWei;
        uint256 causeAClaimableWei;
        uint256 causeBClaimableWei;
        uint256 causeARoutedWei;
        uint256 causeBRoutedWei;
        uint256 refundPerPlayerWei;
        uint256 winnerShareWei;
        uint256 causeCutWei;
        uint256 netPrizeWei;
        bool[4] joined;
        bool[4] alive;
        bool[4] claimed;
        bool[4] refunded;
        uint16[4] causeIds;
    }

    struct MixedGameSet {
        GameExpectation[3] expectations;
        uint256 cancelledIndex;
        uint256 winnerIndex;
        uint256 noWinnerIndex;
    }

    struct MixedActionPlan {
        uint256[4] winnerClaimOrder;
        uint8[3] noWinnerWithdrawOrder;
        uint16[2] finalWinnerCauseOrder;
        uint8 winnerTreasuryPosition;
        uint8 refundPosition;
        uint256 immediateWinnerCauseWithdrawMask;
        bool preWithdrawNoWinner;
    }

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
        game = new PrisonersDAOlemma(owner, treasury, address(registry), _defaultConfig());

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

        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 1);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 2);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 3);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
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

            vm.expectRevert(PrisonersDAOlemma.AlreadyClaimed.selector);
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

        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Catch, 9);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);

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

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.NoWinners));
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

    function testFuzz_SequentialMixedTerminalGamesKeepOlderPreviewsAndWithdrawablesStable(
        uint8 permutationSeed,
        uint256 adminSeed1,
        uint256 adminSeed2,
        uint256 adminSeed3,
        uint256 postAdminSeed,
        uint256 winnerCauseMaskSeed,
        uint256 noWinnerCauseMaskSeed,
        uint256 actionSeed
    ) public {
        MixedGameSet memory gameSet = _createMixedGameSet(
            permutationSeed, adminSeed1, adminSeed2, adminSeed3, winnerCauseMaskSeed, noWinnerCauseMaskSeed, actionSeed
        );

        GameAdmin memory postAdmin = _applyMixedGameAdmin(99, postAdminSeed);
        assertEq(game.treasury(), postAdmin.treasury);
        assertEq(game.getCause(CAUSE_A).recipient, postAdmin.causeARecipient);
        assertEq(game.getCause(CAUSE_B).recipient, postAdmin.causeBRecipient);
        _assertMixedGameExpectations(gameSet.expectations, 3);

        _executeMixedActionPlan(gameSet, _deriveMixedActionPlan(actionSeed));
    }

    function _createMixedGameSet(
        uint8 permutationSeed,
        uint256 adminSeed1,
        uint256 adminSeed2,
        uint256 adminSeed3,
        uint256 winnerCauseMaskSeed,
        uint256 noWinnerCauseMaskSeed,
        uint256 actionSeed
    ) internal returns (MixedGameSet memory gameSet) {
        PrisonersDAOlemma.Outcome[3] memory outcomeOrder = _mixedOutcomePermutation(permutationSeed);
        uint256[3] memory adminSeeds;
        adminSeeds[0] = adminSeed1;
        adminSeeds[1] = adminSeed2;
        adminSeeds[2] = adminSeed3;

        for (uint256 slot = 0; slot < outcomeOrder.length; ++slot) {
            _applyMixedGameAdmin(slot, adminSeeds[slot]);

            if (outcomeOrder[slot] == PrisonersDAOlemma.Outcome.Cancelled) {
                gameSet.expectations[slot] = _createCancelledMixedGame(actionSeed >> slot);
                gameSet.cancelledIndex = slot;
            } else if (outcomeOrder[slot] == PrisonersDAOlemma.Outcome.Winners) {
                gameSet.expectations[slot] = _createWinnerMixedGame(winnerCauseMaskSeed);
                gameSet.winnerIndex = slot;
            } else {
                gameSet.expectations[slot] = _createNoWinnerMixedGame(noWinnerCauseMaskSeed);
                gameSet.noWinnerIndex = slot;
            }

            _assertMixedGameExpectations(gameSet.expectations, slot + 1);
        }
    }

    function _deriveMixedActionPlan(uint256 actionSeed) internal pure returns (MixedActionPlan memory plan) {
        plan.winnerClaimOrder = _permutation4(actionSeed);
        plan.noWinnerWithdrawOrder = _permutation3(actionSeed >> 64);
        plan.finalWinnerCauseOrder = _causeWithdrawalOrder(((actionSeed >> 128) & 1) == 1);
        plan.winnerTreasuryPosition = uint8((actionSeed >> 136) % 5);
        plan.refundPosition = uint8((actionSeed >> 144) % 5);
        plan.immediateWinnerCauseWithdrawMask = (actionSeed >> 152) & 0x0f;
        plan.preWithdrawNoWinner = ((actionSeed >> 160) & 1) == 1;
    }

    function _executeMixedActionPlan(MixedGameSet memory gameSet, MixedActionPlan memory plan) internal {
        bool withdrewWinnerTreasury;
        bool refundedCancelled;
        uint256 nextNoWinnerWithdrawal;

        if (plan.preWithdrawNoWinner) {
            gameSet.expectations[gameSet.noWinnerIndex] = _withdrawNoWinnerItem(
                gameSet.expectations[gameSet.noWinnerIndex], plan.noWinnerWithdrawOrder[nextNoWinnerWithdrawal]
            );
            nextNoWinnerWithdrawal = 1;
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }

        if (plan.winnerTreasuryPosition == 0) {
            gameSet.expectations[gameSet.winnerIndex] =
                _withdrawTreasuryIfClaimable(gameSet.expectations[gameSet.winnerIndex]);
            withdrewWinnerTreasury = true;
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }

        if (plan.refundPosition == 0) {
            gameSet.expectations[gameSet.cancelledIndex] =
                _claimRefundByIndex(gameSet.expectations[gameSet.cancelledIndex], 0);
            refundedCancelled = true;
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }

        for (uint256 step = 0; step < plan.winnerClaimOrder.length; ++step) {
            gameSet.expectations[gameSet.winnerIndex] =
                _claimWinnerByIndex(gameSet.expectations[gameSet.winnerIndex], plan.winnerClaimOrder[step]);
            _assertMixedGameExpectations(gameSet.expectations, 3);

            if ((plan.immediateWinnerCauseWithdrawMask & (1 << step)) != 0) {
                gameSet.expectations[gameSet.winnerIndex] = _withdrawCauseIfClaimable(
                    gameSet.expectations[gameSet.winnerIndex],
                    gameSet.expectations[gameSet.winnerIndex].causeIds[plan.winnerClaimOrder[step]]
                );
                _assertMixedGameExpectations(gameSet.expectations, 3);
            }

            if (nextNoWinnerWithdrawal < plan.noWinnerWithdrawOrder.length) {
                gameSet.expectations[gameSet.noWinnerIndex] = _withdrawNoWinnerItem(
                    gameSet.expectations[gameSet.noWinnerIndex], plan.noWinnerWithdrawOrder[nextNoWinnerWithdrawal]
                );
                nextNoWinnerWithdrawal += 1;
                _assertMixedGameExpectations(gameSet.expectations, 3);
            }

            if (!withdrewWinnerTreasury && plan.winnerTreasuryPosition == step + 1) {
                gameSet.expectations[gameSet.winnerIndex] =
                    _withdrawTreasuryIfClaimable(gameSet.expectations[gameSet.winnerIndex]);
                withdrewWinnerTreasury = true;
                _assertMixedGameExpectations(gameSet.expectations, 3);
            }

            if (!refundedCancelled && plan.refundPosition == step + 1) {
                gameSet.expectations[gameSet.cancelledIndex] =
                    _claimRefundByIndex(gameSet.expectations[gameSet.cancelledIndex], 0);
                refundedCancelled = true;
                _assertMixedGameExpectations(gameSet.expectations, 3);
            }
        }

        if (!withdrewWinnerTreasury) {
            gameSet.expectations[gameSet.winnerIndex] =
                _withdrawTreasuryIfClaimable(gameSet.expectations[gameSet.winnerIndex]);
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }

        if (!refundedCancelled) {
            gameSet.expectations[gameSet.cancelledIndex] =
                _claimRefundByIndex(gameSet.expectations[gameSet.cancelledIndex], 0);
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }

        for (uint256 index = 0; index < plan.finalWinnerCauseOrder.length; ++index) {
            gameSet.expectations[gameSet.winnerIndex] =
                _withdrawCauseIfClaimable(gameSet.expectations[gameSet.winnerIndex], plan.finalWinnerCauseOrder[index]);
            _assertMixedGameExpectations(gameSet.expectations, 3);
        }
    }

    function _applyMixedGameAdmin(uint256 slot, uint256 seed) internal returns (GameAdmin memory admin) {
        admin.entryFeeWei = bound(seed & type(uint96).max, 0.001 ether, 0.01 ether);
        admin.creatorFeeBps = uint16(bound((seed >> 96) & 0xffff, 0, 500));
        admin.causeFeeBps = uint16(bound((seed >> 112) & 0xffff, 100, 500));
        admin.treasury = _derivedAddress(keccak256("mixed-treasury"), slot, seed);
        admin.causeARecipient = _derivedAddress(keccak256("mixed-cause-a"), slot, seed);
        admin.causeBRecipient = _derivedAddress(keccak256("mixed-cause-b"), slot, seed);

        vm.startPrank(owner);
        game.setTreasury(admin.treasury);
        game.whitelistCause(CAUSE_A, admin.causeARecipient, keccak256(abi.encodePacked("mixed-cause-a", slot, seed)));
        game.whitelistCause(CAUSE_B, admin.causeBRecipient, keccak256(abi.encodePacked("mixed-cause-b", slot, seed)));
        game.configureDefaults(_configWithFees(admin.entryFeeWei, admin.creatorFeeBps, admin.causeFeeBps));
        vm.stopPrank();
    }

    function _createCancelledMixedGame(uint256 causeSeed) internal returns (GameExpectation memory expected) {
        vm.prank(owner);
        uint256 gameId = game.createGame();

        uint16 causeId = _causeForIndex(causeSeed, 0);
        uint256 entryFeeWei = game.getGame(gameId).entryFeeWei;

        vm.prank(players[0]);
        game.join{ value: entryFeeWei }(gameId, causeId);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId);

        expected = _baseMixedGameExpectation(gameId);
        expected.refundPerPlayerWei = game.getSettlement(gameId).refundPerPlayerWei;
        expected.joined[0] = true;
        expected.alive[0] = game.getPlayer(gameId, players[0]).alive;
        expected.causeIds[0] = causeId;
    }

    function _createWinnerMixedGame(uint256 causeMaskSeed) internal returns (GameExpectation memory expected) {
        vm.prank(owner);
        uint256 gameId = game.createGame();

        uint256 playerCount = players.length;
        uint256 causeMask = _balancedCauseMask(causeMaskSeed, playerCount);

        _joinFilledGame(gameId, playerCount, causeMask);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 41);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 42);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, 43);

        expected = _baseMixedGameExpectation(gameId);

        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        expected.winnerShareWei = settlement.winnerShareWei;
        expected.causeCutWei = settlement.winnerShareWei * uint256(expected.causeFeeBps) / 10_000;
        expected.netPrizeWei = expected.winnerShareWei - expected.causeCutWei;

        for (uint256 index = 0; index < playerCount; ++index) {
            expected.joined[index] = true;
            expected.alive[index] = true;
            expected.causeIds[index] = _causeForIndex(causeMask, index);
        }
    }

    function _createNoWinnerMixedGame(uint256 causeMaskSeed) internal returns (GameExpectation memory expected) {
        vm.prank(owner);
        uint256 gameId = game.createGame();

        uint256 playerCount = 3;
        uint256 causeMask = _balancedCauseMask(causeMaskSeed, playerCount);

        _joinFilledGame(gameId, playerCount, causeMask);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Catch, 51);

        expected = _baseMixedGameExpectation(gameId);

        for (uint256 index = 0; index < playerCount; ++index) {
            expected.joined[index] = true;
            expected.alive[index] = false;
            expected.causeIds[index] = _causeForIndex(causeMask, index);
        }
    }

    function _baseMixedGameExpectation(uint256 gameId) internal view returns (GameExpectation memory expected) {
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);

        expected.gameId = gameId;
        expected.outcome = snapshot.outcome;
        expected.entryFeeWei = snapshot.entryFeeWei;
        expected.creatorFeeBps = snapshot.creatorFeeBps;
        expected.causeFeeBps = snapshot.causeFeeBps;
        expected.treasury = snapshot.treasury;
        expected.causeARecipient = game.gameCauseRecipient(gameId, CAUSE_A);
        expected.causeBRecipient = game.gameCauseRecipient(gameId, CAUSE_B);
        expected.treasuryClaimableWei = game.treasuryClaimableAmount(gameId);
        expected.causeAClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_A);
        expected.causeBClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_B);
        expected.causeARoutedWei = game.gameCauseRoutedAmount(gameId, CAUSE_A);
        expected.causeBRoutedWei = game.gameCauseRoutedAmount(gameId, CAUSE_B);
    }

    function _joinFilledGame(uint256 gameId, uint256 playerCount, uint256 causeMask) internal {
        uint256 entryFeeWei = game.getGame(gameId).entryFeeWei;

        for (uint256 index = 0; index < playerCount; ++index) {
            vm.prank(players[index]);
            game.join{ value: entryFeeWei }(gameId, _causeForIndex(causeMask, index));
        }

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);
    }

    function _claimWinnerByIndex(GameExpectation memory expected, uint256 playerIndex)
        internal
        returns (GameExpectation memory)
    {
        uint256 balanceBefore = players[playerIndex].balance;

        vm.prank(players[playerIndex]);
        game.claim(expected.gameId);

        assertEq(players[playerIndex].balance, balanceBefore + expected.netPrizeWei);

        expected.claimed[playerIndex] = true;

        if (expected.causeIds[playerIndex] == CAUSE_A) {
            expected.causeARoutedWei += expected.causeCutWei;
            expected.causeAClaimableWei += expected.causeCutWei;
        } else {
            expected.causeBRoutedWei += expected.causeCutWei;
            expected.causeBClaimableWei += expected.causeCutWei;
        }

        return expected;
    }

    function _claimRefundByIndex(GameExpectation memory expected, uint256 playerIndex)
        internal
        returns (GameExpectation memory)
    {
        uint256 balanceBefore = players[playerIndex].balance;

        vm.prank(players[playerIndex]);
        game.claimRefund(expected.gameId);

        assertEq(players[playerIndex].balance, balanceBefore + expected.refundPerPlayerWei);
        expected.refunded[playerIndex] = true;
        return expected;
    }

    function _withdrawTreasuryIfClaimable(GameExpectation memory expected) internal returns (GameExpectation memory) {
        if (expected.treasuryClaimableWei == 0) {
            return expected;
        }

        uint256 balanceBefore = expected.treasury.balance;

        vm.prank(expected.treasury);
        game.withdrawTreasury(expected.gameId);

        assertEq(expected.treasury.balance, balanceBefore + expected.treasuryClaimableWei);
        expected.treasuryClaimableWei = 0;
        return expected;
    }

    function _withdrawCauseIfClaimable(GameExpectation memory expected, uint16 causeId)
        internal
        returns (GameExpectation memory)
    {
        uint256 amountWei = causeId == CAUSE_A ? expected.causeAClaimableWei : expected.causeBClaimableWei;
        if (amountWei == 0) {
            return expected;
        }

        address recipient = causeId == CAUSE_A ? expected.causeARecipient : expected.causeBRecipient;
        uint256 balanceBefore = recipient.balance;

        vm.prank(recipient);
        game.withdrawCause(expected.gameId, causeId);

        assertEq(recipient.balance, balanceBefore + amountWei);

        if (causeId == CAUSE_A) {
            expected.causeAClaimableWei = 0;
        } else {
            expected.causeBClaimableWei = 0;
        }

        return expected;
    }

    function _withdrawNoWinnerItem(GameExpectation memory expected, uint8 item)
        internal
        returns (GameExpectation memory)
    {
        if (item == 0) {
            return _withdrawTreasuryIfClaimable(expected);
        }

        return _withdrawCauseIfClaimable(expected, item == 1 ? CAUSE_A : CAUSE_B);
    }

    function _assertMixedGameExpectations(GameExpectation[3] memory expectations, uint256 builtCount) internal view {
        for (uint256 index = 0; index < builtCount; ++index) {
            _assertMixedGameExpectation(expectations[index]);
        }
    }

    function _assertMixedGameExpectation(GameExpectation memory expected) internal view {
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(expected.gameId);
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(expected.gameId);

        assertEq(snapshot.entryFeeWei, expected.entryFeeWei);
        assertEq(snapshot.creatorFeeBps, expected.creatorFeeBps);
        assertEq(snapshot.causeFeeBps, expected.causeFeeBps);
        assertEq(snapshot.treasury, expected.treasury);
        assertEq(uint256(snapshot.outcome), uint256(expected.outcome));
        assertEq(
            uint256(snapshot.phase),
            uint256(
                expected.outcome == PrisonersDAOlemma.Outcome.Cancelled
                    ? PrisonersDAOlemma.Phase.Cancelled
                    : PrisonersDAOlemma.Phase.Ended
            )
        );
        assertEq(game.playerCount(expected.gameId), _joinedCount(expected));
        assertEq(game.gameCauseCount(expected.gameId), _usedCauseCount(expected));
        assertEq(game.gameCauseRecipient(expected.gameId, CAUSE_A), expected.causeARecipient);
        assertEq(game.gameCauseRecipient(expected.gameId, CAUSE_B), expected.causeBRecipient);
        assertEq(game.treasuryClaimableAmount(expected.gameId), expected.treasuryClaimableWei);
        assertEq(settlement.treasuryAccruedWei - settlement.treasuryWithdrawnWei, expected.treasuryClaimableWei);
        assertEq(game.gameCauseClaimableAmount(expected.gameId, CAUSE_A), expected.causeAClaimableWei);
        assertEq(game.gameCauseClaimableAmount(expected.gameId, CAUSE_B), expected.causeBClaimableWei);
        assertEq(game.gameCauseRoutedAmount(expected.gameId, CAUSE_A), expected.causeARoutedWei);
        assertEq(game.gameCauseRoutedAmount(expected.gameId, CAUSE_B), expected.causeBRoutedWei);

        if (expected.outcome == PrisonersDAOlemma.Outcome.Winners) {
            assertEq(settlement.refundPerPlayerWei, 0);
            assertEq(settlement.winnerShareWei, expected.winnerShareWei);
            assertEq(settlement.noWinnerCausePoolWei, 0);
            assertEq(settlement.noWinnerCauseDistributedWei, 0);
        } else if (expected.outcome == PrisonersDAOlemma.Outcome.NoWinners) {
            assertEq(settlement.refundPerPlayerWei, 0);
            assertEq(settlement.winnerShareWei, 0);
            assertEq(settlement.noWinnerCauseDistributedWei, expected.causeARoutedWei + expected.causeBRoutedWei);
        } else {
            assertEq(settlement.winnerShareWei, 0);
            assertEq(settlement.noWinnerCausePoolWei, 0);
            assertEq(settlement.noWinnerCauseDistributedWei, 0);
            assertEq(settlement.refundPerPlayerWei, expected.refundPerPlayerWei);
        }

        for (uint256 index = 0; index < players.length; ++index) {
            PrisonersDAOlemma.PlayerState memory player = game.getPlayer(expected.gameId, players[index]);
            (uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, bool claimAvailable) =
                game.previewWinnerClaim(expected.gameId, players[index]);
            (uint256 refundWei, bool refundAvailable) = game.previewRefund(expected.gameId, players[index]);

            assertEq(player.joined, expected.joined[index]);
            assertEq(player.alive, expected.alive[index]);
            assertEq(player.claimed, expected.claimed[index]);
            assertEq(player.refunded, expected.refunded[index]);
            assertEq(player.causeId, expected.causeIds[index]);

            if (
                expected.outcome == PrisonersDAOlemma.Outcome.Winners && expected.joined[index] && expected.alive[index]
            ) {
                assertEq(grossPrizeWei, expected.winnerShareWei);
                assertEq(causeCutWei, expected.causeCutWei);
                assertEq(netPrizeWei, expected.netPrizeWei);
                assertEq(claimAvailable, !expected.claimed[index] && !expected.refunded[index]);
                assertEq(refundWei, 0);
                assertFalse(refundAvailable);
            } else if (expected.outcome == PrisonersDAOlemma.Outcome.Cancelled && expected.joined[index]) {
                assertEq(grossPrizeWei, 0);
                assertEq(causeCutWei, 0);
                assertEq(netPrizeWei, 0);
                assertFalse(claimAvailable);
                assertEq(refundWei, expected.refundPerPlayerWei);
                assertEq(refundAvailable, !expected.refunded[index] && !expected.claimed[index]);
            } else {
                assertEq(grossPrizeWei, 0);
                assertEq(causeCutWei, 0);
                assertEq(netPrizeWei, 0);
                assertFalse(claimAvailable);
                assertEq(refundWei, 0);
                assertFalse(refundAvailable);
            }
        }
    }

    function _joinedCount(GameExpectation memory expected) internal pure returns (uint256 joinedCount) {
        for (uint256 index = 0; index < expected.joined.length; ++index) {
            if (expected.joined[index]) {
                joinedCount += 1;
            }
        }
    }

    function _usedCauseCount(GameExpectation memory expected) internal pure returns (uint256 usedCauseCount) {
        if (expected.causeARecipient != address(0)) {
            usedCauseCount += 1;
        }
        if (expected.causeBRecipient != address(0)) {
            usedCauseCount += 1;
        }
    }

    function _mixedOutcomePermutation(uint8 seed) internal pure returns (PrisonersDAOlemma.Outcome[3] memory outcomes) {
        uint8 permutation = seed % 6;

        if (permutation == 0) {
            outcomes[0] = PrisonersDAOlemma.Outcome.Cancelled;
            outcomes[1] = PrisonersDAOlemma.Outcome.Winners;
            outcomes[2] = PrisonersDAOlemma.Outcome.NoWinners;
        } else if (permutation == 1) {
            outcomes[0] = PrisonersDAOlemma.Outcome.Cancelled;
            outcomes[1] = PrisonersDAOlemma.Outcome.NoWinners;
            outcomes[2] = PrisonersDAOlemma.Outcome.Winners;
        } else if (permutation == 2) {
            outcomes[0] = PrisonersDAOlemma.Outcome.Winners;
            outcomes[1] = PrisonersDAOlemma.Outcome.Cancelled;
            outcomes[2] = PrisonersDAOlemma.Outcome.NoWinners;
        } else if (permutation == 3) {
            outcomes[0] = PrisonersDAOlemma.Outcome.Winners;
            outcomes[1] = PrisonersDAOlemma.Outcome.NoWinners;
            outcomes[2] = PrisonersDAOlemma.Outcome.Cancelled;
        } else if (permutation == 4) {
            outcomes[0] = PrisonersDAOlemma.Outcome.NoWinners;
            outcomes[1] = PrisonersDAOlemma.Outcome.Cancelled;
            outcomes[2] = PrisonersDAOlemma.Outcome.Winners;
        } else {
            outcomes[0] = PrisonersDAOlemma.Outcome.NoWinners;
            outcomes[1] = PrisonersDAOlemma.Outcome.Winners;
            outcomes[2] = PrisonersDAOlemma.Outcome.Cancelled;
        }
    }

    function _permutation4(uint256 seed) internal pure returns (uint256[4] memory order) {
        order[0] = 0;
        order[1] = 1;
        order[2] = 2;
        order[3] = 3;

        for (uint256 index = 0; index < order.length; ++index) {
            uint256 swapIndex = index + (seed % (order.length - index));
            uint256 temp = order[index];
            order[index] = order[swapIndex];
            order[swapIndex] = temp;
            seed /= order.length - index;
        }
    }

    function _permutation3(uint256 seed) internal pure returns (uint8[3] memory order) {
        order[0] = 0;
        order[1] = 1;
        order[2] = 2;

        for (uint256 index = 0; index < order.length; ++index) {
            uint256 swapIndex = index + (seed % (order.length - index));
            uint8 temp = order[index];
            order[index] = order[swapIndex];
            order[swapIndex] = temp;
            seed /= order.length - index;
        }
    }

    function _causeWithdrawalOrder(bool reverse) internal pure returns (uint16[2] memory order) {
        if (reverse) {
            order[0] = CAUSE_B;
            order[1] = CAUSE_A;
            return order;
        }

        order[0] = CAUSE_A;
        order[1] = CAUSE_B;
    }

    function _balancedCauseMask(uint256 rawMask, uint256 playerCount) internal pure returns (uint256 mask) {
        mask = rawMask & ((uint256(1) << playerCount) - 1);
        uint256 allSameMask = (uint256(1) << playerCount) - 1;

        if (mask == 0 || mask == allSameMask) {
            mask ^= 1;
        }
    }

    function _derivedAddress(bytes32 domain, uint256 slot, uint256 seed) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(domain, slot, seed)))));
    }

    function _createAndAssertWinnerGame(
        uint256 gameSeed,
        uint96 entryFeeSeed,
        address expectedTreasury,
        uint256 saltBase
    ) internal returns (uint256 gameId) {
        uint256 playerCount = bound(gameSeed & 0xff, 2, 4);
        uint256 causeMask = gameSeed >> 8;
        uint256 entryFeeWei = bound(uint256(entryFeeSeed), 1, 1 ether);
        uint16 creatorFeeBps = uint16(bound((gameSeed >> 40) & 0xffff, 0, 500));
        uint16 causeFeeBps = uint16(bound((gameSeed >> 56) & 0xffff, 0, 500));

        vm.prank(owner);
        game.configureDefaults(_configWithFees(entryFeeWei, creatorFeeBps, causeFeeBps));

        gameId = _createAndFillGame(playerCount, causeMask);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, saltBase);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, saltBase + 1);
        _resolveUniformRound(gameId, playerCount, PrisonersDAOlemma.Choice.Share, saltBase + 2);

        _assertWinnerGameSnapshotAndSettlement(
            gameId, entryFeeWei, creatorFeeBps, causeFeeBps, expectedTreasury, playerCount
        );
    }

    function _assertUsedCauseRecipients(
        uint256 gameId,
        address expectedCauseARecipient,
        address expectedCauseBRecipient
    ) internal view {
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
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);

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
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);

        uint256 totalPotWei = expectedEntryFeeWei * expectedPlayerCount;
        uint256 creatorFeeWei = totalPotWei * uint256(expectedCreatorFeeBps) / 10_000;
        uint256 postCreatorPotWei = totalPotWei - creatorFeeWei;
        uint256 winnerShareWei = postCreatorPotWei / expectedPlayerCount;
        uint256 treasuryAccruedWei = creatorFeeWei + (postCreatorPotWei - (winnerShareWei * expectedPlayerCount));

        assertEq(snapshot.entryFeeWei, expectedEntryFeeWei);
        assertEq(snapshot.creatorFeeBps, expectedCreatorFeeBps);
        assertEq(snapshot.causeFeeBps, expectedCauseFeeBps);
        assertEq(snapshot.treasury, expectedTreasury);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
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
        PrisonersDAOlemma.Choice choice,
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
        returns (PrisonersDAOlemma.GameConfig memory)
    {
        PrisonersDAOlemma.GameConfig memory config = _defaultConfig();
        config.entryFeeWei = entryFeeWei;
        config.creatorFeeBps = creatorFeeBps;
        config.causeFeeBps = causeFeeBps;
        return config;
    }

    function _defaultConfig() internal pure returns (PrisonersDAOlemma.GameConfig memory) {
        return PrisonersDAOlemma.GameConfig({
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
