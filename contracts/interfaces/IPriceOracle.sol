// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceOracle
/// @notice Price feed interface consumed by LendingPool for health-factor and liquidation logic.
///         All prices are denominated in USD with 8 decimal places (Chainlink convention).
///         Example: 200000000000 represents $2,000.00000000.
interface IPriceOracle {
    /// @notice Returns the current ETH price in USD.
    /// @return price USD per ETH, scaled by 1e8 (8 decimal places).
    function getETHPrice() external view returns (uint256 price);

    /// @notice Returns the current USDC price in USD.
    /// @return price USD per USDC, scaled by 1e8 (8 decimal places).
    ///         Under normal conditions this is ~1e8 ($1.00000000).
    function getUSDCPrice() external view returns (uint256 price);

    /// @notice Returns the combined USD value of an ETH + USDC collateral position.
    /// @param ethAmount  ETH quantity expressed in wei (1 ETH = 1e18 wei).
    /// @param usdcAmount USDC quantity expressed in USDC's smallest unit (1 USDC = 1e6 atoms).
    /// @return value     Total USD collateral value, scaled by 1e8 (8 decimal places).
    ///                   Computed as:
    ///                     ethValue  = (ethAmount  * getETHPrice())  / 1e18
    ///                     usdcValue = (usdcAmount * getUSDCPrice()) / 1e6
    ///                     value     = ethValue + usdcValue
    function getCollateralValue(uint256 ethAmount, uint256 usdcAmount) external view returns (uint256 value);
}
