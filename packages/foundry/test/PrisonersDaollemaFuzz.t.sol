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
