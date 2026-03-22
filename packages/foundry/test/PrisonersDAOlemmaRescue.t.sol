// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { PrisonersDAOlemma } from "../contracts/PrisonersDAOlemma.sol";

contract RescueTokenMock is ERC20 {
    constructor() ERC20("Rescue Token", "RSC") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ForceSendETH {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

contract PrisonersDAOlemmaRescueTest is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;

    bytes32 internal constant PLAYER1_AGENT = keccak256("agent-alpha");
    bytes32 internal constant PLAYER2_AGENT = keccak256("agent-beta");

    bytes32 internal constant SALT_1 = keccak256("salt-1");
    bytes32 internal constant SALT_2 = keccak256("salt-2");

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;

    AgentAuthRegistry internal registry;
    PrisonersDAOlemma internal game;

    address internal owner;
    address internal verifier;
    address internal treasury;
    address internal causeARecipient;
    address internal causeBRecipient;
    address internal player1;
    address internal player2;

    event ForeignTokenRescued(address indexed token, address indexed to, uint256 amount);
    event ExcessETHRescued(address indexed to, uint256 amount);

    function setUp() public {
        owner = vm.addr(ownerPk);
        verifier = vm.addr(verifierPk);
        treasury = makeAddr("treasury");
        causeARecipient = makeAddr("cause-a-recipient");
        causeBRecipient = makeAddr("cause-b-recipient");
        player1 = makeAddr("player-1");
        player2 = makeAddr("player-2");

        vm.deal(player1, 10 ether);
        vm.deal(player2, 10 ether);

        registry = new AgentAuthRegistry(owner, verifier);
        game = new PrisonersDAOlemma(owner, treasury, address(registry), _defaultConfig());

        vm.startPrank(owner);
        game.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        game.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        vm.stopPrank();
    }

    function testRescueERC20TransfersAccidentalTokensWhenIdle() public {
        RescueTokenMock token = new RescueTokenMock();
        address recipient = makeAddr("erc20-recipient");
        uint256 amount = 125 ether;

        token.mint(address(this), amount);
        token.transfer(address(game), amount);

        vm.expectEmit(true, true, false, true, address(game));
        emit ForeignTokenRescued(address(token), recipient, amount);

        vm.prank(owner);
        game.rescueERC20(address(token), recipient, amount);

        assertEq(token.balanceOf(address(game)), 0);
        assertEq(token.balanceOf(recipient), amount);
    }

    function testRescueERC20RejectsUnauthorizedCaller() public {
        RescueTokenMock token = new RescueTokenMock();
        token.mint(address(this), 10 ether);
        token.transfer(address(game), 10 ether);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player1));
        vm.prank(player1);
        game.rescueERC20(address(token), player1, 10 ether);
    }

    function testRescueERC20RejectsZeroTokenRecipientAndAmount() public {
        RescueTokenMock token = new RescueTokenMock();

        vm.expectRevert(PrisonersDAOlemma.InvalidRescueToken.selector);
        vm.prank(owner);
        game.rescueERC20(address(0), player1, 1);

        vm.expectRevert(PrisonersDAOlemma.InvalidRecipient.selector);
        vm.prank(owner);
        game.rescueERC20(address(token), address(0), 1);

        vm.expectRevert(PrisonersDAOlemma.InvalidRescueAmount.selector);
        vm.prank(owner);
        game.rescueERC20(address(token), player1, 0);
    }

    function testRescueFunctionsRevertDuringJoiningCommitAndReveal() public {
        RescueTokenMock token = new RescueTokenMock();
        token.mint(address(this), 1 ether);
        token.transfer(address(game), 1 ether);
        _forceSend(address(game), 1 ether);

        uint256 gameId = _createGame();

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueERC20(address(token), owner, 1 ether);

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.25 ether);

        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-live-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-live-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueERC20(address(token), owner, 1 ether);

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.25 ether);

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueERC20(address(token), owner, 1 ether);

        vm.expectRevert(PrisonersDAOlemma.RescueUnavailableDuringLiveGame.selector);
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.25 ether);
    }

    function testRescueExcessETHOnlyTransfersForcedExcessAndEmitsEvent() public {
        address recipient = makeAddr("eth-recipient");

        assertEq(game.accountedETHLiabilities(), 0);
        assertEq(game.excessETH(), 0);

        _forceSend(address(game), 1 ether);

        assertEq(game.accountedETHLiabilities(), 0);
        assertEq(game.excessETH(), 1 ether);

        vm.expectEmit(true, false, false, true, address(game));
        emit ExcessETHRescued(recipient, 0.4 ether);

        vm.prank(owner);
        game.rescueExcessETH(payable(recipient), 0.4 ether);

        assertEq(recipient.balance, 0.4 ether);
        assertEq(game.excessETH(), 0.6 ether);
        assertEq(game.accountedETHLiabilities(), 0);

        vm.prank(owner);
        game.rescueExcessETH(payable(recipient), 0.6 ether);

        assertEq(recipient.balance, 1 ether);
        assertEq(game.excessETH(), 0);
        assertEq(address(game).balance, 0);
    }

    function testRescueExcessETHRejectsZeroRecipientAndAmount() public {
        _forceSend(address(game), 1 ether);

        vm.expectRevert(PrisonersDAOlemma.InvalidRecipient.selector);
        vm.prank(owner);
        game.rescueExcessETH(payable(address(0)), 1);

        vm.expectRevert(PrisonersDAOlemma.InvalidRescueAmount.selector);
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0);
    }

    function testRescueExcessETHRejectsUnauthorizedCallerAndExcessOverdraw() public {
        _forceSend(address(game), 1 ether);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player1));
        vm.prank(player1);
        game.rescueExcessETH(payable(player1), 0.1 ether);

        vm.expectRevert(abi.encodeWithSelector(PrisonersDAOlemma.InsufficientExcessETH.selector, 1 ether + 1, 1 ether));
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 1 ether + 1);
    }

    function testRescueExcessETHPreservesUnclaimedWinnerAndTreasuryLiabilities() public {
        uint256 gameId = _resolveWinnerGame();
        PrisonersDAOlemma.SettlementState memory settlement = game.getSettlement(gameId);
        PrisonersDAOlemma.GameSnapshot memory snapshot = game.getGame(gameId);
        uint256 winnerCauseCutWei = settlement.winnerShareWei * uint256(snapshot.causeFeeBps) / 10_000;
        uint256 winnerNetPrizeWei = settlement.winnerShareWei - winnerCauseCutWei;
        uint256 baseLiabilityWei = settlement.totalPotWei;

        assertEq(uint256(snapshot.phase), uint256(PrisonersDAOlemma.Phase.Ended));
        assertEq(uint256(snapshot.outcome), uint256(PrisonersDAOlemma.Outcome.Winners));
        assertEq(game.accountedETHLiabilities(), baseLiabilityWei);
        assertEq(game.excessETH(), 0);

        _forceSend(address(game), 0.5 ether);

        assertEq(game.accountedETHLiabilities(), baseLiabilityWei);
        assertEq(game.excessETH(), 0.5 ether);

        vm.expectRevert(
            abi.encodeWithSelector(PrisonersDAOlemma.InsufficientExcessETH.selector, 0.5 ether + 1, 0.5 ether)
        );
        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.5 ether + 1);

        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.5 ether);

        assertEq(game.accountedETHLiabilities(), baseLiabilityWei);
        assertEq(game.excessETH(), 0);

        uint256 player1BalanceBefore = player1.balance;
        vm.prank(player1);
        game.claim(gameId);
        assertEq(player1.balance - player1BalanceBefore, winnerNetPrizeWei);

        assertEq(game.accountedETHLiabilities(), baseLiabilityWei - winnerNetPrizeWei);
        assertEq(game.gameCauseClaimableAmount(gameId, CAUSE_A), winnerCauseCutWei);
        assertEq(game.treasuryClaimableAmount(gameId), settlement.treasuryAccruedWei);

        uint256 treasuryBalanceBefore = treasury.balance;
        vm.prank(treasury);
        game.withdrawTreasury(gameId);
        assertEq(treasury.balance - treasuryBalanceBefore, settlement.treasuryAccruedWei);

        uint256 causeABalanceBefore = causeARecipient.balance;
        vm.prank(causeARecipient);
        game.withdrawCause(gameId, CAUSE_A);
        assertEq(causeARecipient.balance - causeABalanceBefore, winnerCauseCutWei);

        assertEq(game.accountedETHLiabilities(), 0);
        assertEq(game.excessETH(), 0);
        assertEq(address(game).balance, 0);
    }

    function testRescueExcessETHPreservesRefundLiabilitiesAfterCancelledGame() public {
        uint256 gameId = _resolveCancelledSinglePlayerGame();
        uint256 refundWei = game.getSettlement(gameId).refundPerPlayerWei;

        assertEq(game.accountedETHLiabilities(), refundWei);
        assertEq(game.excessETH(), 0);

        _forceSend(address(game), 0.25 ether);
        assertEq(game.excessETH(), 0.25 ether);

        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.25 ether);

        assertEq(game.accountedETHLiabilities(), refundWei);
        assertEq(game.excessETH(), 0);

        uint256 player1BalanceBefore = player1.balance;
        vm.prank(player1);
        game.claimRefund(gameId);
        assertEq(player1.balance - player1BalanceBefore, refundWei);

        assertEq(game.accountedETHLiabilities(), 0);
        assertEq(address(game).balance, 0);
    }

    function testRescueExcessETHPreservesCauseAndTreasuryLiabilitiesAfterNoWinnerGame() public {
        uint256 gameId = _resolveNoWinnerGame();
        uint256 treasuryClaimableWei = game.treasuryClaimableAmount(gameId);
        uint256 causeAClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_A);
        uint256 causeBClaimableWei = game.gameCauseClaimableAmount(gameId, CAUSE_B);
        uint256 baseLiabilityWei = treasuryClaimableWei + causeAClaimableWei + causeBClaimableWei;

        assertEq(game.accountedETHLiabilities(), baseLiabilityWei);
        assertEq(game.excessETH(), 0);

        _forceSend(address(game), 0.4 ether);
        assertEq(game.excessETH(), 0.4 ether);

        vm.prank(owner);
        game.rescueExcessETH(payable(owner), 0.4 ether);

        assertEq(game.accountedETHLiabilities(), baseLiabilityWei);
        assertEq(game.excessETH(), 0);

        uint256 treasuryBalanceBefore = treasury.balance;
        vm.prank(treasury);
        game.withdrawTreasury(gameId);
        assertEq(treasury.balance - treasuryBalanceBefore, treasuryClaimableWei);

        uint256 causeABalanceBefore = causeARecipient.balance;
        vm.prank(causeARecipient);
        game.withdrawCause(gameId, CAUSE_A);
        assertEq(causeARecipient.balance - causeABalanceBefore, causeAClaimableWei);

        uint256 causeBBalanceBefore = causeBRecipient.balance;
        vm.prank(causeBRecipient);
        game.withdrawCause(gameId, CAUSE_B);
        assertEq(causeBRecipient.balance - causeBBalanceBefore, causeBClaimableWei);

        assertEq(game.accountedETHLiabilities(), 0);
        assertEq(address(game).balance, 0);
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

    function _createGame() internal returns (uint256) {
        vm.prank(owner);
        return game.createGame();
    }

    function _resolveWinnerGame() internal returns (uint256 gameId) {
        gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-winner-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-winner-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Share, SALT_1);
        _revealForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);
    }

    function _resolveCancelledSinglePlayerGame() internal returns (uint256 gameId) {
        gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-cancel-1"), CAUSE_A);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.cancelIfInsufficientPlayers(gameId);
    }

    function _resolveNoWinnerGame() internal returns (uint256 gameId) {
        gameId = _createGame();
        _joinPlayer(gameId, player1, PLAYER1_AGENT, keccak256("nonce-no-winner-1"), CAUSE_A);
        _joinPlayer(gameId, player2, PLAYER2_AGENT, keccak256("nonce-no-winner-2"), CAUSE_B);

        vm.warp(game.getGame(gameId).joinDeadline + 1);
        game.advancePhase(gameId);

        _commitForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);
        _commitForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);

        _revealForPlayer(gameId, player1, PrisonersDAOlemma.Choice.Catch, SALT_1);
        _revealForPlayer(gameId, player2, PrisonersDAOlemma.Choice.Catch, SALT_2);
        game.advancePhase(gameId);
    }

    function _joinPlayer(uint256 gameId, address wallet_, bytes32 agentKey_, bytes32 nonce_, uint16 causeId) internal {
        _registerWallet(wallet_, agentKey_, uint64(vm.getBlockTimestamp() + 1 hours), nonce_);

        uint256 entryFeeWei = game.getGame(gameId).entryFeeWei;
        vm.prank(wallet_);
        game.join{ value: entryFeeWei }(gameId, causeId);
    }

    function _commitForPlayer(uint256 gameId, address wallet_, PrisonersDAOlemma.Choice choice_, bytes32 salt_)
        internal
    {
        bytes32 commitment = game.computeCommitment(gameId, game.getGame(gameId).round, wallet_, choice_, salt_);
        vm.prank(wallet_);
        game.commit(gameId, commitment);
    }

    function _revealForPlayer(uint256 gameId, address wallet_, PrisonersDAOlemma.Choice choice_, bytes32 salt_)
        internal
    {
        vm.prank(wallet_);
        game.reveal(gameId, choice_, salt_);
    }

    function _forceSend(address target, uint256 amount) internal {
        new ForceSendETH{ value: amount }(payable(target));
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
