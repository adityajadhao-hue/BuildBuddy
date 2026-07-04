# BuildBuddy Free MVP — Setup Guide

**Total cost: $0. No credit card needed anywhere.**

---

## Step 1: Install Node.js

Download and run: https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi

After installing, **close and reopen** your terminal. Verify:

```powershell
node --version    # Should show v20.18.0
npm --version     # Should show 10.x
```

---

## Step 2: Install Foundry (for smart contracts)

Open **Git Bash** (not PowerShell) and run:

```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup
```

Verify:
```bash
forge --version
```

---

## Step 3: Get a wallet & free testnet MON

1. Install MetaMask browser extension
2. Create or use existing wallet
3. Add Monad Testnet:
   - Network: `Monad Testnet`
   - RPC: `https://testnet-rpc.monad.xyz`
   - Chain ID: `10143`
   - Currency: `MON`
   - Explorer: `https://testnet.monadexplorer.com`
4. Go to https://faucet.monad.xyz — get free MON
5. Export your private key: MetaMask → Account → Export Private Key

---

## Step 4: Deploy contracts

```bash
cd C:\Users\ashis\Downloads\buildbuddy\BuildBuddy\contracts

# Install Foundry deps
forge install --no-git OpenZeppelin/openzeppelin-contracts
forge install --no-git foundry-rs/forge-std

# Run tests (should all pass)
forge test -vv

# Deploy (replace with YOUR private key)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --private-key 0xYOUR_PRIVATE_KEY_HERE
```

This prints two addresses. Save them:
```
BuildAttestationRegistry deployed at: 0x...
BountyGate deployed at: 0x...
```

---

## Step 5: Configure environment

Create file `backend/.env`:

```env
ORACLE_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_FROM_STEP_3
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
REGISTRY_CONTRACT_ADDRESS=0xADDRESS_FROM_STEP_4
BOUNTYGATE_CONTRACT_ADDRESS=0xADDRESS_FROM_STEP_4
API_KEYS=my-dev-key
PORT=3001
```

Create file `frontend/.env.local`:

```env
NEXT_PUBLIC_REGISTRY_ADDRESS=0xADDRESS_FROM_STEP_4
NEXT_PUBLIC_BOUNTYGATE_ADDRESS=0xADDRESS_FROM_STEP_4
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=demo
```

---

## Step 6: Install & Run

```powershell
cd C:\Users\ashis\Downloads\buildbuddy\BuildBuddy

# Install all dependencies
npm install

# Start the backend
npm run dev:backend
```

The backend will start at http://localhost:3001

In a **second terminal**:
```powershell
cd C:\Users\ashis\Downloads\buildbuddy\BuildBuddy
npm run dev:frontend
```

Frontend at http://localhost:3000

---

## Step 7: Test it

```powershell
# Health check
curl http://localhost:3001/health

# Submit a verification
curl -X POST http://localhost:3001/verify `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer my-dev-key" `
  -d "{\"repoUrl\":\"https://github.com/expressjs/express\",\"commitHash\":\"508936a\",\"branch\":\"master\",\"walletAddress\":\"0xYOUR_WALLET_ADDRESS\"}"
```

---

## What's Free

| Component | How it's free |
|-----------|--------------|
| Blockchain | Monad testnet + free faucet MON |
| Backend | Runs on your machine |
| Test runner | Runs locally (git clone + npm test) |
| Frontend | Runs on your machine |
| Job queue | In-memory (no Redis needed) |
| IPFS | Skipped in MVP (attestation stored on-chain) |
| Sandbox | Local execution (no Fly.io VMs) |

---

## Architecture (Free MVP)

```
Your Machine
├── Backend (localhost:3001)
│   ├── POST /verify → clones repo, runs tests, submits on-chain
│   ├── GET /jobs/:id → check verification status
│   └── GET /dev/:wallet/score → read on-chain score
│
├── Frontend (localhost:3000)
│   ├── Leaderboard (reads ScoreUpdated events)
│   ├── BountyGate (claim with score threshold)
│   └── Dev Profile (score + history)
│
└── MCP Server (stdio)
    └── 5 tools that call the backend

Monad Testnet (free)
├── BuildAttestationRegistry (stores attestations)
└── BountyGate (score-gated claims)
```
