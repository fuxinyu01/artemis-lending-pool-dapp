import { network } from "hardhat";

const ONE_USDT = 10n ** 6n;

async function main() {
  const { ethers } = await network.create();

  const [deployer, liquidityProvider, borrower, liquidator] =
    await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  const mockUSDT = await ethers.deployContract("MockUSDT");
  await mockUSDT.waitForDeployment();

  const mockPriceOracle = await ethers.deployContract("MockPriceOracle", [
    2000n * 10n ** 8n, // ETH = $2000
    1n * 10n ** 8n, // USDC = $1
  ]);
  await mockPriceOracle.waitForDeployment();

  const liquidityPool = await ethers.deployContract("LiquidityPool");
  await liquidityPool.waitForDeployment();

  const lendingPool = await ethers.deployContract("LendingPool", [
    await mockUSDT.getAddress(),
    await liquidityPool.getAddress(),
    await mockPriceOracle.getAddress(),
  ]);
  await lendingPool.waitForDeployment();

  await liquidityPool.addressSetter(
    await mockUSDT.getAddress(),
    await lendingPool.getAddress()
  );

  const lpTokenAddress = await liquidityPool.lpToken();

  // Give testing balances to local accounts
  await mockUSDT.mint(liquidityProvider.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(borrower.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(liquidator.address, 10_000n * ONE_USDT);

  console.log("\nLocal deployment completed.\n");

  console.log("Accounts:");
  console.log("deployer:          ", deployer.address);
  console.log("liquidityProvider: ", liquidityProvider.address);
  console.log("borrower:          ", borrower.address);
  console.log("liquidator:        ", liquidator.address);

  console.log("\nContract addresses:");
  console.log("mockUSDT:          ", await mockUSDT.getAddress());
  console.log("mockPriceOracle:   ", await mockPriceOracle.getAddress());
  console.log("liquidityPool:     ", await liquidityPool.getAddress());
  console.log("lendingPool:       ", await lendingPool.getAddress());
  console.log("lpToken:           ", lpTokenAddress);

  console.log("\nFrontend config:");
  console.log(`
export const addresses = {
  mockUSDT: "${await mockUSDT.getAddress()}",
  mockPriceOracle: "${await mockPriceOracle.getAddress()}",
  liquidityPool: "${await liquidityPool.getAddress()}",
  lendingPool: "${await lendingPool.getAddress()}",
  lpToken: "${lpTokenAddress}",
};
`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});