# BuildBuddy — Proof-of-Build on Monad

**Free MVP** — Verifiable on-chain developer reputation from real test results. Zero cost to run.

## How It Works

1. You submit a repo + commit via the API or MCP tool
2. Backend clones the repo, detects the test framework, runs tests locally
3. A 3-layer parser verifies the output (exit code → structured output → framework signature)
4. An attestation is submitted on-chain to Monad testnet
5. Your score accumulates — queryable by any smart contract (BountyGate demo included)

## Quick Start

See **[SETUP.md](./SETUP.md)** for the full step-by-step guide.

```powershell
# After installing Node.js 20+ and deploying contracts:
cd BuildBuddy
npm install
npm run dev:backend    # Starts on http://localhost:3001
npm run dev:frontend   # Starts on http://localhost:3000 (separate terminal)
```

## Architecture (Free MVP)

```
Your Machine (free)
├── Backend (localhost:3001)
│   ├── POST /verify → clone repo → run tests → submit on-chain
│   ├── GET /jobs/:id → check status
│   └── GET /dev/:wallet/score → read from chain
│
├── Frontend (localhost:3000)
│   ├── Leaderboard
│   ├── BountyGate claim UI
│   └── Dev profiles
│
└── MCP Server (stdio)
    └── verify-build, get-dev-score, get-build-history, etc.

Monad Testnet (free — faucet MON)
├── BuildAttestationRegistry
└── BountyGate
```

## What's Free

| Component | How |
|-----------|-----|
| Blockchain | Monad testnet + free faucet |
| Backend | Runs locally |
| Test execution | Local git clone + npm test |
| Frontend | Runs locally |
| Job queue | In-memory (no Redis) |
| IPFS | Skipped (attestation data on-chain) |

## Anti-Cheat

- Tests derived from manifest (developer can't supply arbitrary commands)
- Exit code is ground truth
- Framework signature detection catches `echo PASS`
- Trivial-diff gating (whitespace commits = 0 points)

## Scoring

| Event | Points |
|-------|--------|
| Verified pass (1-3/day) | +100 + streak × 10 |
| Verified pass (4-5/day) | Half points |
| Flagged build | -25, streak resets |
| Trivial diff | 0 points |

## Tech Stack

- Solidity + Foundry (contracts)
- Node.js + Express + TypeScript (backend)
- Next.js + wagmi + RainbowKit (frontend)
- MCP SDK (AI tool integration)
- Monad Testnet (chain ID 10143)

## License

MIT
