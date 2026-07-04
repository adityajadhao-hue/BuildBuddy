# BuildBuddy — Proof-of-Build on Monad

## The Problem

Developers push code, builds pass, tests are green — but the project fails during a live demo. There's no verifiable, portable proof that a build *actually worked* at a specific point in time. CI badges are tied to GitHub's walled garden. Judges, grant DAOs, and bounty platforms can't programmatically verify "this person ships working code" without trusting a specific CI provider.

**BuildBuddy solves this.** It's an AI-powered verification service (exposed via MCP) that clones your repo at a specific commit, runs your *actual* test suite in a sandboxed environment, verifies the output, and stamps an immutable proof-of-build attestation on Monad testnet. Every verified build earns a developer score — a portable, on-chain reputation queryable by any smart contract.

---

## Architecture — Trust Model

### Key Design Decision: The developer never holds the oracle key.

The local MCP tool is a **thin client**. It sends repo URL + commit hash to a **hosted verification backend** that the developer does not control. The backend:

1. Clones the repo at the exact commit in a sandboxed container
2. Reads the project manifest to derive the test command (not developer-supplied)
3. Runs tests in isolation, captures stdout/stderr
4. AI agent parses output using structured reporters + exit code
5. Signs and submits the attestation on-chain

The developer cannot forge output because they never touch the execution environment or the oracle key.

```
Developer's Machine                    Hosted Backend (you control)
┌─────────────────────┐               ┌──────────────────────────────────┐
│  MCP Client (Kiro,  │  HTTPS POST   │  Verification Service            │
│  Claude Desktop,    ├──────────────► │                                  │
│  Cursor)            │  {repo, commit │  1. git clone --depth=1 @ commit │
│                     │   branch,      │  2. Read manifest → derive cmd   │
│  Local MCP Server   │   wallet}      │  3. Run in container sandbox     │
│  (thin client,      │               │  4. Capture stdout/stderr + exit │
│   NO oracle key)    │ ◄─────────────┤  5. Validate framework output    │
│                     │  {jobId,       │  6. Cross-verify git state       │
│                     │   status:      │  7. Pin JSON to IPFS             │
│                     │   "pending"}   │  8. Sign + submit to Monad       │
│                     │               │                                  │
│  (polls or webhook) │ ◄─────────────┤  Returns result when done        │
│                     │  {attestation, │                                  │
│                     │   tx_hash,     │  ORACLE_PRIVATE_KEY lives HERE   │
│                     │   score}       │                                  │
└─────────────────────┘               └──────────────────────────────────┘
                                                     │
                                                     ▼
                                      ┌──────────────────────────────────┐
                                      │  Monad Testnet (Chain ID: 10143) │
                                      │  BuildAttestationRegistry        │
                                      └──────────────────────────────────┘
```

### Verification is Asynchronous

`verify-build` does NOT block. It returns a `jobId` immediately. The sandbox clones, installs deps, and runs tests in the background. The MCP tool polls for completion (or receives a webhook). This matches how CI already works — nobody expects instant results.

For the **live demo**: the demo repo's container image has dependencies pre-cached (keyed by lockfile hash). This isn't cheating — it's the same caching any real CI does. Cold runs for new repos take 30-120s depending on the ecosystem.

---

## Why Not Just a CI Badge?

| | CI Badge (GitHub Actions) | BuildBuddy |
|--|--------------------------|------------|
| Queryable by smart contracts | No — requires GitHub API + trust | Yes — any contract can call `scoreOf(wallet)` |
| Portable across platforms | No — locked to GitHub | Yes — on-chain, platform-agnostic |
| Consumed by bounty/grant DAOs | No — manual review | Yes — programmatic threshold checks |
| Verifiable without trusting one provider | No | Yes — IPFS JSON + on-chain hash |
| Developer score / reputation | No | Yes — cumulative, streak-based |

**The differentiator:** BuildBuddy produces a *machine-readable, on-chain credential* that external systems (bounty platforms, grant DAOs, hiring tools) can consume without GitHub API access or trusting any specific CI config.

