// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BuildAttestationRegistry.sol";
import "../src/BountyGate.sol";

contract BountyGateTest is Test {
    BuildAttestationRegistry public registry;
    BountyGate public gate;

    event BountyClaimed(address indexed dev, uint256 indexed bountyId, uint256 reward);

    address oracle = address(0x1);
    address dev1 = address(0x2);
    address dev2 = address(0x3);
    address gateOwner = address(0x5);

    bytes32 repoHash = keccak256("github.com/dev1/project");

    uint256 constant REQUIRED_SCORE = 500;

    function setUp() public {
        registry = new BuildAttestationRegistry(oracle);
        vm.prank(gateOwner);
        gate = new BountyGate(address(registry), REQUIRED_SCORE);
    }

    // ─── Helper ─────────────────────────────────────────────────────────────────

    function _buildScore(address dev, uint256 numBuilds) internal {
        for (uint256 i = 1; i <= numBuilds; i++) {
            BuildAttestationRegistry.BuildRecord memory rec = BuildAttestationRegistry.BuildRecord({
                commitHash: bytes32(i),
                parentCommitHash: bytes32(i - 1),
                attestationHash: keccak256(abi.encodePacked(i, "att")),
                repoHash: repoHash,
                ipfsCidHash: keccak256(abi.encodePacked(i, "ipfs")),
                confidenceScore: 9500,
                status: 1,
                dirtyTree: false,
                timestamp: block.timestamp
            });
            vm.prank(oracle);
            registry.submitBuild(dev, rec, false);

            // Advance day every 3 builds to avoid rate limiting
            if (i % 3 == 0) {
                vm.warp(block.timestamp + 1 days);
            }
        }
    }

    function _createFundedBounty(string memory title, uint256 reward) internal returns (uint256) {
        vm.prank(gateOwner);
        vm.deal(gateOwner, reward);
        gate.createBounty{value: reward}(title);
        return gate.nextBountyId() - 1;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    function test_constructor_setsRegistry() public view {
        assertEq(address(gate.registry()), address(registry));
    }

    function test_constructor_setsRequiredScore() public view {
        assertEq(gate.requiredScore(), REQUIRED_SCORE);
    }

    function test_constructor_setsOwner() public view {
        assertEq(gate.owner(), gateOwner);
    }

    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(BountyGate.ZeroAddress.selector);
        new BountyGate(address(0), 100);
    }

    // ─── Bounty Creation ────────────────────────────────────────────────────────

    function test_createBounty_success() public {
        vm.deal(gateOwner, 1 ether);
        vm.prank(gateOwner);
        gate.createBounty{value: 1 ether}("Fix the login bug");

        (string memory title, uint256 reward, bool exists, bool claimed) = gate.bounties(0);
        assertEq(title, "Fix the login bug");
        assertEq(reward, 1 ether);
        assertTrue(exists);
        assertFalse(claimed);
    }

    function test_createBounty_incrementsId() public {
        vm.startPrank(gateOwner);
        gate.createBounty("First");
        gate.createBounty("Second");
        vm.stopPrank();
        assertEq(gate.nextBountyId(), 2);
    }

    function test_createBounty_revertsIfNotOwner() public {
        vm.prank(dev1);
        vm.expectRevert(BountyGate.NotOwner.selector);
        gate.createBounty("Unauthorized");
    }

    // ─── Claim — Success ────────────────────────────────────────────────────────

    function test_claimBounty_successWhenScoreSufficient() public {
        // Build enough score for dev1 (need >= 500)
        // Each day: 3 builds at full points. Builds accumulate streak.
        // Day 1: 110 + 120 + 130 = 360
        // Day 2: 140 + 150 + 160 = 450 → total = 810 > 500
        _buildScore(dev1, 6);
        assertGe(registry.scoreOf(dev1), REQUIRED_SCORE);

        uint256 bountyId = _createFundedBounty("Build a widget", 0.5 ether);

        uint256 balBefore = dev1.balance;
        vm.prank(dev1);
        gate.claimBounty(bountyId);

        assertEq(dev1.balance, balBefore + 0.5 ether);
        assertEq(gate.claimedBy(bountyId), dev1);
    }

    function test_claimBounty_emitsEvent() public {
        _buildScore(dev1, 6);
        uint256 bountyId = _createFundedBounty("Event test", 0.1 ether);

        vm.prank(dev1);
        vm.expectEmit(true, true, false, true);
        emit BountyClaimed(dev1, bountyId, 0.1 ether);
        gate.claimBounty(bountyId);
    }

    // ─── Claim — Failures ───────────────────────────────────────────────────────

    function test_claimBounty_revertsWhenScoreTooLow() public {
        // dev2 has no score
        vm.prank(gateOwner);
        gate.createBounty("High bar");
        
        vm.prank(dev2);
        vm.expectRevert(abi.encodeWithSelector(BountyGate.ScoreTooLow.selector, 0, REQUIRED_SCORE));
        gate.claimBounty(0);
    }

    function test_claimBounty_revertsWhenAlreadyClaimed() public {
        _buildScore(dev1, 6);
        _buildScore(dev2, 6);
        uint256 bountyId = _createFundedBounty("One-time only", 0.1 ether);

        vm.prank(dev1);
        gate.claimBounty(bountyId);

        // Second claim by different eligible dev
        vm.prank(dev2);
        vm.expectRevert(abi.encodeWithSelector(BountyGate.AlreadyClaimed.selector, bountyId));
        gate.claimBounty(bountyId);
    }

    function test_claimBounty_revertsWhenBountyNotFound() public {
        _buildScore(dev1, 6);

        vm.prank(dev1);
        vm.expectRevert(abi.encodeWithSelector(BountyGate.BountyNotFound.selector, 999));
        gate.claimBounty(999);
    }

    // ─── Integration: Build Score → Claim ───────────────────────────────────────

    function test_integration_buildScoreThenClaim() public {
        // Start with 0 score
        assertEq(registry.scoreOf(dev1), 0);
        assertFalse(gate.isEligible(dev1));

        // Build up score over several days
        _buildScore(dev1, 6);

        // Now eligible
        assertTrue(gate.isEligible(dev1));

        // Claim bounty
        uint256 bountyId = _createFundedBounty("Integration test", 0.2 ether);
        vm.prank(dev1);
        gate.claimBounty(bountyId);

        (, , , bool claimed) = gate.bounties(bountyId);
        assertTrue(claimed);
    }

    function test_integration_scorePenaltyBlocksClaim() public {
        // Build to just above threshold
        _buildScore(dev1, 6); // ~810

        // Lower threshold to just under current score
        vm.prank(gateOwner);
        gate.setRequiredScore(800);
        assertTrue(gate.isEligible(dev1));

        // Flag dev1 repeatedly to drop below threshold
        for (uint256 i = 0; i < 15; i++) {
            BuildAttestationRegistry.BuildRecord memory rec = BuildAttestationRegistry.BuildRecord({
                commitHash: bytes32(uint256(100 + i)),
                parentCommitHash: bytes32(uint256(99 + i)),
                attestationHash: keccak256(abi.encodePacked(i, "flag")),
                repoHash: repoHash,
                ipfsCidHash: keccak256(abi.encodePacked(i, "flag-ipfs")),
                confidenceScore: 1000,
                status: 2, // flagged
                dirtyTree: false,
                timestamp: block.timestamp
            });
            vm.prank(oracle);
            registry.submitBuild(dev1, rec, false);
        }

        // Score should have dropped below 800
        assertFalse(gate.isEligible(dev1));

        // Create and try to claim
        uint256 bountyId = _createFundedBounty("Blocked", 0.1 ether);
        vm.prank(dev1);
        vm.expectRevert(
            abi.encodeWithSelector(BountyGate.ScoreTooLow.selector, registry.scoreOf(dev1), 800)
        );
        gate.claimBounty(bountyId);
    }

    // ─── Admin Functions ────────────────────────────────────────────────────────

    function test_setRequiredScore_success() public {
        vm.prank(gateOwner);
        gate.setRequiredScore(1000);
        assertEq(gate.requiredScore(), 1000);
    }

    function test_setRequiredScore_revertsIfNotOwner() public {
        vm.prank(dev1);
        vm.expectRevert(BountyGate.NotOwner.selector);
        gate.setRequiredScore(1000);
    }

    function test_transferOwnership_success() public {
        vm.prank(gateOwner);
        gate.transferOwnership(dev1);
        assertEq(gate.owner(), dev1);
    }

    function test_transferOwnership_revertsOnZeroAddress() public {
        vm.prank(gateOwner);
        vm.expectRevert(BountyGate.ZeroAddress.selector);
        gate.transferOwnership(address(0));
    }

    // ─── isEligible ─────────────────────────────────────────────────────────────

    function test_isEligible_falseWhenNoScore() public view {
        assertFalse(gate.isEligible(dev1));
    }

    function test_isEligible_trueWhenScoreMet() public {
        _buildScore(dev1, 6);
        assertTrue(gate.isEligible(dev1));
    }

    // ─── Zero-Reward Bounty ─────────────────────────────────────────────────────

    function test_claimBounty_zeroRewardWorks() public {
        _buildScore(dev1, 6);

        vm.prank(gateOwner);
        gate.createBounty("Honor only");

        vm.prank(dev1);
        gate.claimBounty(0); // No revert, no transfer

        assertEq(gate.claimedBy(0), dev1);
    }

    // ─── Receive ────────────────────────────────────────────────────────────────

    function test_receiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool success, ) = address(gate).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(gate).balance, 1 ether);
    }
}
