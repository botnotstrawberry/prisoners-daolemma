// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { ERC8004AuthAdapter } from "../contracts/ERC8004AuthAdapter.sol";
import { MockAgentIdentityRegistry } from "../contracts/mocks/MockAgentIdentityRegistry.sol";
import { GameChat } from "../contracts/GameChat.sol";
import { PrisonersDAOlemma } from "../contracts/PrisonersDAOlemma.sol";
import { IGameChatHost } from "../contracts/interfaces/IGameChatHost.sol";

contract GameChatTest is Test {
    uint16 internal constant CAUSE_A = 1;
    uint16 internal constant CAUSE_B = 2;
    uint256 internal constant MOCK_GAME_ID = 77;
    uint256 internal constant MISSING_GAME_ID = type(uint256).max;

    bytes32 internal constant PLAYER1_AGENT = keccak256("agent-alpha");

    uint256 internal ownerPk = 0xA11CE;

    ERC8004AuthAdapter internal registry;
    MockAgentIdentityRegistry internal identityRegistry;
    PrisonersDAOlemma internal realGame;
    GameChat internal chat;

    MockGameChatHost internal mockGame;
    GameChat internal mockChat;

    address internal owner;
    address internal treasury;
    address internal causeARecipient;
    address internal causeBRecipient;
    address internal player1;
    address internal outsider;

    uint256 internal realGameId;

    event MessagePosted(
        uint256 indexed gameId,
        uint256 indexed messageId,
        address indexed sender,
        uint32 round,
        uint8 phase,
        GameChat.Scope scope,
        uint16 causeId,
        uint64 createdAt,
        string text
    );

    function setUp() public {
        owner = vm.addr(ownerPk);
        treasury = makeAddr("treasury");
        causeARecipient = makeAddr("cause-a-recipient");
        causeBRecipient = makeAddr("cause-b-recipient");
        player1 = makeAddr("player-1");
        outsider = makeAddr("outsider");

        vm.deal(player1, 10 ether);
        vm.deal(outsider, 10 ether);

        identityRegistry = new MockAgentIdentityRegistry();
        registry = new ERC8004AuthAdapter(address(identityRegistry));
        realGame = new PrisonersDAOlemma(owner, treasury, address(registry), _defaultConfig());
        chat = new GameChat(address(realGame));

        vm.startPrank(owner);
        realGame.whitelistCause(CAUSE_A, causeARecipient, keccak256("cause-a"));
        realGame.whitelistCause(CAUSE_B, causeBRecipient, keccak256("cause-b"));
        realGameId = realGame.createGame();
        vm.stopPrank();

        mockGame = new MockGameChatHost();
        mockChat = new GameChat(address(mockGame));
    }

    function testJoinedParticipantCanPostGlobal() public {
        _joinRealPlayer(player1, PLAYER1_AGENT, keccak256("nonce-global-joined"), CAUSE_A);

        vm.prank(player1);
        uint256 messageId = chat.postGlobal(realGameId, "hello world");

        assertEq(messageId, 1);
        assertEq(chat.messageCount(), 1);
    }

    function testEliminatedParticipantCanStillPostGlobal() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, false, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Reveal));

        vm.prank(player1);
        uint256 messageId = mockChat.postGlobal(MOCK_GAME_ID, "still in the public feed");

        assertEq(messageId, 1);
        assertEq(mockChat.messageCount(), 1);
    }

    function testNonParticipantCannotPostGlobal() public {
        vm.expectRevert(GameChat.NotJoined.selector);
        vm.prank(outsider);
        chat.postGlobal(realGameId, "let me in");

        assertEq(chat.messageCount(), 0);
    }

    function testCannotPostGlobalToMissingGame() public {
        _joinRealPlayer(player1, PLAYER1_AGENT, keccak256("nonce-global-missing-game"), CAUSE_A);

        vm.expectRevert(GameChat.MissingGame.selector);
        vm.prank(player1);
        chat.postGlobal(MISSING_GAME_ID, "ghost game");

        assertEq(chat.messageCount(), 0);
    }

    function testCannotPostEmptyGlobalMessage() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Commit));

        vm.expectRevert(GameChat.EmptyMessage.selector);
        vm.prank(player1);
        mockChat.postGlobal(MOCK_GAME_ID, "");

        assertEq(mockChat.messageCount(), 0);
    }

    function testCannotPostOversizedGlobalMessage() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Commit));

        string memory text = _messageOfLength(uint256(mockChat.MAX_MESSAGE_BYTES()) + 1);

        vm.expectRevert(GameChat.MessageTooLong.selector);
        vm.prank(player1);
        mockChat.postGlobal(MOCK_GAME_ID, text);

        assertEq(mockChat.messageCount(), 0);
    }

    function testMaxLengthGlobalMessageIsAllowed() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Commit));

        string memory text = _messageOfLength(uint256(mockChat.MAX_MESSAGE_BYTES()));

        vm.prank(player1);
        uint256 messageId = mockChat.postGlobal(MOCK_GAME_ID, text);

        assertEq(messageId, 1);
        assertEq(mockChat.messageCount(), 1);
    }

    function testAliveSameCauseParticipantCanPostCauseChat() public {
        _joinRealPlayer(player1, PLAYER1_AGENT, keccak256("nonce-cause-joined"), CAUSE_A);

        vm.prank(player1);
        uint256 messageId = chat.postCause(realGameId, CAUSE_A, "for the cause");

        assertEq(messageId, 1);
        assertEq(chat.messageCount(), 1);
    }

    function testWrongCauseParticipantCannotPostCauseChat() public {
        _joinRealPlayer(player1, PLAYER1_AGENT, keccak256("nonce-wrong-cause"), CAUSE_A);

        vm.expectRevert(GameChat.WrongCause.selector);
        vm.prank(player1);
        chat.postCause(realGameId, CAUSE_B, "cross-posting");
    }

    function testEliminatedParticipantCannotPostCauseChat() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, false, CAUSE_A, 5, uint8(PrisonersDAOlemma.Phase.Commit));

        vm.expectRevert(GameChat.NotAlive.selector);
        vm.prank(player1);
        mockChat.postCause(MOCK_GAME_ID, CAUSE_A, "I should not be able to send this");

        assertEq(mockChat.messageCount(), 0);
    }

    function testNonParticipantCannotPostCauseChat() public {
        vm.expectRevert(GameChat.NotJoined.selector);
        vm.prank(outsider);
        chat.postCause(realGameId, CAUSE_A, "let me in");

        assertEq(chat.messageCount(), 0);
    }

    function testCannotPostCauseChatToMissingGame() public {
        _joinRealPlayer(player1, PLAYER1_AGENT, keccak256("nonce-cause-missing-game"), CAUSE_A);

        vm.expectRevert(GameChat.MissingGame.selector);
        vm.prank(player1);
        chat.postCause(MISSING_GAME_ID, CAUSE_A, "ghost cause");

        assertEq(chat.messageCount(), 0);
    }

    function testCannotPostEmptyCauseMessage() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Commit));

        vm.expectRevert(GameChat.EmptyMessage.selector);
        vm.prank(player1);
        mockChat.postCause(MOCK_GAME_ID, CAUSE_A, "");

        assertEq(mockChat.messageCount(), 0);
    }

    function testCannotPostOversizedCauseMessage() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 3, uint8(PrisonersDAOlemma.Phase.Commit));

        string memory text = _messageOfLength(uint256(mockChat.MAX_MESSAGE_BYTES()) + 1);

        vm.expectRevert(GameChat.MessageTooLong.selector);
        vm.prank(player1);
        mockChat.postCause(MOCK_GAME_ID, CAUSE_A, text);

        assertEq(mockChat.messageCount(), 0);
    }

    function testMessageEventCarriesDeterministicScopeAndGameContext() public {
        _seedMockPlayer(MOCK_GAME_ID, player1, true, true, CAUSE_A, 7, uint8(PrisonersDAOlemma.Phase.Commit));

        vm.expectEmit(true, true, true, true, address(mockChat));
        emit MessagePosted(
            MOCK_GAME_ID,
            1,
            player1,
            7,
            uint8(PrisonersDAOlemma.Phase.Commit),
            GameChat.Scope.Global,
            0,
            uint64(block.timestamp),
            "broadcast"
        );

        vm.prank(player1);
        mockChat.postGlobal(MOCK_GAME_ID, "broadcast");

        vm.expectEmit(true, true, true, true, address(mockChat));
        emit MessagePosted(
            MOCK_GAME_ID,
            2,
            player1,
            7,
            uint8(PrisonersDAOlemma.Phase.Commit),
            GameChat.Scope.Cause,
            CAUSE_A,
            uint64(block.timestamp),
            "hold the line"
        );

        vm.prank(player1);
        mockChat.postCause(MOCK_GAME_ID, CAUSE_A, "hold the line");
    }

    function _seedMockPlayer(
        uint256 gameId,
        address wallet,
        bool joined,
        bool alive,
        uint16 causeId,
        uint32 round,
        uint8 phase
    ) internal {
        mockGame.setGame(gameId, true, round, phase);
        mockGame.setPlayer(gameId, wallet, joined, alive, causeId);
    }

    function _joinRealPlayer(uint256 gameId, address wallet, bytes32 agentKey, bytes32 nonce, uint16 causeId) internal {
        _registerWallet(wallet, agentKey, uint64(block.timestamp + 1 hours), nonce);

        vm.prank(wallet);
        realGame.join{ value: _defaultConfig().entryFeeWei }(gameId, causeId);
    }

    function _joinRealPlayer(address wallet, bytes32 agentKey, bytes32 nonce, uint16 causeId) internal {
        _joinRealPlayer(realGameId, wallet, agentKey, nonce, causeId);
    }

    function _registerWallet(address wallet, bytes32, uint64, bytes32) internal {
        identityRegistry.mint(wallet);
    }

    function _messageOfLength(uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(length);
        for (uint256 i = 0; i < length; ++i) {
            buffer[i] = bytes1("a");
        }
        return string(buffer);
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
}

