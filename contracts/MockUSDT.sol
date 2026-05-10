// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MockUSDT is ERC20, ERC20Permit, Ownable, Pausable {
    uint8 private constant DECIMALS = 6;

    uint256 public constant FAUCET_LIMIT = 1000 * 10 ** DECIMALS;

    constructor()
        ERC20("Mock USDT", "mUSDT")
        ERC20Permit("Mock USDT")
        Ownable(msg.sender)
    {
        _mint(msg.sender, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function faucet(address to, uint256 amount) external whenNotPaused {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than zero");
        require(amount <= FAUCET_LIMIT, "Faucet limit exceeded");

        _mint(to, amount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than zero");

        _mint(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value)
        internal
        override
        whenNotPaused
    {
        super._update(from, to, value);
    }
}