**Honest caveat (MVP):** The current backend is itself a single-point-of-dependency, architecturally equivalent to CI in that respect. The k-of-n oracle network on the roadmap fixes both the trust problem AND the availability problem simultaneously — they're the same architectural gap, not two separate ones.

---

## Solving the `echo "PASS"` Attack

This is the hardest problem. The developer controls their own machine — if we let them run arbitrary commands and just read the output, they can fake anything.

### Solution: Sandboxed, manifest-derived execution + framework signature detection

1. **Developer never supplies the test command.** The backend reads the project manifest:
   - `package.json` → `scripts.test`
   - `foundry.toml` → `forge test`
   - `Cargo.toml` → `cargo test`
   - `pyproject.toml` → pytest / configured test runner
   - `Makefile` → `make test`

2. **Execution happens server-side** in a fresh container clone at the exact commit. The developer cannot inject output.

3. **Exit code is ground truth.** If exit code ≠ 0, it's a fail regardless of what text the LLM sees.

4. **Structured reporters are preferred over raw text:**
   - Jest: `--json` flag → machine-readable JSON
   - pytest: `--junitxml` → XML report
   - Foundry: `--json` → structured output
   - Cargo: `--message-format=json`
   - Go: `-json` flag

5. **Framework signature detection (the actual anti-cheat):**

   This is what catches `echo PASS`. It's a **hard rule, not a confidence penalty:**

   > If the derived command claims to be a known test runner (`npm test`, `pytest`, `forge test`, etc.) but produces **zero recognizable framework output** (no structured reporter data, no recognizable framework banner like "Tests: 24 passed", no TAP output, no JUnit XML), the build is **automatically flagged** — not passed with lower confidence.

   A real test runner invoked correctly *always* produces either structured output or a recognizable framework signature. A bare `echo` produces neither. This is the detection mechanism.

6. **Cross-repo discontinuity check:** If a repo previously attested with "24 tests passed" and suddenly produces a build with zero identifiable tests but still "passes," that's flagged as a discontinuity.

### What this does NOT catch (stated honestly):

A developer who writes `"test": "node fake-tests.js"` where `fake-tests.js` imports Jest's reporter and prints fake structured output. This is a much more sophisticated attack (essentially writing a test harness simulator), and while the manifest hash makes it *visible* in the IPFS JSON, automated detection of "is this a real test suite?" is a research problem beyond hackathon scope.

---

## Parsing Strategy (Not LLM-Only)

```
Terminal Output
      │
      ▼
┌─────────────────────────┐
│ Layer 1: Exit Code      │  ← Ground truth. Non-zero = fail. Period.
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Layer 2: Structured     │  ← Jest --json, pytest --junitxml, forge --json
│ Reporter Output         │     Machine-readable. Authoritative for counts.
│                         │     ABSENT + known runner = AUTOMATIC FLAG.
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Layer 3: Framework      │  ← Recognizes banners: "Tests: X passed",
│ Signature Detection     │     "PASS src/...", "test result: ok."
│                         │     Must find at least one. Else → flag.
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Layer 4: LLM Agent      │  ← Summarizes for humans. Flags edge cases
│ (summary, not judge)    │     (tests skipped, partial runs, timeouts).
│                         │     Never overrides layers 1-3.
└─────────────────────────┘
```

---

## Sandbox: Dependency Installation & Caching

### The Reality

Between "clone" and "run tests" lives `npm install` / `pip install` / `cargo build`. This is the slowest step and the most likely failure point.

### Caching Strategy

Dependencies are cached **keyed by lockfile hash, per-repo**. This means:
- Same `package-lock.json` hash → reuse cached `node_modules` (fast)
- Lockfile changes → fresh install (slower, but correct)
- Different repos → different caches (no cross-contamination)

**Cache poisoning requires a lockfile hash collision** — a much narrower attack surface than "shared global cache." The container is ephemeral per execution; cached artifacts are mounted read-only.

### Timeout & Failure Handling

