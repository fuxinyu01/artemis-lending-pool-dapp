# Artemis Lending Pool

A decentralised lending protocol built on Ethereum (Solidity + Hardhat), with a React frontend, a small Express backend for IPFS uploads, and Docker Compose for one-command local startup.

**BCOLN FS26 — Group Artemis**

---

## How It Works

The protocol has three types of participants:

- **Liquidity Providers** deposit MockUSDT into the `LiquidityPool` and receive LP tokens representing their share. They earn yield from borrower interest.
- **Borrowers** deposit ETH as collateral into the `LendingPool` and borrow MockUSDT against it. They must maintain a 150% collateral ratio or face liquidation.
- **Liquidators** repay the debt of undercollateralised borrowers and receive a 5% bonus on the collateral they claim.

Every on-chain action (deposit, borrow, repay, withdraw, liquidate) is also uploaded to IPFS via a backend Express service and shown in a shared **Transaction History** panel in the UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│   React Frontend (Vite)  ←→  MetaMask (ethers.js v6)   │
│            │                                            │
│            └──── HTTP ────→ Express Backend (port 3001) │
└─────────────────────────────────────────────────────────┘
                                    │
                            Pinata IPFS API
                                    
┌─────────────────────────────────────────────────────────┐
│           Hardhat Local Node (port 8545)                │
│   LendingPool · LiquidityPool · MockUSDT                │
│   MockPriceOracle · LPToken                             │
└─────────────────────────────────────────────────────────┘
```

- The **frontend** talks to smart contracts via MetaMask and to the backend via REST.
- The **backend** holds the Pinata JWT server-side (never exposed to the browser) and maintains a shared in-memory transaction history.
- The **Hardhat node** runs a local Ethereum chain with deterministic accounts and deployed contracts.

---

## Smart Contracts

| Contract | Description |
|---|---|
| `LendingPool.sol` | Core borrowing logic — deposit collateral, borrow, repay, withdraw, liquidate |
| `LiquidityPool.sol` | USDT liquidity pool — LP deposit/withdraw, issues LP tokens |
| `LPToken.sol` | ERC20 LP token representing liquidity provider shares |
| `MockUSDT.sol` | ERC20 stablecoin used for local testing |
| `MockPriceOracle.sol` | Manually settable ETH/USD price for local testing |
| `PriceOracle.sol` | Chainlink-backed price feed for Sepolia deployment |

**Protocol parameters:** 150% collateral ratio · 120% liquidation threshold · 5% fixed interest · 5% liquidation bonus

---

## Running Locally

### Option A — Docker (recommended)

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Clone the repository
git clone <repo-url>
cd artemis-lending-pool-dapp

# 2. (Optional) Set up Pinata credentials for IPFS history
cp .env.example .env
# Edit .env and fill in PINATA_JWT and PINATA_GATEWAY

# 3. Start everything
docker compose up --build
```

Wait ~30 seconds. Docker starts three services in order:

| Service | Port | Description |
|---|---|---|
| `hardhat-node` | `8545` | Local Ethereum node, deploys all contracts on startup |
| `ipfs-backend` | `3001` | Express server — proxies Pinata uploads, serves history |
| `frontend` | `5173` | Vite + React UI |

Open `http://localhost:5173`.

**Useful commands:**
```bash
docker compose logs hardhat-node    # see deployed contract addresses
docker compose logs ipfs-backend    # see IPFS upload logs
docker compose down                 # stop everything
docker compose up --build           # rebuild after code changes
```

---

### Option B — Manual (4 terminals)

**Prerequisites:** Node.js 22+, npm

```bash
# Terminal 1 — local blockchain
npx hardhat node

# Terminal 2 — deploy contracts (run after node is ready)
npx hardhat run scripts/deployLocal.ts

# Terminal 3 — IPFS backend
cd backend
npm install
npm start        # http://localhost:3001

# Terminal 4 — frontend
cd frontend
npm install
npm run dev      # http://localhost:5173
```

---

## MetaMask Setup

### 1. Add the Hardhat Local network

MetaMask → Networks dropdown → **Add a network manually**:

| Field | Value |
|---|---|
| Network name | `Hardhat Local` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

### 2. Import test accounts

The Hardhat node always generates the same deterministic accounts. Import any of these private keys into MetaMask:

| # | Role | Address | Private Key |
|---|---|---|---|
| 0 | Deployer / LP | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | Borrower | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | Liquidator | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

> These are well-known public test accounts. **Never send real ETH to them.**

### 3. Connect to the app

Switch MetaMask to **Hardhat Local**, open `http://localhost:5173`, and click **Connect Wallet**.

---

## After Every Restart

Each time the Hardhat node restarts (or after `docker compose down && docker compose up`) the blockchain resets to block 0. You must do both steps in MetaMask before reconnecting:

**Step 1 — Reset Account** (clears stale nonces)
MetaMask → three-dot menu → Settings → Advanced → **Reset Account**
Repeat for every account you have imported.

**Step 2 — Disconnect the site** (clears stale session cache)
MetaMask → three-dot menu → **Connected sites** → disconnect `localhost`

> Skipping Step 2 causes all contract read calls (`balanceOf`, etc.) to silently return empty data (`0x`) even when the node is running correctly. This is the most common source of the "values showing as —" issue.

---

## IPFS Transaction History

Every transaction is uploaded to IPFS via [Pinata](https://pinata.cloud) and displayed in the **Transaction History** panel with:
- Filter buttons by event type
- Clickable CID links to view the raw JSON on the IPFS gateway
- Shared history across all connected users (not per-browser localStorage)

The Express backend (`backend/`) handles all Pinata communication so the JWT is never bundled into the browser.

### Setup

Create a `.env` file in the project root:
```
PINATA_JWT=your_pinata_jwt_here
PINATA_GATEWAY=https://gateway.pinata.cloud
```

You can get a JWT from [app.pinata.cloud](https://app.pinata.cloud) → API Keys → New Key.

Without the backend running (or without a valid JWT) the app still works fully — the Transaction History panel displays a setup notice instead.

---

## Running Tests

```bash
npx hardhat test
```

Tests cover the full protocol flow: liquidity deposit, collateral deposit, borrowing, interest accrual, repayment, withdrawal, and liquidation.

---

## Sepolia Deployment

Create a `.env` file in the project root with:
```
SEPOLIA_RPC_URL=your_sepolia_rpc_url
SEPOLIA_PRIVATE_KEY=your_wallet_private_key
```

Deploy:
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

Then update `frontend/src/config/addresses.ts` with the deployed contract addresses.
