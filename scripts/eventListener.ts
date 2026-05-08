import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { uploadToIPFS, type EventRecord } from "./ipfsStorage.js";
dotenv.config();

const LENDING_POOL_ABI = [
  "event CollateralDeposited(address indexed user, uint256 amount)",
  "event Borrowed(address indexed user, uint256 amount)",
  "event Repaid(address indexed user, uint256 amount, uint256 interest)",
  "event CollateralWithdrawn(address indexed user, uint256 amount)",
  "event Liquidated(address indexed borrower, address indexed liquidator, uint256 repayAmount, uint256 collateralSeized)",
];

async function main() {
  const contractAddress = process.env.LENDING_POOL_ADDRESS;
  if (!contractAddress) {
    throw new Error("LENDING_POOL_ADDRESS not set in .env");
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, LENDING_POOL_ABI, provider);

  console.log(`Listening to LendingPool at ${contractAddress}...`);

  contract.on("CollateralDeposited", async (user, amount, event) => {
    const block = await event.getBlock();
    await uploadToIPFS({
      event: "CollateralDeposited",
      user,
      data: { amountETH: ethers.formatEther(amount) },
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: block.timestamp,
    } as EventRecord);
  });

  contract.on("Borrowed", async (user, amount, event) => {
    const block = await event.getBlock();
    await uploadToIPFS({
      event: "Borrowed",
      user,
      data: { amountUSDT: (Number(amount) / 1e6).toFixed(6) },
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: block.timestamp,
    } as EventRecord);
  });

  contract.on("Repaid", async (user, amount, interest, event) => {
    const block = await event.getBlock();
    await uploadToIPFS({
      event: "Repaid",
      user,
      data: {
        amountUSDT: (Number(amount) / 1e6).toFixed(6),
        interestUSDT: (Number(interest) / 1e6).toFixed(6),
      },
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: block.timestamp,
    } as EventRecord);
  });

  contract.on("CollateralWithdrawn", async (user, amount, event) => {
    const block = await event.getBlock();
    await uploadToIPFS({
      event: "CollateralWithdrawn",
      user,
      data: { amountETH: ethers.formatEther(amount) },
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: block.timestamp,
    } as EventRecord);
  });

  contract.on("Liquidated", async (borrower, liquidator, repayAmount, collateralSeized, event) => {
    const block = await event.getBlock();
    await uploadToIPFS({
      event: "Liquidated",
      user: borrower,
      data: {
        liquidator,
        repayAmountUSDT: (Number(repayAmount) / 1e6).toFixed(6),
        collateralSeizedETH: ethers.formatEther(collateralSeized),
      },
      txHash: event.log.transactionHash,
      blockNumber: event.log.blockNumber,
      timestamp: block.timestamp,
    } as EventRecord);
  });
}

main().catch(console.error);