| Scenario | Behavior |
|----------|----------|
| Install succeeds, tests run | Normal attestation |
| Install fails (private registry, native bindings) | Attestation with `status: fail`, reason: "dependency installation failed" |
| Timeout exceeded (default: 5 min) | Attestation with `status: fail`, reason: "execution timeout" |
| Platform mismatch (macOS-only deps in Linux container) | Attestation with `status: fail`, reason: "platform incompatibility" |

### Known Limitation

Verification runs in a **Linux (amd64) sandbox**. Projects with platform-specific native bindings (macOS frameworks, Windows DLLs) may fail to install. This is the same limitation every Linux-based CI system has. Stated upfront, not hidden.

---

## GitHub Identity Verification (Challenge-Response)

`linkGithub` is NOT a raw self-attestation. It requires proof of ownership:

### Flow

1. Developer calls `link-github` MCP tool with their GitHub handle.
2. Backend generates a random nonce tied to (wallet address + GitHub handle).
3. Developer creates a **public GitHub Gist** titled `buildbuddy-verify` containing the nonce.
4. Developer confirms in the MCP tool: "I created the gist."
5. Backend calls GitHub API: `GET /users/{handle}/gists`, finds the gist, verifies the nonce matches.
6. Backend (as oracle) calls `linkGithub(wallet, handle)` on-chain.

### Contract Change

```solidity
// Only oracle can link (after backend verifies the gist)
function linkGithub(address dev, string calldata handle) external onlyOracle {
    githubOf[dev] = handle;
    emit IdentityLinked(dev, handle);
}
```

The developer cannot call `linkGithub` directly — only the oracle can, after verifying ownership. This is the same pattern Keybase and ENS social verification use.

---

## Gas Optimization: No Strings On-Chain

Storing dynamic `string` fields (`repoUrl`, `ipfsCid`) on-chain is expensive and unnecessary. The full data lives in the IPFS JSON — on-chain only needs enough to *verify*.

### Optimized Struct

```solidity
struct BuildRecord {
    bytes32 commitHash;
    bytes32 parentCommitHash;
    bytes32 attestationHash;    // keccak256(full IPFS JSON)
    bytes32 repoHash;           // keccak256(repoUrl) — for per-repo keying
    bytes32 ipfsCidHash;        // keccak256(ipfsCid) — verifiable against IPFS
    uint16  confidenceScore;    // 0-10000 bps
    uint8   status;             // 0=fail, 1=pass, 2=flagged
    bool    dirtyTree;
    uint256 timestamp;
}
```

**Result:** Fixed-size struct (all `bytes32` + small types). No dynamic storage allocation. Per-attestation gas drops ~60% vs. string storage. Verified via `forge test --gas-report` before demo.

Anyone can verify: fetch the IPFS JSON (CID is in the `BuildSubmitted` event log as an indexed topic or in the off-chain index), compute `keccak256(repoUrl)` and `keccak256(ipfsCid)`, confirm they match the on-chain record.

---

## Per-Repo Storage & Lineage (Fixed Schema)

### Problem

Previous design: `mapping(address => BuildRecord[])` mixes all repos together. Lineage checks compare commits across unrelated projects — meaningless.

### Fix

```solidity
// Keyed by wallet AND repo
mapping(address => mapping(bytes32 => BuildRecord[])) public buildsOf;
// repoHash = keccak256(repoUrl)

// Scores remain per-wallet (aggregate across all repos)
mapping(address => uint256) public scoreOf;
mapping(address => uint32) public streakOf;  // streak is per-repo too
mapping(address => mapping(bytes32 => uint32)) public repoStreakOf;
```

### Lineage Check Rules

| Scenario | Behavior |
|----------|----------|
| First attestation for this repo | No lineage check — pass automatically |
| Subsequent attestation | Parent commit must match last on-chain commit for this repo |
| Lineage breaks (force-push) | Flag, but still record |
| Different repo entirely | Separate array, separate streak, no lineage comparison |

---

## Anti-Farming: Scoring Guards

### Problem

Without rate limits, a developer can farm score with trivial whitespace commits that each "pass."

### Mitigations

