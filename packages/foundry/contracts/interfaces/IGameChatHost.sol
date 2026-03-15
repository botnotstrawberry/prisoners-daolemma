// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IGameChatHost {
    function gameExists(uint256 gameId) external view returns (bool);
    function chatContext(uint256 gameId) external view returns (uint32 round, uint8 phase);
    function isJoined(uint256 gameId, address wallet) external view returns (bool);
    function isAlive(uint256 gameId, address wallet) external view returns (bool);
    function playerCause(uint256 gameId, address wallet) external view returns (uint16);
}
