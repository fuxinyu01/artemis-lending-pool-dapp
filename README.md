# Artemis Lending Pool DApp

A decentralised lending protocol built on Ethereum using Solidity, Hardhat, React, ethers.js, and Chainlink price feeds.

This project simulates a simplified overcollateralised lending market where:

- Liquidity providers deposit stablecoins into a shared pool and earn yield
- Borrowers lock ETH as collateral and borrow against it
- Liquidators maintain protocol solvency by liquidating unhealthy positions
- Every on-chain action can optionally be persisted to IPFS through a backend API

---

# Project Status & Branch Structure

## Important

The repository currently uses **two primary working branches**:

| Branch | Purpose |
|---|---|
| `main` | Configured for the **Sepolia deployment** using the live Chainlink price feed |
| `Local_test_mock_oracle` | Contains the **fully local Hardhat demo environment** using the `MockPriceOracle` |

### Which branch should you use?

#### Use `main` if you want:
- The Sepolia deployment configuration
- Real Chainlink ETH/USD price feeds
- Public testnet interaction
- Production-style deployment behaviour

#### Use `Local_test_mock_oracle` if you want:
- Fully local development
- A deterministic Hardhat environment
- Manual oracle price manipulation for liquidation testing
- The classroom/demo setup
- Docker-based local testing

---

# Features

## Lending Protocol

- ETH-backed borrowing
- Stablecoin liquidity pool
- LP token issuance
- Fixed interest borrowing
- Collateral health checks
- Liquidation mechanics
- Borrow repayment flow
- Withdrawal logic

## Frontend

- React + Vite frontend
- MetaMask wallet integration
- ethers.js v6 contract interaction
- Live protocol dashboard
- Shared transaction history panel

## Backend

- Express.js API server
- Pinata IPFS integration
- Shared transaction persistence
- Secure server-side JWT handling

## Smart Contract Infrastructure

- Solidity smart contracts
- Hardhat development environment
- Local and Sepolia deployments
- Chainlink oracle integration
- Mock oracle support for testing

---

# Protocol Overview

The protocol has three participant roles.

## Liquidity Providers

Liquidity providers:
- Deposit MockUSDT into the liquidity pool
- Receive LP tokens representing their pool share
- Earn yield from borrower interest payments

## Borrowers

Borrowers:
- Deposit ETH as collateral
- Borrow MockUSDT against that collateral
- Must maintain a healthy collateral ratio

## Liquidators

Liquidators:
- Repay debt for undercollateralised borrowers
- Receive discounted collateral plus a liquidation bonus

---

# Core Protocol Parameters

| Parameter | Value |
|---|---|
| Minimum Collateral Ratio | 150% |
| Liquidation Threshold | 120% |
| Borrow Interest Rate | 5% |
| Liquidation Bonus | 5% |

---

# Deployment Architectures

The project currently supports two separate environments depending on the branch being used.

---

## Sepolia Architecture (`main` branch)

The `main` branch is configured for deployment on the Sepolia Ethereum testnet using live Chainlink price feeds.

### Components

- React frontend
- MetaMask wallet
- ethers.js
- Sepolia RPC provider
- Chainlink ETH/USD Price Feed
- LendingPool smart contracts
- Express IPFS backend

### Architecture Flow

```text
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│   React Frontend  ←→  MetaMask  ←→  ethers.js           │
│            │                                            │
│            └──────── HTTP API ───────→ Express Backend  │
│                                              │          │
│                                              ▼          │
│                                         Pinata IPFS     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Sepolia Testnet                     │
│                                                         │
│  LendingPool · LiquidityPool · LPToken                 │
│  MockUSDT · PriceOracle                                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                 Chainlink ETH/USD Feed
                          │
                          ▼
                   Sepolia Contracts

┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│   React Frontend  ←→  MetaMask  ←→  ethers.js           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Hardhat Local Node                    │
│                                                         │
│  LendingPool · LiquidityPool · LPToken                 │
│  MockUSDT · MockPriceOracle                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                Manual Oracle Price Updates
                          │
                          ▼
                  Express IPFS Backend
                          │
                          ▼
                      Pinata IPFS
```

---

# Smart Contracts

| Contract | Description |
|---|---|
| `LendingPool.sol` | Core borrowing and collateral management |
| `LiquidityPool.sol` | Stablecoin liquidity management |
| `LPToken.sol` | ERC20 token representing LP shares |
| `MockUSDT.sol` | Local testing stablecoin |
| `MockPriceOracle.sol` | Manual price oracle for local testing |
| `PriceOracle.sol` | Chainlink-backed oracle for Sepolia |

---

# Tech Stack

## Blockchain

- Solidity
- Hardhat
- ethers.js v6
- OpenZeppelin Contracts
- Chainlink Price Feeds

