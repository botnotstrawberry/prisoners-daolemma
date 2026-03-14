// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAgentAuthRegistry {
    function isAuthorized(address wallet) external view returns (bool);
}

/// @title Prisoners DAOllema
/// @notice Fresh hackathon skeleton for the onchain agent game.
/// @dev The full game loop will be implemented from CANON.md + ARCHITECTURE.md + BUILD_PLAN.md.
contract PrisonersDaollema is Ownable {
    error InvalidConfiguration();

    enum Phase {
        Unconfigured,
        Join,
        Commit,
        Reveal,
        Ended,
        Cancelled
    }

    address public treasury;
    address public authRegistry;
    uint256 public entryFee;
    uint256 public minPlayers;
    uint256 public currentGameId;
    Phase public currentPhase;

    event CoreConfigured(address indexed treasury, address indexed authRegistry, uint256 entryFee, uint256 minPlayers);
    event PhaseAdvanced(uint256 indexed gameId, Phase newPhase);

    constructor(address owner_, address treasury_, address authRegistry_, uint256 entryFee_, uint256 minPlayers_)
        Ownable(owner_)
    {
        _configureCore(treasury_, authRegistry_, entryFee_, minPlayers_);
        currentPhase = Phase.Unconfigured;
    }

    function configureCore(address treasury_, address authRegistry_, uint256 entryFee_, uint256 minPlayers_)
        external
        onlyOwner
    {
        _configureCore(treasury_, authRegistry_, entryFee_, minPlayers_);
    }

    function startJoinPhase() external onlyOwner {
        currentGameId += 1;
        currentPhase = Phase.Join;
        emit PhaseAdvanced(currentGameId, Phase.Join);
    }

    function isAdmissionReady(address wallet) external view returns (bool) {
        if (authRegistry == address(0) || wallet == address(0)) return false;
        return IAgentAuthRegistry(authRegistry).isAuthorized(wallet);
    }

    function _configureCore(address treasury_, address authRegistry_, uint256 entryFee_, uint256 minPlayers_) internal {
        if (treasury_ == address(0) || authRegistry_ == address(0) || minPlayers_ == 0) {
            revert InvalidConfiguration();
        }

        treasury = treasury_;
        authRegistry = authRegistry_;
        entryFee = entryFee_;
        minPlayers = minPlayers_;

        emit CoreConfigured(treasury_, authRegistry_, entryFee_, minPlayers_);
    }
}
