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
    ///         If collateral value falls below 120% of borrowed value, the position is liquidatable.
    uint256 public constant LIQUIDATION_THRESHOLD = 120;

    /// @notice Simple fixed interest rate for this prototype.
    ///         5 means 5%.
    uint256 public constant INTEREST_RATE = 5;

    /// @notice Liquidator receives 5% extra collateral value as incentive.
    uint256 public constant LIQUIDATION_BONUS = 5;

    /// @notice Liquidator can repay at most 50% of the borrower's debt in one liquidation.
    uint256 public constant CLOSE_FACTOR = 50;

    /// @notice Borrower position.
    struct Position {
        uint256 collateralETH; // ETH collateral in wei
        uint256 borrowedAmount; // MockUSDT borrowed amount, using 6 decimals
        bool active;
    }

    /// @notice Maps borrower address to borrowing position.
    mapping(address => Position) public positions;

    /// @notice List of borrowers tracked for prototype-level total loan value calculation.
    /// @dev This is acceptable for a small prototype but not suitable for a large production protocol.
    address[] public borrowers;

    /// @notice Tracks whether an address has already been added to borrowers.
    mapping(address => bool) public borrowerTracked;

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
    function getCollateralValueUSD(address borrower) public view returns (uint256) {
        Position memory position = positions[borrower];

        return priceOracle.getCollateralValue(position.collateralETH, 0);
    }

    /// @notice Converts MockUSDT amount with 6 decimals to USD value with 8 decimals.
    /// @dev MockUSDT is treated as a USD stablecoin: 1 MockUSDT = 1 USD.
    function borrowedAmountToUSDValue(uint256 amount) public pure returns (uint256) {
        return amount * 1e2;
    }

    /// @notice Converts USD value with 8 decimals to MockUSDT amount with 6 decimals.
    function usdValueToBorrowAmount(uint256 usdValue) public pure returns (uint256) {
        return usdValue / 1e2;
    }

    /// @notice Returns the maximum amount of MockUSDT the borrower can borrow.
    /// @return Maximum borrow amount in MockUSDT smallest units, using 6 decimals.
    function getMaxBorrowAmount(address borrower) public view returns (uint256) {
        uint256 collateralValueUSD = getCollateralValueUSD(borrower);

        uint256 maxBorrowValueUSD =
            (collateralValueUSD * 100) / COLLATERAL_RATIO;

        return usdValueToBorrowAmount(maxBorrowValueUSD);
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

        if (!borrowerTracked[msg.sender]) {
            borrowers.push(msg.sender);
            borrowerTracked[msg.sender] = true;
        }

        liquidityPool.transferToBorrower(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
    }

    /// @notice Returns repayment amount including simple fixed interest.
    /// @dev Interest is simplified for this prototype and does not depend on time.
    function getRepaymentAmount(address borrower) public view returns (uint256) {
        uint256 principal = positions[borrower].borrowedAmount;
        uint256 interest = (principal * INTEREST_RATE) / 100;

        return principal + interest;
    }

    /// @notice Returns the total current value of all active loans, including fixed interest.
    /// @dev This loops through all tracked borrowers, which is acceptable for this prototype
    ///      but not suitable for a large production protocol.
    function currentLoanValue() external view returns (uint256) {
        uint256 total = 0;

        for (uint256 i = 0; i < borrowers.length; i++) {
            address borrower = borrowers[i];

            if (positions[borrower].borrowedAmount > 0) {
                total += getRepaymentAmount(borrower);
            }
        }

        return total;
    }

    /// @notice Returns the number of tracked borrowers.
    function getBorrowersCount() external view returns (uint256) {
        return borrowers.length;
    }

    /// @notice Returns a tracked borrower address by index.
    function getBorrowerAt(uint256 index) external view returns (address) {
        require(index < borrowers.length, "Borrower index out of range");

        return borrowers[index];
    }

    /// @notice Returns all tracked borrower addresses.
    /// @dev This is acceptable for a small prototype/demo, but not suitable for a large production protocol.
    function getAllBorrowers() external view returns (address[] memory) {
        return borrowers;
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
        uint256 interest = (principal * INTEREST_RATE) / 100;
        uint256 repaymentAmount = principal + interest;

        liquidityPool.receiveRepayment(msg.sender, repaymentAmount);

        position.borrowedAmount = 0;

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
    function getMaxWithdrawableCollateral(address borrower) public view returns (uint256) {
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
    function isLiquidatable(address borrower) public view returns (bool) {
        Position memory position = positions[borrower];

        if (position.borrowedAmount == 0) {
            return false;
        }

        uint256 collateralValueUSD = getCollateralValueUSD(borrower);

        uint256 borrowedValueUSD =
            borrowedAmountToUSDValue(position.borrowedAmount);

        uint256 requiredCollateralValueUSD =
            (borrowedValueUSD * LIQUIDATION_THRESHOLD) / 100;

        return collateralValueUSD < requiredCollateralValueUSD;
    }

    /// @notice Liquidate an under-collateralised position.
    /// @dev The liquidator repays part of the borrower's borrowed principal and receives ETH collateral with a bonus.
    ///      For this prototype, liquidation is based on principal only, while normal repayment includes fixed interest.
    ///      Liquidator must approve the LiquidityPool before calling this function.
    /// @param borrower The borrower whose position is being liquidated.
    /// @param repayAmount The amount of MockUSDT debt the liquidator wants to repay, using 6 decimals.
    function liquidate(address borrower, uint256 repayAmount) external nonReentrant {
        require(isLiquidatable(borrower), "Position is not liquidatable");
        require(repayAmount > 0, "Repay amount must be greater than zero");

        Position storage position = positions[borrower];

        uint256 maxRepayAmount =
            (position.borrowedAmount * CLOSE_FACTOR) / 100;

        if (repayAmount > maxRepayAmount) {
            repayAmount = maxRepayAmount;
        }

        require(repayAmount <= position.borrowedAmount, "Repay amount exceeds debt");

        uint256 repayValueUSD =
            borrowedAmountToUSDValue(repayAmount);

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

        position.borrowedAmount -= repayAmount;
        position.collateralETH -= collateralToSeize;

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