## Frontend

- React
- Vite
- TypeScript

## Backend

- Node.js
- Express.js
- Pinata IPFS SDK

## Infrastructure

- Docker
- Docker Compose

---

# Repository Structure

```text
.
├── backend/                 # Express IPFS backend
├── contracts/               # Solidity smart contracts
├── frontend/                # React frontend
├── scripts/                 # Deployment scripts
├── test/                    # Hardhat tests
├── docker-compose.yml
├── hardhat.config.ts
└── README.md
```

---

# Getting Started

## Prerequisites

Install:

- Node.js 22+
- npm
- MetaMask
- Docker Desktop (recommended)

---

# Running the Local Demo

## Recommended Branch

For the fully local demo environment:

```bash
git checkout Local_test_mock_oracle
```

This branch includes:
- Mock oracle support
- Local Hardhat deployment
- Easier liquidation testing
- Fully isolated development environment

---

# Option A — Docker (Recommended)

## 1. Clone the repository

```bash
git clone <repo-url>
cd artemis-lending-pool-dapp
```

## 2. Switch to the local demo branch

```bash
git checkout Local_test_mock_oracle
```

## 3. Configure environment variables (optional)

```bash
cp .env.example .env
```

Fill in:

```env
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=https://gateway.pinata.cloud
```

## 4. Start all services

```bash
docker compose up --build
```

---

## Services

| Service | Port | Description |
|---|---|---|
| Hardhat Node | 8545 | Local Ethereum blockchain |
| Backend API | 3001 | IPFS upload backend |
| Frontend | 5173 | React application |

Open:

```text
http://localhost:5173
```

---

## Useful Docker Commands

```bash
docker compose logs hardhat-node
```

```bash
docker compose logs ipfs-backend
```

```bash
docker compose down
```

```bash
docker compose up --build
```

---

# Option B — Manual Local Setup

## Terminal 1 — Start Hardhat node

```bash
npx hardhat node
```

## Terminal 2 — Deploy contracts

```bash
npx hardhat run scripts/deployLocal.ts
```

## Terminal 3 — Start backend

```bash
cd backend
npm install
npm start
```

## Terminal 4 — Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# MetaMask Setup

## Add Hardhat Network

| Field | Value |
|---|---|
| Network Name | Hardhat Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency Symbol | ETH |

---

## Import Test Accounts

### Account 0 — Deployer / Liquidity Provider

```text
Private Key:
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Account 1 — Borrower

```text
Private Key:
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### Account 2 — Liquidator

```text
Private Key:
0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

> These are public Hardhat development accounts. Never send real assets to them.

---

# Local Demo Workflow

A typical local demo flow:

1. Deposit liquidity as LP
2. Deposit ETH collateral as borrower
3. Borrow MockUSDT
4. Manipulate the mock oracle price
5. Trigger liquidation
6. Repay debt and withdraw collateral

The `Local_test_mock_oracle` branch is specifically designed for this workflow.

---

# IPFS Transaction History

Every transaction can optionally be:

- Uploaded to IPFS
- Pinned through Pinata
- Displayed in the shared frontend history panel

## Features

- Shared transaction history
- CID links
- Event filtering
- Persistent transaction records

---

# Environment Variables

Copy and follow .env.example

---

# Testing

Run the Hardhat test suite:

```bash
npx hardhat test
```

Tests cover:

- Liquidity deposits
- Borrowing
- Repayment
- Withdrawals
- Interest accrual
- Liquidations
- Oracle interactions

---

# Sepolia Deployment

## Recommended Branch

Use:

```bash
git checkout main
```

The `main` branch is configured for the Sepolia deployment environment.

---

## Deploy to Sepolia

```bash
npx hardhat run scripts/deploySepolia.ts --network sepolia
```

After deployment:

1. Copy deployed contract addresses
2. Update frontend configuration
3. Restart the frontend

---

# Common Issues

## MetaMask Returning Empty Values

After restarting the Hardhat node:

### Reset MetaMask Account

MetaMask → Settings → Advanced → Reset Account

### Disconnect Localhost Site

MetaMask → Connected Sites → Disconnect localhost

Then reconnect the wallet.

---

# Security Notes

- Never expose private keys publicly
- Never commit `.env` files
- Never use development keys on mainnet
- The backend keeps the Pinata JWT server-side only

---

# Future Improvements

Potential future upgrades:

- Dynamic interest rates
- Multi-asset collateral
- Governance token
- Staking incentives
- Advanced liquidation engine
- Cross-chain support
- Improved analytics dashboard
- Persistent database-backed history

---

# Contributors

BCOLN FS26 — Group Artemis

---

# License

This project is intended for educational and demonstration purposes.
