import { network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const { ethers } = await network.connect({
    network: "sepolia",
  });

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts to Sepolia...");
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "Sepolia ETH");

  const ethFeed =
    process.env.ETH_USD_FEED_SEPOLIA ??
    "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  const usdcFeed =
    process.env.USDC_USD_FEED_SEPOLIA ??
    "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E";

  console.log("ETH/USD feed:", ethFeed);
  console.log("USDC/USD feed:", usdcFeed);

  // 1. Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();

  const mockUSDTAddress = await mockUSDT.getAddress();
  console.log("MockUSDT deployed to:", mockUSDTAddress);

  // 2. Deploy PriceOracle
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await PriceOracle.deploy(ethFeed, usdcFeed);
  await priceOracle.waitForDeployment();

  const priceOracleAddress = await priceOracle.getAddress();
  console.log("PriceOracle deployed to:", priceOracleAddress);

  // 3. Deploy LiquidityPool
  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const liquidityPool = await LiquidityPool.deploy();
  await liquidityPool.waitForDeployment();

  const liquidityPoolAddress = await liquidityPool.getAddress();
  console.log("LiquidityPool deployed to:", liquidityPoolAddress);

  // 4. Read LPToken address created inside LiquidityPool constructor
  const lpTokenAddress = await liquidityPool.lpToken();
  console.log("LPToken deployed to:", lpTokenAddress);

  // 5. Deploy LendingPool
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(
    mockUSDTAddress,
    liquidityPoolAddress,
    priceOracleAddress
  );
  await lendingPool.waitForDeployment();

  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("LendingPool deployed to:", lendingPoolAddress);

  // 6. Link LiquidityPool to MockUSDT and LendingPool
  const setTx = await liquidityPool.addressSetter(
    mockUSDTAddress,
    lendingPoolAddress
  );
  await setTx.wait();

  console.log("LiquidityPool addressSetter completed.");

  // 7. Write frontend addresses
  const outputPath = path.join(
    process.cwd(),
    "frontend",
    "src",
    "config",
    "addresses.ts"
  );

  const fileContent = `export const CONTRACT_ADDRESSES = {
  network: "sepolia",
  mockUSDT: "${mockUSDTAddress}",
  lpToken: "${lpTokenAddress}",
  liquidityPool: "${liquidityPoolAddress}",
  lendingPool: "${lendingPoolAddress}",
  priceOracle: "${priceOracleAddress}",
  ethUsdFeed: "${ethFeed}",
  usdcUsdFeed: "${usdcFeed}",
} as const;
`;

  fs.writeFileSync(outputPath, fileContent);

  console.log("Frontend addresses written to:", outputPath);
  console.log("Sepolia deployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});