// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract MockAgentIdentityRegistry {
    error NotRegistered();

    mapping(uint256 agentId => address owner) private _owners;

    function setOwner(uint256 agentId, address owner) external {
        _owners[agentId] = owner;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address owner = _owners[agentId];
        if (owner == address(0)) revert NotRegistered();
        return owner;
    }
}
