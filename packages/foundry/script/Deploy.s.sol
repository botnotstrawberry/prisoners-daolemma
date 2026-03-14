// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./DeployPrisonersDaollema.s.sol";

contract DeployScript {
    function run() external {
        DeployPrisonersDaollema deployPrisonersDaollema = new DeployPrisonersDaollema();
        deployPrisonersDaollema.run();
    }
}
