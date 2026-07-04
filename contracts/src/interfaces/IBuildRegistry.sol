// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBuildRegistry
 * @notice Interface for consuming the BuildAttestationRegistry's score data.
 *         Any contract that gates on developer reputation implements against this.
 */
interface IBuildRegistry {
    function scoreOf(address dev) external view returns (uint256);
    function streakOf(address dev, bytes32 repoHash) external view returns (uint32);
    function githubOf(address dev) external view returns (string memory);
    function getBuildCount(address dev, bytes32 repoHash) external view returns (uint256);
}
