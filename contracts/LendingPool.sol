// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IPriceOracle.sol";

/// @dev Minimal interface for the LiquidityPool contract.
///      LendingPool only needs to call these two functions.
interface ILiquidityPool {
    function transferToBorrower(address borrower, uint256 amount) external;

    function receiveRepayment(address payer, uint256 amount) external;
}

/// @title LendingPool
/// @notice Main lending contract. Borrowers deposit ETH as collateral and borrow MockUSDT.
contract LendingPool is ReentrancyGuard {
    /// @notice ERC20 token borrowed by users, e.g. MockUSDT.
    IERC20 public immutable lendingToken;

    /// @notice LiquidityPool that stores and transfers MockUSDT liquidity.
    ILiquidityPool public immutable liquidityPool;

    /// @notice Oracle used to calculate ETH collateral value.
    IPriceOracle public immutable priceOracle;

    /// @notice Borrowing collateral ratio = 150%.
    ///         Example: user needs $150 collateral to borrow $100.
    uint256 public constant COLLATERAL_RATIO = 150;

    /// @notice Liquidation threshold = 120%.
    ///         If collateral value falls below 120% of debt value, the position is liquidatable.
    uint256 public constant LIQUIDATION_THRESHOLD = 120;

    /// @notice Simple fixed interest rate for this prototype.
    ///         5 means 5%.
    uint256 public constant INTEREST_RATE = 5;

    /// @notice Liquidator receives 5% extra collateral value as incentive.
    uint256 public constant LIQUIDATION_BONUS = 5;

    /// @notice Liquidator can repay at most 50% of the borrower's principal debt in one liquidation.
    uint256 public constant CLOSE_FACTOR = 50;

    /// @notice If remaining principal debt is small, the liquidator can fully close the position.
    /// @dev MockUSDT uses 6 decimals, so this equals 20 MockUSDT.
    uint256 public constant MIN_DEBT_FOR_CLOSE_FACTOR = 20 * 10 ** 6;

    /// @notice Borrower position.
    struct Position {
        uint256 collateralETH; // ETH collateral in wei
        uint256 borrowedAmount; // MockUSDT principal borrowed amount, using 6 decimals
        bool active;
    }

    /// @notice Maps borrower address to borrowing position.
    mapping(address => Position) public positions;

    /// @notice Active borrowers with outstanding principal debt.
    /// @dev This is still a prototype-level on-chain list, but it no longer stores historical borrowers.
    address[] private activeBorrowers;

    /// @notice Tracks whether an address is currently in the active borrower list.
    mapping(address => bool) public borrowerTracked;

    /// @notice Stores each active borrower's index in activeBorrowers for efficient removal.
    mapping(address => uint256) private borrowerIndex;

    event CollateralDeposited(address indexed borrower, uint256 amount);

    event Borrowed(address indexed borrower, uint256 amount);

    event Repaid(
        address indexed borrower,
        uint256 repaymentAmount,
        uint256 interest
    );

    event CollateralWithdrawn(address indexed borrower, uint256 amount);

    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 repaidAmount,
        uint256 collateralSeized
    );

    constructor(
        address _lendingToken,
        address _liquidityPool,
        address _priceOracle
    ) {
        require(_lendingToken != address(0), "Invalid lending token");
        require(_liquidityPool != address(0), "Invalid liquidity pool");
        require(_priceOracle != address(0), "Invalid price oracle");

        lendingToken = IERC20(_lendingToken);
        liquidityPool = ILiquidityPool(_liquidityPool);
        priceOracle = IPriceOracle(_priceOracle);
    }

    /// @notice Deposit ETH as collateral.
    function depositCollateral() external payable {
        require(msg.value > 0, "Collateral must be greater than zero");

        Position storage position = positions[msg.sender];

        position.collateralETH += msg.value;
        position.active = true;

        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Returns the borrower's collateral value in USD with 8 decimals.
    /// @dev Current prototype only uses ETH collateral, so USDC amount is set to 0.
    function getCollateralValueUSD(address borrower)
        public
        view
        returns (uint256)
    {
        Position memory position = positions[borrower];

        return priceOracle.getCollateralValue(position.collateralETH, 0);
    }

    /// @notice Converts MockUSDT amount with 6 decimals to USD value with 8 decimals.
    /// @dev MockUSDT is treated as a USD stablecoin: 1 MockUSDT = 1 USD.
    function borrowedAmountToUSDValue(uint256 amount)
        public
        pure
        returns (uint256)
    {
        return amount * 1e2;
    }

    /// @notice Converts USD value with 8 decimals to MockUSDT amount with 6 decimals.
    function usdValueToBorrowAmount(uint256 usdValue)
        public
        pure
        returns (uint256)
    {
        return usdValue / 1e2;
    }

    /// @notice Returns the fixed interest for a principal amount.
    function getInterestAmount(uint256 principal) public pure returns (uint256) {
        return (principal * INTEREST_RATE) / 100;
    }

    /// @notice Returns principal plus fixed interest for a principal amount.
    function getAmountWithInterest(uint256 principal)
        public
        pure
        returns (uint256)
    {
        return principal + getInterestAmount(principal);
    }

    /// @notice Converts a repayment amount including interest back to its principal portion.
    /// @dev Example: repayment 1050 with 5% interest corresponds to principal 1000.
    function getPrincipalFromRepayment(uint256 repaymentAmount)
        public
        pure
        returns (uint256)
    {
        return (repaymentAmount * 100) / (100 + INTEREST_RATE);
    }

    /// @notice Returns the maximum amount of MockUSDT the borrower can borrow.
    /// @return Maximum borrow amount in MockUSDT smallest units, using 6 decimals.
    function getMaxBorrowAmount(address borrower) public view returns (uint256) {
        uint256 collateralValueUSD = getCollateralValueUSD(borrower);

        uint256 maxBorrowValueUSD =
            (collateralValueUSD * 100) / COLLATERAL_RATIO;

        return usdValueToBorrowAmount(maxBorrowValueUSD);
    }

    /// @dev Adds a borrower to the active borrower list if not already included.
    function _addActiveBorrower(address borrower) internal {
        if (!borrowerTracked[borrower]) {
            borrowerIndex[borrower] = activeBorrowers.length;
            activeBorrowers.push(borrower);
            borrowerTracked[borrower] = true;
        }
    }

    /// @dev Removes a borrower from the active borrower list using swap-and-pop.
    function _removeActiveBorrower(address borrower) internal {
        if (!borrowerTracked[borrower]) {
            return;
        }

        uint256 index = borrowerIndex[borrower];
        uint256 lastIndex = activeBorrowers.length - 1;

        if (index != lastIndex) {
            address lastBorrower = activeBorrowers[lastIndex];
            activeBorrowers[index] = lastBorrower;
            borrowerIndex[lastBorrower] = index;
        }

        activeBorrowers.pop();

        delete borrowerIndex[borrower];
        borrowerTracked[borrower] = false;
    }

    /// @notice Borrow MockUSDT based on deposited ETH collateral.
    /// @param amount Borrow amount in MockUSDT smallest unit, using 6 decimals.
    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "Borrow amount must be greater than zero");

        Position storage position = positions[msg.sender];

        require(position.collateralETH > 0, "No collateral deposited");

        uint256 maxBorrowAmount = getMaxBorrowAmount(msg.sender);

        require(
            position.borrowedAmount + amount <= maxBorrowAmount,
            "Insufficient collateral"
        );

        position.borrowedAmount += amount;
        position.active = true;

        _addActiveBorrower(msg.sender);

        liquidityPool.transferToBorrower(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
    }

    /// @notice Returns repayment amount including simple fixed interest.
    /// @dev Interest is simplified for this prototype and does not depend on time.
    function getRepaymentAmount(address borrower) public view returns (uint256) {
        uint256 principal = positions[borrower].borrowedAmount;

        return getAmountWithInterest(principal);
    }

    /// @notice Returns the total current value of all active loans, including fixed interest.
    /// @dev This loops through active borrowers only. It is acceptable for this prototype
    ///      but not suitable for a large production protocol.
    function currentLoanValue() external view returns (uint256) {
        uint256 total = 0;

        for (uint256 i = 0; i < activeBorrowers.length; i++) {
            total += getRepaymentAmount(activeBorrowers[i]);
        }

        return total;
    }

    /// @notice Returns the number of active borrowers with outstanding debt.
    function getBorrowersCount() external view returns (uint256) {
        return activeBorrowers.length;
    }

    /// @notice Returns an active borrower address by index.
    function getBorrowerAt(uint256 index) external view returns (address) {
        require(index < activeBorrowers.length, "Borrower index out of range");

        return activeBorrowers[index];
    }

    /// @notice Returns all active borrower addresses.
    /// @dev This is acceptable for a small prototype/demo, but not suitable for a large production protocol.
    function getAllBorrowers() external view returns (address[] memory) {
        return activeBorrowers;
    }

    /// @notice Returns borrower information for frontend display.
    function getBorrowerSummary(address borrower)
        external
        view
        returns (
            uint256 collateralETH,
            uint256 borrowedAmount,
            uint256 repaymentAmount,
            bool active,
            bool liquidatable
        )
    {
        Position memory position = positions[borrower];

        return (
            position.collateralETH,
            position.borrowedAmount,
            getRepaymentAmount(borrower),
            position.active,
            isLiquidatable(borrower)
        );
    }

    /// @notice Repay the full borrowed amount plus fixed interest.
    /// @dev Borrower must approve the LiquidityPool before calling this function.
    function repay() external nonReentrant {
        Position storage position = positions[msg.sender];

        require(position.borrowedAmount > 0, "No active loan");

        uint256 principal = position.borrowedAmount;
        uint256 interest = getInterestAmount(principal);
        uint256 repaymentAmount = principal + interest;

        liquidityPool.receiveRepayment(msg.sender, repaymentAmount);

        position.borrowedAmount = 0;

        _removeActiveBorrower(msg.sender);

        if (position.collateralETH == 0) {
            position.active = false;
        }

        emit Repaid(msg.sender, repaymentAmount, interest);
    }

    /// @notice Withdraw ETH collateral.
    /// @dev If the borrower still has debt, the remaining collateral must satisfy the collateral ratio.
    function withdrawCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than zero");

        Position storage position = positions[msg.sender];

        require(position.collateralETH >= amount, "Insufficient collateral");

        uint256 remainingCollateralETH = position.collateralETH - amount;

        if (position.borrowedAmount > 0) {
            uint256 remainingCollateralValueUSD =
                priceOracle.getCollateralValue(remainingCollateralETH, 0);

            uint256 borrowedValueUSD =
                borrowedAmountToUSDValue(position.borrowedAmount);

            uint256 requiredCollateralValueUSD =
                (borrowedValueUSD * COLLATERAL_RATIO) / 100;

            require(
                remainingCollateralValueUSD >= requiredCollateralValueUSD,
                "Withdrawal would make position under-collateralised"
            );
        }

        position.collateralETH = remainingCollateralETH;

        if (position.collateralETH == 0 && position.borrowedAmount == 0) {
            position.active = false;
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Returns the maximum ETH collateral that a borrower can withdraw while keeping the position healthy.
    function getMaxWithdrawableCollateral(address borrower)
        public
        view
        returns (uint256)
    {
        Position memory position = positions[borrower];

        if (position.collateralETH == 0) {
            return 0;
        }

        if (position.borrowedAmount == 0) {
            return position.collateralETH;
        }

        uint256 borrowedValueUSD =
            borrowedAmountToUSDValue(position.borrowedAmount);

        uint256 requiredCollateralValueUSD =
            (borrowedValueUSD * COLLATERAL_RATIO) / 100;

        uint256 currentCollateralValueUSD = getCollateralValueUSD(borrower);

        if (currentCollateralValueUSD <= requiredCollateralValueUSD) {
            return 0;
        }

        uint256 excessCollateralValueUSD =
            currentCollateralValueUSD - requiredCollateralValueUSD;

        uint256 ethPrice = priceOracle.getETHPrice();

        return (excessCollateralValueUSD * 1e18) / ethPrice;
    }

    /// @notice Checks whether a borrower's position is eligible for liquidation.
    /// @dev Liquidation threshold is based on total debt value including fixed interest.
    function isLiquidatable(address borrower) public view returns (bool) {
        Position memory position = positions[borrower];

        if (position.borrowedAmount == 0) {
            return false;
        }

        uint256 collateralValueUSD = getCollateralValueUSD(borrower);

        uint256 debtValueUSD =
            borrowedAmountToUSDValue(getRepaymentAmount(borrower));

        uint256 requiredCollateralValueUSD =
            (debtValueUSD * LIQUIDATION_THRESHOLD) / 100;

        return collateralValueUSD < requiredCollateralValueUSD;
    }

    /// @notice Returns the maximum principal amount that can be repaid in one liquidation.
    /// @dev If the remaining principal debt is small, full liquidation is allowed.
    function getMaxLiquidationPrincipal(address borrower)
        public
        view
        returns (uint256)
    {
        uint256 principalDebt = positions[borrower].borrowedAmount;

        if (principalDebt == 0) {
            return 0;
        }

        if (principalDebt <= MIN_DEBT_FOR_CLOSE_FACTOR) {
            return principalDebt;
        }

        return (principalDebt * CLOSE_FACTOR) / 100;
    }

    /// @notice Returns the maximum liquidation repayment amount, including the corresponding fixed interest.
    function getMaxLiquidationRepayment(address borrower)
        public
        view
        returns (uint256)
    {
        uint256 maxPrincipalRepay = getMaxLiquidationPrincipal(borrower);

        return getAmountWithInterest(maxPrincipalRepay);
    }

    /// @notice Liquidate an under-collateralised position.
    /// @dev The liquidator repays part of the borrower's total debt, including the corresponding 5% interest,
    ///      and receives ETH collateral with a separate liquidation bonus.
    ///      borrowedAmount remains the principal debt and is reduced by the corresponding principal portion.
    ///      If the remaining principal debt is small, the position can be fully closed.
    ///      Liquidator must approve the LiquidityPool before calling this function.
    /// @param borrower The borrower whose position is being liquidated.
    /// @param repayAmount The amount of MockUSDT the liquidator pays, including the corresponding fixed interest, using 6 decimals.
    function liquidate(address borrower, uint256 repayAmount)
        external
        nonReentrant
    {
        require(isLiquidatable(borrower), "Position is not liquidatable");
        require(repayAmount > 0, "Repay amount must be greater than zero");

        Position storage position = positions[borrower];

        uint256 maxPrincipalRepay = getMaxLiquidationPrincipal(borrower);
        uint256 maxRepaymentAmount = getAmountWithInterest(maxPrincipalRepay);

        if (repayAmount > maxRepaymentAmount) {
            repayAmount = maxRepaymentAmount;
        }

        uint256 principalRepaid;

        if (repayAmount == maxRepaymentAmount) {
            principalRepaid = maxPrincipalRepay;
        } else {
            principalRepaid = getPrincipalFromRepayment(repayAmount);
        }

        require(principalRepaid > 0, "Repay amount too small");
        require(
            principalRepaid <= position.borrowedAmount,
            "Repay amount exceeds debt"
        );

        uint256 repayValueUSD = borrowedAmountToUSDValue(repayAmount);

        uint256 collateralValueWithBonusUSD =
            (repayValueUSD * (100 + LIQUIDATION_BONUS)) / 100;

        uint256 ethPrice = priceOracle.getETHPrice();

        uint256 collateralToSeize =
            (collateralValueWithBonusUSD * 1e18) / ethPrice;

        require(
            collateralToSeize <= position.collateralETH,
            "Not enough collateral"
        );

        liquidityPool.receiveRepayment(msg.sender, repayAmount);

        position.borrowedAmount -= principalRepaid;
        position.collateralETH -= collateralToSeize;

        if (position.borrowedAmount == 0) {
            _removeActiveBorrower(borrower);
        }

        if (position.borrowedAmount == 0 && position.collateralETH == 0) {
            position.active = false;
        }

        (bool success, ) = payable(msg.sender).call{value: collateralToSeize}("");
        require(success, "ETH transfer failed");

        emit Liquidated(borrower, msg.sender, repayAmount, collateralToSeize);
    }

    /// @notice Allows the contract to receive ETH.
    receive() external payable {}
}