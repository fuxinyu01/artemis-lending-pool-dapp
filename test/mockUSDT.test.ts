import { expect } from "chai";
import { network } from "hardhat";

const ONE_USDT = 10n ** 6n;
const INITIAL_SUPPLY = 1_000_000n * ONE_USDT;
const FAUCET_LIMIT = 1_000n * ONE_USDT;

async function deployMockUSDT() {
  const { ethers } = await network.connect();
  const [owner, user1, user2] = await ethers.getSigners();

  const mockUSDT = await ethers.deployContract("MockUSDT");
  await mockUSDT.waitForDeployment();

  return {
    ethers,
    owner,
    user1,
    user2,
    mockUSDT,
  };
}

describe("MockUSDT", function () {
  it("uses 6 decimals", async function () {
    const { mockUSDT } = await deployMockUSDT();

    expect(await mockUSDT.decimals()).to.equal(6);
  });

  it("mints the initial supply to the owner on deployment", async function () {
    const { owner, mockUSDT } = await deployMockUSDT();

    expect(await mockUSDT.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
  });

  it("allows the owner to mint tokens", async function () {
    const { user1, mockUSDT } = await deployMockUSDT();

    const mintAmount = 500n * ONE_USDT;

    await mockUSDT.mint(user1.address, mintAmount);

    expect(await mockUSDT.balanceOf(user1.address)).to.equal(mintAmount);
  });

  it("does not allow a non-owner to mint tokens", async function () {
    const { ethers, user1, user2, mockUSDT } = await deployMockUSDT();

    const mintAmount = 500n * ONE_USDT;

    await expect(
      mockUSDT.connect(user1).mint(user2.address, mintAmount)
    ).to.be.revert(ethers);
  });

  it("allows users to use the faucet within the faucet limit", async function () {
    const { user1, mockUSDT } = await deployMockUSDT();

    const faucetAmount = 500n * ONE_USDT;

    await mockUSDT.connect(user1).faucet(user1.address, faucetAmount);

    expect(await mockUSDT.balanceOf(user1.address)).to.equal(faucetAmount);
  });

  it("does not allow faucet minting above the faucet limit", async function () {
    const { user1, mockUSDT } = await deployMockUSDT();

    const tooMuch = FAUCET_LIMIT + 1n;

    await expect(
      mockUSDT.connect(user1).faucet(user1.address, tooMuch)
    ).to.be.revertedWith("Faucet limit exceeded");
  });

  it("allows token transfers when not paused", async function () {
    const { owner, user1, mockUSDT } = await deployMockUSDT();

    const transferAmount = 100n * ONE_USDT;

    await mockUSDT.transfer(user1.address, transferAmount);

    expect(await mockUSDT.balanceOf(user1.address)).to.equal(transferAmount);
    expect(await mockUSDT.balanceOf(owner.address)).to.equal(
      INITIAL_SUPPLY - transferAmount
    );
  });

  it("blocks token transfers when paused", async function () {
    const { ethers, user1, mockUSDT } = await deployMockUSDT();

    const transferAmount = 100n * ONE_USDT;

    await mockUSDT.pause();

    await expect(
      mockUSDT.transfer(user1.address, transferAmount)
    ).to.be.revert(ethers);
  });

  it("blocks faucet minting when paused", async function () {
    const { ethers, user1, mockUSDT } = await deployMockUSDT();

    const faucetAmount = 100n * ONE_USDT;

    await mockUSDT.pause();

    await expect(
      mockUSDT.connect(user1).faucet(user1.address, faucetAmount)
    ).to.be.revert(ethers);
  });

  it("blocks owner minting when paused", async function () {
    const { ethers, user1, mockUSDT } = await deployMockUSDT();

    const mintAmount = 100n * ONE_USDT;

    await mockUSDT.pause();

    await expect(mockUSDT.mint(user1.address, mintAmount)).to.be.revert(
      ethers
    );
  });

  it("allows transfers again after unpause", async function () {
    const { user1, mockUSDT } = await deployMockUSDT();

    const transferAmount = 100n * ONE_USDT;

    await mockUSDT.pause();
    await mockUSDT.unpause();

    await mockUSDT.transfer(user1.address, transferAmount);

    expect(await mockUSDT.balanceOf(user1.address)).to.equal(transferAmount);
  });
});