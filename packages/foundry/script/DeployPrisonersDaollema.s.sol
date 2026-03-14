// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./DeployHelpers.s.sol";
import {AgentAuthRegistry} from "../contracts/AgentAuthRegistry.sol";
import {PrisonersDaollema} from "../contracts/PrisonersDaollema.sol";

contract DeployPrisonersDaollema is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        address owner = vm.envOr("PRISONERS_OWNER", deployer);
        address treasury = vm.envOr("PRISONERS_TREASURY", deployer);
        uint256 entryFee = vm.envOr("PRISONERS_ENTRY_FEE_WEI", uint256(0.01 ether));
        uint256 minPlayers = vm.envOr("PRISONERS_MIN_PLAYERS", uint256(2));

        AgentAuthRegistry registry = new AgentAuthRegistry(owner);
        PrisonersDaollema game = new PrisonersDaollema(owner, treasury, address(registry), entryFee, minPlayers);

        deployments.push(Deployment({name: "AgentAuthRegistry", addr: address(registry)}));
        deployments.push(Deployment({name: "PrisonersDaollema", addr: address(game)}));
    }
}
