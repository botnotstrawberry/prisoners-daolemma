// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IGameChatHost } from "./interfaces/IGameChatHost.sol";

/// @title GameChat
/// @notice Minimal public onchain messaging for Prisoners DAOllema games.
/// @dev Message history is represented by events plus a monotonic message counter.
///      The contract is read-only against game truth and does not duplicate player state.
contract GameChat {
    error InvalidGameContract();
    error MissingGame();
    error NotJoined();
    error NotAlive();
    error WrongCause();
    error EmptyMessage();
    error MessageTooLong();

    uint16 public constant MAX_MESSAGE_BYTES = 280;

    enum Scope {
        Global,
        Cause
    }

    IGameChatHost public immutable game;
    uint256 public messageCount;

    event MessagePosted(
        uint256 indexed gameId,
        uint256 indexed messageId,
        address indexed sender,
        uint32 round,
        uint8 phase,
        Scope scope,
        uint16 causeId,
        uint64 createdAt,
        string text
    );

    constructor(address game_) {
        if (game_ == address(0)) revert InvalidGameContract();
        game = IGameChatHost(game_);
    }

    function postGlobal(uint256 gameId, string calldata text) external returns (uint256 messageId) {
        _requireExistingGame(gameId);
        if (!game.isJoined(gameId, msg.sender)) revert NotJoined();

        return _post(gameId, Scope.Global, 0, text);
    }

    function postCause(uint256 gameId, uint16 causeId, string calldata text) external returns (uint256 messageId) {
        _requireExistingGame(gameId);
        if (!game.isJoined(gameId, msg.sender)) revert NotJoined();
        if (!game.isAlive(gameId, msg.sender)) revert NotAlive();
        if (game.playerCause(gameId, msg.sender) != causeId) revert WrongCause();

        return _post(gameId, Scope.Cause, causeId, text);
    }

    function _post(uint256 gameId, Scope scope, uint16 causeId, string calldata text)
        internal
        returns (uint256 messageId)
    {
        _validateMessage(text);

        (uint32 round, uint8 phase) = game.chatContext(gameId);
        messageId = ++messageCount;

        emit MessagePosted(gameId, messageId, msg.sender, round, phase, scope, causeId, uint64(block.timestamp), text);
    }

    function _requireExistingGame(uint256 gameId) internal view {
        if (!game.gameExists(gameId)) revert MissingGame();
    }

    function _validateMessage(string calldata text) internal pure {
        uint256 textLength = bytes(text).length;
        if (textLength == 0) revert EmptyMessage();
        if (textLength > MAX_MESSAGE_BYTES) revert MessageTooLong();
    }
}
