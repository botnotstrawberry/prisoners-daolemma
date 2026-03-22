// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IAgentAuthRegistry } from "./interfaces/IAgentAuthRegistry.sol";

/// @title ERC8004AuthAdapter
/// @notice Permissionless auth adapter for Prisoners DAOlemma.
/// @dev Any wallet holding at least one identity token on the configured ERC-8004 registry is authorized.
contract ERC8004AuthAdapter is IAgentAuthRegistry {
    error InvalidIdentityRegistry();

    bytes32 internal constant _AGENT_KEY_NAMESPACE = keccak256("erc8004-agent");

    IERC721 public immutable identityRegistry;

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0) || identityRegistry_.code.length == 0) {
            revert InvalidIdentityRegistry();
        }
        identityRegistry = IERC721(identityRegistry_);
    }

    function isAuthorized(address wallet) external view override returns (bool) {
        if (wallet == address(0)) return false;
        return identityRegistry.balanceOf(wallet) > 0;
    }

    function agentKeyOf(address wallet) external view override returns (bytes32) {
        if (wallet == address(0)) return bytes32(0);
        if (identityRegistry.balanceOf(wallet) == 0) return bytes32(0);
        return keccak256(abi.encodePacked(_AGENT_KEY_NAMESPACE, wallet));
    }
}
