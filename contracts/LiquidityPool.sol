// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LPToken.sol";

interface ILiquidityPool {
    function depositLiquidity(uint256 amount) external;
    function withdrawLiquidity(uint256 shares) external;
    function transferToBorrower(address borrower, uint256 amount) external;
    function receiveRepayment(address payer, uint256 amount) external;
}

interface ILendingPool {
    function currentLoanValue() external view returns (uint256);
}

contract LiquidityPool is ILiquidityPool {
    // Variables
    IERC20 public usdt;
    LPToken public lpToken;
    bool private allowSetter = true;
    ILendingPool public lendingPool;
    address public owner;

    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawal(address indexed user, uint256 amount, uint256 shares);

    // Constructor
    constructor() {
        owner = msg.sender;
        // deploy LPToken, such that LPToken's owner is the Liquidity Pool itself
        lpToken = new LPToken();
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyLendingPool() {
        require(
            msg.sender == address(lendingPool),
            "Only the Lending Pool can call this function."
        );
        _;
    }

    function addressSetter(address usdtAddress, address lpAddress) external onlyOwner {
        require(allowSetter, "Addresses are already set");
        require(usdtAddress != address(0), "Invalid USDT address");
        require(lpAddress != address(0), "Invalid LendingPool address");

        // set the addresses of the respective contracts
        usdt = IERC20(usdtAddress);
        lendingPool = ILendingPool(lpAddress);

        // !! makes sure the setter can only be run exactly once !!
        allowSetter = false;
    }

    function availableLiquidity() public view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function totalPoolValue() public view returns (uint256) {
        uint256 idle = usdt.balanceOf(address(this));
        uint256 lent = lendingPool.currentLoanValue();

        return idle + lent;
    }

    function depositLiquidity(uint256 amount) external {
        require(!allowSetter, "Addresses not set");

        // input validation: Amount of usdt sent and the sender's balance must be larger than 0
        require(amount > 0, "Cannot deposit 0 tokens.");
        require(usdt.balanceOf(msg.sender) >= amount, "Insufficient balance");
        // the allowance must be at least the specified amount
        require(
            usdt.allowance(msg.sender, address(this)) >= amount,
            "Allowance insufficient"
        );

        // calculate LP token allocation
        uint256 lptSupply = lpToken.totalSupply();
        uint256 poolValueBefore = totalPoolValue();

        uint256 newShares;

        if (lptSupply == 0 || poolValueBefore == 0) {
            newShares = amount;
        } else {
            newShares = (amount * lptSupply) / poolValueBefore;
        }

        require(newShares > 0, "Shares rounded to zero");

        // transfer approved amount
        require(
            usdt.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        // mint new LPTokens (shares that let a user withdraw their deposit)
        lpToken.mint(msg.sender, newShares);

        emit Deposit(msg.sender, amount, newShares);
    }

    function withdrawLiquidity(uint256 shares) external {
        require(!allowSetter, "Addresses not set");

        require(shares > 0, "Cannot withdraw 0 tokens.");
        require(
            lpToken.balanceOf(msg.sender) >= shares,
            "You do not own enough shares of this Liquidity Pool."
        );

        uint256 lptSupply = lpToken.totalSupply();
        require(lptSupply > 0, "No LP token supply");

        // calculate current worth of shares
        // The value of active loans is included in totalPoolValue()
        // through lendingPool.currentLoanValue().
        // uint256 loanValue = lendingPool.currentLoanValue();

        uint256 withdrawalAmount = (shares * totalPoolValue()) / lptSupply;

        require(
            usdt.balanceOf(address(this)) >= withdrawalAmount,
            "Insufficient available liquidity"
        );

        // update total deposit, burn LPtokens, transfer usdt to sender
        lpToken.burn(msg.sender, shares);

        require(
            usdt.transfer(msg.sender, withdrawalAmount),
            "Transfer failed"
        );

        emit Withdrawal(msg.sender, withdrawalAmount, shares);
    }

    function receiveRepayment(address payer, uint256 amount) external onlyLendingPool {
        require(!allowSetter, "Addresses not set");

        // Called by Lending Pool
        require(payer != address(0), "Invalid payer");
        require(amount > 0, "Amount must be greater than zero");
        require(
            usdt.allowance(payer, address(this)) >= amount,
            "Transfer of desired amount not approved."
        );

        require(
            usdt.transferFrom(payer, address(this), amount),
            "Transfer failed"
        );
    }

    function transferToBorrower(address borrower, uint256 amount) external onlyLendingPool {
        require(!allowSetter, "Addresses not set");

        // Called by Lending Pool
        require(borrower != address(0), "Invalid borrower");
        require(amount > 0, "Amount must be greater than zero");
        require(usdt.balanceOf(address(this)) >= amount, "Not enough liquidity!");

        require(
            usdt.transfer(borrower, amount),
            "Transfer failed"
        );
    }
}