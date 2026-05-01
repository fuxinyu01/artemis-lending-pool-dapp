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
        ethFeed = AggregatorV3Interface(ethFeedAddress);
        usdcFeed = AggregatorV3Interface(usdcFeedAddress);
    }

    /// @inheritdoc IPriceOracle
    function getETHPrice() public view override returns (uint256 price) {
        (, int256 answer, , , ) = ethFeed.latestRoundData();
        require(answer > 0, "PriceOracle: invalid ETH price");
        price = uint256(answer);
    }

    /// @inheritdoc IPriceOracle
    function getUSDCPrice() public view override returns (uint256 price) {
        (, int256 answer, , , ) = usdcFeed.latestRoundData();
        require(answer > 0, "PriceOracle: invalid USDC price");
        price = uint256(answer);
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
}
