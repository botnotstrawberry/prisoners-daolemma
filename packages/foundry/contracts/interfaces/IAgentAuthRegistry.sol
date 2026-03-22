// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IAgentAuthRegistry {
    function isAuthorized(address wallet) external view returns (bool);
    function agentKeyOf(address wallet) external view returns (bytes32);
}
