export const mockUSDTAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

export const liquidityPoolAbi = [
  "function depositLiquidity(uint256 amount) external",
  "function withdrawLiquidity(uint256 shares) external",
  "function availableLiquidity() view returns (uint256)",
  "function totalPoolValue() view returns (uint256)",
  "function lpToken() view returns (address)",
] as const;

export const lendingPoolAbi = [
  "function depositCollateral() payable external",
  "function borrow(uint256 amount) external",
  "function repay() external",
  "function withdrawCollateral(uint256 amount) external",

  "function positions(address borrower) view returns (uint256 collateralETH, uint256 borrowedAmount, bool active)",
  "function getMaxBorrowAmount(address borrower) view returns (uint256)",
  "function getMaxWithdrawableCollateral(address borrower) view returns (uint256)",
  "function getRepaymentAmount(address borrower) view returns (uint256)",
  "function isLiquidatable(address borrower) view returns (bool)",

  "function getBorrowersCount() view returns (uint256)",
  "function getBorrowerAt(uint256 index) view returns (address)",
  "function getAllBorrowers() view returns (address[])",
  "function getBorrowerSummary(address borrower) view returns (uint256 collateralETH, uint256 borrowedAmount, uint256 repaymentAmount, bool active, bool liquidatable)",

  "function getMaxLiquidationPrincipal(address borrower) view returns (uint256)",
  "function getMaxLiquidationRepayment(address borrower) view returns (uint256)",

  "function liquidate(address borrower, uint256 repayAmount) external",
] as const;

export const lpTokenAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
] as const;

export const priceOracleAbi = [
  "function getETHPrice() view returns (uint256)",
  "function getUSDCPrice() view returns (uint256)",
  "function getCollateralValue(uint256 ethAmount, uint256 usdcAmount) view returns (uint256)",
] as const;