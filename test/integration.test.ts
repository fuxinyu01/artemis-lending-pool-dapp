import { expect } from "chai";
import { network } from "hardhat";

const ONE_USDT = 10n ** 6n;
const ONE_ETH = 10n ** 18n;

const ETH_PRICE = 2000n * 10n ** 8n;
const USDC_PRICE = 1n * 10n ** 8n;

async function deployIntegrationFixture() {
  const { ethers } = await network.create();

  const [owner, lp1, lp2, borrower, liquidator] = await ethers.getSigners();

  const mockUSDT = await ethers.deployContract("MockUSDT");
  await mockUSDT.waitForDeployment();

  const mockPriceOracle = await ethers.deployContract("MockPriceOracle", [
    ETH_PRICE,
    USDC_PRICE,
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
  const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress);

  await mockUSDT.mint(lp1.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(lp2.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(liquidator.address, 10_000n * ONE_USDT);

  async function depositLiquidity(user: any, amount: bigint) {
    await mockUSDT
      .connect(user)
      .approve(await liquidityPool.getAddress(), amount);

    await liquidityPool.connect(user).depositLiquidity(amount);
  }

  async function borrowerDepositAndBorrow(
    collateralAmount: bigint,
    borrowAmount: bigint
  ) {
    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: collateralAmount });

    await lendingPool.connect(borrower).borrow(borrowAmount);
  }

  return {
    ethers,
    owner,
    lp1,
    lp2,
    borrower,
    liquidator,
    mockUSDT,
    mockPriceOracle,
    liquidityPool,
    lendingPool,
    lpToken,
    depositLiquidity,
    borrowerDepositAndBorrow,
  };
}

describe("Integration flow", function () {
  it("runs the full normal lending flow: LP deposit, borrow, repay, withdraw collateral", async function () {
    const {
      lp1,
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
      depositLiquidity,
      borrowerDepositAndBorrow,
    } = await deployIntegrationFixture();

    const lpDepositAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const interestAmount = 50n * ONE_USDT;
    const repaymentAmount = 1_050n * ONE_USDT;

    await depositLiquidity(lp1, lpDepositAmount);

    expect(await liquidityPool.availableLiquidity()).to.equal(lpDepositAmount);

    await borrowerDepositAndBorrow(ONE_ETH, borrowAmount);

    expect(await mockUSDT.balanceOf(borrower.address)).to.equal(borrowAmount);
    expect(await liquidityPool.availableLiquidity()).to.equal(
      lpDepositAmount - borrowAmount
    );

    const positionAfterBorrow = await lendingPool.positions(borrower.address);

    expect(positionAfterBorrow.collateralETH).to.equal(ONE_ETH);
    expect(positionAfterBorrow.borrowedAmount).to.equal(borrowAmount);
    expect(positionAfterBorrow.active).to.equal(true);

    // Borrower borrowed 1000 MockUSDT but must repay 1050.
    // Mint 50 extra MockUSDT to represent interest payment capacity in the local test.
    await mockUSDT.mint(borrower.address, interestAmount);

    await mockUSDT
      .connect(borrower)
      .approve(await liquidityPool.getAddress(), repaymentAmount);

    await lendingPool.connect(borrower).repay();

    expect(await liquidityPool.availableLiquidity()).to.equal(
      lpDepositAmount + interestAmount
    );

    const positionAfterRepay = await lendingPool.positions(borrower.address);

    expect(positionAfterRepay.borrowedAmount).to.equal(0n);
    expect(positionAfterRepay.collateralETH).to.equal(ONE_ETH);
    expect(positionAfterRepay.active).to.equal(true);

    await lendingPool.connect(borrower).withdrawCollateral(ONE_ETH);

    const positionAfterWithdraw = await lendingPool.positions(borrower.address);

    expect(positionAfterWithdraw.borrowedAmount).to.equal(0n);
    expect(positionAfterWithdraw.collateralETH).to.equal(0n);
    expect(positionAfterWithdraw.active).to.equal(false);
  });

  it("runs the liquidation flow after ETH price drops", async function () {
    const {
      lp1,
      borrower,
      liquidator,
      mockUSDT,
      mockPriceOracle,
      liquidityPool,
      lendingPool,
      depositLiquidity,
      borrowerDepositAndBorrow,
    } = await deployIntegrationFixture();

    const lpDepositAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const liquidationRepayAmount = 500n * ONE_USDT;

    await depositLiquidity(lp1, lpDepositAmount);

    await borrowerDepositAndBorrow(ONE_ETH, borrowAmount);

    expect(await lendingPool.isLiquidatable(borrower.address)).to.equal(false);

    // ETH price drops from $2000 to $1000.
    // Borrowed value = $1000.
    // Liquidation threshold = 120%, so required collateral = $1200.
    // Current collateral value = $1000, so the position becomes liquidatable.
    await mockPriceOracle.setETHPrice(1000n * 10n ** 8n);

    expect(await lendingPool.isLiquidatable(borrower.address)).to.equal(true);

    await mockUSDT
      .connect(liquidator)
      .approve(await liquidityPool.getAddress(), liquidationRepayAmount);

    await lendingPool
      .connect(liquidator)
      .liquidate(borrower.address, liquidationRepayAmount);

    const positionAfterLiquidation = await lendingPool.positions(
      borrower.address
    );

    expect(positionAfterLiquidation.borrowedAmount).to.equal(
      500n * ONE_USDT
    );

    // Liquidator repays 500 MockUSDT principal.
    // Liquidation bonus = 5%.
    // Collateral seized value = $500 * 1.05 = $525.
    // ETH price = $1000.
    // Collateral seized = 0.525 ETH.
    // Borrower collateral left = 1 - 0.525 = 0.475 ETH.
    expect(positionAfterLiquidation.collateralETH).to.equal(
      475000000000000000n
    );

    expect(await liquidityPool.availableLiquidity()).to.equal(
      lpDepositAmount - borrowAmount + liquidationRepayAmount
    );
  });

  it("prevents LP from withdrawing unavailable liquidity while active loans exist", async function () {
    const {
      ethers,
      lp1,
      borrower,
      liquidityPool,
      depositLiquidity,
      borrowerDepositAndBorrow,
    } = await deployIntegrationFixture();

    const lpDepositAmount = 1_000n * ONE_USDT;
    const borrowAmount = 900n * ONE_USDT;

    await depositLiquidity(lp1, lpDepositAmount);

    await borrowerDepositAndBorrow(ONE_ETH, borrowAmount);

    // availableLiquidity = 100.
    // LP has 1000 shares, but trying to withdraw all shares would require
    // totalPoolValue, including active loan value, which is not fully available as idle USDT.
    await expect(
      liquidityPool.connect(lp1).withdrawLiquidity(lpDepositAmount)
    ).to.be.revert(ethers);
  });

  it("allows LPs to withdraw their proportional value after borrower repays with interest", async function () {
    const {
      lp1,
      lp2,
      borrower,
      mockUSDT,
      liquidityPool,
      lpToken,
      lendingPool,
      depositLiquidity,
      borrowerDepositAndBorrow,
    } = await deployIntegrationFixture();

    const lp1Deposit = 1_000n * ONE_USDT;
    const lp2Deposit = 1_000n * ONE_USDT;

    const borrowAmount = 1_000n * ONE_USDT;
    const interestAmount = 50n * ONE_USDT;
    const repaymentAmount = 1_050n * ONE_USDT;

    await depositLiquidity(lp1, lp1Deposit);
    await depositLiquidity(lp2, lp2Deposit);

    expect(await lpToken.balanceOf(lp1.address)).to.equal(lp1Deposit);
    expect(await lpToken.balanceOf(lp2.address)).to.equal(lp2Deposit);
    expect(await lpToken.totalSupply()).to.equal(lp1Deposit + lp2Deposit);

    await borrowerDepositAndBorrow(ONE_ETH, borrowAmount);

    await mockUSDT.mint(borrower.address, interestAmount);

    await mockUSDT
      .connect(borrower)
      .approve(await liquidityPool.getAddress(), repaymentAmount);

    await lendingPool.connect(borrower).repay();

    // Total liquidity after repayment:
    // initial 2000 - borrowed 1000 + repaid 1050 = 2050.
    expect(await liquidityPool.availableLiquidity()).to.equal(
      2_050n * ONE_USDT
    );

    // LP1 owns 50% of LP tokens, so withdrawing all LP1 shares should return 1025.
    await liquidityPool.connect(lp1).withdrawLiquidity(lp1Deposit);

    expect(await mockUSDT.balanceOf(lp1.address)).to.equal(
      10_000n * ONE_USDT - lp1Deposit + 1_025n * ONE_USDT
    );

    expect(await lpToken.balanceOf(lp1.address)).to.equal(0n);

    // After LP1 withdraws 1025, pool should still have 1025 left for LP2.
    expect(await liquidityPool.availableLiquidity()).to.equal(
      1_025n * ONE_USDT
    );
  });
});