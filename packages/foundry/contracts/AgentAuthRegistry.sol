// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentAuthRegistry
/// @notice Minimal onchain admission registry for the hackathon build.
/// @dev This is intentionally small. SIWA verification and richer admission logic will be layered on later.
contract AgentAuthRegistry is Ownable {
    error InvalidWallet();
    error InvalidAgentKey();
    error InvalidExpiry();

    struct AuthRecord {
        bytes32 agentKey;
        bytes32 manifestHash;
        uint64 expiresAt;
        bool exists;
    }

    mapping(address wallet => AuthRecord record) private _records;

    event AuthRecordSet(address indexed wallet, bytes32 indexed agentKey, bytes32 manifestHash, uint64 expiresAt);
    event AuthRecordCleared(address indexed wallet);

    constructor(address owner_) Ownable(owner_) {}

    function setAuthRecord(address wallet, bytes32 agentKey, bytes32 manifestHash, uint64 expiresAt) external onlyOwner {
        if (wallet == address(0)) revert InvalidWallet();
        if (agentKey == bytes32(0)) revert InvalidAgentKey();
        if (expiresAt != 0 && expiresAt < block.timestamp) revert InvalidExpiry();

        _records[wallet] = AuthRecord({
            agentKey: agentKey,
            manifestHash: manifestHash,
            expiresAt: expiresAt,
            exists: true
        });

        emit AuthRecordSet(wallet, agentKey, manifestHash, expiresAt);
    }

    function clearAuthRecord(address wallet) external onlyOwner {
        delete _records[wallet];
        emit AuthRecordCleared(wallet);
    }

    function isAuthorized(address wallet) public view returns (bool) {
        AuthRecord memory record = _records[wallet];
        if (!record.exists) return false;
        if (record.expiresAt == 0) return true;
        return record.expiresAt >= block.timestamp;
    }

    function agentKeyOf(address wallet) external view returns (bytes32) {
        return _records[wallet].agentKey;
    }

    function authRecordOf(address wallet) external view returns (AuthRecord memory) {
        return _records[wallet];
    }
}
