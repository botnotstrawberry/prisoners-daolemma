// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./DeployHelpers.s.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { GameChat } from "../contracts/GameChat.sol";
import { PrisonersDaollema } from "../contracts/PrisonersDaollema.sol";

contract DeployPrisonersDaollema is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        address owner = vm.envOr("PRISONERS_OWNER", deployer);
        address treasury = vm.envOr("PRISONERS_TREASURY", deployer);
        address authVerifier = vm.envOr("PRISONERS_AUTH_VERIFIER", owner);

        PrisonersDaollema.GameConfig memory defaultConfig = PrisonersDaollema.GameConfig({
            entryFeeWei: vm.envOr("PRISONERS_ENTRY_FEE_WEI", uint256(0.001 ether)),
            creatorFeeBps: uint16(vm.envOr("PRISONERS_CREATOR_FEE_BPS", uint256(100))),
            causeFeeBps: uint16(vm.envOr("PRISONERS_CAUSE_FEE_BPS", uint256(100))),
            joinDurationSeconds: uint32(vm.envOr("PRISONERS_JOIN_DURATION_SECONDS", uint256(900))),
            commitDurationBlocks: uint32(vm.envOr("PRISONERS_COMMIT_DURATION_BLOCKS", uint256(20))),
            revealDurationBlocks: uint32(vm.envOr("PRISONERS_REVEAL_DURATION_BLOCKS", uint256(20))),
            minPlayers: uint16(vm.envOr("PRISONERS_MIN_PLAYERS", uint256(3))),
            maxPlayers: uint16(vm.envOr("PRISONERS_MAX_PLAYERS", uint256(32))),
            maxCauses: uint16(vm.envOr("PRISONERS_MAX_CAUSES", uint256(8)))
        });

        AgentAuthRegistry registry = new AgentAuthRegistry(owner, authVerifier);
        PrisonersDaollema game = new PrisonersDaollema(owner, treasury, address(registry), defaultConfig);
        GameChat chat = new GameChat(address(game));

        deployments.push(Deployment({ name: "AgentAuthRegistry", addr: address(registry) }));
        deployments.push(Deployment({ name: "PrisonersDaollema", addr: address(game) }));
        deployments.push(Deployment({ name: "GameChat", addr: address(chat) }));
    }
}
