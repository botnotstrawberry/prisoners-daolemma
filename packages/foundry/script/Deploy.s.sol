// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./DeployPrisonersDAOlemma.s.sol";

contract DeployScript {
    function run() external {
        DeployPrisonersDAOlemma deployPrisonersDAOlemma = new DeployPrisonersDAOlemma();
        deployPrisonersDAOlemma.run();
    }
}