contract MockGameChatHost is IGameChatHost {
    struct GameContext {
        bool exists;
        uint32 round;
        uint8 phase;
    }

    mapping(uint256 gameId => GameContext context) internal _games;
    mapping(uint256 gameId => mapping(address wallet => bool joined)) internal _joined;
    mapping(uint256 gameId => mapping(address wallet => bool alive)) internal _alive;
    mapping(uint256 gameId => mapping(address wallet => uint16 causeId)) internal _causeIds;

    function setGame(uint256 gameId, bool exists, uint32 round, uint8 phase) external {
        _games[gameId] = GameContext({ exists: exists, round: round, phase: phase });
    }

    function setPlayer(uint256 gameId, address wallet, bool joined, bool alive, uint16 causeId) external {
        _joined[gameId][wallet] = joined;
        _alive[gameId][wallet] = alive;
        _causeIds[gameId][wallet] = causeId;
    }

    function gameExists(uint256 gameId) external view returns (bool) {
        return _games[gameId].exists;
    }

    function chatContext(uint256 gameId) external view returns (uint32 round, uint8 phase) {
        GameContext memory game = _games[gameId];
        return (game.round, game.phase);
    }

    function isJoined(uint256 gameId, address wallet) external view returns (bool) {
        return _joined[gameId][wallet];
    }

    function isAlive(uint256 gameId, address wallet) external view returns (bool) {
        return _alive[gameId][wallet];
    }

    function playerCause(uint256 gameId, address wallet) external view returns (uint16) {
        return _causeIds[gameId][wallet];
    }
}
