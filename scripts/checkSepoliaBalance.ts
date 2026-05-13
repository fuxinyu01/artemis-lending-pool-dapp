import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect({
    network: "sepolia",
  });

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer address:", deployer.address);
  console.log("Sepolia balance:", ethers.formatEther(balance), "ETH");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});