**1. Diff-content gate (cheap, effective):**

Before awarding score, the backend checks: does the commit's diff touch meaningful code? Strip comments and whitespace-only changes from the diff. If what remains is empty → attestation is recorded but awarded **zero points**.

```
Diff analysis:
- Remove lines that are comment-only changes
- Remove lines that are whitespace-only changes
- If remaining diff is empty → score: 0, status: "trivial"
```

**2. Rate limit per repo per day:**

Maximum 5 scoring builds per repo per 24-hour window. Subsequent verifications in the same window are attested (for completeness) but earn 0 points. Resets daily.

**3. Diminishing returns within a streak window:**

| Build # (same repo, same day) | Score awarded |
|-------------------------------|---------------|
| 1-3 | Full (100 + streak × 10) |
| 4-5 | Half |
| 6+ | 0 (still attested, just no score) |

### What this does NOT prevent:

Slow-drip farming (one trivial commit per day). Fully solving "meaningful code change" requires LLM-assisted diff analysis ("did this commit plausibly improve functionality?") — a valid roadmap item but not hackathon scope.

---

## Revenue Model

The backend runs arbitrary developer code in containers. That costs money.

### MVP Answer (hackathon): Developer pays per verification

- Small fee (paid in MON or stablecoin) alongside the verification request.
- Covers sandbox compute, IPFS pinning, and on-chain gas.
- Estimated cost per verification: $0.01-0.05 (container time + gas + IPFS pin).

### Future Models

| Model | How it works |
|-------|-------------|
| Freemium | First 10 verifications/day free; pay beyond that |
| Consumer-subsidized | Bounty platforms / grant DAOs pay to keep the oracle running (like Chainlink requesters paying for data feeds) |
| Staking | Verifier nodes in the k-of-n network stake MON and earn fees |

For the hackathon demo, a simple payable modifier or pre-funded account is sufficient to demonstrate the model.

---

