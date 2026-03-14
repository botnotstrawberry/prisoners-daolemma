// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {AgentAuthRegistry} from "../contracts/AgentAuthRegistry.sol";

contract AgentAuthRegistryTest is Test {
    AgentAuthRegistry internal registry;
    address internal owner = address(0xA11CE);
    address internal wallet = address(0xB0B);

    function setUp() public {
        registry = new AgentAuthRegistry(owner);
    }

    function testOwnerCanSetAuthRecord() public {
        vm.prank(owner);
        registry.setAuthRecord(wallet, bytes32("agent-alpha"), keccak256("manifest"), 0);

        assertTrue(registry.isAuthorized(wallet));
        assertEq(registry.agentKeyOf(wallet), bytes32("agent-alpha"));
    }

    function testExpiredAuthIsNotAuthorized() public {
        uint64 expiry = uint64(block.timestamp + 1 hours);

        vm.prank(owner);
        registry.setAuthRecord(wallet, bytes32("agent-alpha"), keccak256("manifest"), expiry);

        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(registry.isAuthorized(wallet));
    }
}
