// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./DeployHelpers.s.sol";
import { AgentAuthRegistry } from "../contracts/AgentAuthRegistry.sol";
import { GameChat } from "../contracts/GameChat.sol";
import { PrisonersDAOlemma } from "../contracts/PrisonersDAOlemma.sol";

contract DeployPrisonersDAOlemma is ScaffoldETHDeploy {
    uint256 internal constant BASE_MAINNET_CHAIN_ID = 8453;

    function run() external ScaffoldEthDeployerRunner {
        bool strictDeploy = block.chainid == BASE_MAINNET_CHAIN_ID || vm.envOr("PRISONERS_STRICT_DEPLOY", false);

        address owner = strictDeploy ? _requiredEnvAddress("PRISONERS_OWNER") : vm.envOr("PRISONERS_OWNER", deployer);
        address treasury = strictDeploy ? _requiredEnvAddress("PRISONERS_TREASURY") : vm.envOr("PRISONERS_TREASURY", deployer);
        address authVerifier = strictDeploy
            ? _requiredEnvAddress("PRISONERS_AUTH_VERIFIER")
            : vm.envOr("PRISONERS_AUTH_VERIFIER", owner);

        PrisonersDAOlemma.GameConfig memory defaultConfig = PrisonersDAOlemma.GameConfig({
            entryFeeWei: strictDeploy ? _requiredEnvUint("PRISONERS_ENTRY_FEE_WEI") : vm.envOr("PRISONERS_ENTRY_FEE_WEI", uint256(0.001 ether)),
            creatorFeeBps: uint16(strictDeploy ? _requiredEnvUint("PRISONERS_CREATOR_FEE_BPS") : vm.envOr("PRISONERS_CREATOR_FEE_BPS", uint256(100))),
            causeFeeBps: uint16(strictDeploy ? _requiredEnvUint("PRISONERS_CAUSE_FEE_BPS") : vm.envOr("PRISONERS_CAUSE_FEE_BPS", uint256(100))),
            joinDurationSeconds: uint32(strictDeploy ? _requiredEnvUint("PRISONERS_JOIN_DURATION_SECONDS") : vm.envOr("PRISONERS_JOIN_DURATION_SECONDS", uint256(900))),
            commitDurationBlocks: uint32(strictDeploy ? _requiredEnvUint("PRISONERS_COMMIT_DURATION_BLOCKS") : vm.envOr("PRISONERS_COMMIT_DURATION_BLOCKS", uint256(20))),
            revealDurationBlocks: uint32(strictDeploy ? _requiredEnvUint("PRISONERS_REVEAL_DURATION_BLOCKS") : vm.envOr("PRISONERS_REVEAL_DURATION_BLOCKS", uint256(20))),
            minPlayers: uint16(strictDeploy ? _requiredEnvUint("PRISONERS_MIN_PLAYERS") : vm.envOr("PRISONERS_MIN_PLAYERS", uint256(3))),
            maxPlayers: uint16(strictDeploy ? _requiredEnvUint("PRISONERS_MAX_PLAYERS") : vm.envOr("PRISONERS_MAX_PLAYERS", uint256(32))),
            maxCauses: uint16(strictDeploy ? _requiredEnvUint("PRISONERS_MAX_CAUSES") : vm.envOr("PRISONERS_MAX_CAUSES", uint256(8)))
        });

        AgentAuthRegistry registry = new AgentAuthRegistry(owner, authVerifier);
        PrisonersDAOlemma game = new PrisonersDAOlemma(owner, treasury, address(registry), defaultConfig);
        GameChat chat = new GameChat(address(game));

        deployments.push(Deployment({ name: "AgentAuthRegistry", addr: address(registry) }));
        deployments.push(Deployment({ name: "PrisonersDAOlemma", addr: address(game) }));
        deployments.push(Deployment({ name: "GameChat", addr: address(chat) }));
    }

    function _requiredEnvAddress(string memory key) internal view returns (address) {
        require(vm.envExists(key), string.concat("Missing required env: ", key));
        return vm.envAddress(key);
    }

    function _requiredEnvUint(string memory key) internal view returns (uint256) {
        require(vm.envExists(key), string.concat("Missing required env: ", key));
        return vm.envUint(key);
    }
}