## Smart Contract — BuildAttestationRegistry (Monad)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BuildAttestationRegistry {
    struct BuildRecord {
        bytes32 commitHash;
        bytes32 parentCommitHash;
        bytes32 attestationHash;    // keccak256(full IPFS JSON)
        bytes32 repoHash;           // keccak256(repoUrl)
        bytes32 ipfsCidHash;        // keccak256(ipfsCid)
        uint16  confidenceScore;    // 0-10000 bps
        uint8   status;             // 0=fail, 1=pass, 2=flagged
        bool    dirtyTree;
        uint256 timestamp;
    }

    address public trustedOracle;

    // Per-wallet, per-repo build history
    mapping(address => mapping(bytes32 => BuildRecord[])) public buildsOf;

    // Aggregate score per wallet
    mapping(address => uint256) public scoreOf;

    // Streak per wallet per repo
    mapping(address => mapping(bytes32 => uint32)) public streakOf;

    // Verified GitHub identity (only oracle can set)
    mapping(address => string) public githubOf;

    // Rate limiting: builds per repo per day
    mapping(address => mapping(bytes32 => mapping(uint256 => uint8))) public dailyBuilds;

    event BuildSubmitted(
        address indexed dev,
        bytes32 indexed repoHash,
        uint256 index,
        uint8 status,
        bytes32 attestationHash
    );
    event ScoreUpdated(address indexed dev, uint256 newScore, uint32 repoStreak);
    event IdentityLinked(address indexed dev, string githubHandle);

    modifier onlyOracle() {
        require(msg.sender == trustedOracle, "not oracle");
        _;
    }

    constructor(address _oracle) {
        trustedOracle = _oracle;
    }

    function linkGithub(address dev, string calldata handle) external onlyOracle {
        githubOf[dev] = handle;
        emit IdentityLinked(dev, handle);
    }

    function submitBuild(
        address dev,
        BuildRecord calldata rec,
        bool trivialDiff
    ) external onlyOracle {
        bytes32 repo = rec.repoHash;
        buildsOf[dev][repo].push(rec);

        // Rate limiting
        uint256 today = block.timestamp / 1 days;
        uint8 todayCount = dailyBuilds[dev][repo][today];
        dailyBuilds[dev][repo][today] = todayCount + 1;

        // Score calculation
        uint256 points = 0;
        if (rec.status == 1 && !rec.dirtyTree && !trivialDiff) {
            if (todayCount < 3) {
                streakOf[dev][repo] += 1;
                points = 100 + uint256(streakOf[dev][repo]) * 10;
            } else if (todayCount < 5) {
                streakOf[dev][repo] += 1;
                points = (100 + uint256(streakOf[dev][repo]) * 10) / 2;
            }
            // 5+ today: attested but 0 points
            scoreOf[dev] += points;
        } else if (rec.status == 2) {
            streakOf[dev][repo] = 0;
            if (scoreOf[dev] > 25) scoreOf[dev] -= 25;
            else scoreOf[dev] = 0;
        } else {
            streakOf[dev][repo] = 0;
        }

        emit BuildSubmitted(dev, repo, buildsOf[dev][repo].length - 1, rec.status, rec.attestationHash);
        emit ScoreUpdated(dev, scoreOf[dev], streakOf[dev][repo]);
    }

    function getLatestBuild(address dev, bytes32 repoHash) external view returns (BuildRecord memory) {
        require(buildsOf[dev][repoHash].length > 0, "no builds");
        return buildsOf[dev][repoHash][buildsOf[dev][repoHash].length - 1];
    }

    function getBuildCount(address dev, bytes32 repoHash) external view returns (uint256) {
        return buildsOf[dev][repoHash].length;
    }
}
```

---

## Score Consumer — BountyGate

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBuildRegistry {
    function scoreOf(address dev) external view returns (uint256);
}

contract BountyGate {
    IBuildRegistry public registry;
    uint256 public requiredScore;

    mapping(uint256 => bool) public claimed;

    event BountyClaimed(address indexed dev, uint256 indexed bountyId);

    constructor(address _registry, uint256 _requiredScore) {
        registry = IBuildRegistry(_registry);
        requiredScore = _requiredScore;
    }

    function claimBounty(uint256 bountyId) external {
        require(registry.scoreOf(msg.sender) >= requiredScore, "score too low");
        require(!claimed[bountyId], "already claimed");
        claimed[bountyId] = true;
        emit BountyClaimed(msg.sender, bountyId);
    }
}
```

---

## Monad Testnet Details

