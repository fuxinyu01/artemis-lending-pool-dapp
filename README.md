# Artemis Lending Pool

A decentralised lending protocol built on Ethereum. Users deposit ETH as collateral to borrow MockUSDT, liquidity providers earn yield by supplying funds, and liquidators maintain protocol solvency by closing undercollateralised positions. Transaction events are stored off-chain on IPFS via Pinata.

**BCOLN FS26 — Group Artemis**

---

## Contracts

| Contract | Description |
|---|---|
| `LendingPool.sol` | Core borrowing logic — collateral, borrow, repay, liquidate |
| `LiquidityPool.sol` | USDT liquidity pool — deposit/withdraw, issues LP tokens |
| `MockUSDT.sol` | ERC20 stablecoin for local testing |
| `MockPriceOracle.sol` | Manually settable ETH/USD price for local testing |
| `PriceOracle.sol` | Chainlink-backed price feed for Sepolia deployment |

**Key parameters:** 150% collateral ratio · 120% liquidation threshold · 5% fixed interest · 5% liquidation bonus

---

## Running Locally

### Option A — Docker (recommended)

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# Clone and enter the project
git clone <repo-url>
cd artemis-lending-pool-dapp

# Start everything in one command
docker compose up --build
```

Wait ~30 seconds. Docker will:
1. Start a local Hardhat blockchain on port `8545`
2. Deploy all contracts automatically
3. Start the frontend at `http://localhost:5173`

**Useful commands:**
```bash
# View Hardhat node logs (deployed addresses, transactions)
docker compose logs hardhat-node

# Stop everything
docker compose down

# Rebuild after code changes
docker compose up --build
```

---

### Option B — Manual (3 terminals)

**Prerequisites:** Node.js 22+, npm

```bash
# Terminal 1 — start the local blockchain
npx hardhat node

# Terminal 2 — deploy contracts
npx hardhat run scripts/deployLocal.ts

# Terminal 3 — start the frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## MetaMask Setup

### 1. Add the Hardhat Local network

Open MetaMask → Networks dropdown → **Add a network manually**:

| Field | Value |
|---|---|
| Network name | `Hardhat Local` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

### 2. Import test accounts

The Hardhat node always generates the same accounts. Import these private keys into MetaMask:

| Account | Address | Private Key |
|---|---|---|
| #0 — Deployer / LP | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| #1 — Borrower | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| #2 — Liquidator | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

> These are public test accounts. **Never send real ETH to them.**

### 3. Connect to the app

Switch MetaMask to **Hardhat Local**, open `http://localhost:5173`, and click **Connect Wallet**.

---

## After Every Restart

Each time you restart the Hardhat node (or run `docker compose down && docker compose up`), the blockchain resets. Do both of the following in MetaMask before reconnecting:

**Step 1 — Reset Account** (clears stale nonces)
MetaMask → three-dot menu → Settings → Advanced → **Reset Account**
Repeat for every imported account.

**Step 2 — Disconnect the site** (clears stale session cache)
MetaMask → three-dot menu → **Connected sites** → disconnect `localhost`

> Skipping Step 2 causes contract read calls (`balanceOf`, etc.) to silently return empty data even when the node is running correctly.

---

## IPFS Transaction History

The frontend stores every transaction event (collateral deposit, borrow, repay, withdraw, liquidate) on IPFS via Pinata and displays a **Transaction History** panel with clickable CID links.

To enable, create `frontend/.env`:
```
VITE_PINATA_JWT=your_pinata_jwt_here
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
```

Without this file the app still works — IPFS history is simply disabled.

---

## Running Tests

```bash
npx hardhat test
```

---

## Sepolia Deployment

Create a `.env` file in the project root:
```
SEPOLIA_RPC_URL=your_sepolia_rpc_url
SEPOLIA_PRIVATE_KEY=your_wallet_private_key
```

Then deploy:
```bash
npx hardhat run scripts/deployLocal.ts --network sepolia
```
