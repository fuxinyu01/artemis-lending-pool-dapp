import { expect } from "chai";
import { network } from "hardhat";

// All prices use 8 decimal places (Chainlink convention).
// 2000_00000000 === 200000000000 === $2,000.00000000
const ETH_PRICE = 2000_00000000n;
// 1_00000000 === 100000000 === $1.00000000
const USDC_PRICE = 1_00000000n;

async function deployMockOracle() {
  const { ethers } = await network.create();
  return ethers.deployContract("MockPriceOracle", [ETH_PRICE, USDC_PRICE]);
}

describe("MockPriceOracle", function () {
  it("returns the configured ETH price", async function () {
    const oracle = await deployMockOracle();
    expect(await oracle.getETHPrice()).to.equal(ETH_PRICE);
  });

  it("returns the configured USDC price", async function () {
    const oracle = await deployMockOracle();
    expect(await oracle.getUSDCPrice()).to.equal(USDC_PRICE);
  });

  it("returns zero collateral value for zero amounts", async function () {
    const oracle = await deployMockOracle();
    expect(await oracle.getCollateralValue(0n, 0n)).to.equal(0n);
  });

  it("calculates collateral value for ETH only", async function () {
    const oracle = await deployMockOracle();
    const oneEth = 10n ** 18n; // 1 ETH in wei
    // 1 ETH * $2000 → $2000 with 8 decimals
    expect(await oracle.getCollateralValue(oneEth, 0n)).to.equal(2000_00000000n);
  });

  it("calculates collateral value for USDC only", async function () {
    const oracle = await deployMockOracle();
    const thousandUsdc = 1000n * 10n ** 6n; // 1000 USDC in atoms
    // 1000 USDC * $1 → $1000 with 8 decimals
    expect(await oracle.getCollateralValue(0n, thousandUsdc)).to.equal(1000_00000000n);
  });

  it("calculates combined collateral value", async function () {
    const oracle = await deployMockOracle();
    const oneEth = 10n ** 18n;          // 1 ETH   → $2000
    const fiveHundredUsdc = 500n * 10n ** 6n; // 500 USDC → $500
    // $2000 + $500 = $2500 with 8 decimals
    expect(await oracle.getCollateralValue(oneEth, fiveHundredUsdc)).to.equal(2500_00000000n);
  });

  it("reflects updated ETH price after setETHPrice", async function () {
    const oracle = await deployMockOracle();
    const newPrice = 3000_00000000n;
    await oracle.setETHPrice(newPrice);
    expect(await oracle.getETHPrice()).to.equal(newPrice);

    const oneEth = 10n ** 18n;
    expect(await oracle.getCollateralValue(oneEth, 0n)).to.equal(3000_00000000n);
  });

  it("reflects updated USDC price after setUSDCPrice", async function () {
    const oracle = await deployMockOracle();
    // Simulate a mild de-peg: USDC trades at $0.98
    const depegPrice = 98_000000n; // $0.98000000
    await oracle.setUSDCPrice(depegPrice);
    expect(await oracle.getUSDCPrice()).to.equal(depegPrice);

    const hundredUsdc = 100n * 10n ** 6n;
    // 100 USDC * $0.98 = $98.00000000 with 8 decimals
    expect(await oracle.getCollateralValue(0n, hundredUsdc)).to.equal(98_00000000n);
  });
});