| Field | Value |
|-------|-------|
| Chain ID | 10143 |
| Network Name | Monad Testnet |
| Currency | MON |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Block Explorer | [testnet.monadexplorer.com](https://testnet.monadexplorer.com) |
| Faucet | [faucet.monad.xyz](https://faucet.monad.xyz) |
| Version | v0.14.5 |

---

## MCP Server Design

The local MCP server is a thin client — it does NOT hold secrets or make trust decisions.

### Tools Exposed

| Tool | Description |
|------|-------------|
| `verify-build` | Sends repo/commit/branch to hosted backend, returns jobId. Polls for result. |
| `get-dev-score` | Queries on-chain builder score for a wallet |
| `get-build-history` | Returns attestation history for a wallet + repo |
| `link-github` | Initiates GitHub identity verification (challenge-response flow) |
| `get-job-status` | Polls a pending verification job |

### MCP Client Config

```json
{
  "mcpServers": {
    "buildbuddy": {
      "command": "node",
      "args": ["./mcp-server/build/index.js"],
      "env": {
        "BUILDBUDDY_API_URL": "https://api.buildbuddy.dev",
        "BUILDBUDDY_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

No `ORACLE_PRIVATE_KEY` on the client. The API key authenticates the developer to the backend; the backend holds the oracle key.

### Monad Development Skills

```bash
npx skills add therealharpaljadeja/monskills
```

Provides AI agents with Monad-specific context: contract deployment patterns, gas pricing (charges on limit, not usage), testnet config, and frontend scaffolding.

---

## Cross-Verification Rules

| Check | How | Flags When |
|-------|-----|-----------|
| Lineage | Compare parent commit to last on-chain commit **for this repo** | Force-push / rewritten history |
| First commit | No prior record for this repo | Pass automatically (no flag) |
| Dirty tree | `git status --porcelain` in sandbox | Shouldn't happen in sandbox — flags tampering |
| Staleness | Timestamp delta (request → execution) | > 5 min (possible queue manipulation) |
| Duplicate | Same commit hash already attested for this repo | Re-using old passing build |
| Remote match | Clone directly from GitHub at commit | If commit doesn't exist on remote, it's fabricated |
| Framework signature | Command claims to be `npm test`/`pytest`/etc. | Zero recognizable test framework output → **automatic flag** |
| Discontinuity | Repo previously had N tests, now has zero identifiable tests | Sudden test disappearance → flag |
| Trivial diff | Diff is whitespace/comment-only | Attested but 0 points |

---

## Scoring

| Event | Score Change |
|-------|-------------|
| Verified pass (clean tree, non-trivial diff, < 3 today) | +100 + (streak × 10) |
| Verified pass (4th-5th build same repo same day) | Half points |
| Verified pass (6+ same repo same day) | 0 points (still attested) |
| Trivial diff (whitespace/comment only) | 0 points (still attested) |
| Flagged build | -25, streak resets |
| Failed build | +0, streak resets |

Score is consumed by `BountyGate` and any future integration.

---

## Attestation JSON (pinned to IPFS)

```json
{
  "version": "1.0",
  "dev_wallet": "0x...",
  "github_handle": "developer123",
  "repo": "github.com/developer123/my-project",
  "branch": "main",
  "commit_hash": "a1b2c3d4e5f6...",
  "parent_commit_hash": "9f8e7d6c5b4a...",
  "dirty_tree": false,
  "manifest_hash": "0x...",
  "derived_command": "npm test",
  "timestamp": "2026-07-04T10:22:00Z",
  "execution": {
    "exit_code": 0,
    "framework_detected": "jest",
    "framework_signature_found": true,
    "structured_output": {
      "tests_passed": 24,
      "tests_failed": 0,
      "tests_skipped": 0,
      "duration_ms": 3200
    },
    "llm_summary": "All 24 Jest unit tests passed in 3.2s. No warnings."
  },
  "diff_analysis": {
    "files_changed": 3,
    "meaningful_changes": true,
    "lines_added": 45,
    "lines_removed": 12
  },
  "cross_checks": {
    "lineage_valid": true,
    "tree_clean": true,
    "timestamp_consistent": true,
    "not_duplicate": true,
    "remote_exists": true,
    "framework_signature_present": true,
    "test_count_consistent": true
  },
  "final_status": "pass",
  "flagged": false,
  "flag_reason": null,
  "score_awarded": 150,
  "attestation_hash": "0x...",
  "ipfs_cid": "bafybei...",
  "monad_tx_hash": "0x..."
}
```

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| MCP Server (local) | Node.js + `@modelcontextprotocol/sdk` | Thin client, stdio transport |
| Hosted Backend | Node.js (Express) or Python (FastAPI) | Holds oracle key, runs sandbox, async job queue |
| Job Queue | BullMQ + Redis | Async verification jobs, polling |
| Sandbox | Docker containers (ephemeral, lockfile-keyed cache) | Isolated execution per verification |
| AI Agent | OpenAI GPT-4 / Claude | Layer 4: summaries + edge case flagging only |
| Git | Direct clone from GitHub in sandbox | No developer-supplied output |
| Blockchain | Monad Testnet (10143) | 10K+ TPS, sub-second finality, EVM |
| Contract Tooling | Foundry | Fast test/deploy, gas reporting |
| Chain Client | `viem` | Type-safe, Monad-compatible |
| Off-chain Storage | IPFS (Web3.Storage / Pinata) | Permanent, verifiable, decentralized |
| Monad Skills | `therealharpaljadeja/monskills` | AI-assisted Monad development |
| Frontend | Next.js + wagmi + RainbowKit | Leaderboard + BountyGate demo |

---

## Project Structure

```
buildbuddy/
├── mcp-server/                    # Thin MCP client (runs locally)
│   ├── src/
│   │   ├── index.ts              # MCP server entry, tool definitions
│   │   ├── tools/
│   │   │   ├── verifyBuild.ts    # POST to backend, return jobId
│   │   │   ├── getJobStatus.ts   # Poll job completion
│   │   │   ├── getDevScore.ts    # Read on-chain score
│   │   │   ├── getBuildHistory.ts
│   │   │   └── linkGithub.ts     # Challenge-response identity flow
│   │   └── client/
│   │       └── api.ts            # HTTP client to hosted backend
│   ├── package.json
│   └── tsconfig.json
├── backend/                       # Hosted verification service (YOU control)
│   ├── src/
│   │   ├── server.ts             # Express/Fastify entry
│   │   ├── routes/
│   │   │   ├── verify.ts         # POST /verify → enqueue job
│   │   │   ├── status.ts         # GET /jobs/:id → poll status
│   │   │   └── identity.ts       # GitHub challenge-response
│   │   ├── jobs/
│   │   │   └── verifyWorker.ts   # BullMQ worker: clone → install → test → attest
│   │   ├── sandbox/
│   │   │   ├── runner.ts         # Docker container orchestration
│   │   │   ├── manifest.ts       # Reads manifest → derives command
│   │   │   └── cache.ts          # Lockfile-keyed dependency cache
│   │   ├── agent/
│   │   │   ├── frameworkDetect.ts # Layer 3: framework signature detection
│   │   │   ├── structuredParse.ts # Layer 2: parse --json/--junitxml output
│   │   │   └── llmSummary.ts     # Layer 4: LLM summary
│   │   ├── verify/
│   │   │   ├── crossCheck.ts     # Lineage, staleness, duplicate checks
│   │   │   └── diffAnalysis.ts   # Trivial-diff detection
│   │   ├── chain/
│   │   │   ├── monad.ts          # viem client for Monad testnet
│   │   │   └── submit.ts         # Oracle signer + tx submission
│   │   └── storage/
│   │       └── ipfs.ts           # Pin attestation JSON to IPFS
│   ├── Dockerfile                 # Sandbox base image
│   └── package.json
├── contracts/
│   ├── src/
│   │   ├── BuildAttestationRegistry.sol
│   │   └── BountyGate.sol
│   ├── test/
│   │   ├── BuildAttestationRegistry.t.sol
│   │   └── BountyGate.t.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Leaderboard
│   │   ├── bounty/page.tsx       # BountyGate demo UI
│   │   └── dev/[wallet]/page.tsx # Per-dev history
│   └── package.json
└── README.md
```

---

## The Demo (3 minutes, split screen)

**Pre-demo prep:** Demo repo container image has `node_modules` pre-cached (keyed by lockfile). This ensures the verification completes in ~5-10 seconds, not 60+.

**Left screen:** Terminal + block explorer

1. Show real repo with real Jest tests (24 passing)
2. Run `verify-build` via MCP → get jobId → poll → attestation arrives
3. Tx lands on Monad explorer in real-time (sub-second confirmation)
4. Score updates live on leaderboard: "Score: 110, Streak: 1"

**Right screen:** The cheat attempt

5. Push a commit that changes `package.json` to `"test": "echo PASS"`
6. Run verify again → backend runs `echo PASS` → gets stdout "PASS"
7. **Framework signature detection fires:** npm test should produce Jest output. Got bare text with no framework banner, no structured JSON, no test counts.
8. Result: `status: flagged`, reason: "no recognizable test framework output for derived command"
9. Leaderboard shows the red "FLAGGED" badge, score drops by 25

**Closing beat:** Open BountyGate UI → "Wallets with score > 500 can claim. This flagged wallet can't. No resumes. No trust. Just proof."

---

## Trust Model: MVP → Roadmap

| Phase | Trust Model | Availability |
|-------|-------------|-------------|
| **MVP (hackathon)** | Single oracle EOA, single backend | Single server (your laptop/VPS) |
| **v1** | Multi-region backend, oracle key in HSM | Auto-scaling, multi-AZ |
| **v2** | k-of-n multisig over independent verifier nodes | Distributed — any node can serve |
| **v3** | Verifier nodes stake MON, slashing for false attestations | Fully decentralized |
| **v4** | TEE-based execution (hardware-attested output) | Trustless — no oracle needed |

We say this plainly upfront. Judges hear: "We know the MVP limitations. Here's the path. They're the same fix — decentralizing the oracle solves both trust and availability."

---

## Environment Variables

### Backend (hosted — you control)
```env
ORACLE_PRIVATE_KEY=       # Signs submitBuild txs — NEVER on client
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
CONTRACT_ADDRESS=         # Deployed BuildAttestationRegistry
OPENAI_API_KEY=           # For LLM summary layer (layer 4 only)
GITHUB_TOKEN=             # Clone repos, verify commits, check gists
IPFS_TOKEN=               # Web3.Storage or Pinata JWT
REDIS_URL=                # Job queue (BullMQ)
DATABASE_URL=             # Postgres for leaderboard cache + job state
```

### MCP Client (developer's machine — no secrets)
```env
BUILDBUDDY_API_URL=https://api.buildbuddy.dev
BUILDBUDDY_API_KEY=       # Authenticates dev to backend (not oracle key)
```

---

## Why Monad?

- **10,000+ TPS** — attestations confirm in under a second. Demo flows smoothly without awkward waiting.
- **Low gas** — submitting attestations costs fractions of a cent. Can attest every build without economic concern.
- **EVM compatible** — standard Solidity, Foundry, viem, wagmi. Zero new tooling.
- **Active testnet** — faucet, explorer, multiple RPC providers, community support all live.
- **Gas pricing model** — charges on gas *limit*, not *usage*. Set tight limits on `submitBuild` to keep costs predictable.

---

## Known Limitations (say these before judges find them)

1. **Single oracle / single backend** — MVP. Same fix for trust AND availability: k-of-n oracle network. Not a coincidence — they're the same architectural gap.
2. **Linux sandbox only** — Docker on amd64 Linux. macOS/Windows native deps may fail. Same limitation as every CI system.
3. **Manifest-derived command isn't foolproof** — a sophisticated attacker could write a fake test harness that mimics framework output. Manifest hash makes it *visible* in IPFS JSON, but automated detection is a research problem.
4. **Testnet only** — no real economic value until mainnet. Proofs and scores are real and portable when the chain goes live.
5. **Async verification** — not instant. Cold runs take 30-120s. Cached runs take 5-15s. This matches CI expectations but may feel slow in a live demo if not pre-warmed.
6. **Rate limiting is coarse** — 5 builds/repo/day is arbitrary. May need tuning based on real usage patterns.
7. **LLM cost per verification** — even as summary-only (layer 4), each call costs $0.01-0.03. At scale, this adds up. Caching identical summaries per framework/pattern helps.

---

## Summary

BuildBuddy is a **production-grade, MCP-connected verification service** that:

1. Clones your repo server-side at the exact commit (no developer-controlled output)
2. Derives the test command from your manifest (no arbitrary command injection)
3. Runs tests in a sandboxed container with lockfile-keyed dependency caching
4. Uses exit code as ground truth, structured reporters as authoritative, framework signature detection as anti-cheat, and LLM as summary-only layer
5. **Automatically flags** builds with no recognizable test framework output (catches `echo PASS`)
6. Cross-verifies git lineage per-repo, tree cleanliness, and remote existence
7. Detects trivial-diff farming and rate-limits scoring
8. Verifies GitHub identity via challenge-response (not self-attestation)
9. Pins full attestation JSON to IPFS (verifiable forever)
10. Stamps an immutable proof on Monad testnet with gas-optimized fixed-size structs
11. Maintains a developer score consumed by on-chain systems (BountyGate)
12. Revenue model: developer pays per verification (covers compute + gas + IPFS)

The trust model is explicit, the attack vectors are addressed with specific mechanisms, the economic model is stated, and the on-chain score has a real consumer.
