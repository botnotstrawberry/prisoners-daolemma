// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";

import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDaollema } from "../contracts/PrisonersDaollema.sol";

contract PrisonersDaollemaHandler is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;
    uint16 internal constant CAUSE_C = 3;
    uint256 internal constant MAX_TRACKED_GAMES = 4;

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry public registry;
    PrisonersDaollema public game;

    address public owner;
    address public verifier;
    address public treasury;
    address public causeARecipient;
    address public causeBRecipient;
    address public causeCRecipient;

    address[] internal _wallets;
    bytes32[] internal _agentKeys;
    uint16[] internal _causeIds;

    bool public invalidPhaseTransitionObserved;
    bool public shareStreakViolated;
    bool public duplicatePayoutObserved;
    bool public crossPayoutObserved;

    mapping(uint256 gameId => uint8 phase) internal _lastObservedPhase;
    mapping(uint256 gameId => mapping(uint32 round => mapping(address wallet => bytes32 salt))) internal _salts;
    mapping(uint256 gameId => mapping(uint32 round => mapping(address wallet => PrisonersDaollema.Choice choice)))
        internal _choices;

    constructor() {
        owner = vm.addr(ownerPk);
        verifier = vm.addr(verifierPk);
        treasury = makeAddr("invariant-treasury");
        causeARecipient = makeAddr("invariant-cause-a");
        causeBRecipient = makeAddr("invariant-cause-b");
        causeCRecipient = makeAddr("invariant-cause-c");

        registry = new AgentAuthRegistry(owner, verifier);
        game = new PrisonersDaollema(owner, treasury, address(registry), _defaultConfig());

        vm.startPrank(owner);
        game.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        game.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        game.whitelistCause(CAUSE_C, causeCRecipient, keccak256("cause-c"));
        vm.stopPrank();

        _causeIds.push(CAUSE_A);
        _causeIds.push(CAUSE_B);
        _causeIds.push(CAUSE_C);

        for (uint256 index = 0; index < 6; ++index) {
            address wallet = makeAddr(string.concat("handler-player-", vm.toString(index)));
            bytes32 agentKey = keccak256(abi.encodePacked("handler-agent-", index));

            _wallets.push(wallet);
            _agentKeys.push(agentKey);

            vm.deal(wallet, 100 ether);
            _registerWallet(wallet, agentKey, keccak256(abi.encodePacked("handler-nonce-", index)));
        }
    }

    function createGame() external {
        if (game.activeGameId() != 0) return;
        if (game.currentGameId() >= MAX_TRACKED_GAMES) return;

        vm.prank(owner);
        uint256 gameId = game.createGame();

        _observeGame(gameId);
    }

    function join(uint256 walletSeed, uint256 causeSeed) external {
        uint256 gameId = game.activeGameId();
        if (gameId == 0) return;

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        if (snapshot.phase != PrisonersDaollema.Phase.Joining) return;
        if (block.timestamp > snapshot.joinDeadline) return;
        if (snapshot.joinedCount >= snapshot.maxPlayers) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);
        if (player.joined) return;

        uint16 causeId = _causeIds[causeSeed % _causeIds.length];
        PrisonersDaollema.GameCauseState memory gameCause = game.getGameCause(gameId, causeId);
        if (!gameCause.used && snapshot.usedCauseCount >= snapshot.maxCauses) return;

        vm.prank(wallet);
        game.join{ value: snapshot.entryFeeWei }(gameId, causeId);

        _observeGame(gameId);
    }

    function advanceActiveGame() external {
        uint256 gameId = game.activeGameId();
        if (gameId == 0) return;

        PrisonersDaollema.GameSnapshot memory beforeSnapshot = game.getGame(gameId);

        if (beforeSnapshot.phase == PrisonersDaollema.Phase.Joining) {
            if (block.timestamp <= beforeSnapshot.joinDeadline) {
                vm.warp(beforeSnapshot.joinDeadline + 1);
            }
        } else if (beforeSnapshot.phase == PrisonersDaollema.Phase.Commit) {
            if (
                beforeSnapshot.committedCount != beforeSnapshot.aliveCount
                    && block.number <= beforeSnapshot.commitDeadlineBlock
            ) {
                vm.roll(beforeSnapshot.commitDeadlineBlock + 1);
            }
        } else if (beforeSnapshot.phase == PrisonersDaollema.Phase.Reveal) {
            if (
                beforeSnapshot.revealedCount != beforeSnapshot.committedCount
                    && block.number <= beforeSnapshot.revealDeadlineBlock
            ) {
                vm.roll(beforeSnapshot.revealDeadlineBlock + 1);
            }
        } else {
            return;
        }

        if (!game.canAdvancePhase(gameId)) return;

        game.advancePhase(gameId);

        if (beforeSnapshot.phase == PrisonersDaollema.Phase.Reveal) {
            _checkResolvedRound(gameId, beforeSnapshot);
        }

        _observeAllGames();
    }

    function commit(uint256 walletSeed, uint256 choiceSeed, bytes32 saltSeed) external {
        uint256 gameId = game.activeGameId();
        if (gameId == 0) return;

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        if (snapshot.phase != PrisonersDaollema.Phase.Commit) return;
        if (block.number > snapshot.commitDeadlineBlock) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);
        if (!player.joined || !player.alive || player.committedThisRound) return;

        PrisonersDaollema.Choice choice = PrisonersDaollema.Choice((choiceSeed % 3) + 1);
        bytes32 salt = keccak256(abi.encode(gameId, snapshot.round, wallet, saltSeed));
        bytes32 commitment = game.computeCommitment(gameId, snapshot.round, wallet, choice, salt);

        _salts[gameId][snapshot.round][wallet] = salt;
        _choices[gameId][snapshot.round][wallet] = choice;

        vm.prank(wallet);
        game.commit(gameId, commitment);

        _observeGame(gameId);
    }

    function reveal(uint256 walletSeed) external {
        uint256 gameId = game.activeGameId();
        if (gameId == 0) return;

        PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
        if (snapshot.phase != PrisonersDaollema.Phase.Reveal) return;
        if (block.number > snapshot.revealDeadlineBlock) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);
        if (!player.joined || !player.alive || !player.committedThisRound || player.revealedThisRound) return;

        bytes32 salt = _salts[gameId][snapshot.round][wallet];
        PrisonersDaollema.Choice choice = _choices[gameId][snapshot.round][wallet];
        if (salt == bytes32(0) || choice == PrisonersDaollema.Choice.Unset) return;

        vm.prank(wallet);
        game.reveal(gameId, choice, salt);

        _observeGame(gameId);
    }

    function claim(uint256 gameSeed, uint256 walletSeed) external {
        uint256 gameId = _selectGameId(gameSeed);
        if (gameId == 0) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        (,,, bool availableNow) = game.previewWinnerClaim(gameId, wallet);
        if (!availableNow) return;

        vm.prank(wallet);
        game.claim(gameId);
    }

    function claimRefund(uint256 gameSeed, uint256 walletSeed) external {
        uint256 gameId = _selectGameId(gameSeed);
        if (gameId == 0) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        (, bool availableNow) = game.previewRefund(gameId, wallet);
        if (!availableNow) return;

        vm.prank(wallet);
        game.claimRefund(gameId);
    }

    function withdrawTreasury(uint256 gameSeed) external {
        uint256 gameId = _selectGameId(gameSeed);
        if (gameId == 0) return;
        if (game.treasuryClaimableAmount(gameId) == 0) return;

        vm.prank(treasury);
        game.withdrawTreasury(gameId);
    }

    function withdrawCause(uint256 gameSeed, uint256 causeSeed) external {
        uint256 gameId = _selectGameId(gameSeed);
        if (gameId == 0) return;

        uint16 causeId = _causeIds[causeSeed % _causeIds.length];
        if (game.gameCauseClaimableAmount(gameId, causeId) == 0) return;

        address recipient = game.gameCauseRecipient(gameId, causeId);
        if (recipient == address(0)) return;

        vm.prank(recipient);
        game.withdrawCause(gameId, causeId);
    }

    function probeDuplicatePayouts(uint256 gameSeed, uint256 walletSeed) external {
        uint256 gameId = _selectGameId(gameSeed);
        if (gameId == 0) return;

        address wallet = _wallets[walletSeed % _wallets.length];
        PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);

        if (player.claimed) {
            vm.prank(wallet);
            (bool claimSucceeded,) = address(game).call(abi.encodeCall(PrisonersDaollema.claim, (gameId)));
            if (claimSucceeded) duplicatePayoutObserved = true;

            vm.prank(wallet);
            (bool refundSucceeded,) = address(game).call(abi.encodeCall(PrisonersDaollema.claimRefund, (gameId)));
            if (refundSucceeded) crossPayoutObserved = true;
        }

        if (player.refunded) {
            vm.prank(wallet);
            (bool refundSucceeded,) = address(game).call(abi.encodeCall(PrisonersDaollema.claimRefund, (gameId)));
            if (refundSucceeded) duplicatePayoutObserved = true;

            vm.prank(wallet);
            (bool claimSucceeded,) = address(game).call(abi.encodeCall(PrisonersDaollema.claim, (gameId)));
            if (claimSucceeded) crossPayoutObserved = true;
        }
    }

    function walletCount() external view returns (uint256) {
        return _wallets.length;
    }

    function walletAt(uint256 index) external view returns (address) {
        return _wallets[index];
    }

    function causeCount() external view returns (uint256) {
        return _causeIds.length;
    }

    function causeAt(uint256 index) external view returns (uint16) {
        return _causeIds[index];
    }

    function _selectGameId(uint256 seed) internal view returns (uint256) {
        uint256 totalGames = game.currentGameId();
        if (totalGames == 0) return 0;
        return (seed % totalGames) + 1;
    }

    function _observeAllGames() internal {
        uint256 totalGames = game.currentGameId();
        for (uint256 gameId = 1; gameId <= totalGames; ++gameId) {
            _observeGame(gameId);
        }
    }

    function _observeGame(uint256 gameId) internal {
        uint8 currentPhase = uint8(game.getGame(gameId).phase);
        uint8 previousPhase = _lastObservedPhase[gameId];

        if (previousPhase != 0 && !_isAllowedTransition(previousPhase, currentPhase)) {
            invalidPhaseTransitionObserved = true;
        }

        _lastObservedPhase[gameId] = currentPhase;
    }

    function _isAllowedTransition(uint8 previousPhase, uint8 currentPhase) internal pure returns (bool) {
        if (previousPhase == currentPhase) return true;

        uint8 joining = uint8(PrisonersDaollema.Phase.Joining);
        uint8 commitPhase = uint8(PrisonersDaollema.Phase.Commit);
        uint8 revealPhase = uint8(PrisonersDaollema.Phase.Reveal);
        uint8 ended = uint8(PrisonersDaollema.Phase.Ended);
        uint8 cancelled = uint8(PrisonersDaollema.Phase.Cancelled);

        if (previousPhase == joining) {
            return currentPhase == commitPhase || currentPhase == cancelled;
        }

        if (previousPhase == commitPhase) {
            return currentPhase == revealPhase;
        }

        if (previousPhase == revealPhase) {
            return currentPhase == commitPhase || currentPhase == ended;
        }

        if (previousPhase == ended || previousPhase == cancelled) {
            return false;
        }

        return false;
    }

    function _checkResolvedRound(uint256 gameId, PrisonersDaollema.GameSnapshot memory beforeSnapshot) internal {
        uint32 resolvedRound = beforeSnapshot.round;
        uint256 rosterLength = game.playerCount(gameId);

        bool sawChoice;
        bool hasShare;
        bool hasCatch;
        bool hasSteal;

        for (uint256 index = 0; index < rosterLength; ++index) {
            address wallet = game.playerAt(gameId, index);
            PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);
            if (player.lastChoiceRound != resolvedRound) continue;

            sawChoice = true;

            if (player.effectiveChoice == PrisonersDaollema.Choice.Share) {
                hasShare = true;
            } else if (player.effectiveChoice == PrisonersDaollema.Choice.Catch) {
                hasCatch = true;
            } else if (player.effectiveChoice == PrisonersDaollema.Choice.Steal) {
                hasSteal = true;
            }
        }

        if (!sawChoice) {
            shareStreakViolated = true;
            return;
        }

        uint32 expectedShareStreak = (hasShare && !hasCatch && !hasSteal) ? beforeSnapshot.shareStreak + 1 : 0;
        if (game.getGame(gameId).shareStreak != expectedShareStreak) {
            shareStreakViolated = true;
        }
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

