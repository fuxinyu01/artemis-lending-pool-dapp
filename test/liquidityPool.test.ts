import { expect } from "chai";
import { network } from "hardhat";

const ONE_USDT = 10n ** 6n;
const ONE_ETH = 10n ** 18n;

async function deployLiquidityPoolFixture() {
  const { ethers } = await network.connect();

  const [owner, liquidityProvider1, liquidityProvider2, borrower, randomUser] =
    await ethers.getSigners();

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
  const lpToken = await ethers.getContractAt("LPToken", lpTokenAddress);

  await mockUSDT.mint(liquidityProvider1.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(liquidityProvider2.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(borrower.address, 10_000n * ONE_USDT);
  await mockUSDT.mint(randomUser.address, 10_000n * ONE_USDT);

  return {
    ethers,
    owner,
    liquidityProvider1,
    liquidityProvider2,
    borrower,
    randomUser,
    mockUSDT,
    mockPriceOracle,
    liquidityPool,
    lendingPool,
    lpToken,
  };
}

describe("LiquidityPool", function () {
  it("deploys an LPToken owned by the LiquidityPool", async function () {
    const { liquidityPool, lpToken } = await deployLiquidityPoolFixture();

    expect(await lpToken.pool()).to.equal(await liquidityPool.getAddress());
  });

  it("allows a liquidity provider to deposit USDT and receive LP tokens", async function () {
    const { liquidityProvider1, mockUSDT, liquidityPool, lpToken } =
      await deployLiquidityPoolFixture();

    const depositAmount = 1_000n * ONE_USDT;

    await mockUSDT
      .connect(liquidityProvider1)
      .approve(await liquidityPool.getAddress(), depositAmount);

    await liquidityPool
      .connect(liquidityProvider1)
      .depositLiquidity(depositAmount);

    expect(await mockUSDT.balanceOf(await liquidityPool.getAddress())).to.equal(
      depositAmount
    );

    expect(await lpToken.balanceOf(liquidityProvider1.address)).to.equal(
      depositAmount
    );
  });

  it("does not allow deposit without enough allowance", async function () {
    const { ethers, liquidityProvider1, liquidityPool } =
      await deployLiquidityPoolFixture();

    const depositAmount = 1_000n * ONE_USDT;

    await expect(
      liquidityPool.connect(liquidityProvider1).depositLiquidity(depositAmount)
    ).to.be.revert(ethers);
  });

  it("allows two liquidity providers to deposit and receive proportional LP tokens", async function () {
    const {
      liquidityProvider1,
      liquidityProvider2,
      mockUSDT,
      liquidityPool,
      lpToken,
    } = await deployLiquidityPoolFixture();

    const deposit1 = 1_000n * ONE_USDT;
    const deposit2 = 1_000n * ONE_USDT;

    await mockUSDT
      .connect(liquidityProvider1)
      .approve(await liquidityPool.getAddress(), deposit1);

    await liquidityPool.connect(liquidityProvider1).depositLiquidity(deposit1);

    await mockUSDT
      .connect(liquidityProvider2)
      .approve(await liquidityPool.getAddress(), deposit2);

    await liquidityPool.connect(liquidityProvider2).depositLiquidity(deposit2);

    expect(await lpToken.balanceOf(liquidityProvider1.address)).to.equal(
      deposit1
    );
    expect(await lpToken.balanceOf(liquidityProvider2.address)).to.equal(
      deposit2
    );
    expect(await lpToken.totalSupply()).to.equal(deposit1 + deposit2);
  });

  it("allows a liquidity provider to withdraw liquidity and burns LP tokens", async function () {
    const { liquidityProvider1, mockUSDT, liquidityPool, lpToken } =
      await deployLiquidityPoolFixture();

    const depositAmount = 1_000n * ONE_USDT;
    const withdrawShares = 400n * ONE_USDT;

    await mockUSDT
      .connect(liquidityProvider1)
      .approve(await liquidityPool.getAddress(), depositAmount);

    await liquidityPool
      .connect(liquidityProvider1)
      .depositLiquidity(depositAmount);

    await liquidityPool
      .connect(liquidityProvider1)
      .withdrawLiquidity(withdrawShares);

    expect(await lpToken.balanceOf(liquidityProvider1.address)).to.equal(
      depositAmount - withdrawShares
    );

    expect(await mockUSDT.balanceOf(await liquidityPool.getAddress())).to.equal(
      depositAmount - withdrawShares
    );
  });

  it("does not allow withdrawing more LP shares than owned", async function () {
    const { ethers, liquidityProvider1, liquidityPool } =
      await deployLiquidityPoolFixture();

    const shares = 100n * ONE_USDT;

    await expect(
      liquidityPool.connect(liquidityProvider1).withdrawLiquidity(shares)
    ).to.be.revert(ethers);
  });

  it("only allows LendingPool to call transferToBorrower", async function () {
    const { ethers, randomUser, borrower, liquidityPool } =
      await deployLiquidityPoolFixture();

    await expect(
      liquidityPool
        .connect(randomUser)
        .transferToBorrower(borrower.address, 100n * ONE_USDT)
    ).to.be.revert(ethers);
  });

  it("only allows LendingPool to call receiveRepayment", async function () {
    const { ethers, randomUser, borrower, liquidityPool } =
      await deployLiquidityPoolFixture();

    await expect(
      liquidityPool
        .connect(randomUser)
        .receiveRepayment(borrower.address, 100n * ONE_USDT)
    ).to.be.revert(ethers);
  });

  it("updates availableLiquidity after borrow through LendingPool", async function () {
    const {
      liquidityProvider1,
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
    } = await deployLiquidityPoolFixture();

    const depositAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await mockUSDT
      .connect(liquidityProvider1)
      .approve(await liquidityPool.getAddress(), depositAmount);

    await liquidityPool
      .connect(liquidityProvider1)
      .depositLiquidity(depositAmount);

    await lendingPool.connect(borrower).depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    expect(await liquidityPool.availableLiquidity()).to.equal(
      depositAmount - borrowAmount
    );
  });

  it("calculates totalPoolValue as available liquidity plus active loan value", async function () {
    const {
      liquidityProvider1,
      borrower,
      mockUSDT,
      liquidityPool,
      lendingPool,
    } = await deployLiquidityPoolFixture();

    const depositAmount = 5_000n * ONE_USDT;
    const borrowAmount = 1_000n * ONE_USDT;

    await mockUSDT
      .connect(liquidityProvider1)
      .approve(await liquidityPool.getAddress(), depositAmount);

    await liquidityPool
      .connect(liquidityProvider1)
      .depositLiquidity(depositAmount);

    await lendingPool.connect(borrower).depositCollateral({ value: ONE_ETH });

    await lendingPool.connect(borrower).borrow(borrowAmount);

    const availableLiquidity = depositAmount - borrowAmount;
    const activeLoanValue = 1_050n * ONE_USDT; // principal + 5% interest

    expect(await liquidityPool.totalPoolValue()).to.equal(
      availableLiquidity + activeLoanValue
    );
  });
});