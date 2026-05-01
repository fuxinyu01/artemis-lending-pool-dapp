// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice IPriceOracle implementation with manually settable prices for use in Hardhat tests.
///         Has no external dependencies — all prices are stored in contract storage.
contract MockPriceOracle is IPriceOracle {
    uint256 private _ethPrice;
    uint256 private _usdcPrice;

    /// @param initialEthPrice  Initial ETH/USD price, scaled by 1e8.
    /// @param initialUsdcPrice Initial USDC/USD price, scaled by 1e8.
    constructor(uint256 initialEthPrice, uint256 initialUsdcPrice) {
        _ethPrice = initialEthPrice;
        _usdcPrice = initialUsdcPrice;
    }

    function setETHPrice(uint256 price) external {
        _ethPrice = price;
    }

    function setUSDCPrice(uint256 price) external {
        _usdcPrice = price;
    }

    /// @inheritdoc IPriceOracle
    function getETHPrice() public view override returns (uint256) {
        return _ethPrice;
    }

    /// @inheritdoc IPriceOracle
    function getUSDCPrice() public view override returns (uint256) {
        return _usdcPrice;
    }

    /// @inheritdoc IPriceOracle
    function getCollateralValue(
        uint256 ethAmount,
        uint256 usdcAmount
    ) external view override returns (uint256) {
        uint256 ethValue = (ethAmount * getETHPrice()) / 1e18;
        uint256 usdcValue = (usdcAmount * getUSDCPrice()) / 1e6;
        return ethValue + usdcValue;
    }
}
