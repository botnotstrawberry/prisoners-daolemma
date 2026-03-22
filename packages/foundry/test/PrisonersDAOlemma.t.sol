// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDAOlemma } from "../contracts/PrisonersDAOlemma.sol";

contract PrisonersDAOlemmaTest is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;
    uint16 internal constant CAUSE_C = 3;

    bytes32 internal constant PLAYER1_AGENT = keccak256("agent-alpha");
    bytes32 internal constant PLAYER2_AGENT = keccak256("agent-beta");
    bytes32 internal constant PLAYER3_AGENT = keccak256("agent-gamma");
    bytes32 internal constant PLAYER4_AGENT = keccak256("agent-delta");

    bytes32 internal constant SALT_1 = keccak256("salt-1");
    bytes32 internal constant SALT_2 = keccak256("salt-2");
    bytes32 internal constant SALT_3 = keccak256("salt-3");
    bytes32 internal constant SALT_4 = keccak256("salt-4");

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry internal registry;
    PrisonersDAOlemma internal game;

    address internal owner;
    address internal verifier;
    address internal treasury;
    address internal causeARecipient;
    address internal causeBRecipient;
    address internal causeCRecipient;

    address internal player1;
    address internal player2;
    address internal player3;
    address internal player4;

    struct WinnerSequenceContext {
        uint256 gameId;
        uint256 creatorFeeWei;
        uint256 winnerShareWei;
        uint256 causeCutWei;
        uint256 netPrizeWei;
        address treasury;
        address causeARecipient;
        address causeBRecipient;
    }

    struct NoWinnerSequenceContext {
        uint256 gameId;
        uint256 treasuryWei;
        uint256 causeAWei;
        uint256 causeBWei;
        address treasury;
        address causeARecipient;
        address causeBRecipient;
    }

    struct HighCardinalityNoWinnerExpectation {
        uint256 totalPotWei;
        uint256 creatorFeeWei;
        uint256 noWinnerCausePoolWei;
        uint256 noWinnerCauseDistributedWei;
        uint256 treasuryAccruedWei;
        uint256 causeAAmountWei;
        uint256 causeBAmountWei;
        uint256 causeCAmountWei;
    }

    function setUp() public {
        owner = vm.addr(ownerPk);
        verifier = vm.addr(verifierPk);
        treasury = makeAddr("treasury");
        causeARecipient = makeAddr("cause-a-recipient");
        causeBRecipient = makeAddr("cause-b-recipient");
        causeCRecipient = makeAddr("cause-c-recipient");

        player1 = makeAddr("player-1");
        player2 = makeAddr("player-2");
        player3 = makeAddr("player-3");
        player4 = makeAddr("player-4");

        vm.deal(player1, 10 ether);
        vm.deal(player2, 10 ether);
        vm.deal(player3, 10 ether);
        vm.deal(player4, 10 ether);

        registry = new AgentAuthRegistry(owner, verifier);
        game = new PrisonersDAOlemma(owner, treasury, address(registry), _defaultConfig());

        vm.startPrank(owner);
        game.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        game.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        game.whitelistCause(CAUSE_C, causeCRecipient, keccak256("cause-c"));
        vm.stopPrank();
    }

    function testConstructorStoresCoreAddressesAndDefaultConfig() public view {
        PrisonersDAOlemma.GameConfig memory config = game.getDefaultConfig();

        assertEq(game.owner(), owner);
        assertEq(game.treasury(), treasury);
        assertEq(game.authRegistry(), address(registry));
        assertEq(config.entryFeeWei, 0.001 ether);
        assertEq(config.creatorFeeBps, 100);
        assertEq(config.causeFeeBps, 100);
        assertEq(config.joinDurationSeconds, 1 hours);
        assertEq(config.commitDurationBlocks, 20);
        assertEq(config.revealDurationBlocks, 20);
        assertEq(config.minPlayers, 2);
        assertEq(config.maxPlayers, 4);
        assertEq(config.maxCauses, 2);
    }

    function testCauseWhitelistManagementStoresRecipientsAndActiveCount() public {
        assertEq(game.causeCount(), 3);
        assertEq(game.activeCauseCount(), 3);
        assertEq(game.causeAt(0), CAUSE_A);
        assertEq(game.causeAt(1), CAUSE_B);
        assertEq(game.causeAt(2), CAUSE_C);

        PrisonersDAOlemma.CauseDefinition memory causeA = game.getCause(CAUSE_A);
        assertTrue(causeA.active);
        assertEq(causeA.recipient, causeARecipient);
        assertEq(causeA.metadataHash, keccak256("cause-a"));

        vm.prank(owner);
        game.removeCause(CAUSE_B);

        PrisonersDAOlemma.CauseDefinition memory causeB = game.getCause(CAUSE_B);
        assertFalse(causeB.active);
        assertEq(game.activeCauseCount(), 2);
        assertFalse(game.isCauseWhitelisted(CAUSE_B));
    }

    function testCreateGameStartsJoiningAndSnapshotsDefaults() public {
        uint256 expectedDeadline = vm.getBlockTimestamp() + _defaultConfig().joinDurationSeconds;

        vm.prank(owner);
        uint256 gameId = game.createGame();

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        assertEq(gameId, 1);
        assertEq(game.currentGameId(), 1);
        assertEq(game.activeGameId(), 1);
        assertEq(snapshot.entryFeeWei, 0.001 ether);
        assertEq(snapshot.treasury, treasury);
        assertEq(snapshot.minPlayers, 2);
        assertEq(snapshot.maxPlayers, 4);
        assertEq(snapshot.maxCauses, 2);
        assertEq(snapshot.createdAt, vm.getBlockTimestamp());
        assertEq(snapshot.joinDeadline, expectedDeadline);
        assertEq(snapshot.round, 0);
        assertEq(snapshot.committedCount, 0);
        assertEq(snapshot.revealedCount, 0);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Joining));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Unset));
        assertTrue(game.gameExists(gameId));
    }

    function testCreateGameRequiresAtLeastOneWhitelistedCause() public {
        PrisonersDAOlemma emptyGame = new PrisonersDAOlemma(owner, treasury, address(registry), _defaultConfig());

        vm.expectRevert(PrisonersDAOlemma.NoWhitelistedCauses.selector);
        vm.prank(owner);
        emptyGame.createGame();
    }

    function testCreateGameRequiresIdlePhase() public {
        vm.prank(owner);
        game.createGame();

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.createGame();
    }

    function testLaunchGameAndJoinAllowsAuthorizedWalletToStartAndAutoJoin() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-1"));

        uint32 joinDurationSeconds = 900;

        vm.prank(player1);
        uint256 gameId = game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(joinDurationSeconds, CAUSE_A);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player = game.getPlayer(gameId, player1);

        assertEq(gameId, 1);
        assertEq(game.currentGameId(), 1);
        assertEq(game.activeGameId(), 1);
        assertEq(snapshot.joinDurationSeconds, joinDurationSeconds);
        assertEq(snapshot.commitDurationBlocks, _defaultConfig().commitDurationBlocks);
        assertEq(snapshot.revealDurationBlocks, _defaultConfig().revealDurationBlocks);
        assertEq(snapshot.minPlayers, _defaultConfig().minPlayers);
        assertEq(snapshot.maxPlayers, _defaultConfig().maxPlayers);
        assertEq(snapshot.maxCauses, _defaultConfig().maxCauses);
        assertEq(snapshot.joinedCount, 1);
        assertEq(snapshot.aliveCount, 1);
        assertEq(snapshot.usedCauseCount, 1);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Joining));
        assertEq(game.accountedETHLiabilities(), _defaultConfig().entryFeeWei);

        assertTrue(player.joined);
        assertTrue(player.alive);
        assertEq(player.wallet, player1);
        assertEq(player.agentKey, PLAYER1_AGENT);
        assertEq(player.causeId, CAUSE_A);
        assertEq(game.gameCauseRecipient(gameId, CAUSE_A), causeARecipient);
    }

    function testLaunchGameAndJoinRejectsUnauthorizedWallet() public {
        vm.expectRevert(PrisonersDAOlemma.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(300, CAUSE_A);

        assertEq(game.currentGameId(), 0);
        assertEq(game.activeGameId(), 0);
    }

    function testLaunchGameAndJoinRejectsTooShortJoinDuration() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-short"));

        vm.expectRevert(PrisonersDAOlemma.InvalidLaunchJoinDuration.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(299, CAUSE_A);
    }

    function testLaunchGameAndJoinRejectsTooLongJoinDuration() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-long"));

        vm.expectRevert(PrisonersDAOlemma.InvalidLaunchJoinDuration.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(3601, CAUSE_A);
    }

    function testLaunchGameAndJoinRequiresIdlePhase() public {
        vm.prank(owner);
        game.createGame();

        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-idle"));

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(300, CAUSE_A);
    }

    function testLaunchGameAndJoinRejectsEntryFeeMismatch() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-fee"));

        vm.expectRevert(PrisonersDAOlemma.EntryFeeMismatch.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei + 1 }(300, CAUSE_A);

        assertEq(game.currentGameId(), 0);
        assertEq(game.activeGameId(), 0);
    }

    function testLaunchGameAndJoinRejectsInvalidCauseAndRevertsCreation() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-cause"));

        vm.expectRevert(PrisonersDAOlemma.InvalidCause.selector);
        vm.prank(player1);
        game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(300, 999);

        assertEq(game.currentGameId(), 0);
        assertEq(game.activeGameId(), 0);
    }

    function testLaunchGameAndJoinCanStillCancelAndRefundUnderfilledGame() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-launch-refund"));

        vm.prank(player1);
        uint256 gameId = game.launchGameAndJoin{ value: _defaultConfig().entryFeeWei }(300, CAUSE_A);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Cancelled));
        _assertRefundPreview(gameId, player1, _defaultConfig().entryFeeWei, true);
    }

    function testRejectsInvalidGameConfigBounds() public {
        PrisonersDAOlemma.GameConfig memory invalidConfig = _defaultConfig();

        invalidConfig.entryFeeWei = 0;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.joinDurationSeconds = 0;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.commitDurationBlocks = 0;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.revealDurationBlocks = 0;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.minPlayers = 0;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.minPlayers = 1;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.minPlayers = 5;
        invalidConfig.maxPlayers = 4;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.maxPlayers = 257;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.maxCauses = 17;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.maxCauses = invalidConfig.maxPlayers + 1;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.creatorFeeBps = 501;
        _assertInvalidConfig(invalidConfig);

        invalidConfig = _defaultConfig();
        invalidConfig.causeFeeBps = 501;
        _assertInvalidConfig(invalidConfig);
    }

    function testAdmissionViewsMirrorRegistry() public {
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-admission"));

        assertTrue(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);
    }

    function testJoinRejectsUnauthorizedWallet() public {
        uint256 gameId = _createGame();

        vm.expectRevert(PrisonersDAOlemma.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsExpiredAuthAndAdmissionViewTurnsFalse() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 10), keccak256("nonce-expired"));

        vm.warp(vm.getBlockTimestamp() + 11);

        assertFalse(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);

        vm.expectRevert(PrisonersDAOlemma.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsRevokedAuthAndAdmissionViewTurnsFalse() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-revoked"));

        vm.prank(owner);
        registry.revokeAuth(player1);

        assertFalse(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);

        vm.expectRevert(PrisonersDAOlemma.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testPostJoinRevokedOrExpiredAuthDoesNotBlockGameplayOrClaims() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-postjoin-revoked"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 10), keccak256("nonce-postjoin-expired"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_B);

        vm.prank(owner);
        registry.revokeAuth(player1);

        vm.warp(game.getGame(gameId).joinDeadline + 1);

        assertFalse(game.isAdmissionReady(player1));
        assertFalse(game.isAdmissionReady(player2));

        game.advancePhase(gameId);
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_3, player2, PrisonersDAOlemma.Choice.Share, SALT_4
        );
        _resolveCurrentRoundTwoPlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(41)),
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(42))
        );

        uint256 player1BalanceBefore = player1.balance;
        uint256 player2BalanceBefore = player2.balance;

        vm.prank(player1);
        game.claim(gameId);

        vm.prank(player2);
        game.claim(gameId);

        assertGt(player1.balance, player1BalanceBefore);
        assertGt(player2.balance, player2BalanceBefore);
    }

    function testJoinRejectsDuplicateWalletPerGame() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-wallet-1"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDAOlemma.DuplicateWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsDuplicateAgentKeyPerGame() public {
        uint256 gameId = _createGame();
        bytes32 sharedAgentKey = keccak256("shared-agent");

        _registerWallet(player1, sharedAgentKey, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-agent-1"));
        _registerWallet(player2, sharedAgentKey, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-agent-2"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDAOlemma.DuplicateAgentKey.selector);
        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testJoinRejectsInvalidCause() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-invalid-cause"));

        vm.expectRevert(PrisonersDAOlemma.InvalidCause.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, 999);
    }

    function testJoinRequiresExactEntryFee() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-entry-fee"));

        vm.expectRevert(PrisonersDAOlemma.EntryFeeMismatch.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether - 1 }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDAOlemma.EntryFeeMismatch.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether + 1 }(gameId, CAUSE_A);
    }

    function testJoinEnforcesMaxPlayers() public {
        PrisonersDAOlemma limitedGame = _deployGame(_configWith(0.001 ether, 2, 2, 2));
        _whitelistDefaultCauses(limitedGame);

        vm.prank(owner);
        uint256 gameId = limitedGame.createGame();

        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-players-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-players-2"));
        _registerWallet(player3, PLAYER3_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-players-3"));

        vm.prank(player1);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_B);

        vm.expectRevert(PrisonersDAOlemma.MaxPlayersReached.selector);
        vm.prank(player3);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_C);
    }

    function testJoinAccepts256PlayersAndRejects257th() public {
        PrisonersDAOlemma maxGame = _deployGame(_configWith(0.001 ether, 2, 256, 1));
        _whitelistDefaultCauses(maxGame);

        vm.prank(owner);
        uint256 gameId = maxGame.createGame();

        uint256 entryFeeWei = maxGame.getGame(gameId).entryFeeWei;

        for (uint256 index = 0; index < 256; ++index) {
            address wallet = vm.addr(10_000 + index);
            bytes32 agentKey = keccak256(abi.encodePacked("bulk-agent-", index));
            bytes32 nonce = keccak256(abi.encodePacked("bulk-nonce-", index));

            vm.deal(wallet, 1 ether);
            _registerWallet(wallet, agentKey, uint64(vm.getBlockTimestamp() + 1 hours), nonce);

            vm.prank(wallet);
            maxGame.join{ value: entryFeeWei }(gameId, CAUSE_A);
        }

        PrisonersDAOlemma.GameSnapshot memory snapshot = maxGame.getGame(gameId);
        assertEq(snapshot.joinedCount, 256);
        assertEq(snapshot.aliveCount, 256);
        assertEq(snapshot.usedCauseCount, 1);
        assertEq(maxGame.playerCount(gameId), 256);

        address overflowWallet = vm.addr(20_000);
        vm.deal(overflowWallet, 1 ether);
        _registerWallet(
            overflowWallet,
            keccak256("bulk-agent-overflow"),
            uint64(vm.getBlockTimestamp() + 1 hours),
            keccak256("bulk-nonce-overflow")
        );

        vm.expectRevert(PrisonersDAOlemma.MaxPlayersReached.selector);
        vm.prank(overflowWallet);
        maxGame.join{ value: entryFeeWei }(gameId, CAUSE_A);

        assertEq(maxGame.playerCount(gameId), 256);
        assertEq(maxGame.playerAt(gameId, 255), vm.addr(10_000 + 255));
    }

    function testJoinEnforcesMaxCausesButAllowsExistingCauseReuse() public {
        PrisonersDAOlemma singleCauseGame = _deployGame(_configWith(0.001 ether, 2, 4, 1));
        _whitelistDefaultCauses(singleCauseGame);

        vm.prank(owner);
        uint256 gameId = singleCauseGame.createGame();

        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-causes-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-causes-2"));
        _registerWallet(player3, PLAYER3_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-max-causes-3"));

        vm.prank(player1);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDAOlemma.MaxCausesReached.selector);
        vm.prank(player3);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testJoinStoresPlayerStateRosterAndCauseSnapshotReads() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-read-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-read-2"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        PrisonersDAOlemma.PlayerState memory player = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.GameCauseState memory gameCause = game.getGameCause(gameId, CAUSE_A);

        assertTrue(player.joined);
        assertTrue(player.alive);
        assertFalse(player.claimed);
        assertFalse(player.refunded);
        assertFalse(player.committedThisRound);
        assertFalse(player.revealedThisRound);
        assertEq(player.wallet, player1);
        assertEq(player.agentKey, PLAYER1_AGENT);
        assertEq(player.causeId, CAUSE_A);
        assertEq(player.commitment, bytes32(0));
        assertEq(uint256(player.revealedChoice), uint256(PrisonersDAOlemma.Choice.Unset));
        assertEq(uint256(player.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Unset));
        assertEq(player.lastChoiceRound, 0);

        assertEq(snapshot.joinedCount, 2);
        assertEq(snapshot.aliveCount, 2);
        assertEq(snapshot.usedCauseCount, 1);
        assertEq(snapshot.committedCount, 0);
        assertEq(snapshot.revealedCount, 0);
        assertEq(game.playerCount(gameId), 2);
        assertEq(game.playerAt(gameId, 0), player1);
        assertEq(game.playerAt(gameId, 1), player2);
        assertEq(game.gameCauseCount(gameId), 1);
        assertEq(game.gameCauseAt(gameId, 0), CAUSE_A);
        assertTrue(game.isJoined(gameId, player1));
        assertTrue(game.isAlive(gameId, player1));
        assertEq(game.playerCause(gameId, player1), CAUSE_A);
        assertEq(game.causeEntrants(gameId, CAUSE_A), 2);
        assertTrue(gameCause.used);
        assertEq(gameCause.entrantCount, 2);
        assertEq(gameCause.recipient, causeARecipient);
        assertEq(game.gameCauseRecipient(gameId, CAUSE_A), causeARecipient);
        assertEq(gameCause.metadataHash, keccak256("cause-a"));
    }

    function testJoinAllowsExactJoinDeadlineButRejectsAfterDeadline() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-deadline-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-deadline-2"));

        uint64 joinDeadline = game.getGame(gameId).joinDeadline;

        vm.warp(joinDeadline);
        assertFalse(game.canAdvancePhase(gameId));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.warp(joinDeadline + 1);
        assertTrue(game.canAdvancePhase(gameId));

        vm.expectRevert(PrisonersDAOlemma.JoinWindowClosed.selector);
        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testAdvancePhaseMovesJoiningToCommitAfterDeadlineWhenMinPlayersMet() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-advance-join-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-advance-join-2"), CAUSE_B);

        vm.expectRevert(PrisonersDAOlemma.JoinWindowStillOpen.selector);
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory joiningSnapshot = game.getGame(gameId);
        vm.warp(joiningSnapshot.joinDeadline + 1);

        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory commitSnapshot = game.getGame(gameId);
        assertEq(uint256(commitSnapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(commitSnapshot.round, 1);
        assertEq(commitSnapshot.commitDeadlineBlock, block.number + _defaultConfig().commitDurationBlocks);
        assertEq(commitSnapshot.revealDeadlineBlock, 0);
        assertEq(commitSnapshot.committedCount, 0);
        assertEq(commitSnapshot.revealedCount, 0);
        assertEq(game.activeGameId(), gameId);
        assertTrue(game.canAdvancePhase(gameId) == false);
    }

    function testAdvancePhaseCancelsJoiningGameAfterDeadlineBelowMinPlayers() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-advance-1"), CAUSE_A);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory cancelledGame = game.getGame(gameId);
        assertEq(game.activeGameId(), 0);
        assertEq(uint256(cancelledGame.phase), uint256(PrisonersDAOlemma.Phase.Cancelled));
        assertEq(uint256(cancelledGame.outcome), uint256(PrisonersDAOlemma.Outcome.Cancelled));
    }

    function testCancelIfInsufficientPlayersRejectsWhileJoinWindowIsStillOpen() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-open"), CAUSE_A);

        vm.expectRevert(PrisonersDAOlemma.JoinWindowStillOpen.selector);
        game.cancelIfInsufficientPlayers(gameId);
    }

    function testCancelIfInsufficientPlayersRejectsOnceMinimumPlayersMet() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-met-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-cancel-met-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);

        vm.expectRevert(PrisonersDAOlemma.MinimumPlayersMet.selector);
        game.cancelIfInsufficientPlayers(gameId);
    }

    function testCancelIfInsufficientPlayersRejectsMissingGame() public {
        vm.expectRevert(PrisonersDAOlemma.MissingGame.selector);
        game.cancelIfInsufficientPlayers(999);
    }

    function testCommitRequiresJoinedPlayerStoresHashAndRejectsDuplicateCommit() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        bytes32 commitment = _commitmentFor(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        vm.prank(player1);
        game.commit(gameId, commitment);

        PrisonersDAOlemma.PlayerState memory player = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);

        assertTrue(player.committedThisRound);
        assertFalse(player.revealedThisRound);
        assertEq(player.commitment, commitment);
        assertEq(uint256(player.revealedChoice), uint256(PrisonersDAOlemma.Choice.Unset));
        assertEq(snapshot.committedCount, 1);
        assertEq(snapshot.revealedCount, 0);

        vm.expectRevert(PrisonersDAOlemma.DuplicateCommit.selector);
        vm.prank(player1);
        game.commit(gameId, commitment);

        bytes32 outsiderCommitment = _commitmentFor(gameId, player4, PrisonersDAOlemma.Choice.Catch, SALT_2);
        vm.expectRevert(PrisonersDAOlemma.PlayerNotJoined.selector);
        vm.prank(player4);
        game.commit(gameId, outsiderCommitment);
    }

    function testAdvancePhaseMovesCommitToRevealEarlyWhenEveryoneCommitted() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);

        assertTrue(game.canAdvancePhase(gameId));
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertEq(uint256(revealSnapshot.phase), uint256(PrisonersDAOlemma.Phase.Reveal));
        assertEq(revealSnapshot.round, 1);
        assertEq(revealSnapshot.commitDeadlineBlock, game.getGame(gameId).commitDeadlineBlock);
        assertEq(revealSnapshot.revealDeadlineBlock, block.number + _defaultConfig().revealDurationBlocks);
        assertEq(revealSnapshot.committedCount, 2);
        assertEq(revealSnapshot.revealedCount, 0);
        assertFalse(game.canAdvancePhase(gameId));
    }

    function testCommitAllowsLastValidBlock() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        PrisonersDAOlemma.GameSnapshot memory commitSnapshot = game.getGame(gameId);

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        bytes32 player2Commitment = _commitmentFor(gameId, player2, PrisonersDAOlemma.Choice.Steal, SALT_2);
        vm.roll(commitSnapshot.commitDeadlineBlock);
        vm.prank(player2);
        game.commit(gameId, player2Commitment);

        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);
        assertTrue(player2State.committedThisRound);
    }

    function testCommitBecomesAdvanceableOnlyAfterDeadlineWhenNotEveryoneCommitted() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        PrisonersDAOlemma.GameSnapshot memory commitSnapshot = game.getGame(gameId);

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        vm.roll(commitSnapshot.commitDeadlineBlock);
        assertFalse(game.canAdvancePhase(gameId));

        vm.roll(commitSnapshot.commitDeadlineBlock + 1);
        assertTrue(game.canAdvancePhase(gameId));
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertEq(uint256(revealSnapshot.phase), uint256(PrisonersDAOlemma.Phase.Reveal));
    }

    function testRevealRejectsWithoutCommitInvalidPreimageAndDuplicateReveal() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        PrisonersDAOlemma.GameSnapshot memory commitSnapshot = game.getGame(gameId);
        vm.roll(commitSnapshot.commitDeadlineBlock + 1);
        game.advancePhase(gameId);

        vm.expectRevert(PrisonersDAOlemma.MissingCommitment.selector);
        vm.prank(player2);
        game.reveal(gameId, PrisonersDAOlemma.Choice.Catch, SALT_2);

        vm.expectRevert(PrisonersDAOlemma.InvalidRevealPreimage.selector);
        vm.prank(player1);
        game.reveal(gameId, PrisonersDAOlemma.Choice.Share, SALT_2);

        vm.prank(player1);
        game.reveal(gameId, PrisonersDAOlemma.Choice.Share, SALT_1);

        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertTrue(player1State.revealedThisRound);
        assertEq(uint256(player1State.revealedChoice), uint256(PrisonersDAOlemma.Choice.Share));
        assertEq(revealSnapshot.revealedCount, 1);

        vm.expectRevert(PrisonersDAOlemma.DuplicateReveal.selector);
        vm.prank(player1);
        game.reveal(gameId, PrisonersDAOlemma.Choice.Share, SALT_1);
    }

    function testRevealEarlyReadinessWhenAllCommittedPlayersReveal() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        assertFalse(game.isRoundReadyForResolution(gameId));

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        assertFalse(game.isRoundReadyForResolution(gameId));

        _revealForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        assertTrue(game.isRoundReadyForResolution(gameId));
    }

    function testRevealAllowsLastValidBlock() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Steal, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        vm.roll(revealSnapshot.revealDeadlineBlock);
        _revealForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Steal, SALT_2);

        assertTrue(game.isRoundReadyForResolution(gameId));
    }

    function testRevealBecomesReadyAfterDeadlineWhenNotEveryoneReveals() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);

        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        vm.roll(revealSnapshot.revealDeadlineBlock);
        assertFalse(game.isRoundReadyForResolution(gameId));

        vm.roll(revealSnapshot.revealDeadlineBlock + 1);
        assertTrue(game.isRoundReadyForResolution(gameId));

        vm.expectRevert(PrisonersDAOlemma.RevealWindowClosed.selector);
        vm.prank(player2);
        game.reveal(gameId, PrisonersDAOlemma.Choice.Catch, SALT_2);
    }

    function testAdminConfigAndCauseWritesAreBlockedThroughCommitAndRevealPhases() public {
        uint256 gameId = _createGame();
        _expectAdminWritesBlocked();

        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-admin-join-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-admin-join-2"), CAUSE_B);
        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        _expectAdminWritesBlocked();

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _expectAdminWritesBlocked();
    }

    function testCancelIfInsufficientPlayersSnapshotsOldGameAndReleasesActiveSlot() public {
        uint256 gameId1 = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-snapshot-1"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId1, CAUSE_A);

        PrisonersDAOlemma.GameSnapshot memory game1BeforeCancel = game.getGame(gameId1);
        assertEq(game1BeforeCancel.entryFeeWei, 0.001 ether);
        assertEq(game1BeforeCancel.treasury, treasury);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_A), causeARecipient);

        vm.warp(game1BeforeCancel.joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId1);

        PrisonersDAOlemma.GameSnapshot memory cancelledGame = game.getGame(gameId1);

        assertEq(game.activeGameId(), 0);
        assertEq(uint256(cancelledGame.phase), uint256(PrisonersDAOlemma.Phase.Cancelled));
        assertEq(uint256(cancelledGame.outcome), uint256(PrisonersDAOlemma.Outcome.Cancelled));

        address updatedTreasury = makeAddr("updated-treasury");
        address updatedCauseARecipient = makeAddr("cause-a-recipient-updated");

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.configureDefaults(_configWith(0.002 ether, 2, 4, 2));
        game.whitelistCause(CAUSE_A, updatedCauseARecipient, keccak256("cause-a-updated"));
        uint256 gameId2 = game.createGame();
        vm.stopPrank();

        _registerWallet(player2, PLAYER2_AGENT, uint64(vm.getBlockTimestamp() + 1 hours), keccak256("nonce-snapshot-2"));
        vm.prank(player2);
        game.join{ value: 0.002 ether }(gameId2, CAUSE_A);

        PrisonersDAOlemma.GameSnapshot memory game1AfterChanges = game.getGame(gameId1);
        PrisonersDAOlemma.GameSnapshot memory game2 = game.getGame(gameId2);
        PrisonersDAOlemma.GameCauseState memory game1Cause = game.getGameCause(gameId1, CAUSE_A);
        PrisonersDAOlemma.GameCauseState memory game2Cause = game.getGameCause(gameId2, CAUSE_A);

        assertEq(game1AfterChanges.entryFeeWei, 0.001 ether);
        assertEq(game1AfterChanges.treasury, treasury);
        assertEq(game2.entryFeeWei, 0.002 ether);
        assertEq(game2.treasury, updatedTreasury);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_A), causeARecipient);
        assertEq(game.gameCauseRecipient(gameId2, CAUSE_A), updatedCauseARecipient);
        assertEq(game1Cause.metadataHash, keccak256("cause-a"));
        assertEq(game2Cause.metadataHash, keccak256("cause-a-updated"));
    }

    function testAdvancePhaseResolvesCatchersOnlyToNoWinnersAndReleasesActiveSlot() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1, player2, PrisonersDAOlemma.Choice.Catch, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.NoWinners));
        assertEq(snapshot.round, 1);
        assertEq(snapshot.aliveCount, 0);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), 0);
        assertFalse(player1State.alive);
        assertFalse(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
        assertEq(player1State.lastChoiceRound, 1);
        assertEq(player2State.lastChoiceRound, 1);

        vm.prank(owner);
        uint256 nextGameId = game.createGame();
        assertEq(nextGameId, 2);
    }

    function testAdvancePhaseResolvesSharersOnlyAndIncrementsShareStreak() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Unset));
        assertEq(snapshot.round, 2);
        assertEq(snapshot.aliveCount, 2);
        assertEq(snapshot.shareStreak, 1);
        assertEq(game.activeGameId(), gameId);

        _assertAlivePlayerRoundReset(gameId, player1, 1, PrisonersDAOlemma.Choice.Share);
        _assertAlivePlayerRoundReset(gameId, player2, 1, PrisonersDAOlemma.Choice.Share);
    }

    function testAdvancePhaseResolvesStealersOnlyToNoWinners() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Steal, SALT_1, player2, PrisonersDAOlemma.Choice.Steal, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.NoWinners));
        assertEq(snapshot.aliveCount, 0);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), 0);
        assertFalse(player1State.alive);
        assertFalse(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Steal));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Steal));
    }

    function testAdvancePhaseResolvesSharersAndCatchersToSoleSurvivorWin() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Catch, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.aliveCount, 1);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), 0);
        assertTrue(player1State.alive);
        assertFalse(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Share));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
    }

    function testAdvancePhaseResolvesStealersAndCatchersToSoleSurvivorWin() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1, player2, PrisonersDAOlemma.Choice.Steal, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.aliveCount, 1);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), 0);
        assertTrue(player1State.alive);
        assertFalse(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Steal));
    }

    function testAdvancePhaseResolvesStealersAndSharersToStealerWinAndReleasesActiveSlot() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Steal, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.aliveCount, 1);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), 0);
        assertTrue(player1State.alive);
        assertFalse(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Steal));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Share));

        vm.prank(owner);
        uint256 nextGameId = game.createGame();
        assertEq(nextGameId, 2);
    }

    function testAdvancePhaseResolvesAllThreeChoicesByEliminatingStealersAndContinuing() public {
        uint256 gameId = _advanceThreePlayerGameToCommit();
        _resolveCurrentRoundThreePlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            SALT_1,
            player2,
            PrisonersDAOlemma.Choice.Catch,
            SALT_2,
            player3,
            PrisonersDAOlemma.Choice.Steal,
            SALT_3
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);
        PrisonersDAOlemma.PlayerState memory player3State = game.getPlayer(gameId, player3);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Unset));
        assertEq(snapshot.round, 2);
        assertEq(snapshot.aliveCount, 2);
        assertEq(snapshot.shareStreak, 0);
        assertEq(game.activeGameId(), gameId);

        _assertAlivePlayerRoundReset(gameId, player1, 1, PrisonersDAOlemma.Choice.Share);
        _assertAlivePlayerRoundReset(gameId, player2, 1, PrisonersDAOlemma.Choice.Catch);
        assertFalse(player3State.alive);
        assertEq(uint256(player3State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Steal));
        assertEq(player3State.lastChoiceRound, 1);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Share));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
    }

    function testMissedCommitDefaultsToShareAtResolution() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);

        PrisonersDAOlemma.GameSnapshot memory commitSnapshot = game.getGame(gameId);
        vm.roll(commitSnapshot.commitDeadlineBlock + 1);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);
        assertTrue(game.canAdvancePhase(gameId));
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.aliveCount, 1);
        assertEq(game.activeGameId(), 0);
        assertFalse(player1State.alive);
        assertTrue(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Share));
        assertEq(player2State.lastChoiceRound, 1);
        assertFalse(player2State.committedThisRound);
        assertFalse(player2State.revealedThisRound);
    }

    function testNonRevealDefaultsToShareAtResolution() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Steal, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);

        PrisonersDAOlemma.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        vm.roll(revealSnapshot.revealDeadlineBlock + 1);
        game.advancePhase(gameId);

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDAOlemma.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDAOlemma.PlayerState memory player2State = game.getPlayer(gameId, player2);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.aliveCount, 1);
        assertEq(game.activeGameId(), 0);
        assertFalse(player1State.alive);
        assertTrue(player2State.alive);
        assertEq(uint256(player1State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Catch));
        assertEq(uint256(player2State.effectiveChoice), uint256(PrisonersDAOlemma.Choice.Share));
        assertEq(player2State.lastChoiceRound, 1);
        assertTrue(player2State.committedThisRound);
        assertFalse(player2State.revealedThisRound);
    }

    function testMultiRoundSurvivorFlowResetsRoundStateAndEndsOnThreeAllShareRounds() public {
        uint256 gameId = _advanceThreePlayerGameToCommit();

        _resolveCurrentRoundThreePlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            SALT_1,
            player2,
            PrisonersDAOlemma.Choice.Catch,
            SALT_2,
            player3,
            PrisonersDAOlemma.Choice.Steal,
            SALT_3
        );

        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(snapshot.round, 2);
        assertEq(snapshot.aliveCount, 2);
        assertEq(snapshot.shareStreak, 0);
        _assertAlivePlayerRoundReset(gameId, player1, 1, PrisonersDAOlemma.Choice.Share);
        _assertAlivePlayerRoundReset(gameId, player2, 1, PrisonersDAOlemma.Choice.Catch);
        assertFalse(game.getPlayer(gameId, player3).alive);

        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );

        snapshot = game.getGame(gameId);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(snapshot.round, 3);
        assertEq(snapshot.shareStreak, 1);
        _assertAlivePlayerRoundReset(gameId, player1, 2, PrisonersDAOlemma.Choice.Share);
        _assertAlivePlayerRoundReset(gameId, player2, 2, PrisonersDAOlemma.Choice.Share);

        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_3, player2, PrisonersDAOlemma.Choice.Share, SALT_4
        );

        snapshot = game.getGame(gameId);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Commit));
        assertEq(snapshot.round, 4);
        assertEq(snapshot.shareStreak, 2);
        _assertAlivePlayerRoundReset(gameId, player1, 3, PrisonersDAOlemma.Choice.Share);
        _assertAlivePlayerRoundReset(gameId, player2, 3, PrisonersDAOlemma.Choice.Share);

        _resolveCurrentRoundTwoPlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(101)),
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(202))
        );

        snapshot = game.getGame(gameId);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(snapshot.round, 4);
        assertEq(snapshot.aliveCount, 2);
        assertEq(snapshot.shareStreak, 3);
        assertEq(game.activeGameId(), 0);
        assertTrue(game.getPlayer(gameId, player1).alive);
        assertTrue(game.getPlayer(gameId, player2).alive);
        assertFalse(game.getPlayer(gameId, player3).alive);
    }

    function testWinnerClaimsSplitPostCreatorPotAndPreventDoubleClaim() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_3, player2, PrisonersDAOlemma.Choice.Share, SALT_4
        );
        _resolveCurrentRoundTwoPlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(301)),
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(302))
        );

        uint256 totalPotWei = 2 * _defaultConfig().entryFeeWei;
        uint256 creatorFeeWei = totalPotWei / 100;
        uint256 winnerShareWei = (totalPotWei - creatorFeeWei) / 2;
        uint256 causeCutWei = winnerShareWei / 100;
        uint256 netPrizeWei = winnerShareWei - causeCutWei;

        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        assertTrue(settlement.finalized);
        assertEq(settlement.totalPotWei, totalPotWei);
        assertEq(settlement.creatorFeeWei, creatorFeeWei);
        assertEq(settlement.treasuryAccruedWei, creatorFeeWei);
        assertEq(settlement.treasuryWithdrawnWei, 0);
        assertEq(settlement.winnerShareWei, winnerShareWei);
        assertEq(settlement.winnerCount, 2);
        assertEq(game.treasuryClaimableAmount(gameId), creatorFeeWei);

        _assertWinnerClaimPreview(gameId, player1, winnerShareWei, causeCutWei, netPrizeWei, true);

        uint256 player1BalanceBeforeClaim = player1.balance;
        vm.prank(player1);
        game.claim(gameId);
        assertEq(player1.balance, player1BalanceBeforeClaim + netPrizeWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), causeCutWei);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), causeCutWei);
        assertEq(game.gameCauseWithdrawnAmount(gameId, CAUSE_A), 0);
        assertTrue(game.getPlayer(gameId, player1).claimed);

        _assertWinnerClaimPreview(gameId, player1, winnerShareWei, causeCutWei, netPrizeWei, false);

        uint256 player2BalanceBeforeClaim = player2.balance;
        vm.prank(player2);
        game.claim(gameId);
        assertEq(player2.balance, player2BalanceBeforeClaim + netPrizeWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), causeCutWei);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_B), causeCutWei);
        assertTrue(game.getPlayer(gameId, player2).claimed);
        assertEq(game.treasuryClaimableAmount(gameId), creatorFeeWei);

        vm.expectRevert(PrisonersDAOlemma.AlreadyClaimed.selector);
        vm.prank(player1);
        game.claim(gameId);
    }

    function testWinnerCanRedirectPrizeWithClaimTo() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_3, player2, PrisonersDAOlemma.Choice.Share, SALT_4
        );
        _resolveCurrentRoundTwoPlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(303)),
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(304))
        );

        (, uint256 causeCutWei, uint256 netPrizeWei, bool availableNow) = game.previewWinnerClaim(gameId, player1);
        assertTrue(availableNow);

        address payoutRecipient = makeAddr("claim-to-recipient");
        uint256 recipientBalanceBefore = payoutRecipient.balance;
        uint256 playerBalanceBefore = player1.balance;

        vm.prank(player1);
        game.claimTo(gameId, payoutRecipient);

        assertEq(payoutRecipient.balance, recipientBalanceBefore + netPrizeWei);
        assertEq(player1.balance, playerBalanceBefore);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), causeCutWei);
        assertTrue(game.getPlayer(gameId, player1).claimed);
    }

    function testThirdPartyCanTriggerWinnerClaimForWinnerAddress() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Share, SALT_2
        );
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_3, player2, PrisonersDAOlemma.Choice.Share, SALT_4
        );
        _resolveCurrentRoundTwoPlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(305)),
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(306))
        );

        (, uint256 causeCutWei, uint256 netPrizeWei, bool availableNow) = game.previewWinnerClaim(gameId, player1);
        assertTrue(availableNow);

        address caller = makeAddr("claim-for-caller");
        uint256 playerBalanceBefore = player1.balance;
        uint256 callerBalanceBefore = caller.balance;

        vm.prank(caller);
        game.claimFor(gameId, player1);

        assertEq(player1.balance, playerBalanceBefore + netPrizeWei);
        assertEq(caller.balance, callerBalanceBefore);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), causeCutWei);
        assertTrue(game.getPlayer(gameId, player1).claimed);
    }

    function testCancelledGameRefundsEntryFeeAndPreventsDoubleRefund() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-refund-1"), CAUSE_A);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId);

        address updatedTreasury = makeAddr("refund-updated-treasury");
        PrisonersDAOlemma.GameConfig memory updatedConfig = _defaultConfig();
        updatedConfig.entryFeeWei = 2 * _defaultConfig().entryFeeWei;

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.configureDefaults(updatedConfig);
        vm.stopPrank();

        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        assertTrue(settlement.finalized);
        assertEq(settlement.totalPotWei, _defaultConfig().entryFeeWei);
        assertEq(settlement.refundPerPlayerWei, _defaultConfig().entryFeeWei);
        assertEq(settlement.creatorFeeWei, 0);
        assertEq(settlement.treasuryAccruedWei, 0);

        _assertRefundPreview(gameId, player1, _defaultConfig().entryFeeWei, true);

        uint256 player1BalanceBeforeRefund = player1.balance;
        vm.prank(player1);
        game.claimRefund(gameId);
        assertEq(player1.balance, player1BalanceBeforeRefund + _defaultConfig().entryFeeWei);
        assertTrue(game.getPlayer(gameId, player1).refunded);

        _assertRefundPreview(gameId, player1, _defaultConfig().entryFeeWei, false);

        vm.expectRevert(PrisonersDAOlemma.AlreadyRefunded.selector);
        vm.prank(player1);
        game.claimRefund(gameId);

        vm.expectRevert(PrisonersDAOlemma.ClaimUnavailable.selector);
        vm.prank(player1);
        game.claim(gameId);
    }

    function testNoWinnerSettlementRoutesCausePoolAndTreasuryPerGame() public {
        uint256 gameId = _advanceThreePlayerGameToCommit();
        _resolveCurrentRoundThreePlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Catch,
            SALT_1,
            player2,
            PrisonersDAOlemma.Choice.Catch,
            SALT_2,
            player3,
            PrisonersDAOlemma.Choice.Catch,
            SALT_3
        );

        uint256 totalPotWei = 3 * _defaultConfig().entryFeeWei;
        uint256 creatorFeeWei = totalPotWei / 100;
        uint256 noWinnerCausePoolWei = (totalPotWei - creatorFeeWei) * 9_000 / 10_000;
        uint256 causeAAmountWei = noWinnerCausePoolWei * 2 / 3;
        uint256 causeBAmountWei = noWinnerCausePoolWei / 3;
        uint256 distributedCauseWei = causeAAmountWei + causeBAmountWei;
        uint256 treasuryAccruedWei = totalPotWei - distributedCauseWei;

        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        assertTrue(settlement.finalized);
        assertEq(settlement.totalPotWei, totalPotWei);
        assertEq(settlement.creatorFeeWei, creatorFeeWei);
        assertEq(settlement.noWinnerCausePoolWei, noWinnerCausePoolWei);
        assertEq(settlement.noWinnerCauseDistributedWei, distributedCauseWei);
        assertEq(settlement.treasuryAccruedWei, treasuryAccruedWei);
        assertEq(settlement.treasuryWithdrawnWei, 0);
        assertEq(settlement.winnerCount, 0);
        assertEq(game.treasuryClaimableAmount(gameId), treasuryAccruedWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), causeAAmountWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), causeBAmountWei);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), causeAAmountWei);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_B), causeBAmountWei);
        assertEq(game.gameCauseWithdrawnAmount(gameId, CAUSE_A), 0);
        assertEq(game.gameCauseWithdrawnAmount(gameId, CAUSE_B), 0);

        vm.expectRevert(PrisonersDAOlemma.ClaimUnavailable.selector);
        vm.prank(player1);
        game.claim(gameId);

        uint256 treasuryBalanceBefore = treasury.balance;
        vm.prank(treasury);
        game.withdrawTreasury(gameId);
        assertEq(treasury.balance, treasuryBalanceBefore + treasuryAccruedWei);
        assertEq(game.treasuryClaimableAmount(gameId), 0);
        assertEq(game.getSettlement(gameId).treasuryWithdrawnWei, treasuryAccruedWei);

        uint256 causeABalanceBefore = causeARecipient.balance;
        vm.prank(causeARecipient);
        game.withdrawCause(gameId, CAUSE_A);
        assertEq(causeARecipient.balance, causeABalanceBefore + causeAAmountWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), 0);
        assertEq(game.gameCauseWithdrawnAmount(gameId, CAUSE_A), causeAAmountWei);

        uint256 causeBBalanceBefore = causeBRecipient.balance;
        vm.prank(causeBRecipient);
        game.withdrawCause(gameId, CAUSE_B);
        assertEq(causeBRecipient.balance, causeBBalanceBefore + causeBAmountWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), 0);
        assertEq(game.gameCauseWithdrawnAmount(gameId, CAUSE_B), causeBAmountWei);
    }

    function testHighCardinalityNoWinnerSettlementRoutesAcrossCauses() public {
        PrisonersDAOlemma highCardinalityGame = _deployGame(_configWith(0.001 ether, 2, 128, 3));
        _whitelistDefaultCauses(highCardinalityGame);

        vm.prank(owner);
        uint256 gameId = highCardinalityGame.createGame();

        uint256 entryFeeWei = highCardinalityGame.getGame(gameId).entryFeeWei;
        _joinHighCardinalityRoster(highCardinalityGame, gameId, 128, entryFeeWei);

        vm.warp(highCardinalityGame.getGame(gameId).joinDeadline + 1);
        highCardinalityGame.advancePhase(gameId);
        _commitRevealAllCatch(highCardinalityGame, gameId, 128);
        highCardinalityGame.advancePhase(gameId);

        _assertHighCardinalityNoWinnerSettlement(highCardinalityGame, gameId);
    }

    function testNoWinnerSettlementRoutesRoundingDustToTreasury() public {
        PrisonersDAOlemma.GameConfig memory tinyConfig = _defaultConfig();
        tinyConfig.entryFeeWei = 1;

        vm.prank(owner);
        game.configureDefaults(tinyConfig);

        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-dust-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-dust-2"), CAUSE_A);
        _joinPlayer(gameId, player3, PLAYER3_AGENT, keccak256("nonce-dust-3"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        _resolveCurrentRoundThreePlayers(
            gameId,
            player1,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(401)),
            player2,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(402)),
            player3,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(403))
        );

        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        assertEq(settlement.totalPotWei, 3);
        assertEq(settlement.creatorFeeWei, 0);
        assertEq(settlement.noWinnerCausePoolWei, 2);
        assertEq(settlement.noWinnerCauseDistributedWei, 1);
        assertEq(settlement.treasuryAccruedWei, 2);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_A), 1);
        assertEq(game.gameCauseRoutedAmount(gameId, CAUSE_B), 0);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), 1);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_B), 0);
        assertEq(game.treasuryClaimableAmount(gameId), 2);
    }

    function testWinnerClaimUsesSnapshottedCauseRecipientAndTreasuryAfterAdminChanges() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _resolveCurrentRoundTwoPlayers(
            gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1, player2, PrisonersDAOlemma.Choice.Catch, SALT_2
        );

        uint256 totalPotWei = 2 * _defaultConfig().entryFeeWei;
        uint256 creatorFeeWei = totalPotWei / 100;
        uint256 winnerShareWei = totalPotWei - creatorFeeWei;
        uint256 causeCutWei = winnerShareWei / 100;

        address updatedTreasury = makeAddr("updated-treasury");
        address updatedCauseARecipient = makeAddr("updated-cause-a-recipient");

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.whitelistCause(CAUSE_A, updatedCauseARecipient, keccak256("cause-a-updated"));
        vm.stopPrank();

        vm.prank(player1);
        game.claim(gameId);

        assertEq(game.treasuryClaimableAmount(gameId), creatorFeeWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), causeCutWei);
        assertEq(game.gameCauseRecipient(gameId, CAUSE_A), causeARecipient);

        uint256 treasuryBalanceBefore = treasury.balance;
        vm.prank(treasury);
        game.withdrawTreasury(gameId);
        assertEq(treasury.balance, treasuryBalanceBefore + creatorFeeWei);
        assertEq(updatedTreasury.balance, 0);

        uint256 causeABalanceBefore = causeARecipient.balance;
        vm.prank(causeARecipient);
        game.withdrawCause(gameId, CAUSE_A);
        assertEq(causeARecipient.balance, causeABalanceBefore + causeCutWei);
        assertEq(updatedCauseARecipient.balance, 0);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), 0);
    }

    function testNoWinnerWithdrawalsUseSnapshottedRecipientsAfterWhitelistRemovalAndRewhitelist() public {
        uint256 gameId1 = _advanceThreePlayerGameToCommit();
        _resolveCurrentRoundThreePlayers(
            gameId1,
            player1,
            PrisonersDAOlemma.Choice.Catch,
            SALT_1,
            player2,
            PrisonersDAOlemma.Choice.Catch,
            SALT_2,
            player3,
            PrisonersDAOlemma.Choice.Catch,
            SALT_3
        );

        address updatedTreasury = makeAddr("no-winner-updated-treasury");
        address updatedCauseARecipient = makeAddr("no-winner-updated-cause-a");
        address updatedCauseBRecipient = makeAddr("no-winner-updated-cause-b");

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.removeCause(CAUSE_A);
        game.removeCause(CAUSE_B);
        game.whitelistCause(CAUSE_A, updatedCauseARecipient, keccak256("cause-a-rewhitelisted"));
        game.whitelistCause(CAUSE_B, updatedCauseBRecipient, keccak256("cause-b-rewhitelisted"));
        uint256 gameId2 = game.createGame();
        vm.stopPrank();

        _joinPlayer(gameId2, player1, PLAYER1_AGENT, keccak256("nonce-no-winner-rejoin-1"), CAUSE_A);
        _joinPlayer(gameId2, player2, PLAYER2_AGENT, keccak256("nonce-no-winner-rejoin-2"), CAUSE_B);

        _assertDefaultThreePlayerNoWinnerSnapshotIsolation(
            gameId1, gameId2, updatedTreasury, updatedCauseARecipient, updatedCauseBRecipient
        );
        _withdrawDefaultThreePlayerNoWinnerFunds(
            gameId1, updatedTreasury, updatedCauseARecipient, updatedCauseBRecipient
        );
    }

    function testMixedTerminalOutcomeSequencePreservesOlderAccountingAcrossAdminChanges() public {
        uint256 cancelledGameId = _createGame();
        _joinPlayer(cancelledGameId, player1, PLAYER1_AGENT, keccak256("nonce-mixed-cancel-1"), CAUSE_A);

        vm.warp(game.getGame(cancelledGameId).joinDeadline + 1);
        game.cancelIfInsufficientPlayers(cancelledGameId);

        uint256 cancelledRefundWei = game.getGame(cancelledGameId).entryFeeWei;
        _assertRefundPreview(cancelledGameId, player1, cancelledRefundWei, true);

        WinnerSequenceContext memory winnerCtx = _prepareMixedWinnerSequence();
        _assertMixedWinnerAccountingState(winnerCtx, true, true, 0, 0);

        uint256 player2BalanceBeforeClaim = player2.balance;
        vm.prank(player2);
        game.claim(winnerCtx.gameId);
        assertEq(player2.balance, player2BalanceBeforeClaim + winnerCtx.netPrizeWei);
        _assertMixedWinnerAccountingState(winnerCtx, false, true, winnerCtx.causeCutWei, 0);

        NoWinnerSequenceContext memory noWinnerCtx = _prepareMixedNoWinnerSequence();
        _assertNoWinnerAccountingState(
            noWinnerCtx, noWinnerCtx.treasuryWei, noWinnerCtx.causeAWei, noWinnerCtx.causeBWei
        );

        _assertRefundPreview(cancelledGameId, player1, cancelledRefundWei, true);
        _assertMixedWinnerAccountingState(winnerCtx, false, true, winnerCtx.causeCutWei, 0);

        vm.prank(noWinnerCtx.treasury);
        game.withdrawTreasury(noWinnerCtx.gameId);
        assertEq(noWinnerCtx.treasury.balance, noWinnerCtx.treasuryWei);
        _assertNoWinnerAccountingState(noWinnerCtx, 0, noWinnerCtx.causeAWei, noWinnerCtx.causeBWei);

        vm.prank(noWinnerCtx.causeARecipient);
        game.withdrawCause(noWinnerCtx.gameId, CAUSE_A);
        assertEq(noWinnerCtx.causeARecipient.balance, noWinnerCtx.causeAWei);
        _assertNoWinnerAccountingState(noWinnerCtx, 0, 0, noWinnerCtx.causeBWei);

        _assertRefundPreview(cancelledGameId, player1, cancelledRefundWei, true);
        _assertMixedWinnerAccountingState(winnerCtx, false, true, winnerCtx.causeCutWei, 0);

        uint256 player3BalanceBeforeClaim = player3.balance;
        vm.prank(player3);
        game.claim(winnerCtx.gameId);
        assertEq(player3.balance, player3BalanceBeforeClaim + winnerCtx.netPrizeWei);
        _assertMixedWinnerAccountingState(winnerCtx, false, false, winnerCtx.causeCutWei, winnerCtx.causeCutWei);

        uint256 player1BalanceBeforeRefund = player1.balance;
        vm.prank(player1);
        game.claimRefund(cancelledGameId);
        assertEq(player1.balance, player1BalanceBeforeRefund + cancelledRefundWei);
        _assertRefundPreview(cancelledGameId, player1, cancelledRefundWei, false);

        vm.prank(winnerCtx.treasury);
        game.withdrawTreasury(winnerCtx.gameId);
        assertEq(winnerCtx.treasury.balance, winnerCtx.creatorFeeWei);
        assertEq(noWinnerCtx.treasury.balance, noWinnerCtx.treasuryWei);

        vm.prank(winnerCtx.causeARecipient);
        game.withdrawCause(winnerCtx.gameId, CAUSE_A);
        assertEq(winnerCtx.causeARecipient.balance, winnerCtx.causeCutWei);
        assertEq(noWinnerCtx.causeARecipient.balance, noWinnerCtx.causeAWei);

        vm.prank(winnerCtx.causeBRecipient);
        game.withdrawCause(winnerCtx.gameId, CAUSE_B);
        assertEq(winnerCtx.causeBRecipient.balance, winnerCtx.causeCutWei);
        assertEq(game.treasuryClaimableAmount(winnerCtx.gameId), 0);
        assertEq(game.gameCauseClaimableAmount(winnerCtx.gameId, CAUSE_A), 0);
        assertEq(game.gameCauseClaimableAmount(winnerCtx.gameId, CAUSE_B), 0);

        vm.prank(noWinnerCtx.causeBRecipient);
        game.withdrawCause(noWinnerCtx.gameId, CAUSE_B);
        assertEq(noWinnerCtx.causeBRecipient.balance, noWinnerCtx.causeBWei);
        _assertNoWinnerAccountingState(noWinnerCtx, 0, 0, 0);
    }

    function _prepareMixedWinnerSequence() internal returns (WinnerSequenceContext memory ctx) {
        ctx.treasury = makeAddr("winner-sequence-treasury");
        ctx.causeARecipient = makeAddr("winner-sequence-cause-a");
        ctx.causeBRecipient = makeAddr("winner-sequence-cause-b");

        vm.startPrank(owner);
        game.setTreasury(ctx.treasury);
        game.configureDefaults(_configWith(0.002 ether, 2, 4, 2));
        game.whitelistCause(CAUSE_A, ctx.causeARecipient, keccak256("winner-sequence-cause-a"));
        game.whitelistCause(CAUSE_B, ctx.causeBRecipient, keccak256("winner-sequence-cause-b"));
        vm.stopPrank();

        ctx.gameId = _createGame();
        _joinPlayer(ctx.gameId, player2, PLAYER2_AGENT, keccak256("nonce-mixed-winner-2"), CAUSE_A);
        _joinPlayer(ctx.gameId, player3, PLAYER3_AGENT, keccak256("nonce-mixed-winner-3"), CAUSE_B);

        vm.warp(game.getGame(ctx.gameId).joinDeadline + 1);
        game.advancePhase(ctx.gameId);

        _resolveCurrentRoundTwoPlayers(
            ctx.gameId, player2, PrisonersDAOlemma.Choice.Share, SALT_1, player3, PrisonersDAOlemma.Choice.Share, SALT_2
        );
        _resolveCurrentRoundTwoPlayers(
            ctx.gameId, player2, PrisonersDAOlemma.Choice.Share, SALT_3, player3, PrisonersDAOlemma.Choice.Share, SALT_4
        );
        _resolveCurrentRoundTwoPlayers(
            ctx.gameId,
            player2,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(501)),
            player3,
            PrisonersDAOlemma.Choice.Share,
            bytes32(uint256(502))
        );

        PrisonersDAOlemma.GameSnapshot memory winnerGame = game.getGame(ctx.gameId);
        assertEq(uint256(winnerGame.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(winnerGame.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));

        uint256 winnerTotalPotWei = winnerGame.entryFeeWei * uint256(winnerGame.joinedCount);
        ctx.creatorFeeWei = winnerTotalPotWei * uint256(winnerGame.creatorFeeBps) / 10_000;
        ctx.winnerShareWei = (winnerTotalPotWei - ctx.creatorFeeWei) / uint256(winnerGame.aliveCount);
        ctx.causeCutWei = ctx.winnerShareWei * uint256(winnerGame.causeFeeBps) / 10_000;
        ctx.netPrizeWei = ctx.winnerShareWei - ctx.causeCutWei;
    }

    function _prepareMixedNoWinnerSequence() internal returns (NoWinnerSequenceContext memory ctx) {
        ctx.treasury = makeAddr("no-winner-sequence-treasury");
        ctx.causeARecipient = makeAddr("no-winner-sequence-cause-a");
        ctx.causeBRecipient = makeAddr("no-winner-sequence-cause-b");

        vm.startPrank(owner);
        game.setTreasury(ctx.treasury);
        game.configureDefaults(_configWith(0.003 ether, 2, 4, 2));
        game.removeCause(CAUSE_A);
        game.removeCause(CAUSE_B);
        game.whitelistCause(CAUSE_A, ctx.causeARecipient, keccak256("no-winner-sequence-cause-a"));
        game.whitelistCause(CAUSE_B, ctx.causeBRecipient, keccak256("no-winner-sequence-cause-b"));
        vm.stopPrank();

        ctx.gameId = _createGame();
        _joinPlayer(ctx.gameId, player1, PLAYER1_AGENT, keccak256("nonce-mixed-no-winner-1"), CAUSE_A);
        _joinPlayer(ctx.gameId, player2, PLAYER2_AGENT, keccak256("nonce-mixed-no-winner-2"), CAUSE_A);
        _joinPlayer(ctx.gameId, player4, PLAYER4_AGENT, keccak256("nonce-mixed-no-winner-4"), CAUSE_B);

        vm.warp(game.getGame(ctx.gameId).joinDeadline + 1);
        game.advancePhase(ctx.gameId);

        _resolveCurrentRoundThreePlayers(
            ctx.gameId,
            player1,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(601)),
            player2,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(602)),
            player4,
            PrisonersDAOlemma.Choice.Catch,
            bytes32(uint256(604))
        );

        PrisonersDAOlemma.GameSnapshot memory noWinnerGame = game.getGame(ctx.gameId);
        assertEq(uint256(noWinnerGame.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(noWinnerGame.outcome), uint256(PrisonersDAOlemma.Outcome.NoWinners));

        uint256 noWinnerTotalPotWei = noWinnerGame.entryFeeWei * uint256(noWinnerGame.joinedCount);
        uint256 noWinnerCreatorFeeWei = noWinnerTotalPotWei * uint256(noWinnerGame.creatorFeeBps) / 10_000;
        uint256 noWinnerCausePoolWei = (noWinnerTotalPotWei - noWinnerCreatorFeeWei) * 9_000 / 10_000;
        ctx.causeAWei =
            noWinnerCausePoolWei * uint256(game.causeEntrants(ctx.gameId, CAUSE_A)) / uint256(noWinnerGame.joinedCount);
        ctx.causeBWei =
            noWinnerCausePoolWei * uint256(game.causeEntrants(ctx.gameId, CAUSE_B)) / uint256(noWinnerGame.joinedCount);
        ctx.treasuryWei = noWinnerTotalPotWei - (ctx.causeAWei + ctx.causeBWei);
    }

    function _assertMixedWinnerAccountingState(
        WinnerSequenceContext memory ctx,
        bool player2Available,
        bool player3Available,
        uint256 causeAClaimableWei,
        uint256 causeBClaimableWei
    ) internal view {
        _assertWinnerClaimPreview(
            ctx.gameId, player2, ctx.winnerShareWei, ctx.causeCutWei, ctx.netPrizeWei, player2Available
        );
        _assertWinnerClaimPreview(
            ctx.gameId, player3, ctx.winnerShareWei, ctx.causeCutWei, ctx.netPrizeWei, player3Available
        );
        assertEq(game.getGame(ctx.gameId).treasury, ctx.treasury);
        assertEq(game.gameCauseRecipient(ctx.gameId, CAUSE_A), ctx.causeARecipient);
        assertEq(game.gameCauseRecipient(ctx.gameId, CAUSE_B), ctx.causeBRecipient);
        assertEq(game.treasuryClaimableAmount(ctx.gameId), ctx.creatorFeeWei);
        assertEq(game.gameCauseClaimableAmount(ctx.gameId, CAUSE_A), causeAClaimableWei);
        assertEq(game.gameCauseClaimableAmount(ctx.gameId, CAUSE_B), causeBClaimableWei);
    }

    function _assertNoWinnerAccountingState(
        NoWinnerSequenceContext memory ctx,
        uint256 treasuryClaimableWei,
        uint256 causeAClaimableWei,
        uint256 causeBClaimableWei
    ) internal view {
        assertEq(game.getGame(ctx.gameId).treasury, ctx.treasury);
        assertEq(game.gameCauseRecipient(ctx.gameId, CAUSE_A), ctx.causeARecipient);
        assertEq(game.gameCauseRecipient(ctx.gameId, CAUSE_B), ctx.causeBRecipient);
        assertEq(game.treasuryClaimableAmount(ctx.gameId), treasuryClaimableWei);
        assertEq(game.gameCauseClaimableAmount(ctx.gameId, CAUSE_A), causeAClaimableWei);
        assertEq(game.gameCauseClaimableAmount(ctx.gameId, CAUSE_B), causeBClaimableWei);
    }

    function _assertDefaultThreePlayerNoWinnerSnapshotIsolation(
        uint256 gameId1,
        uint256 gameId2,
        address updatedTreasury,
        address updatedCauseARecipient,
        address updatedCauseBRecipient
    ) internal view {
        PrisonersDAOlemma.CauseDefinition memory globalCauseA = game.getCause(CAUSE_A);
        PrisonersDAOlemma.CauseDefinition memory globalCauseB = game.getCause(CAUSE_B);

        uint256 totalPotWei = 3 * _defaultConfig().entryFeeWei;
        uint256 creatorFeeWei = totalPotWei / 100;
        uint256 noWinnerCausePoolWei = (totalPotWei - creatorFeeWei) * 9_000 / 10_000;
        uint256 causeAAmountWei = noWinnerCausePoolWei * 2 / 3;
        uint256 causeBAmountWei = noWinnerCausePoolWei / 3;
        uint256 treasuryAccruedWei = totalPotWei - (causeAAmountWei + causeBAmountWei);

        assertTrue(globalCauseA.active);
        assertTrue(globalCauseB.active);
        assertEq(globalCauseA.recipient, updatedCauseARecipient);
        assertEq(globalCauseB.recipient, updatedCauseBRecipient);
        assertEq(globalCauseA.metadataHash, keccak256("cause-a-rewhitelisted"));
        assertEq(globalCauseB.metadataHash, keccak256("cause-b-rewhitelisted"));

        assertEq(game.getGame(gameId1).treasury, treasury);
        assertEq(game.getGame(gameId2).treasury, updatedTreasury);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_A), causeARecipient);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_B), causeBRecipient);
        assertEq(game.getGameCause(gameId1, CAUSE_A).metadataHash, keccak256("cause-a"));
        assertEq(game.getGameCause(gameId1, CAUSE_B).metadataHash, keccak256("cause-b"));
        assertEq(game.gameCauseRecipient(gameId2, CAUSE_A), updatedCauseARecipient);
        assertEq(game.gameCauseRecipient(gameId2, CAUSE_B), updatedCauseBRecipient);

        assertEq(game.getSettlement(gameId1).creatorFeeWei, creatorFeeWei);
        assertEq(game.treasuryClaimableAmount(gameId1), treasuryAccruedWei);
        assertEq(game.gameCauseClaimableAmount(gameId1, CAUSE_A), causeAAmountWei);
        assertEq(game.gameCauseClaimableAmount(gameId1, CAUSE_B), causeBAmountWei);
    }

    function _withdrawDefaultThreePlayerNoWinnerFunds(
        uint256 gameId,
        address updatedTreasury,
        address updatedCauseARecipient,
        address updatedCauseBRecipient
    ) internal {
        uint256 treasuryClaimableWei = game.treasuryClaimableAmount(gameId);
        uint256 causeAClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_A);
        uint256 causeBClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_B);

        uint256 treasuryBalanceBefore = treasury.balance;
        vm.prank(treasury);
        game.withdrawTreasury(gameId);
        assertEq(treasury.balance, treasuryBalanceBefore + treasuryClaimableWei);
        assertEq(updatedTreasury.balance, 0);

        uint256 causeABalanceBefore = causeARecipient.balance;
        vm.prank(causeARecipient);
        game.withdrawCause(gameId, CAUSE_A);
        assertEq(causeARecipient.balance, causeABalanceBefore + causeAClaimableWei);
        assertEq(updatedCauseARecipient.balance, 0);

        uint256 causeBBalanceBefore = causeBRecipient.balance;
        vm.prank(causeBRecipient);
        game.withdrawCause(gameId, CAUSE_B);
        assertEq(causeBRecipient.balance, causeBBalanceBefore + causeBClaimableWei);
        assertEq(updatedCauseBRecipient.balance, 0);
    }

    function _assertWinnerClaimPreview(
        uint256 gameId,
        address wallet,
        uint256 expectedGrossPrizeWei,
        uint256 expectedCauseCutWei,
        uint256 expectedNetPrizeWei,
        bool expectedAvailable
    ) internal view {
        (uint256 grossPrizeWei, uint256 causeCutWei, uint256 netPrizeWei, bool available) =
            game.previewWinnerClaim(gameId, wallet);
        assertEq(grossPrizeWei, expectedGrossPrizeWei);
        assertEq(causeCutWei, expectedCauseCutWei);
        assertEq(netPrizeWei, expectedNetPrizeWei);
        assertEq(available, expectedAvailable);
    }

    function _assertRefundPreview(uint256 gameId, address wallet, uint256 expectedRefundWei, bool expectedAvailable)
        internal
        view
    {
        (uint256 refundWei, bool available) = game.previewRefund(gameId, wallet);
        assertEq(refundWei, expectedRefundWei);
        assertEq(available, expectedAvailable);
    }

    function _assertInvalidConfig(PrisonersDAOlemma.GameConfig memory invalidConfig) internal {
        vm.expectRevert(PrisonersDAOlemma.InvalidGameConfig.selector);
        new PrisonersDAOlemma(owner, treasury, address(registry), invalidConfig);

        vm.expectRevert(PrisonersDAOlemma.InvalidGameConfig.selector);
        vm.prank(owner);
        game.configureDefaults(invalidConfig);
    }

    function _createGame() internal returns (uint256) {
        vm.prank(owner);
        return game.createGame();
    }

    function _advanceDefaultGameToCommit() internal returns (uint256 gameId) {
        gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-default-join-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-default-join-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);
    }

    function _advanceThreePlayerGameToCommit() internal returns (uint256 gameId) {
        gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-three-player-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-three-player-2"), CAUSE_B);
        _joinPlayer(gameId, player3, PLAYER3_AGENT, keccak256("nonce-three-player-3"), CAUSE_A);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);
    }

    function _resolveCurrentRoundTwoPlayers(
        uint256 gameId,
        address wallet1,
        PrisonersDAOlemma.Choice choice1,
        bytes32 salt1,
        address wallet2,
        PrisonersDAOlemma.Choice choice2,
        bytes32 salt2
    ) internal {
        _commitForPlayer(gameId, wallet1, choice1, salt1);
        _commitForPlayer(gameId, wallet2, choice2, salt2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, wallet1, choice1, salt1);
        _revealForPlayer(gameId, wallet2, choice2, salt2);
        game.advancePhase(gameId);
    }

    function _resolveCurrentRoundThreePlayers(
        uint256 gameId,
        address wallet1,
        PrisonersDAOlemma.Choice choice1,
        bytes32 salt1,
        address wallet2,
        PrisonersDAOlemma.Choice choice2,
        bytes32 salt2,
        address wallet3,
        PrisonersDAOlemma.Choice choice3,
        bytes32 salt3
    ) internal {
        _commitForPlayer(gameId, wallet1, choice1, salt1);
        _commitForPlayer(gameId, wallet2, choice2, salt2);
        _commitForPlayer(gameId, wallet3, choice3, salt3);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, wallet1, choice1, salt1);
        _revealForPlayer(gameId, wallet2, choice2, salt2);
        _revealForPlayer(gameId, wallet3, choice3, salt3);
        game.advancePhase(gameId);
    }

    function _assertAlivePlayerRoundReset(
        uint256 gameId,
        address wallet_,
        uint32 expectedLastChoiceRound,
        PrisonersDAOlemma.Choice expectedEffectiveChoice
    ) internal {
        PrisonersDAOlemma.PlayerState memory player = game.getPlayer(gameId, wallet_);

        assertTrue(player.alive);
        assertFalse(player.committedThisRound);
        assertFalse(player.revealedThisRound);
        assertEq(player.commitment, bytes32(0));
        assertEq(uint256(player.revealedChoice), uint256(PrisonersDAOlemma.Choice.Unset));
        assertEq(uint256(player.effectiveChoice), uint256(expectedEffectiveChoice));
        assertEq(player.lastChoiceRound, expectedLastChoiceRound);
    }

    function _joinPlayer(uint256 gameId, address wallet_, bytes32 agentKey_, bytes32 nonce_, uint16 causeId) internal {
        _registerWallet(wallet_, agentKey_, uint64(vm.getBlockTimestamp() + 1 hours), nonce_);

        uint256 entryFeeWei = game.getGame(gameId).entryFeeWei;
        vm.prank(wallet_);
        game.join{ value: entryFeeWei }(gameId, causeId);
    }

    function _joinHighCardinalityRoster(PrisonersDAOlemma targetGame, uint256 gameId, uint256 playerCount, uint256 entryFeeWei)
        internal
    {
        for (uint256 index = 0; index < playerCount; ++index) {
            address wallet = vm.addr(30_000 + index);
            bytes32 agentKey = keccak256(abi.encodePacked("no-winner-agent-", index));
            bytes32 nonce = keccak256(abi.encodePacked("no-winner-nonce-", index));
            uint16 causeId = index % 3 == 0 ? CAUSE_A : (index % 3 == 1 ? CAUSE_B : CAUSE_C);

            vm.deal(wallet, 2 ether);
            _registerWallet(wallet, agentKey, uint64(vm.getBlockTimestamp() + 1 hours), nonce);

            vm.prank(wallet);
            targetGame.join{ value: entryFeeWei }(gameId, causeId);
        }
    }

    function _commitRevealAllCatch(PrisonersDAOlemma targetGame, uint256 gameId, uint256 playerCount) internal {
        uint32 round = targetGame.getGame(gameId).round;

        for (uint256 index = 0; index < playerCount; ++index) {
            address wallet = vm.addr(30_000 + index);
            bytes32 salt = bytes32(uint256(40_000 + index));
            bytes32 commitment = targetGame.computeCommitment(gameId, round, wallet, PrisonersDAOlemma.Choice.Catch, salt);

            vm.prank(wallet);
            targetGame.commit(gameId, commitment);
        }

        targetGame.advancePhase(gameId);

        for (uint256 index = 0; index < playerCount; ++index) {
            address wallet = vm.addr(30_000 + index);
            bytes32 salt = bytes32(uint256(40_000 + index));

            vm.prank(wallet);
            targetGame.reveal(gameId, PrisonersDAOlemma.Choice.Catch, salt);
        }
    }

    function _assertHighCardinalityNoWinnerSettlement(PrisonersDAOlemma targetGame, uint256 gameId) internal view {
        PrisonersDAOlemma.GameSnapshot memory snapshot = targetGame.getGame(gameId);
        PrisonersDAOlemma.SettlementState memory settlement = targetGame.getSettlement(gameId);
        HighCardinalityNoWinnerExpectation memory expected =
            _buildHighCardinalityNoWinnerExpectation(targetGame.getGame(gameId).entryFeeWei);

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.NoWinners));
        assertEq(snapshot.joinedCount, 128);
        assertEq(snapshot.aliveCount, 0);
        assertEq(settlement.totalPotWei, expected.totalPotWei);
        assertEq(settlement.creatorFeeWei, expected.creatorFeeWei);
        assertEq(settlement.noWinnerCausePoolWei, expected.noWinnerCausePoolWei);
        assertEq(settlement.noWinnerCauseDistributedWei, expected.noWinnerCauseDistributedWei);
        assertEq(settlement.treasuryAccruedWei, expected.treasuryAccruedWei);

        assertEq(targetGame.gameCauseRoutedAmount(gameId, CAUSE_A), expected.causeAAmountWei);
        assertEq(targetGame.gameCauseRoutedAmount(gameId, CAUSE_B), expected.causeBAmountWei);
        assertEq(targetGame.gameCauseRoutedAmount(gameId, CAUSE_C), expected.causeCAmountWei);
        assertEq(targetGame.treasuryClaimableAmount(gameId), expected.treasuryAccruedWei);
    }

    function _buildHighCardinalityNoWinnerExpectation(uint256 entryFeeWei)
        internal
        pure
        returns (HighCardinalityNoWinnerExpectation memory expected)
    {
        uint256 playerCount = 128;
        uint256 causeACount = 43;
        uint256 causeBCount = 43;
        uint256 causeCCount = 42;

        expected.totalPotWei = playerCount * entryFeeWei;
        expected.creatorFeeWei = expected.totalPotWei / 100;
        expected.noWinnerCausePoolWei = (expected.totalPotWei - expected.creatorFeeWei) * 9_000 / 10_000;
        expected.causeAAmountWei = expected.noWinnerCausePoolWei * causeACount / playerCount;
        expected.causeBAmountWei = expected.noWinnerCausePoolWei * causeBCount / playerCount;
        expected.causeCAmountWei = expected.noWinnerCausePoolWei * causeCCount / playerCount;
        expected.noWinnerCauseDistributedWei =
            expected.causeAAmountWei + expected.causeBAmountWei + expected.causeCAmountWei;
        expected.treasuryAccruedWei = expected.totalPotWei - expected.noWinnerCauseDistributedWei;
    }

    function _commitmentFor(uint256 gameId, address wallet_, PrisonersDAOlemma.Choice choice_, bytes32 salt_)
        internal
        view
        returns (bytes32)
    {
        return game.computeCommitment(gameId, game.getGame(gameId).round, wallet_, choice_, salt_);
    }

    function _commitForPlayer(uint256 gameId, address wallet_, PrisonersDAOlemma.Choice choice_, bytes32 salt_)
        internal
        returns (bytes32 commitment)
    {
        commitment = _commitmentFor(gameId, wallet_, choice_, salt_);
        vm.prank(wallet_);
        game.commit(gameId, commitment);
    }

    function _revealForPlayer(uint256 gameId, address wallet_, PrisonersDAOlemma.Choice choice_, bytes32 salt_)
        internal
    {
        vm.prank(wallet_);
        game.reveal(gameId, choice_, salt_);
    }

    function _expectAdminWritesBlocked() internal {
        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.setTreasury(makeAddr("new-treasury"));

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.setAuthRegistry(makeAddr("new-auth-registry"));

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.configureDefaults(_configWith(0.002 ether, 2, 8, 4));

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.whitelistCause(99, makeAddr("late-cause"), keccak256("late-cause"));

        vm.expectRevert(PrisonersDAOlemma.UnsafePhase.selector);
        vm.prank(owner);
        game.removeCause(CAUSE_A);
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

    function _configWith(uint256 entryFeeWei, uint16 minPlayers, uint16 maxPlayers, uint16 maxCauses)
        internal
        pure
        returns (PrisonersDAOlemma.GameConfig memory)
    {
        return PrisonersDAOlemma.GameConfig({
            entryFeeWei: entryFeeWei,
            creatorFeeBps: 100,
            causeFeeBps: 100,
            joinDurationSeconds: 1 hours,
            commitDurationBlocks: 20,
            revealDurationBlocks: 20,
            minPlayers: minPlayers,
            maxPlayers: maxPlayers,
            maxCauses: maxCauses
        });
    }

    function _deployGame(PrisonersDAOlemma.GameConfig memory config) internal returns (PrisonersDAOlemma) {
        return new PrisonersDAOlemma(owner, treasury, address(registry), config);
    }

    function _whitelistDefaultCauses(PrisonersDAOlemma targetGame) internal {
        vm.startPrank(owner);
        targetGame.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        targetGame.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        targetGame.whitelistCause(CAUSE_C, causeCRecipient, keccak256("cause-c"));
        vm.stopPrank();
    }

    function _registerWallet(address wallet_, bytes32 agentKey_, uint64 expiresAt_, bytes32 nonce_) internal {
        AgentAuthRegistry.AuthPermit memory permit = AgentAuthRegistry.AuthPermit({
            wallet: wallet_,
            agentKey: agentKey_,
            manifestHash: keccak256(abi.encodePacked("manifest://", agentKey_)),
            chainId: block.chainid,
            gameNamespace: registry.gameNamespace(),
            issuedAt: uint64(vm.getBlockTimestamp()),
            expiresAt: expiresAt_,
            nonce: nonce_
        });

        bytes32 digest = registry.hashAuthPermit(permit);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, digest);

        vm.prank(wallet_);
        registry.registerAuth(permit, abi.encodePacked(r, s, v));
    }
}
