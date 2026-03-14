// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {AgentAuthRegistry} from "../contracts/AgentAuthRegistry.sol";
import {PrisonersDaollema} from "../contracts/PrisonersDaollema.sol";

contract PrisonersDaollemaTest is Test {
    AgentAuthRegistry internal registry;
    PrisonersDaollema internal game;

    address internal owner = address(0xA11CE);
    address internal treasury = address(0xCAFE);
    address internal wallet = address(0xB0B);

    function setUp() public {
        registry = new AgentAuthRegistry(owner);
        game = new PrisonersDaollema(owner, treasury, address(registry), 0.01 ether, 2);
    }

    function testConstructorStoresCoreConfig() public view {
        assertEq(game.owner(), owner);
        assertEq(game.treasury(), treasury);
        assertEq(game.authRegistry(), address(registry));
        assertEq(game.entryFee(), 0.01 ether);
        assertEq(game.minPlayers(), 2);
    }

    function testAdmissionReadyUsesRegistry() public {
        vm.prank(owner);
        registry.setAuthRecord(wallet, bytes32("agent-alpha"), keccak256("manifest"), 0);

        assertTrue(game.isAdmissionReady(wallet));
    }

    function testStartJoinPhaseIncrementsGameId() public {
        vm.prank(owner);
        game.startJoinPhase();

        assertEq(game.currentGameId(), 1);
        assertEq(uint256(game.currentPhase()), uint256(PrisonersDaollema.Phase.Join));
    }
}