contract PrisonersDaollemaInvariantTest is StdInvariant, Test {
    PrisonersDaollemaHandler internal handler;
    PrisonersDaollema internal game;

    function setUp() public {
        handler = new PrisonersDaollemaHandler();
        game = PrisonersDaollema(address(handler.game()));

        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = PrisonersDaollemaHandler.createGame.selector;
        selectors[1] = PrisonersDaollemaHandler.join.selector;
        selectors[2] = PrisonersDaollemaHandler.advanceActiveGame.selector;
        selectors[3] = PrisonersDaollemaHandler.commit.selector;
        selectors[4] = PrisonersDaollemaHandler.reveal.selector;
        selectors[5] = PrisonersDaollemaHandler.claim.selector;
        selectors[6] = PrisonersDaollemaHandler.claimRefund.selector;
        selectors[7] = PrisonersDaollemaHandler.withdrawTreasury.selector;
        selectors[8] = PrisonersDaollemaHandler.withdrawCause.selector;
        selectors[9] = PrisonersDaollemaHandler.probeDuplicatePayouts.selector;

        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariant_phase_progress_and_terminal_state_consistency() public view {
        assertFalse(handler.invalidPhaseTransitionObserved());
        assertFalse(handler.shareStreakViolated());

        uint256 totalGames = game.currentGameId();
        uint256 activeGameId = game.activeGameId();
        uint256 nonTerminalGames;

        for (uint256 gameId = 1; gameId <= totalGames; ++gameId) {
            PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);

            if (
                snapshot.phase == PrisonersDaollema.Phase.Joining || snapshot.phase == PrisonersDaollema.Phase.Commit
                    || snapshot.phase == PrisonersDaollema.Phase.Reveal
            ) {
                nonTerminalGames += 1;
                assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Unset));
                assertEq(activeGameId, gameId);
            } else if (snapshot.phase == PrisonersDaollema.Phase.Ended) {
                assertTrue(
                    snapshot.outcome == PrisonersDaollema.Outcome.Winners
                        || snapshot.outcome == PrisonersDaollema.Outcome.NoWinners
                );
                assertTrue(activeGameId != gameId);

                if (snapshot.outcome == PrisonersDaollema.Outcome.Winners) {
                    assertGt(snapshot.aliveCount, 0);
                }

                if (snapshot.outcome == PrisonersDaollema.Outcome.NoWinners) {
                    assertEq(snapshot.aliveCount, 0);
                }
            } else if (snapshot.phase == PrisonersDaollema.Phase.Cancelled) {
                assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Cancelled));
                assertTrue(activeGameId != gameId);
                assertLt(snapshot.joinedCount, snapshot.minPlayers);
            }
        }

        assertLe(nonTerminalGames, 1);
        assertEq(nonTerminalGames == 0 ? 0 : 1, activeGameId == 0 ? 0 : 1);
    }

    function invariant_identity_and_roster_accounting_hold_per_game() public view {
        uint256 totalGames = game.currentGameId();

        for (uint256 gameId = 1; gameId <= totalGames; ++gameId) {
            PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
            uint256 rosterLength = game.playerCount(gameId);
            uint256 usedCauseLength = game.gameCauseCount(gameId);
            uint256 aliveCount;
            uint256 entrantSum;

            assertEq(rosterLength, snapshot.joinedCount);
            assertEq(usedCauseLength, snapshot.usedCauseCount);

            for (uint256 i = 0; i < rosterLength; ++i) {
                address wallet = game.playerAt(gameId, i);
                PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);

                assertTrue(player.joined);
                assertTrue(player.agentKey != bytes32(0));

                if (player.alive) {
                    aliveCount += 1;
                }

                for (uint256 j = i + 1; j < rosterLength; ++j) {
                    address otherWallet = game.playerAt(gameId, j);
                    PrisonersDaollema.PlayerState memory otherPlayer = game.getPlayer(gameId, otherWallet);

                    assertTrue(wallet != otherWallet);
                    assertTrue(player.agentKey != otherPlayer.agentKey);
                }
            }

            for (uint256 index = 0; index < usedCauseLength; ++index) {
                uint16 causeId = game.gameCauseAt(gameId, index);
                PrisonersDaollema.GameCauseState memory causeState = game.getGameCause(gameId, causeId);

                assertTrue(causeState.used);
                entrantSum += causeState.entrantCount;
            }

            assertEq(aliveCount, snapshot.aliveCount);
            assertEq(entrantSum, snapshot.joinedCount);
        }
    }

    function invariant_settlement_bounds_and_payout_paths_remain_exclusive() public view {
        uint256 totalGames = game.currentGameId();

        for (uint256 gameId = 1; gameId <= totalGames; ++gameId) {
            PrisonersDaollema.GameSnapshot memory snapshot = game.getGame(gameId);
            PrisonersDaollema.SettlementState memory settlement = game.getSettlement(gameId);
            uint256 rosterLength = game.playerCount(gameId);
            uint256 usedCauseLength = game.gameCauseCount(gameId);

            uint256 claimedCount;
            uint256 refundedCount;
            uint256 claimedNetWei;
            uint256 totalCauseRoutedWei;

            assertLe(settlement.treasuryWithdrawnWei, settlement.treasuryAccruedWei);

            for (uint256 index = 0; index < usedCauseLength; ++index) {
                uint16 causeId = game.gameCauseAt(gameId, index);
                uint256 routedWei = game.gameCauseRoutedAmount(gameId, causeId);
                uint256 withdrawnWei = game.gameCauseWithdrawnAmount(gameId, causeId);

                assertLe(withdrawnWei, routedWei);
                totalCauseRoutedWei += routedWei;
            }

            for (uint256 index = 0; index < rosterLength; ++index) {
                address wallet = game.playerAt(gameId, index);
                PrisonersDaollema.PlayerState memory player = game.getPlayer(gameId, wallet);

                assertFalse(player.claimed && player.refunded);

                if (player.claimed) {
                    claimedCount += 1;
                    (, uint256 causeCutWei, uint256 netPrizeWei,) = game.previewWinnerClaim(gameId, wallet);
                    claimedNetWei += netPrizeWei;
                    assertLe(causeCutWei, totalCauseRoutedWei);
                }

                if (player.refunded) {
                    refundedCount += 1;
                }
            }

            if (
                snapshot.phase == PrisonersDaollema.Phase.Joining || snapshot.phase == PrisonersDaollema.Phase.Commit
                    || snapshot.phase == PrisonersDaollema.Phase.Reveal
            ) {
                assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Unset));
                assertFalse(settlement.finalized);
                continue;
            }

            assertTrue(settlement.finalized);
            assertEq(settlement.totalPotWei, snapshot.entryFeeWei * uint256(snapshot.joinedCount));

            if (snapshot.phase == PrisonersDaollema.Phase.Cancelled) {
                assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.Cancelled));
                assertEq(claimedCount, 0);
                assertEq(totalCauseRoutedWei, 0);
                assertEq(settlement.creatorFeeWei, 0);
                assertEq(settlement.treasuryAccruedWei, 0);
                assertEq(settlement.winnerShareWei, 0);
                assertEq(settlement.winnerCount, 0);
                assertEq(settlement.refundPerPlayerWei, snapshot.entryFeeWei);
                assertLe(refundedCount * settlement.refundPerPlayerWei, settlement.totalPotWei);
                continue;
            }

            assertEq(refundedCount, 0);
            assertEq(settlement.refundPerPlayerWei, 0);

            if (snapshot.outcome == PrisonersDaollema.Outcome.Winners) {
                uint256 winnerPoolWei = settlement.winnerShareWei * uint256(settlement.winnerCount);

                assertEq(settlement.winnerCount, snapshot.aliveCount);
                assertGt(settlement.winnerCount, 0);
                assertEq(settlement.noWinnerCausePoolWei, 0);
                assertEq(settlement.noWinnerCauseDistributedWei, 0);
                assertEq(winnerPoolWei + settlement.treasuryAccruedWei, settlement.totalPotWei);
                assertLe(claimedCount, settlement.winnerCount);
                assertLe(claimedNetWei + totalCauseRoutedWei + settlement.treasuryAccruedWei, settlement.totalPotWei);
            } else {
                assertEq(uint256(snapshot.outcome), uint256(PrisonersDaollema.Outcome.NoWinners));
                assertEq(snapshot.aliveCount, 0);
                assertEq(settlement.winnerCount, 0);
                assertEq(settlement.winnerShareWei, 0);
                assertEq(claimedCount, 0);
                assertEq(totalCauseRoutedWei, settlement.noWinnerCauseDistributedWei);
                assertEq(totalCauseRoutedWei + settlement.treasuryAccruedWei, settlement.totalPotWei);
            }
        }
    }

    function invariant_duplicate_claims_and_cross_path_payouts_never_succeed() public view {
        assertFalse(handler.duplicatePayoutObserved());
        assertFalse(handler.crossPayoutObserved());
    }
}
