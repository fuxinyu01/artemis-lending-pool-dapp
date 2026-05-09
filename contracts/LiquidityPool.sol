// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LPToken.sol";

interface ILiquidityPool {
   function depositLiquidity(uint256 amount) external;
   function withdrawLiquidity(uint256 shares) external;
   function transferToBorrower(address borrower, uint256 amount) external;
   function receiveRepayment(address payer, uint256 amount) external;
}

interface ILendingPool {
    function currentLoanValue() public view returns (uint256);
}

contract LiquidityPool is ILiquidityPool {

    // Variables
    IERC20 public usdt;
    LPToken public lpToken;
    bool private allowSetter = true;
    ILendingPool public lendingPool;

    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawal(address indexed user, uint256 amount, uint256 shares);
    // Constructor
    constructor() {
        owner = msg.sender;
        // deploy LPToken, such that LPToken's owner is the Liquidity Pool itself
        lpToken = new LPToken();
    }

    function addressSetter(address usdtAddress, address lpAddress, address lptAddress) external {
        require(msg.sender == owner, "Not owner");
        require(allowSetter == true, "Addresses are already set");
        // set the addresses of the respective contracts
        usdt = IERC20(usdtAddress);
        lendingPool = ILendingPool(lpAddress);
        // !! makes sure the setter can only be run exactly once !!
        allowSetter = false;
    }

    function totalPoolValue() public view returns (uint256) {
        uint256 idle = usdt.balanceOf(address(this));
        uint256 lent = ILendingPool(lendingPool).currentLoanValue();
        return idle + lent;
    }

    function depositLiquidity(uint256 amount) external {
        // input validation: Amount of usdt sent and the sender's balance must be larger than 0
        require(amount > 0, "Cannot deposit 0 tokens.");
        require(usdt.balanceOf(msg.sender > 0), "Insufficient balance (0)");
        // the allowance must be at least the specified amount
        require(usdt.allowance(msg.sender, address(this)) >= amount, "Allowance insufficient") 

        // calculate LP token allocation
        uint256 public lptSupply = lpToken.totalSupply()
        if (lptSupply == 0) {
            uint256 newShares = amount;
        } else {
            uint newShares = (amount / totalPoolValue()) * lptSupply;
        }
        
        // transfer approved amount
        usdt.transferFrom(msg.sender, address(this), amount);
        
        // mint new LPTokens (shares that let a user withdraw their deposit)
        lpToken.mint(msg.sender, newShares);
        
        emit Deposit(msg.sender, amount, newShares);
    }

    function withdrawLiquidity(uint256 shares) external {
        require(shares > 0, "Cannot withdraw 0 tokens.");
        require(lpToken.balanceOf(msg.sender > 0), "You do not own any shares of this Liquidity Pool.");
        
        // calculate current worth of shares
        uint256 loanValue = lendingPool.getLoanValue();
        uint256 withdrawalAmount = (shares / lpToken.totalSupply())*totalPoolValue();

        // update total deposit, burn LPtokens, transfer usdt to sender
        lpToken.burn(msg.sender, shares);
        usdt.transfer(msg.sender, withdrawalAmount);

        emit Withdrawal(msg.sender, withdrawalAmount, shares);
    }

    function receiveRepayment(address payer, uint256 amount) external {
        // Called by lending Pool
        require(msg.sender == lendingPool, "Only the Lending Pool can call this function."); 
        require(usdt.allowance(payer, address(this)) >= amount, "Transfer of desired amount not approved.");
        
        usdt.transferFrom(payer, address(this));
    }

    function transferToBorrower(address borrower, uint256 amount) external {
        // Called by lending Pool
        require(msg.sender == lendingPool, "Only the Lending Pool can call this function."); 
        require(usdt.balanceOf(address(this)) >= amount, "Not enough liquidity!");
        
        usdt.transfer(borrower, amount);
    }

}
