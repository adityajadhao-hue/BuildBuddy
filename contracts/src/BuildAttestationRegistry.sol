// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BuildAttestationRegistry
 * @notice On-chain registry for verified build attestations.
 *         Stores gas-optimized fixed-size records per wallet per repo.
 *         Only the trusted oracle (backend verification service) can submit.
 */
contract BuildAttestationRegistry {
    // ─── Structs ────────────────────────────────────────────────────────────────

    struct BuildRecord {
        bytes32 commitHash;
        bytes32 parentCommitHash;
        bytes32 attestationHash; // keccak256(full IPFS JSON)
        bytes32 repoHash; // keccak256(repoUrl)
        bytes32 ipfsCidHash; // keccak256(ipfsCid)
        uint16 confidenceScore; // 0-10000 bps
        uint8 status; // 0=fail, 1=pass, 2=flagged
        bool dirtyTree;
        uint256 timestamp;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    address public trustedOracle;

    /// @notice Per-wallet, per-repo build history
    mapping(address => mapping(bytes32 => BuildRecord[])) public buildsOf;

    /// @notice Aggregate score per wallet (across all repos)
    mapping(address => uint256) public scoreOf;

    /// @notice Streak per wallet per repo (consecutive passing builds)
    mapping(address => mapping(bytes32 => uint32)) public streakOf;

    /// @notice Verified GitHub handle (only oracle can set after gist verification)
    mapping(address => string) public githubOf;

    /// @notice Rate limiting: builds per wallet per repo per day
    mapping(address => mapping(bytes32 => mapping(uint256 => uint8))) public dailyBuilds;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event BuildSubmitted(
        address indexed dev,
        bytes32 indexed repoHash,
        uint256 index,
        uint8 status,
        bytes32 attestationHash
    );

    event ScoreUpdated(address indexed dev, uint256 newScore, uint32 repoStreak);

    event IdentityLinked(address indexed dev, string githubHandle);

    event OracleTransferred(address indexed previousOracle, address indexed newOracle);

    // ─── Errors ─────────────────────────────────────────────────────────────────

    error NotOracle();
    error ZeroAddress();

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOracle() {
        if (msg.sender != trustedOracle) revert NotOracle();
        _;
    }

    // ─── Constructor ────────────────────────────────────────────────────────────

    constructor(address _oracle) {
        if (_oracle == address(0)) revert ZeroAddress();
        trustedOracle = _oracle;
    }

    // ─── Oracle Management ──────────────────────────────────────────────────────

    /**
     * @notice Transfer oracle role to a new address.
     * @param newOracle The new oracle address.
     */
    function transferOracle(address newOracle) external onlyOracle {
        if (newOracle == address(0)) revert ZeroAddress();
        emit OracleTransferred(trustedOracle, newOracle);
        trustedOracle = newOracle;
    }

    // ─── Identity ───────────────────────────────────────────────────────────────

    /**
     * @notice Link a GitHub handle to a wallet (only after backend verifies gist).
     * @param dev The developer's wallet address.
     * @param handle The verified GitHub username.
     */
    function linkGithub(address dev, string calldata handle) external onlyOracle {
        githubOf[dev] = handle;
        emit IdentityLinked(dev, handle);
    }

    // ─── Build Submission ───────────────────────────────────────────────────────

    /**
     * @notice Submit a verified build attestation.
     * @param dev The developer's wallet address.
     * @param rec The build record (all fields pre-computed by backend).
     * @param trivialDiff Whether the commit's diff was whitespace/comment-only.
     */
    function submitBuild(
        address dev,
        BuildRecord calldata rec,
        bool trivialDiff
    ) external onlyOracle {
        bytes32 repo = rec.repoHash;

        // Store the build record
        buildsOf[dev][repo].push(rec);

        // Rate limiting: count builds per repo per day
        uint256 today = block.timestamp / 1 days;
        uint8 todayCount = dailyBuilds[dev][repo][today];
        dailyBuilds[dev][repo][today] = todayCount + 1;

        // Score calculation
        uint256 points = 0;

        if (rec.status == 1 && !rec.dirtyTree && !trivialDiff) {
            // Passing build with clean tree and meaningful diff
            if (todayCount < 3) {
                // Builds 1-3: full points
                streakOf[dev][repo] += 1;
                points = 100 + uint256(streakOf[dev][repo]) * 10;
            } else if (todayCount < 5) {
                // Builds 4-5: half points
                streakOf[dev][repo] += 1;
                points = (100 + uint256(streakOf[dev][repo]) * 10) / 2;
            }
            // Builds 6+: attested but 0 points (streak still increments)
            if (todayCount >= 5) {
                streakOf[dev][repo] += 1;
            }

            scoreOf[dev] += points;
        } else if (rec.status == 2) {
            // Flagged build: penalty and streak reset
            streakOf[dev][repo] = 0;
            if (scoreOf[dev] > 25) {
                scoreOf[dev] -= 25;
            } else {
                scoreOf[dev] = 0;
            }
        } else {
            // Failed build (status == 0) or dirty tree or trivial diff with pass
            streakOf[dev][repo] = 0;
        }

        emit BuildSubmitted(
            dev,
            repo,
            buildsOf[dev][repo].length - 1,
            rec.status,
            rec.attestationHash
        );
        emit ScoreUpdated(dev, scoreOf[dev], streakOf[dev][repo]);
    }

    // ─── View Functions ─────────────────────────────────────────────────────────

    /**
     * @notice Get the latest build record for a wallet + repo.
     */
    function getLatestBuild(
        address dev,
        bytes32 repoHash
    ) external view returns (BuildRecord memory) {
        uint256 len = buildsOf[dev][repoHash].length;
        require(len > 0, "no builds");
        return buildsOf[dev][repoHash][len - 1];
    }

    /**
     * @notice Get the total number of builds for a wallet + repo.
     */
    function getBuildCount(
        address dev,
        bytes32 repoHash
    ) external view returns (uint256) {
        return buildsOf[dev][repoHash].length;
    }

    /**
     * @notice Get a specific build by index.
     */
    function getBuild(
        address dev,
        bytes32 repoHash,
        uint256 index
    ) external view returns (BuildRecord memory) {
        require(index < buildsOf[dev][repoHash].length, "index out of bounds");
        return buildsOf[dev][repoHash][index];
    }

    /**
     * @notice Get the daily build count for rate limiting visibility.
     */
    function getDailyBuildCount(
        address dev,
        bytes32 repoHash,
        uint256 day
    ) external view returns (uint8) {
        return dailyBuilds[dev][repoHash][day];
    }
}
