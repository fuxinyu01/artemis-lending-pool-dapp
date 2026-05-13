// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IPriceOracle.sol";

/// @dev Minimal Chainlink aggregator interface — avoids adding @chainlink/contracts as a dependency.
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}

/// @title PriceOracle
/// @notice Reads ETH/USD and USDC/USD prices from Chainlink Data Feeds on Sepolia.
///         Sepolia feed addresses (Chainlink):
///           ETH/USD  — 0x694AA1769357215DE4FAC081bf1f309aDC325306
///           USDC/USD — 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E
contract PriceOracle is IPriceOracle {
    AggregatorV3Interface private immutable ethFeed;
    AggregatorV3Interface private immutable usdcFeed;

    constructor(address ethFeedAddress, address usdcFeedAddress) {
        require(ethFeedAddress != address(0), "PriceOracle: invalid ETH feed");
        require(usdcFeedAddress != address(0), "PriceOracle: invalid USDC feed");

        ethFeed = AggregatorV3Interface(ethFeedAddress);
        usdcFeed = AggregatorV3Interface(usdcFeedAddress);
    }

    /// @inheritdoc IPriceOracle
    function getETHPrice() public view override returns (uint256 price) {
        price = _getPrice(ethFeed);
    }

    /// @inheritdoc IPriceOracle
    function getUSDCPrice() public view override returns (uint256 price) {
        price = _getPrice(usdcFeed);
    }

    /// @inheritdoc IPriceOracle
    function getCollateralValue(
        uint256 ethAmount,
        uint256 usdcAmount
    ) external view override returns (uint256 value) {
        uint256 ethValue = (ethAmount * getETHPrice()) / 1e18;
        uint256 usdcValue = (usdcAmount * getUSDCPrice()) / 1e6;
        value = ethValue + usdcValue;
    }

    /// @dev Reads a Chainlink feed and normalises the answer to 8 decimals.
    function _getPrice(
        AggregatorV3Interface feed
    ) internal view returns (uint256 price) {
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();

        require(answer > 0, "PriceOracle: invalid price");
        require(updatedAt > 0, "PriceOracle: stale price");

        uint8 feedDecimals = feed.decimals();

        if (feedDecimals == 8) {
            price = uint256(answer);
        } else if (feedDecimals > 8) {
            price = uint256(answer) / (10 ** (feedDecimals - 8));
        } else {
            price = uint256(answer) * (10 ** (8 - feedDecimals));
        }
    }
}