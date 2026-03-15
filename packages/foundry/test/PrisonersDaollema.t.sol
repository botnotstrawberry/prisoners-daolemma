// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDaollema } from "../contracts/PrisonersDaollema.sol";

contract PrisonersDaollemaTest is Test {
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

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry internal registry;
    PrisonersDaollema internal game;

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
        game = new PrisonersDaollema(owner, treasury, address(registry), _defaultConfig());

        vm.startPrank(owner);
        game.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        game.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        game.whitelistCause(CAUSE_C, causeCRecipient, keccak256("cause-c"));
        vm.stopPrank();
    }

    function testConstructorStoresCoreAddressesAndDefaultConfig() public view {
        PrisonersDaollema.GameConfig memory config = game.getDefaultConfig();

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

        PrisonersDaollema.CauseDefinition memory causeA = game.getCause(CAUSE_A);
        assertTrue(causeA.active);
        assertEq(causeA.recipient, causeARecipient);
        assertEq(causeA.metadataHash, keccak256("cause-a"));

        vm.prank(owner);
        game.removeCause(CAUSE_B);

        PrisonersDaollema.CauseDefinition memory causeB = game.getCause(CAUSE_B);
        assertFalse(causeB.active);
        assertEq(game.activeCauseCount(), 2);
        assertFalse(game.isCauseWhitelisted(CAUSE_B));
    }

    function testCreateGameStartsJoiningAndSnapshotsDefaults() public {
        uint256 expectedDeadline = block.timestamp + _defaultConfig().joinDurationSeconds;

        vm.prank(owner);
        uint256 gameId = game.createGame();

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        assertEq(gameId, 1);
        assertEq(game.currentGameId(), 1);
        assertEq(game.activeGameId(), 1);
        assertEq(snapshot.entryFeeWei, 0.001 ether);
        assertEq(snapshot.treasury, treasury);
        assertEq(snapshot.minPlayers, 2);
        assertEq(snapshot.maxPlayers, 4);
        assertEq(snapshot.maxCauses, 2);
        assertEq(snapshot.createdAt, block.timestamp);
        assertEq(snapshot.joinDeadline, expectedDeadline);
        assertEq(snapshot.round, 0);
        assertEq(snapshot.committedCount, 0);
        assertEq(snapshot.revealedCount, 0);
        assertEq(uint256(snapshot.phase), uint256(PrisonersDaollema.Phase.Joining));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Unset));
        assertTrue(game.gameExists(gameId));
    }

    function testCreateGameRequiresAtLeastOneWhitelistedCause() public {
        PrisonersDaollema emptyGame = new PrisonersDaollema(owner, treasury, address(registry), _defaultConfig());

        vm.expectRevert(PrisonersDaollema.NoWhitelistedCauses.selector);
        vm.prank(owner);
        emptyGame.createGame();
    }

    function testCreateGameRequiresIdlePhase() public {
        vm.prank(owner);
        game.createGame();

        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.createGame();
    }

    function testRejectsInvalidGameConfigBounds() public {
        PrisonersDaollema.GameConfig memory invalidConfig = _defaultConfig();

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
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-admission"));

        assertTrue(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);
    }

    function testJoinRejectsUnauthorizedWallet() public {
        uint256 gameId = _createGame();

        vm.expectRevert(PrisonersDaollema.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsExpiredAuthAndAdmissionViewTurnsFalse() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 10), keccak256("nonce-expired"));

        vm.warp(block.timestamp + 11);

        assertFalse(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);

        vm.expectRevert(PrisonersDaollema.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsRevokedAuthAndAdmissionViewTurnsFalse() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-revoked"));

        vm.prank(owner);
        registry.revokeAuth(player1);

        assertFalse(game.isAdmissionReady(player1));
        assertEq(game.admissionAgentKey(player1), PLAYER1_AGENT);

        vm.expectRevert(PrisonersDaollema.UnauthorizedWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsDuplicateWalletPerGame() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-wallet-1"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDaollema.DuplicateWallet.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);
    }

    function testJoinRejectsDuplicateAgentKeyPerGame() public {
        uint256 gameId = _createGame();
        bytes32 sharedAgentKey = keccak256("shared-agent");

        _registerWallet(player1, sharedAgentKey, uint64(block.timestamp + 1 hours), keccak256("nonce-agent-1"));
        _registerWallet(player2, sharedAgentKey, uint64(block.timestamp + 1 hours), keccak256("nonce-agent-2"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDaollema.DuplicateAgentKey.selector);
        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testJoinRejectsInvalidCause() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-invalid-cause"));

        vm.expectRevert(PrisonersDaollema.InvalidCause.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, 999);
    }

    function testJoinRequiresExactEntryFee() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-entry-fee"));

        vm.expectRevert(PrisonersDaollema.EntryFeeMismatch.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether - 1 }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDaollema.EntryFeeMismatch.selector);
        vm.prank(player1);
        game.join{ value: 0.001 ether + 1 }(gameId, CAUSE_A);
    }

    function testJoinEnforcesMaxPlayers() public {
        PrisonersDaollema limitedGame = _deployGame(_configWith(0.001 ether, 2, 2, 2));
        _whitelistDefaultCauses(limitedGame);

        vm.prank(owner);
        uint256 gameId = limitedGame.createGame();

        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-players-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-players-2"));
        _registerWallet(player3, PLAYER3_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-players-3"));

        vm.prank(player1);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_B);

        vm.expectRevert(PrisonersDaollema.MaxPlayersReached.selector);
        vm.prank(player3);
        limitedGame.join{ value: 0.001 ether }(gameId, CAUSE_C);
    }

    function testJoinEnforcesMaxCausesButAllowsExistingCauseReuse() public {
        PrisonersDaollema singleCauseGame = _deployGame(_configWith(0.001 ether, 2, 4, 1));
        _whitelistDefaultCauses(singleCauseGame);

        vm.prank(owner);
        uint256 gameId = singleCauseGame.createGame();

        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-causes-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-causes-2"));
        _registerWallet(player3, PLAYER3_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-max-causes-3"));

        vm.prank(player1);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.expectRevert(PrisonersDaollema.MaxCausesReached.selector);
        vm.prank(player3);
        singleCauseGame.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testJoinStoresPlayerStateRosterAndCauseSnapshotReads() public {
        uint256 gameId = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-read-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-read-2"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, player1);
        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        PrisonersDaollema.GameCauseState memory gameCause = game.getGameCause(gameId, CAUSE_A);

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
        assertEq(uint256(player.revealedChoice), uint256(PrisonersDaollema.Choice.Unset));

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
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-deadline-1"));
        _registerWallet(player2, PLAYER2_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-deadline-2"));

        uint64 joinDeadline = game.getGame(gameId).joinDeadline;

        vm.warp(joinDeadline);
        assertFalse(game.canAdvancePhase(gameId));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId, CAUSE_A);

        vm.warp(joinDeadline + 1);
        assertTrue(game.canAdvancePhase(gameId));

        vm.expectRevert(PrisonersDaollema.JoinWindowClosed.selector);
        vm.prank(player2);
        game.join{ value: 0.001 ether }(gameId, CAUSE_B);
    }

    function testAdvancePhaseMovesJoiningToCommitAfterDeadlineWhenMinPlayersMet() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-advance-join-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-advance-join-2"), CAUSE_B);

        vm.expectRevert(PrisonersDaollema.JoinWindowStillOpen.selector);
        game.advancePhase(gameId);

        PrisonersDaollema.GameSnapshot memory joiningSnapshot = game.getGame(gameId);
        vm.warp(joiningSnapshot.joinDeadline + 1);

        game.advancePhase(gameId);

        PrisonersDaollema.GameSnapshot memory commitSnapshot = game.getGame(gameId);
        assertEq(uint256(commitSnapshot.phase), uint256(PrisonersDaollema.Phase.Commit));
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

        PrisonersDaollema.GameSnapshot memory cancelledGame = game.getGame(gameId);
        assertEq(game.activeGameId(), 0);
        assertEq(uint256(cancelledGame.phase), uint256(PrisonersDaollema.Phase.Cancelled));
        assertEq(uint256(cancelledGame.outcome), uint256(PrisonersDaollema.Outcome.Cancelled));
    }

    function testCancelIfInsufficientPlayersRejectsWhileJoinWindowIsStillOpen() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-open"), CAUSE_A);

        vm.expectRevert(PrisonersDaollema.JoinWindowStillOpen.selector);
        game.cancelIfInsufficientPlayers(gameId);
    }

    function testCancelIfInsufficientPlayersRejectsOnceMinimumPlayersMet() public {
        uint256 gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-met-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-cancel-met-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);

        vm.expectRevert(PrisonersDaollema.MinimumPlayersMet.selector);
        game.cancelIfInsufficientPlayers(gameId);
    }

    function testCancelIfInsufficientPlayersRejectsMissingGame() public {
        vm.expectRevert(PrisonersDaollema.MissingGame.selector);
        game.cancelIfInsufficientPlayers(999);
    }

    function testCommitRequiresJoinedPlayerStoresHashAndRejectsDuplicateCommit() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        bytes32 commitment = _commitmentFor(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        vm.prank(player1);
        game.commit(gameId, commitment);

        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, player1);
        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);

        assertTrue(player.committedThisRound);
        assertFalse(player.revealedThisRound);
        assertEq(player.commitment, commitment);
        assertEq(uint256(player.revealedChoice), uint256(PrisonersDaollema.Choice.Unset));
        assertEq(snapshot.committedCount, 1);
        assertEq(snapshot.revealedCount, 0);

        vm.expectRevert(PrisonersDaollema.DuplicateCommit.selector);
        vm.prank(player1);
        game.commit(gameId, commitment);

        bytes32 outsiderCommitment = _commitmentFor(gameId, player4, PrisonersDaollema.Choice.Catch, SALT_2);
        vm.expectRevert(PrisonersDaollema.PlayerNotJoined.selector);
        vm.prank(player4);
        game.commit(gameId, outsiderCommitment);
    }

    function testAdvancePhaseMovesCommitToRevealEarlyWhenEveryoneCommitted() public {
        uint256 gameId = _advanceDefaultGameToCommit();

        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDaollema.Choice.Catch, SALT_2);

        assertTrue(game.canAdvancePhase(gameId));
        game.advancePhase(gameId);

        PrisonersDaollema.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertEq(uint256(revealSnapshot.phase), uint256(PrisonersDaollema.Phase.Reveal));
        assertEq(revealSnapshot.round, 1);
        assertEq(revealSnapshot.commitDeadlineBlock, game.getGame(gameId).commitDeadlineBlock);
        assertEq(revealSnapshot.revealDeadlineBlock, block.number + _defaultConfig().revealDurationBlocks);
        assertEq(revealSnapshot.committedCount, 2);
        assertEq(revealSnapshot.revealedCount, 0);
        assertFalse(game.canAdvancePhase(gameId));
    }

    function testCommitAllowsLastValidBlock() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        PrisonersDaollema.GameSnapshot memory commitSnapshot = game.getGame(gameId);

        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        bytes32 player2Commitment = _commitmentFor(gameId, player2, PrisonersDaollema.Choice.Steal, SALT_2);
        vm.roll(commitSnapshot.commitDeadlineBlock);
        vm.prank(player2);
        game.commit(gameId, player2Commitment);

        PrisonersDaollema.PlayerState memory player2State = game.getPlayer(gameId, player2);
        assertTrue(player2State.committedThisRound);
    }

    function testCommitBecomesAdvanceableOnlyAfterDeadlineWhenNotEveryoneCommitted() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        PrisonersDaollema.GameSnapshot memory commitSnapshot = game.getGame(gameId);

        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        vm.roll(commitSnapshot.commitDeadlineBlock);
        assertFalse(game.canAdvancePhase(gameId));

        vm.roll(commitSnapshot.commitDeadlineBlock + 1);
        assertTrue(game.canAdvancePhase(gameId));
        game.advancePhase(gameId);

        PrisonersDaollema.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertEq(uint256(revealSnapshot.phase), uint256(PrisonersDaollema.Phase.Reveal));
    }

    function testRevealRejectsWithoutCommitInvalidPreimageAndDuplicateReveal() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        PrisonersDaollema.GameSnapshot memory commitSnapshot = game.getGame(gameId);
        vm.roll(commitSnapshot.commitDeadlineBlock + 1);
        game.advancePhase(gameId);

        vm.expectRevert(PrisonersDaollema.MissingCommitment.selector);
        vm.prank(player2);
        game.reveal(gameId, PrisonersDaollema.Choice.Catch, SALT_2);

        vm.expectRevert(PrisonersDaollema.InvalidRevealPreimage.selector);
        vm.prank(player1);
        game.reveal(gameId, PrisonersDaollema.Choice.Share, SALT_2);

        vm.prank(player1);
        game.reveal(gameId, PrisonersDaollema.Choice.Share, SALT_1);

        PrisonersDaollema.PlayerState memory player1State = game.getPlayer(gameId, player1);
        PrisonersDaollema.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        assertTrue(player1State.revealedThisRound);
        assertEq(uint256(player1State.revealedChoice), uint256(PrisonersDaollema.Choice.Share));
        assertEq(revealSnapshot.revealedCount, 1);

        vm.expectRevert(PrisonersDaollema.DuplicateReveal.selector);
        vm.prank(player1);
        game.reveal(gameId, PrisonersDaollema.Choice.Share, SALT_1);
    }

    function testRevealEarlyReadinessWhenAllCommittedPlayersReveal() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDaollema.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        assertFalse(game.isRoundReadyForResolution(gameId));

        _revealForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        assertFalse(game.isRoundReadyForResolution(gameId));

        _revealForPlayer(gameId, player2, PrisonersDaollema.Choice.Catch, SALT_2);
        assertTrue(game.isRoundReadyForResolution(gameId));
    }

    function testRevealAllowsLastValidBlock() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDaollema.Choice.Steal, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        PrisonersDaollema.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        vm.roll(revealSnapshot.revealDeadlineBlock);
        _revealForPlayer(gameId, player2, PrisonersDaollema.Choice.Steal, SALT_2);

        assertTrue(game.isRoundReadyForResolution(gameId));
    }

    function testRevealBecomesReadyAfterDeadlineWhenNotEveryoneReveals() public {
        uint256 gameId = _advanceDefaultGameToCommit();
        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDaollema.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);

        PrisonersDaollema.GameSnapshot memory revealSnapshot = game.getGame(gameId);
        vm.roll(revealSnapshot.revealDeadlineBlock);
        assertFalse(game.isRoundReadyForResolution(gameId));

        vm.roll(revealSnapshot.revealDeadlineBlock + 1);
        assertTrue(game.isRoundReadyForResolution(gameId));

        vm.expectRevert(PrisonersDaollema.RevealWindowClosed.selector);
        vm.prank(player2);
        game.reveal(gameId, PrisonersDaollema.Choice.Catch, SALT_2);
    }

    function testAdminConfigAndCauseWritesAreBlockedThroughCommitAndRevealPhases() public {
        uint256 gameId = _createGame();
        _expectAdminWritesBlocked();

        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-admin-join-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-admin-join-2"), CAUSE_B);
        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        _expectAdminWritesBlocked();

        _commitForPlayer(gameId, player1, PrisonersDaollema.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDaollema.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _expectAdminWritesBlocked();
    }

    function testCancelIfInsufficientPlayersSnapshotsOldGameAndReleasesActiveSlot() public {
        uint256 gameId1 = _createGame();
        _registerWallet(player1, PLAYER1_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-snapshot-1"));

        vm.prank(player1);
        game.join{ value: 0.001 ether }(gameId1, CAUSE_A);

        PrisonersDaollema.GameSnapshot memory game1BeforeCancel = game.getGame(gameId1);
        assertEq(game1BeforeCancel.entryFeeWei, 0.001 ether);
        assertEq(game1BeforeCancel.treasury, treasury);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_A), causeARecipient);

        vm.warp(game1BeforeCancel.joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId1);

        PrisonersDaollema.GameSnapshot memory cancelledGame = game.getGame(gameId1);

        assertEq(game.activeGameId(), 0);
        assertEq(uint256(cancelledGame.phase), uint256(PrisonersDaollema.Phase.Cancelled));
        assertEq(uint256(cancelledGame.outcome), uint256(PrisonersDaollema.Outcome.Cancelled));

        address updatedTreasury = makeAddr("updated-treasury");
        address updatedCauseARecipient = makeAddr("cause-a-recipient-updated");

        vm.startPrank(owner);
        game.setTreasury(updatedTreasury);
        game.configureDefaults(_configWith(0.002 ether, 2, 4, 2));
        game.whitelistCause(CAUSE_A, updatedCauseARecipient, keccak256("cause-a-updated"));
        uint256 gameId2 = game.createGame();
        vm.stopPrank();

        _registerWallet(player2, PLAYER2_AGENT, uint64(block.timestamp + 1 hours), keccak256("nonce-snapshot-2"));
        vm.prank(player2);
        game.join{ value: 0.002 ether }(gameId2, CAUSE_A);

        PrisonersDaollema.GameSnapshot memory game1AfterChanges = game.getGame(gameId1);
        PrisonersDaollema.GameSnapshot memory game2 = game.getGame(gameId2);
        PrisonersDaollema.GameCauseState memory game1Cause = game.getGameCause(gameId1, CAUSE_A);
        PrisonersDaollema.GameCauseState memory game2Cause = game.getGameCause(gameId2, CAUSE_A);

        assertEq(game1AfterChanges.entryFeeWei, 0.001 ether);
        assertEq(game1AfterChanges.treasury, treasury);
        assertEq(game2.entryFeeWei, 0.002 ether);
        assertEq(game2.treasury, updatedTreasury);
        assertEq(game.gameCauseRecipient(gameId1, CAUSE_A), causeARecipient);
        assertEq(game.gameCauseRecipient(gameId2, CAUSE_A), updatedCauseARecipient);
        assertEq(game1Cause.metadataHash, keccak256("cause-a"));
        assertEq(game2Cause.metadataHash, keccak256("cause-a-updated"));
    }

    function _assertInvalidConfig(PrisonersDaollema.GameConfig memory invalidConfig) internal {
        vm.expectRevert(PrisonersDaollema.InvalidGameConfig.selector);
        new PrisonersDaollema(owner, treasury, address(registry), invalidConfig);

        vm.expectRevert(PrisonersDaollema.InvalidGameConfig.selector);
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

    function _joinPlayer(uint256 gameId, address wallet_, bytes32 agentKey_, bytes32 nonce_, uint16 causeId) internal {
        _registerWallet(wallet_, agentKey_, uint64(block.timestamp + 1 hours), nonce_);

        vm.prank(wallet_);
        game.join{ value: _defaultConfig().entryFeeWei }(gameId, causeId);
    }

    function _commitmentFor(uint256 gameId, address wallet_, PrisonersDaollema.Choice choice_, bytes32 salt_)
        internal
        view
        returns (bytes32)
    {
        return game.computeCommitment(gameId, game.getGame(gameId).round, wallet_, choice_, salt_);
    }

    function _commitForPlayer(uint256 gameId, address wallet_, PrisonersDaollema.Choice choice_, bytes32 salt_)
        internal
        returns (bytes32 commitment)
    {
        commitment = _commitmentFor(gameId, wallet_, choice_, salt_);
        vm.prank(wallet_);
        game.commit(gameId, commitment);
    }

    function _revealForPlayer(uint256 gameId, address wallet_, PrisonersDaollema.Choice choice_, bytes32 salt_)
        internal
    {
        vm.prank(wallet_);
        game.reveal(gameId, choice_, salt_);
    }

    function _expectAdminWritesBlocked() internal {
        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.setTreasury(makeAddr("new-treasury"));

        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.setAuthRegistry(makeAddr("new-auth-registry"));

        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.configureDefaults(_configWith(0.002 ether, 2, 8, 4));

        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.whitelistCause(99, makeAddr("late-cause"), keccak256("late-cause"));

        vm.expectRevert(PrisonersDaollema.UnsafePhase.selector);
        vm.prank(owner);
        game.removeCause(CAUSE_A);
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

    function _configWith(uint256 entryFeeWei, uint16 minPlayers, uint16 maxPlayers, uint16 maxCauses)
        internal
        pure
        returns (PrisonersDaollema.GameConfig memory)
    {
        return PrisonersDaollema.GameConfig({
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

    function _deployGame(PrisonersDaollema.GameConfig memory config) internal returns (PrisonersDaollema) {
        return new PrisonersDaollema(owner, treasury, address(registry), config);
    }

    function _whitelistDefaultCauses(PrisonersDaollema targetGame) internal {
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
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt_,
            nonce: nonce_
        });

        bytes32 digest = registry.hashAuthPermit(permit);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, digest);

        vm.prank(wallet_);
        registry.registerAuth(permit, abi.encodePacked(r, s, v));
    }
}
