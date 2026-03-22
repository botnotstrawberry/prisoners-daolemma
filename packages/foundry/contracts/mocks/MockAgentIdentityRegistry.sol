// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract MockAgentIdentityRegistry {
    error NotRegistered();
    error InvalidOwner();

    uint256 private _nextTokenId = 1;

    mapping(uint256 agentId => address owner) private _owners;
    mapping(address owner => uint256 balance) private _balances;
    mapping(uint256 agentId => string uri) private _tokenUris;

    function setOwner(uint256 agentId, address owner) external {
        address previousOwner = _owners[agentId];
        if (previousOwner != address(0)) {
            _balances[previousOwner] -= 1;
        }

        _owners[agentId] = owner;

        if (owner != address(0)) {
            _balances[owner] += 1;
        }

        if (agentId >= _nextTokenId) {
            _nextTokenId = agentId + 1;
        }
    }

    function mint(address to) external returns (uint256 agentId) {
        return _mint(to, "");
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        return _mint(msg.sender, agentURI);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address owner = _owners[agentId];
        if (owner == address(0)) revert NotRegistered();
        return owner;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidOwner();
        return _balances[owner];
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        if (_owners[agentId] == address(0)) revert NotRegistered();
        return _tokenUris[agentId];
    }

    function _mint(address to, string memory agentURI) internal returns (uint256 agentId) {
        if (to == address(0)) revert InvalidOwner();

        agentId = _nextTokenId;
        _nextTokenId += 1;

        _owners[agentId] = to;
        _balances[to] += 1;
        _tokenUris[agentId] = agentURI;
    }
}
