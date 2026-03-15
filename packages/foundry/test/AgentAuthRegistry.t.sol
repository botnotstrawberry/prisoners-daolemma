// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";

contract AgentAuthRegistryTest is Test {
    AgentAuthRegistry internal registry;

    uint256 internal ownerPk = 0xA11CE;
    uint256 internal verifierPk = 0xB0B;
    uint256 internal nextVerifierPk = 0xC0DE;

    address internal owner;
    address internal verifier;
    address internal nextVerifier;
    address internal wallet = address(0xBEEF);
    address internal otherWallet = address(0xCAFE);

    bytes32 internal agentKey = keccak256("agent-alpha");
    bytes32 internal manifestHash = keccak256("manifest://agent-alpha");

    function setUp() public {
        owner = vm.addr(ownerPk);
        verifier = vm.addr(verifierPk);
        nextVerifier = vm.addr(nextVerifierPk);

        registry = new AgentAuthRegistry(owner, verifier);
    }

    function testRegistersVerifierSignedPermitAndStoresWalletBinding() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-1")
        );
        bytes memory signature = _signPermit(permit, verifierPk);

        vm.prank(wallet);
        registry.registerAuth(permit, signature);

        assertTrue(registry.isAuthorized(wallet));
        assertEq(registry.agentKeyOf(wallet), agentKey);
        assertTrue(registry.hasUsedNonce(permit.nonce));

        AgentAuthRegistry.AuthRecord memory record = registry.authRecordOf(wallet);
        assertEq(record.agentKey, agentKey);
        assertEq(record.manifestHash, manifestHash);
        assertEq(uint256(record.issuedAt), uint256(permit.issuedAt));
        assertEq(uint256(record.expiresAt), uint256(permit.expiresAt));
        assertEq(record.issuer, verifier);
        assertTrue(record.active);
    }

    function testOwnerCanRotateVerifierAndOldVerifierStopsWorking() public {
        vm.prank(owner);
        registry.setVerifier(nextVerifier);

        assertEq(registry.verifier(), nextVerifier);

        AgentAuthRegistry.AuthPermit memory oldVerifierPermit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-old-verifier")
        );
        bytes memory oldVerifierSignature = _signPermit(oldVerifierPermit, verifierPk);

        vm.expectRevert(AgentAuthRegistry.InvalidPermitSigner.selector);
        vm.prank(wallet);
        registry.registerAuth(oldVerifierPermit, oldVerifierSignature);

        AgentAuthRegistry.AuthPermit memory nextVerifierPermit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-next-verifier")
        );
        bytes memory nextVerifierSignature = _signPermit(nextVerifierPermit, nextVerifierPk);

        vm.prank(wallet);
        registry.registerAuth(nextVerifierPermit, nextVerifierSignature);

        assertTrue(registry.isAuthorized(wallet));
        assertEq(registry.authRecordOf(wallet).issuer, nextVerifier);
    }

    function testNonOwnerCannotRotateVerifier() public {
        vm.prank(wallet);
        vm.expectRevert();
        registry.setVerifier(nextVerifier);
    }

    function testExpiredAuthIsNotAuthorized() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-expiry")
        );
        bytes memory signature = _signPermit(permit, verifierPk);

        vm.prank(wallet);
        registry.registerAuth(permit, signature);

        vm.warp(block.timestamp + 1 hours + 1);

        assertFalse(registry.isAuthorized(wallet));
        assertEq(registry.agentKeyOf(wallet), agentKey);
    }

    function testReplayProtectionUsesNonceOnlyOnce() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-replay")
        );
        bytes memory signature = _signPermit(permit, verifierPk);

        vm.prank(wallet);
        registry.registerAuth(permit, signature);

        assertTrue(registry.hasUsedNonce(permit.nonce));

        vm.expectRevert(AgentAuthRegistry.NonceAlreadyUsed.selector);
        vm.prank(wallet);
        registry.registerAuth(permit, signature);
    }

    function testRejectsPermitSignedByWrongVerifier() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-wrong-signer")
        );
        bytes memory signature = _signPermit(permit, nextVerifierPk);

        vm.expectRevert(AgentAuthRegistry.InvalidPermitSigner.selector);
        vm.prank(wallet);
        registry.registerAuth(permit, signature);
    }

    function testRejectsPermitSubmittedByDifferentWallet() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-wallet-mismatch")
        );
        bytes memory signature = _signPermit(permit, verifierPk);

        vm.expectRevert(AgentAuthRegistry.CallerMustBeWallet.selector);
        vm.prank(otherWallet);
        registry.registerAuth(permit, signature);
    }

    function testOwnerCanRevokeAuth() public {
        AgentAuthRegistry.AuthPermit memory permit = _buildPermit(
            wallet,
            agentKey,
            manifestHash,
            uint64(block.timestamp),
            uint64(block.timestamp + 1 hours),
            keccak256("nonce-revoke")
        );
        bytes memory signature = _signPermit(permit, verifierPk);

        vm.prank(wallet);
        registry.registerAuth(permit, signature);

        vm.prank(owner);
        registry.revokeAuth(wallet);

        AgentAuthRegistry.AuthRecord memory record = registry.authRecordOf(wallet);
        assertFalse(registry.isAuthorized(wallet));
        assertFalse(record.active);
        assertEq(record.agentKey, agentKey);
    }

    function _buildPermit(
        address wallet_,
        bytes32 agentKey_,
        bytes32 manifestHash_,
        uint64 issuedAt_,
        uint64 expiresAt_,
        bytes32 nonce_
    ) internal view returns (AgentAuthRegistry.AuthPermit memory) {
        return AgentAuthRegistry.AuthPermit({
            wallet: wallet_,
            agentKey: agentKey_,
            manifestHash: manifestHash_,
            chainId: block.chainid,
            gameNamespace: registry.gameNamespace(),
            issuedAt: issuedAt_,
            expiresAt: expiresAt_,
            nonce: nonce_
        });
    }

    function _signPermit(AgentAuthRegistry.AuthPermit memory permit, uint256 signerPk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = registry.hashAuthPermit(permit);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }
}
