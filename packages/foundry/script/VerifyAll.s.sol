//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/Vm.sol";
import "solidity-bytes-utils/BytesLib.sol";

/**
 * @dev Temp Vm implementation
 * @notice calls the tryffi function on the Vm contract
 * @notice will be deleted once the forge/std is updated
 */
struct FfiResult {
    int32 exit_code;
    bytes stdout;
    bytes stderr;
}

interface tempVm {
    function tryFfi(string[] calldata) external returns (FfiResult memory);
}

contract VerifyAll is Script {
    uint96 currTransactionIdx;

    uint256 internal constant VERIFY_MAX_ATTEMPTS = 5;
    uint256 internal constant VERIFY_INTER_CONTRACT_DELAY_SECONDS = 2;
    uint256 internal constant VERIFY_INITIAL_BACKOFF_SECONDS = 2;

    function run() external {
        string memory path = _broadcastPath();
        console.logString(string.concat("Using verify broadcast file: ", path));
        string memory content = vm.readFile(path);

        while (nextTransaction(content)) {
            _verifyIfContractDeployment(content);
            currTransactionIdx++;
        }
    }

    function _broadcastPath() internal view returns (string memory) {
        if (vm.envExists("VERIFY_BROADCAST_FILE")) {
            return vm.envString("VERIFY_BROADCAST_FILE");
        }

        string memory root = vm.projectRoot();
        return string.concat(root, "/broadcast/Deploy.s.sol/", vm.toString(block.chainid), "/run-latest.json");
    }

    function _verifyIfContractDeployment(string memory content) internal {
        string memory txType =
            abi.decode(vm.parseJson(content, searchStr(currTransactionIdx, "transactionType")), (string));
        if (keccak256(bytes(txType)) == keccak256(bytes("CREATE"))) {
            _verifyContract(content);
        }
    }

    function _verifyContract(string memory content) internal {
        string memory contractName =
            abi.decode(vm.parseJson(content, searchStr(currTransactionIdx, "contractName")), (string));
        address contractAddr =
            abi.decode(vm.parseJson(content, searchStr(currTransactionIdx, "contractAddress")), (address));
        bytes memory deployedBytecode =
            abi.decode(vm.parseJson(content, searchStr(currTransactionIdx, "transaction.input")), (bytes));
        bytes memory compiledBytecode =
            abi.decode(vm.parseJson(_getCompiledBytecode(contractName), ".bytecode.object"), (bytes));
        bytes memory constructorArgs = _constructorArgsOrRevert(contractName, deployedBytecode, compiledBytecode);

        string[] memory inputs = new string[](9);
        inputs[0] = "forge";
        inputs[1] = "verify-contract";
        inputs[2] = vm.toString(contractAddr);
        inputs[3] = contractName;
        inputs[4] = "--chain";
        inputs[5] = vm.toString(block.chainid);
        inputs[6] = "--constructor-args";
        inputs[7] = vm.toString(constructorArgs);
        inputs[8] = "--watch";

        _runVerifyCommandWithRetry(contractName, contractAddr, inputs);
        _sleepSeconds(VERIFY_INTER_CONTRACT_DELAY_SECONDS);
    }

    function nextTransaction(string memory content) internal view returns (bool) {
        string memory hashPath = searchStr(currTransactionIdx, "hash");

        try vm.parseJson(content, hashPath) returns (bytes memory hashBytes) {
            if (hashBytes.length == 0) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    function _runVerifyCommandWithRetry(string memory contractName, address contractAddr, string[] memory inputs)
        internal
    {
        for (uint256 attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
            FfiResult memory f = tempVm(address(vm)).tryFfi(inputs);
            _logFfiResult(f);

            if (f.exit_code == 0) {
                return;
            }

            if (_isRateLimitFailure(f) && attempt < VERIFY_MAX_ATTEMPTS) {
                uint256 backoffSeconds = VERIFY_INITIAL_BACKOFF_SECONDS * attempt;
                console.logString(
                    string.concat(
                        "Explorer rate limit while verifying ",
                        contractName,
                        " at ",
                        vm.toString(contractAddr),
                        ". Retrying in ",
                        vm.toString(backoffSeconds),
                        "s"
                    )
                );
                _sleepSeconds(backoffSeconds);
                continue;
            }

            revert(string.concat("Verification failed for ", contractName, " at ", vm.toString(contractAddr)));
        }

        revert(string.concat("Verification failed after retries for ", contractName, " at ", vm.toString(contractAddr)));
    }

    function _logFfiResult(FfiResult memory f) internal view {
        if (f.stdout.length != 0) {
            console.logString(string(f.stdout));
        }
        if (f.stderr.length != 0) {
            console.logString(string(f.stderr));
        }
    }

    function _isRateLimitFailure(FfiResult memory f) internal pure returns (bool) {
        bytes memory stdout = f.stdout;
        bytes memory stderr = f.stderr;
        return _bytesContains(stdout, bytes("rate limit")) || _bytesContains(stderr, bytes("rate limit"))
            || _bytesContains(stdout, bytes("Rate limit")) || _bytesContains(stderr, bytes("Rate limit"))
            || _bytesContains(stdout, bytes("Max calls per sec")) || _bytesContains(stderr, bytes("Max calls per sec"));
    }

    function _bytesContains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0 || haystack.length < needle.length) {
            return false;
        }
        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) {
                return true;
            }
        }
        return false;
    }

    function _sleepSeconds(uint256 seconds_) internal {
        if (seconds_ == 0) return;

        string[] memory sleepCmd = new string[](3);
        sleepCmd[0] = "bash";
        sleepCmd[1] = "-lc";
        sleepCmd[2] = string.concat("sleep ", vm.toString(seconds_));
        vm.ffi(sleepCmd);
    }

    function _constructorArgsOrRevert(
        string memory contractName,
        bytes memory deployedBytecode,
        bytes memory compiledBytecode
    ) internal view returns (bytes memory constructorArgs) {
        if (deployedBytecode.length < compiledBytecode.length) {
            _logVerificationMismatch(contractName, deployedBytecode.length, compiledBytecode.length);
            revert(
                string.concat(
                    "Verification bytecode mismatch for ",
                    contractName,
                    ": compiled bytecode is longer than deployment input. Likely wrong FOUNDRY_PROFILE or stale out/ artifacts."
                )
            );
        }

        bytes memory deployedCreationPrefix = BytesLib.slice(deployedBytecode, 0, compiledBytecode.length);
        if (keccak256(deployedCreationPrefix) != keccak256(compiledBytecode)) {
            _logVerificationMismatch(contractName, deployedBytecode.length, compiledBytecode.length);
            revert(
                string.concat(
                    "Verification bytecode mismatch for ",
                    contractName,
                    ": deployment input does not begin with compiled bytecode. Likely wrong FOUNDRY_PROFILE or stale out/ artifacts."
                )
            );
        }

        constructorArgs = BytesLib.slice(
            deployedBytecode, compiledBytecode.length, deployedBytecode.length - compiledBytecode.length
        );
    }

    function _logVerificationMismatch(
        string memory contractName,
        uint256 deployedInputLength,
        uint256 compiledBytecodeLength
    ) internal view {
        console.logString("Verification bytecode mismatch detected.");
        console.logString(string.concat("contractName=", contractName));
        console.logString(string.concat("chainId=", vm.toString(block.chainid)));
        if (vm.envExists("FOUNDRY_PROFILE")) {
            console.logString(string.concat("FOUNDRY_PROFILE=", vm.envString("FOUNDRY_PROFILE")));
        } else {
            console.logString("FOUNDRY_PROFILE=<unset>");
        }
        console.logString(string.concat("deploymentInputBytes=", vm.toString(deployedInputLength)));
        console.logString(string.concat("compiledBytecodeBytes=", vm.toString(compiledBytecodeLength)));
        console.logString(
            "Hint: rerun verification with the same FOUNDRY_PROFILE and clean out/ artifacts used for deployment."
        );
    }

    function _getCompiledBytecode(string memory contractName) internal view returns (string memory compiledBytecode) {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/out/", contractName, ".sol/", contractName, ".json");
        compiledBytecode = vm.readFile(path);
    }

    function searchStr(uint96 idx, string memory searchKey) internal pure returns (string memory) {
        return string.concat(".transactions[", vm.toString(idx), "].", searchKey);
    }
}
