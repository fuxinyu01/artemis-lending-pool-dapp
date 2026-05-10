import { expect } from "chai";
import { network } from "hardhat";

const ONE_USDT = 10n ** 6n;
const ONE_ETH = 10n ** 18n;

const ETH_PRICE = 2000n * 10n ** 8n;
const USDC_PRICE = 1n * 10n ** 8n;

async function deployLendingPoolFixture() {
  const { ethers } = await network.create();

  const [owner, liquidityProvider, borrower, liquidator, randomUser] =
    await ethers.getSigners();

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

  await mockUSDT.mint(liquidityProvider.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(liquidator.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(randomUser.address, 10_000n * ONE_USDT);

  async function fundLiquidity(amount: bigint) {
    await mockUSDT
      .connect(liquidityProvider)
      .approve(await liquidityPool.getAddress(), amount);

    await liquidityPool.connect(liquidityProvider).depositLiquidity(amount);
  }

  return {
    ethers,
    owner,
    liquidityProvider,
    borrower,
    liquidator,
    randomUser,
    mockUSDT,
    mockPriceOracle,
    liquidityPool,
    lendingPool,
    fundLiquidity,
  };
}

describe("LendingPool", function () {
  it("allows a borrower to deposit ETH collateral", async function () {
    const { borrower, lendingPool } = await deployLendingPoolFixture();

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    const position = await lendingPool.positions(borrower.address);

    expect(position.collateralETH).to.equal(ONE_ETH);
    expect(position.borrowedAmount).to.equal(0n);
    expect(position.active).to.equal(true);
  });

  it("does not allow zero ETH collateral deposit", async function () {
    const { ethers, borrower, lendingPool } = await deployLendingPoolFixture();

    await expect(
      lendingPool.connect(borrower).depositCollateral({ value: 0n })
    ).to.be.revert(ethers);
  });

  it("calculates collateral value in USD correctly", async function () {
    const { borrower, lendingPool } = await deployLendingPoolFixture();

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    expect(await lendingPool.getCollateralValueUSD(borrower.address)).to.equal(
      2000n * 10n ** 8n
    );
  });

  it("calculates max borrow amount based on collateral ratio", async function () {
    const { borrower, lendingPool } = await deployLendingPoolFixture();

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    // 1 ETH = $2000.
    // Collateral ratio = 150%.
    // Max borrow value = 2000 * 100 / 150 = 1333.333333 USD.
    // MockUSDT has 6 decimals, so expected amount is 1333.333333 mUSDT.
    expect(await lendingPool.getMaxBorrowAmount(borrower.address)).to.equal(
      1333333333n
    );
  });

  it("allows borrowing within the collateral limit", async function () {
    const {
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    const position = await lendingPool.positions(borrower.address);

    expect(position.borrowedAmount).to.equal(borrowAmount);
    expect(await mockUSDT.balanceOf(borrower.address)).to.equal(borrowAmount);
    expect(await liquidityPool.availableLiquidity()).to.equal(
      liquidityAmount - borrowAmount
    );
  });

  it("does not allow borrowing above the collateral limit", async function () {
    const { ethers, borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const tooMuchBorrow = 1_500n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await expect(
      lendingPool.connect(borrower).borrow(tooMuchBorrow)
    ).to.be.revert(ethers);
  });

  it("calculates repayment amount as principal plus fixed interest", async function () {
    const { borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const expectedRepayment = 1_050n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    expect(await lendingPool.getRepaymentAmount(borrower.address)).to.equal(
      expectedRepayment
    );
  });

  it("returns zero borrowers before any borrow action", async function () {
    const { lendingPool } = await deployLendingPoolFixture();

    expect(await lendingPool.getBorrowersCount()).to.equal(0n);
    expect(await lendingPool.getAllBorrowers()).to.deep.equal([]);
  });

  it("tracks borrower after borrowing", async function () {
    const { borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    expect(await lendingPool.getBorrowersCount()).to.equal(1n);
    expect(await lendingPool.getBorrowerAt(0)).to.equal(borrower.address);

    const allBorrowers = await lendingPool.getAllBorrowers();

    expect(allBorrowers.length).to.equal(1);
    expect(allBorrowers[0]).to.equal(borrower.address);
  });

  it("does not duplicate the same borrower in borrowers list", async function () {
    const { borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const firstBorrow = 500n * ONE_USDT;
    const secondBorrow = 300n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(firstBorrow);
    await lendingPool.connect(borrower).borrow(secondBorrow);

    expect(await lendingPool.getBorrowersCount()).to.equal(1n);

    const allBorrowers = await lendingPool.getAllBorrowers();

    expect(allBorrowers.length).to.equal(1);
    expect(allBorrowers[0]).to.equal(borrower.address);
  });

  it("reverts when getBorrowerAt index is out of range", async function () {
    const { ethers, lendingPool } = await deployLendingPoolFixture();

    await expect(lendingPool.getBorrowerAt(0)).to.be.revert(ethers);
  });

  it("returns borrower summary for frontend display", async function () {
    const { borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    const summary = await lendingPool.getBorrowerSummary(borrower.address);

    expect(summary.collateralETH).to.equal(ONE_ETH);
    expect(summary.borrowedAmount).to.equal(1_000n * ONE_USDT);
    expect(summary.repaymentAmount).to.equal(1_050n * ONE_USDT);
    expect(summary.active).to.equal(true);
    expect(summary.liquidatable).to.equal(false);
  });

  it("returns borrower summary as liquidatable after ETH price drops", async function () {
    const { borrower, mockPriceOracle, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await mockPriceOracle.setETHPrice(1000n * 10n ** 8n);

    const summary = await lendingPool.getBorrowerSummary(borrower.address);

    expect(summary.collateralETH).to.equal(ONE_ETH);
    expect(summary.borrowedAmount).to.equal(1_000n * ONE_USDT);
    expect(summary.repaymentAmount).to.equal(1_050n * ONE_USDT);
    expect(summary.active).to.equal(true);
    expect(summary.liquidatable).to.equal(true);
  });

  it("allows borrower to repay principal plus interest", async function () {
    const {
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const interestAmount = 50n * ONE_USDT;
    const repaymentAmount = 1_050n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    // Borrower only receives 1000 from borrowing, so mint 50 extra for interest.
    await mockUSDT.mint(borrower.address, interestAmount);

    await mockUSDT
      .connect(borrower)
      .approve(await liquidityPool.getAddress(), repaymentAmount);

    await lendingPool.connect(borrower).repay();

    const position = await lendingPool.positions(borrower.address);

    expect(position.borrowedAmount).to.equal(0n);
    expect(await liquidityPool.availableLiquidity()).to.equal(
      liquidityAmount + interestAmount
    );
  });

  it("allows borrower to withdraw collateral after full repayment", async function () {
    const {
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const interestAmount = 50n * ONE_USDT;
    const repaymentAmount = 1_050n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await mockUSDT.mint(borrower.address, interestAmount);

    await mockUSDT
      .connect(borrower)
      .approve(await liquidityPool.getAddress(), repaymentAmount);

    await lendingPool.connect(borrower).repay();

    await lendingPool.connect(borrower).withdrawCollateral(ONE_ETH);

    const position = await lendingPool.positions(borrower.address);

    expect(position.collateralETH).to.equal(0n);
    expect(position.borrowedAmount).to.equal(0n);
    expect(position.active).to.equal(false);
  });

  it("does not allow withdrawing too much collateral while debt exists", async function () {
    const { ethers, borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const tooMuchWithdraw = 5n * 10n ** 17n; // 0.5 ETH

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await expect(
      lendingPool.connect(borrower).withdrawCollateral(tooMuchWithdraw)
    ).to.be.revert(ethers);
  });

  it("calculates max withdrawable collateral correctly while debt exists", async function () {
    const { borrower, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    // Borrowed value = $1000.
    // Required collateral at 150% = $1500.
    // Current collateral value = $2000.
    // Excess collateral = $500.
    // ETH price = $2000, so max withdrawable = 0.25 ETH.
    expect(
      await lendingPool.getMaxWithdrawableCollateral(borrower.address)
    ).to.equal(250000000000000000n);
  });

  it("detects whether a position is liquidatable after ETH price drops", async function () {
    const { borrower, mockPriceOracle, lendingPool, fundLiquidity } =
      await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    expect(await lendingPool.isLiquidatable(borrower.address)).to.equal(false);

    // Drop ETH price from $2000 to $1000.
    await mockPriceOracle.setETHPrice(1000n * 10n ** 8n);

    expect(await lendingPool.isLiquidatable(borrower.address)).to.equal(true);
  });

  it("does not allow liquidation of a healthy position", async function () {
    const {
      ethers,
      borrower,
      liquidator,
      mockUSDT,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const repayAmount = 500n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await mockUSDT
      .connect(liquidator)
      .approve(await liquidityPool.getAddress(), repayAmount);

    await expect(
      lendingPool.connect(liquidator).liquidate(borrower.address, repayAmount)
    ).to.be.revert(ethers);
  });

  it("allows liquidation after ETH price drops", async function () {
    const {
      borrower,
      liquidator,
      mockUSDT,
      mockPriceOracle,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const repayAmount = 500n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await mockPriceOracle.setETHPrice(1000n * 10n ** 8n);

    await mockUSDT
      .connect(liquidator)
      .approve(await liquidityPool.getAddress(), repayAmount);

    await lendingPool
      .connect(liquidator)
      .liquidate(borrower.address, repayAmount);

    const position = await lendingPool.positions(borrower.address);

    expect(position.borrowedAmount).to.equal(500n * ONE_USDT);

    // Liquidator repays 500 MockUSDT principal.
    // With 5% liquidation bonus, collateral seized = $525.
    // ETH price after drop = $1000, so collateral seized = 0.525 ETH.
    expect(position.collateralETH).to.equal(475000000000000000n);

    expect(await liquidityPool.availableLiquidity()).to.equal(
      liquidityAmount - borrowAmount + repayAmount
    );
  });

  it("caps liquidation repayment by the close factor", async function () {
    const {
      borrower,
      liquidator,
      mockUSDT,
      mockPriceOracle,
      liquidityPool,
      lendingPool,
      fundLiquidity,
    } = await deployLendingPoolFixture();

    const liquidityAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;
    const attemptedRepayAmount = 800n * ONE_USDT;

    await fundLiquidity(liquidityAmount);

    await lendingPool
      .connect(borrower)
      .depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    await mockPriceOracle.setETHPrice(1000n * 10n ** 8n);

    await mockUSDT
      .connect(liquidator)
      .approve(await liquidityPool.getAddress(), attemptedRepayAmount);

    await lendingPool
      .connect(liquidator)
      .liquidate(borrower.address, attemptedRepayAmount);

    const position = await lendingPool.positions(borrower.address);

    // CLOSE_FACTOR = 50%, so even though the liquidator tries to repay 800,
    // only 500 is actually repaid.
    expect(position.borrowedAmount).to.equal(500n * ONE_USDT);
  });
});