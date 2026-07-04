// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IBuildRegistry.sol";

/**
 * @title BountyGate
 * @notice Score-gated bounty system. Only developers with sufficient on-chain
 *         build reputation can claim bounties. Demonstrates composability of
 *         the BuildAttestationRegistry as a primitive.
 */
contract BountyGate {
    // ─── State ──────────────────────────────────────────────────────────────────

    IBuildRegistry public immutable registry;
    uint256 public requiredScore;
    address public owner;

    /// @notice Tracks which bounties have been claimed (and by whom)
    mapping(uint256 => address) public claimedBy;

    /// @notice Tracks which bounties exist and their metadata
    mapping(uint256 => Bounty) public bounties;
    uint256 public nextBountyId;

    struct Bounty {
        string title;
        uint256 reward; // in wei (MON)
        bool exists;
        bool claimed;
    }

    // ─── Events ─────────────────────────────────────────────────────────────────

    event BountyClaimed(address indexed dev, uint256 indexed bountyId, uint256 reward);
    event BountyCreated(uint256 indexed bountyId, string title, uint256 reward);
    event RequiredScoreUpdated(uint256 oldScore, uint256 newScore);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Errors ─────────────────────────────────────────────────────────────────

    error ScoreTooLow(uint256 current, uint256 required);
    error AlreadyClaimed(uint256 bountyId);
    error BountyNotFound(uint256 bountyId);
    error NotOwner();
    error ZeroAddress();
    error InsufficientFunds();

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor(address _registry, uint256 _requiredScore) {
        if (_registry == address(0)) revert ZeroAddress();
        registry = IBuildRegistry(_registry);
        requiredScore = _requiredScore;
        owner = msg.sender;
    }

    // ─── Bounty Management ──────────────────────────────────────────────────────

    /**
     * @notice Create a new bounty with a title and reward.
     *         Send MON with the transaction to fund the reward.
     */
    function createBounty(string calldata title) external payable onlyOwner {
        uint256 bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            title: title,
            reward: msg.value,
            exists: true,
            claimed: false
        });
        emit BountyCreated(bountyId, title, msg.value);
    }

    /**
     * @notice Claim a bounty. Requires score >= requiredScore.
     * @param bountyId The ID of the bounty to claim.
     */
    function claimBounty(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        if (!bounty.exists) revert BountyNotFound(bountyId);
        if (bounty.claimed) revert AlreadyClaimed(bountyId);

        uint256 devScore = registry.scoreOf(msg.sender);
        if (devScore < requiredScore) revert ScoreTooLow(devScore, requiredScore);

        bounty.claimed = true;
        claimedBy[bountyId] = msg.sender;

        // Transfer reward if funded
        if (bounty.reward > 0) {
            (bool success, ) = payable(msg.sender).call{value: bounty.reward}("");
            if (!success) revert InsufficientFunds();
        }

        emit BountyClaimed(msg.sender, bountyId, bounty.reward);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────────

    /**
     * @notice Update the required score threshold.
     */
    function setRequiredScore(uint256 newScore) external onlyOwner {
        emit RequiredScoreUpdated(requiredScore, newScore);
        requiredScore = newScore;
    }

    /**
     * @notice Transfer ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── View ───────────────────────────────────────────────────────────────────

    /**
     * @notice Check if a wallet is eligible to claim (score check only).
     */
    function isEligible(address dev) external view returns (bool) {
        return registry.scoreOf(dev) >= requiredScore;
    }

    /**
     * @notice Receive MON to fund bounties.
     */
    receive() external payable {}
}
