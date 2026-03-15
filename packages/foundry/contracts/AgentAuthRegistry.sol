// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title AgentAuthRegistry
/// @notice Verifier-signed admission registry for Prisoners DAOllema v1.
/// @dev SIWA verification stays offchain. The verifier signs a compact permit and the gameplay wallet
///      registers it onchain. The game contract consumes only cheap registry reads.
contract AgentAuthRegistry is Ownable, EIP712 {
    error InvalidWallet();
    error InvalidVerifier();
    error InvalidAgentKey();
    error InvalidManifestHash();
    error InvalidNonce();
    error InvalidPermitChain();
    error InvalidPermitNamespace();
    error InvalidPermitWindow();
    error InvalidPermitSigner();
    error CallerMustBeWallet();
    error NonceAlreadyUsed();
    error MissingAuthRecord();
    error AuthInactive();

    bytes32 internal constant _GAME_NAMESPACE = keccak256("PRISONERS_DAOLLEMA_AUTH_V1");

    bytes32 public constant AUTH_PERMIT_TYPEHASH = keccak256(
        "AuthPermit(address wallet,bytes32 agentKey,bytes32 manifestHash,uint256 chainId,bytes32 gameNamespace,uint64 issuedAt,uint64 expiresAt,bytes32 nonce)"
    );

    struct AuthPermit {
        address wallet;
        bytes32 agentKey;
        bytes32 manifestHash;
        uint256 chainId;
        bytes32 gameNamespace;
        uint64 issuedAt;
        uint64 expiresAt;
        bytes32 nonce;
    }

    struct AuthRecord {
        bytes32 agentKey;
        bytes32 manifestHash;
        uint64 issuedAt;
        uint64 expiresAt;
        address issuer;
        bool active;
    }

    address public verifier;

    mapping(address wallet => AuthRecord record) private _records;
    mapping(bytes32 nonce => bool used) private _usedNonces;

    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event AuthRegistered(
        address indexed wallet, bytes32 indexed agentKey, bytes32 manifestHash, uint64 expiresAt, address indexed issuer
    );
    event AuthRevoked(address indexed wallet, bytes32 indexed agentKey);

    constructor(address owner_, address verifier_) Ownable(owner_) EIP712("PrisonersDaollemaAgentAuthRegistry", "1") {
        if (verifier_ == address(0)) revert InvalidVerifier();
        verifier = verifier_;
        emit VerifierUpdated(address(0), verifier_);
    }

    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidVerifier();

        address previousVerifier = verifier;
        verifier = newVerifier;

        emit VerifierUpdated(previousVerifier, newVerifier);
    }

    function registerAuth(AuthPermit calldata permit, bytes calldata signature) external {
        if (permit.wallet == address(0)) revert InvalidWallet();
        if (permit.agentKey == bytes32(0)) revert InvalidAgentKey();
        if (permit.manifestHash == bytes32(0)) revert InvalidManifestHash();
        if (permit.nonce == bytes32(0)) revert InvalidNonce();
        if (permit.chainId != block.chainid) revert InvalidPermitChain();
        if (permit.gameNamespace != _GAME_NAMESPACE) revert InvalidPermitNamespace();
        if (permit.issuedAt == 0 || permit.issuedAt > block.timestamp) revert InvalidPermitWindow();
        if (permit.expiresAt != 0 && (permit.expiresAt <= permit.issuedAt || permit.expiresAt < block.timestamp)) {
            revert InvalidPermitWindow();
        }
        if (msg.sender != permit.wallet) revert CallerMustBeWallet();
        if (_usedNonces[permit.nonce]) revert NonceAlreadyUsed();

        address recoveredSigner = ECDSA.recover(_hashAuthPermit(permit), signature);
        if (recoveredSigner != verifier) revert InvalidPermitSigner();

        _usedNonces[permit.nonce] = true;
        _records[permit.wallet] = AuthRecord({
            agentKey: permit.agentKey,
            manifestHash: permit.manifestHash,
            issuedAt: permit.issuedAt,
            expiresAt: permit.expiresAt,
            issuer: recoveredSigner,
            active: true
        });

        emit AuthRegistered(permit.wallet, permit.agentKey, permit.manifestHash, permit.expiresAt, recoveredSigner);
    }

    function revokeAuth(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidWallet();

        AuthRecord storage record = _records[wallet];
        if (record.agentKey == bytes32(0)) revert MissingAuthRecord();
        if (!record.active) revert AuthInactive();

        record.active = false;
        emit AuthRevoked(wallet, record.agentKey);
    }

    function isAuthorized(address wallet) public view returns (bool) {
        AuthRecord memory record = _records[wallet];
        if (!record.active) return false;
        if (record.agentKey == bytes32(0)) return false;
        return record.expiresAt == 0 || record.expiresAt >= block.timestamp;
    }

    function agentKeyOf(address wallet) external view returns (bytes32) {
        return _records[wallet].agentKey;
    }

    function authRecordOf(address wallet) external view returns (AuthRecord memory) {
        return _records[wallet];
    }

    function hasUsedNonce(bytes32 nonce) external view returns (bool) {
        return _usedNonces[nonce];
    }

    function gameNamespace() external pure returns (bytes32) {
        return _GAME_NAMESPACE;
    }

    function domainSeparatorV4() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashAuthPermit(AuthPermit calldata permit) external view returns (bytes32) {
        return _hashAuthPermit(permit);
    }

    function _hashAuthPermit(AuthPermit calldata permit) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                AUTH_PERMIT_TYPEHASH,
                permit.wallet,
                permit.agentKey,
                permit.manifestHash,
                permit.chainId,
                permit.gameNamespace,
                permit.issuedAt,
                permit.expiresAt,
                permit.nonce
            )
        );

        return _hashTypedDataV4(structHash);
    }
}
