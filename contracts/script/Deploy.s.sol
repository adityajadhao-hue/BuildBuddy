// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BuildAttestationRegistry.sol";
import "../src/BountyGate.sol";

/**
 * @title Deploy
 * @notice Deploys BuildAttestationRegistry and BountyGate to Monad testnet.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --private-key $ORACLE_PRIVATE_KEY \
 *     -vvvv
 *
 * The deployer address becomes the oracle AND the BountyGate owner.
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ORACLE_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 requiredScore = vm.envOr("BOUNTY_REQUIRED_SCORE", uint256(500));

        console.log("Deployer (oracle):", deployer);
        console.log("Required score for BountyGate:", requiredScore);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Registry with deployer as oracle
        BuildAttestationRegistry registry = new BuildAttestationRegistry(deployer);
        console.log("BuildAttestationRegistry deployed at:", address(registry));

        // Deploy BountyGate pointing to registry
        BountyGate gate = new BountyGate(address(registry), requiredScore);
        console.log("BountyGate deployed at:", address(gate));

        vm.stopBroadcast();

        // Log for easy .env update
        console.log("");
        console.log("=== Add to backend .env ===");
        console.log("REGISTRY_CONTRACT_ADDRESS=", address(registry));
        console.log("BOUNTYGATE_CONTRACT_ADDRESS=", address(gate));
    }
}
