// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { ERC8004AuthAdapter } from "../contracts/ERC8004AuthAdapter.sol";
import { MockAgentIdentityRegistry } from "../contracts/mocks/MockAgentIdentityRegistry.sol";

contract ERC8004AuthAdapterTest is Test {
    ERC8004AuthAdapter internal adapter;
    MockAgentIdentityRegistry internal identityRegistry;

    address internal wallet = address(0xBEEF);
    address internal otherWallet = address(0xCAFE);

    function setUp() public {
        identityRegistry = new MockAgentIdentityRegistry();
        adapter = new ERC8004AuthAdapter(address(identityRegistry));
    }

    function testConstructorRejectsZeroRegistry() public {
        vm.expectRevert(ERC8004AuthAdapter.InvalidIdentityRegistry.selector);
        new ERC8004AuthAdapter(address(0));
    }

    function testConstructorRejectsRegistryWithoutCode() public {
        address noCodeRegistry = makeAddr("no-code-registry");

        vm.expectRevert(ERC8004AuthAdapter.InvalidIdentityRegistry.selector);
        new ERC8004AuthAdapter(noCodeRegistry);
    }

    function testIsAuthorizedFalseForZeroAddress() public view {
        assertFalse(adapter.isAuthorized(address(0)));
    }

    function testIsAuthorizedFalseForWalletWithoutIdentity() public view {
        assertFalse(adapter.isAuthorized(wallet));
    }

    function testIsAuthorizedTrueForWalletWithIdentity() public {
        identityRegistry.mint(wallet);

        assertTrue(adapter.isAuthorized(wallet));
    }

    function testAgentKeyIsZeroForUnauthorizedWallet() public view {
        assertEq(adapter.agentKeyOf(wallet), bytes32(0));
    }

    function testAgentKeyIsDeterministicForAuthorizedWallet() public {
        identityRegistry.mint(wallet);

        bytes32 expected = keccak256(abi.encodePacked(keccak256("erc8004-agent"), wallet));

        assertEq(adapter.agentKeyOf(wallet), expected);
        assertEq(adapter.agentKeyOf(wallet), expected);
    }

    function testDifferentAuthorizedWalletsHaveDifferentDerivedAgentKeys() public {
        identityRegistry.mint(wallet);
        identityRegistry.mint(otherWallet);

        assertTrue(adapter.agentKeyOf(wallet) != bytes32(0));
        assertTrue(adapter.agentKeyOf(otherWallet) != bytes32(0));
        assertTrue(adapter.agentKeyOf(wallet) != adapter.agentKeyOf(otherWallet));
    }

    function testAdditionalIdentitiesDoNotChangeDerivedWalletAgentKey() public {
        identityRegistry.mint(wallet);
        bytes32 expected = adapter.agentKeyOf(wallet);

        identityRegistry.mint(wallet);

        assertEq(adapter.agentKeyOf(wallet), expected);
        assertTrue(adapter.isAuthorized(wallet));
    }

    function testAuthorizationTracksRegistryOwnershipChanges() public {
        uint256 tokenId = identityRegistry.mint(wallet);
        assertTrue(adapter.isAuthorized(wallet));

        identityRegistry.setOwner(tokenId, address(0));

        assertFalse(adapter.isAuthorized(wallet));
        assertEq(adapter.agentKeyOf(wallet), bytes32(0));
    }
}
