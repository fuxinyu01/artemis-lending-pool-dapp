// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDT is ERC20, ERC20Permit, Ownable {

    uint8 private constant DECIMALS = 6;

    constructor()
        ERC20("Mock USDT", "mUSDT")
        ERC20Permit("Mock USDT")
        Ownable(msg.sender)
    {
        _mint(msg.sender, 1_000_000 * 10**DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function mint(address to, uint256 amount)
        external
        onlyOwner
    {
        _mint(to, amount);
    }
}
