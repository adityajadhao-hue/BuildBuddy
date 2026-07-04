// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BuildAttestationRegistry.sol";

contract BuildAttestationRegistryTest is Test {
    BuildAttestationRegistry public registry;

    event IdentityLinked(address indexed dev, string githubHandle);
    event BuildSubmitted(address indexed dev, bytes32 indexed repoHash, uint256 index, uint8 status, bytes32 attestationHash);
    event ScoreUpdated(address indexed dev, uint256 newScore, uint32 repoStreak);

    address oracle = address(0x1);
    address dev1 = address(0x2);
    address dev2 = address(0x3);
    address attacker = address(0x4);

    bytes32 repoHash1 = keccak256("github.com/dev1/project-a");
    bytes32 repoHash2 = keccak256("github.com/dev1/project-b");

    function setUp() public {
        registry = new BuildAttestationRegistry(oracle);
    }

    // ─── Helper ─────────────────────────────────────────────────────────────────

    function _buildRecord(
        bytes32 commitHash,
        bytes32 parentCommit,
        bytes32 repoHash,
        uint8 status
    ) internal view returns (BuildAttestationRegistry.BuildRecord memory) {
        return BuildAttestationRegistry.BuildRecord({
            commitHash: commitHash,
            parentCommitHash: parentCommit,
            attestationHash: keccak256(abi.encodePacked(commitHash, "attestation")),
            repoHash: repoHash,
            ipfsCidHash: keccak256(abi.encodePacked(commitHash, "ipfs")),
            confidenceScore: 9500,
            status: status,
            dirtyTree: false,
            timestamp: block.timestamp
        });
    }

    function _submitBuild(
        address dev,
        bytes32 commitHash,
        bytes32 parentCommit,
        bytes32 repoHash,
        uint8 status,
        bool trivialDiff
    ) internal {
        BuildAttestationRegistry.BuildRecord memory rec = _buildRecord(
            commitHash, parentCommit, repoHash, status
        );
        vm.prank(oracle);
        registry.submitBuild(dev, rec, trivialDiff);
    }

    // ─── Constructor Tests ──────────────────────────────────────────────────────

    function test_constructor_setsOracle() public view {
        assertEq(registry.trustedOracle(), oracle);
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(BuildAttestationRegistry.ZeroAddress.selector);
        new BuildAttestationRegistry(address(0));
    }

    // ─── Access Control ─────────────────────────────────────────────────────────

    function test_submitBuild_revertsIfNotOracle() public {
        BuildAttestationRegistry.BuildRecord memory rec = _buildRecord(
            bytes32(uint256(1)), bytes32(0), repoHash1, 1
        );
        vm.prank(attacker);
        vm.expectRevert(BuildAttestationRegistry.NotOracle.selector);
        registry.submitBuild(dev1, rec, false);
    }

    function test_linkGithub_revertsIfNotOracle() public {
        vm.prank(attacker);
        vm.expectRevert(BuildAttestationRegistry.NotOracle.selector);
        registry.linkGithub(dev1, "dev1");
    }

    function test_transferOracle_revertsIfNotOracle() public {
        vm.prank(attacker);
        vm.expectRevert(BuildAttestationRegistry.NotOracle.selector);
        registry.transferOracle(attacker);
    }

    function test_transferOracle_success() public {
        address newOracle = address(0x99);
        vm.prank(oracle);
        registry.transferOracle(newOracle);
        assertEq(registry.trustedOracle(), newOracle);
    }

    function test_transferOracle_revertsOnZeroAddress() public {
        vm.prank(oracle);
        vm.expectRevert(BuildAttestationRegistry.ZeroAddress.selector);
        registry.transferOracle(address(0));
    }

    // ─── Pass Scoring ───────────────────────────────────────────────────────────

    function test_passingBuild_awardsBasePoints() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);

        // First build: 100 + streak(1) * 10 = 110
        assertEq(registry.scoreOf(dev1), 110);
        assertEq(registry.streakOf(dev1, repoHash1), 1);
    }

    function test_passingBuild_streakAccumulates() public {
        // Build 1: streak=1, points=110
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), 110);
        assertEq(registry.streakOf(dev1, repoHash1), 1);

        // Build 2: streak=2, points=120 → total=230
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), 230);
        assertEq(registry.streakOf(dev1, repoHash1), 2);

        // Build 3: streak=3, points=130 → total=360
        _submitBuild(dev1, bytes32(uint256(3)), bytes32(uint256(2)), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), 360);
        assertEq(registry.streakOf(dev1, repoHash1), 3);
    }

    // ─── Rate Limiting ──────────────────────────────────────────────────────────

    function test_rateLimiting_buildsOneToThree_fullPoints() public {
        // Builds 1-3 get full points
        for (uint256 i = 1; i <= 3; i++) {
            _submitBuild(dev1, bytes32(i), bytes32(i - 1), repoHash1, 1, false);
        }
        // streak=3: 110 + 120 + 130 = 360
        assertEq(registry.scoreOf(dev1), 360);
    }

    function test_rateLimiting_buildsFourFive_halfPoints() public {
        // First 3 builds: full points → 360
        for (uint256 i = 1; i <= 3; i++) {
            _submitBuild(dev1, bytes32(i), bytes32(i - 1), repoHash1, 1, false);
        }
        assertEq(registry.scoreOf(dev1), 360);

        // Build 4 (todayCount=3): half points, streak=4 → (100+40)/2 = 70
        _submitBuild(dev1, bytes32(uint256(4)), bytes32(uint256(3)), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), 430);
        assertEq(registry.streakOf(dev1, repoHash1), 4);

        // Build 5 (todayCount=4): half points, streak=5 → (100+50)/2 = 75
        _submitBuild(dev1, bytes32(uint256(5)), bytes32(uint256(4)), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), 505);
        assertEq(registry.streakOf(dev1, repoHash1), 5);
    }

    function test_rateLimiting_buildSixPlus_zeroPoints() public {
        // First 5 builds
        for (uint256 i = 1; i <= 5; i++) {
            _submitBuild(dev1, bytes32(i), bytes32(i - 1), repoHash1, 1, false);
        }
        uint256 scoreBefore = registry.scoreOf(dev1);

        // Build 6+: 0 points but streak still increments
        _submitBuild(dev1, bytes32(uint256(6)), bytes32(uint256(5)), repoHash1, 1, false);
        assertEq(registry.scoreOf(dev1), scoreBefore); // no change
        assertEq(registry.streakOf(dev1, repoHash1), 6); // streak still goes up
    }

    // ─── Fail Scoring ───────────────────────────────────────────────────────────

    function test_failedBuild_zeroPointsAndStreakReset() public {
        // Build streak first
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);
        assertEq(registry.streakOf(dev1, repoHash1), 2);
        uint256 scoreBefore = registry.scoreOf(dev1);

        // Failed build: 0 points, streak resets
        _submitBuild(dev1, bytes32(uint256(3)), bytes32(uint256(2)), repoHash1, 0, false);
        assertEq(registry.scoreOf(dev1), scoreBefore); // unchanged
        assertEq(registry.streakOf(dev1, repoHash1), 0); // reset
    }

    // ─── Flagged Scoring ────────────────────────────────────────────────────────

    function test_flaggedBuild_penaltyAndStreakReset() public {
        // Build up some score
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);
        uint256 scoreBefore = registry.scoreOf(dev1); // 230
        assertEq(registry.streakOf(dev1, repoHash1), 2);

        // Flagged build: -25 points, streak resets
        _submitBuild(dev1, bytes32(uint256(3)), bytes32(uint256(2)), repoHash1, 2, false);
        assertEq(registry.scoreOf(dev1), scoreBefore - 25); // 205
        assertEq(registry.streakOf(dev1, repoHash1), 0);
    }

    function test_flaggedBuild_scoreDoesNotUnderflow() public {
        // No score accumulated — flag should set to 0, not underflow
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 2, false);
        assertEq(registry.scoreOf(dev1), 0);
    }

    function test_flaggedBuild_scoreNearZero() public {
        // Score = 10 (less than 25)
        // Give some score first, then reduce it
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false); // 110
        // Now flag 4 times → 110 - 25 - 25 - 25 - 25 = 10
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 2, false); // 85
        _submitBuild(dev1, bytes32(uint256(3)), bytes32(uint256(2)), repoHash1, 2, false); // 60
        _submitBuild(dev1, bytes32(uint256(4)), bytes32(uint256(3)), repoHash1, 2, false); // 35
        _submitBuild(dev1, bytes32(uint256(5)), bytes32(uint256(4)), repoHash1, 2, false); // 10
        assertEq(registry.scoreOf(dev1), 10);

        // One more flag: 10 < 25 → goes to 0
        _submitBuild(dev1, bytes32(uint256(6)), bytes32(uint256(5)), repoHash1, 2, false);
        assertEq(registry.scoreOf(dev1), 0);
    }

    // ─── Trivial Diff ───────────────────────────────────────────────────────────

    function test_trivialDiff_zeroPointsAndStreakReset() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false); // 110
        uint256 scoreBefore = registry.scoreOf(dev1);

        // Trivial diff: pass but 0 points, streak resets
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, true);
        assertEq(registry.scoreOf(dev1), scoreBefore); // unchanged
        assertEq(registry.streakOf(dev1, repoHash1), 0); // reset
    }

    // ─── Per-Repo Isolation ─────────────────────────────────────────────────────

    function test_perRepoIsolation_separateStreaks() public {
        // Build on repo 1
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        assertEq(registry.streakOf(dev1, repoHash1), 1);
        assertEq(registry.streakOf(dev1, repoHash2), 0);

        // Build on repo 2
        _submitBuild(dev1, bytes32(uint256(10)), bytes32(0), repoHash2, 1, false);
        assertEq(registry.streakOf(dev1, repoHash1), 1);
        assertEq(registry.streakOf(dev1, repoHash2), 1);
    }

    function test_perRepoIsolation_failOnOneDoesNotAffectOther() public {
        // Build streaks on both repos
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(10)), bytes32(0), repoHash2, 1, false);

        // Fail on repo 1
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 0, false);
        assertEq(registry.streakOf(dev1, repoHash1), 0); // reset
        assertEq(registry.streakOf(dev1, repoHash2), 1); // unaffected
    }

    function test_perRepoIsolation_separateBuildHistories() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(10)), bytes32(0), repoHash2, 1, false);

        assertEq(registry.getBuildCount(dev1, repoHash1), 2);
        assertEq(registry.getBuildCount(dev1, repoHash2), 1);
    }

    function test_perRepoIsolation_separateRateLimits() public {
        // Max out repo 1 (6 builds)
        for (uint256 i = 1; i <= 6; i++) {
            _submitBuild(dev1, bytes32(i), bytes32(i - 1), repoHash1, 1, false);
        }
        uint256 scoreAfterRepo1 = registry.scoreOf(dev1);

        // Repo 2 should still get full points (its own rate limit)
        _submitBuild(dev1, bytes32(uint256(100)), bytes32(0), repoHash2, 1, false);
        assertGt(registry.scoreOf(dev1), scoreAfterRepo1); // got points
    }

    // ─── Score is Aggregate Across Repos ────────────────────────────────────────

    function test_scoreIsAggregateAcrossRepos() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false); // 110
        _submitBuild(dev1, bytes32(uint256(10)), bytes32(0), repoHash2, 1, false); // 110
        assertEq(registry.scoreOf(dev1), 220); // aggregated
    }

    // ─── Identity Linking ───────────────────────────────────────────────────────

    function test_linkGithub_success() public {
        vm.prank(oracle);
        registry.linkGithub(dev1, "octocat");
        assertEq(registry.githubOf(dev1), "octocat");
    }

    function test_linkGithub_emitsEvent() public {
        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit IdentityLinked(dev1, "octocat");
        registry.linkGithub(dev1, "octocat");
    }

    function test_linkGithub_canOverwrite() public {
        vm.prank(oracle);
        registry.linkGithub(dev1, "old-handle");
        vm.prank(oracle);
        registry.linkGithub(dev1, "new-handle");
        assertEq(registry.githubOf(dev1), "new-handle");
    }

    // ─── View Functions ─────────────────────────────────────────────────────────

    function test_getLatestBuild_returnsCorrectRecord() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);

        BuildAttestationRegistry.BuildRecord memory latest = registry.getLatestBuild(dev1, repoHash1);
        assertEq(latest.commitHash, bytes32(uint256(2)));
        assertEq(latest.parentCommitHash, bytes32(uint256(1)));
    }

    function test_getLatestBuild_revertsWhenEmpty() public {
        vm.expectRevert("no builds");
        registry.getLatestBuild(dev1, repoHash1);
    }

    function test_getBuild_returnsCorrectIndex() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 0, false);

        BuildAttestationRegistry.BuildRecord memory first = registry.getBuild(dev1, repoHash1, 0);
        assertEq(first.commitHash, bytes32(uint256(1)));
        assertEq(first.status, 1);

        BuildAttestationRegistry.BuildRecord memory second = registry.getBuild(dev1, repoHash1, 1);
        assertEq(second.commitHash, bytes32(uint256(2)));
        assertEq(second.status, 0);
    }

    function test_getBuild_revertsOnOutOfBounds() public {
        vm.expectRevert("index out of bounds");
        registry.getBuild(dev1, repoHash1, 0);
    }

    function test_getBuildCount_returnsZeroInitially() public view {
        assertEq(registry.getBuildCount(dev1, repoHash1), 0);
    }

    // ─── Events ─────────────────────────────────────────────────────────────────

    function test_submitBuild_emitsBuildSubmitted() public {
        BuildAttestationRegistry.BuildRecord memory rec = _buildRecord(
            bytes32(uint256(1)), bytes32(0), repoHash1, 1
        );

        vm.prank(oracle);
        vm.expectEmit(true, true, false, true);
        emit BuildSubmitted(
            dev1,
            repoHash1,
            0, // first build index
            1, // pass
            rec.attestationHash
        );
        registry.submitBuild(dev1, rec, false);
    }

    function test_submitBuild_emitsScoreUpdated() public {
        BuildAttestationRegistry.BuildRecord memory rec = _buildRecord(
            bytes32(uint256(1)), bytes32(0), repoHash1, 1
        );

        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit ScoreUpdated(dev1, 110, 1);
        registry.submitBuild(dev1, rec, false);
    }

    // ─── Dirty Tree ─────────────────────────────────────────────────────────────

    function test_dirtyTree_zeroPointsAndStreakReset() public {
        // Build up a streak
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        uint256 scoreBefore = registry.scoreOf(dev1);

        // Dirty tree record (pass status but dirty tree = true)
        BuildAttestationRegistry.BuildRecord memory rec = BuildAttestationRegistry.BuildRecord({
            commitHash: bytes32(uint256(2)),
            parentCommitHash: bytes32(uint256(1)),
            attestationHash: keccak256("dirty"),
            repoHash: repoHash1,
            ipfsCidHash: keccak256("ipfs-dirty"),
            confidenceScore: 5000,
            status: 1, // pass
            dirtyTree: true, // BUT dirty
            timestamp: block.timestamp
        });

        vm.prank(oracle);
        registry.submitBuild(dev1, rec, false);

        // Dirty tree with pass → treated as fail pathway: 0 points, streak reset
        assertEq(registry.scoreOf(dev1), scoreBefore);
        assertEq(registry.streakOf(dev1, repoHash1), 0);
    }

    // ─── Multi-Developer Isolation ──────────────────────────────────────────────

    function test_multiDeveloper_separateScores() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev2, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);

        assertEq(registry.scoreOf(dev1), 110);
        assertEq(registry.scoreOf(dev2), 110);
    }

    function test_multiDeveloper_flagOneDoesNotAffectOther() public {
        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        _submitBuild(dev2, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);

        // Flag dev1
        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 2, false);

        assertEq(registry.scoreOf(dev1), 85); // 110 - 25
        assertEq(registry.scoreOf(dev2), 110); // unaffected
    }

    // ─── Day Boundary (Rate Limit Reset) ────────────────────────────────────────

    function test_rateLimitResetsNextDay() public {
        // Max out today (6 builds)
        for (uint256 i = 1; i <= 6; i++) {
            _submitBuild(dev1, bytes32(i), bytes32(i - 1), repoHash1, 1, false);
        }
        uint256 scoreAtEndOfDay = registry.scoreOf(dev1);

        // Advance 1 day
        vm.warp(block.timestamp + 1 days);

        // New day: full points again (streak continues from 6)
        _submitBuild(dev1, bytes32(uint256(7)), bytes32(uint256(6)), repoHash1, 1, false);
        // streak=7, points = 100 + 70 = 170
        assertEq(registry.scoreOf(dev1), scoreAtEndOfDay + 170);
    }

    // ─── getDailyBuildCount ─────────────────────────────────────────────────────

    function test_getDailyBuildCount() public {
        uint256 today = block.timestamp / 1 days;
        assertEq(registry.getDailyBuildCount(dev1, repoHash1, today), 0);

        _submitBuild(dev1, bytes32(uint256(1)), bytes32(0), repoHash1, 1, false);
        assertEq(registry.getDailyBuildCount(dev1, repoHash1, today), 1);

        _submitBuild(dev1, bytes32(uint256(2)), bytes32(uint256(1)), repoHash1, 1, false);
        assertEq(registry.getDailyBuildCount(dev1, repoHash1, today), 2);
    }
}
