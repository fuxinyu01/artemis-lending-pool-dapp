// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
    address public pool;

    constructor() ERC20("LP Token", "LPT") {
        pool = msg.sender; // The deploying pool contract is the owner
    }

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool can mint/burn");
        _;
    }

    function mint(address to, uint256 amount) external onlyPool {
        _mint(to, amount); // OZ handles totalSupply and balanceOf internally
    }

    function burn(address from, uint256 amount) external onlyPool {
        _burn(from, amount); // Same here
    }
}
