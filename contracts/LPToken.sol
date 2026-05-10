// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
    address public pool;

    constructor() ERC20("LP Token", "LPT") {
        pool = msg.sender;
    }

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool can mint/burn");
        _;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount);
    }
}