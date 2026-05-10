import { useState } from "react";
import { ethers } from "ethers";
import "./App.css";

import { addresses } from "./config/addresses";
import {
  mockUSDTAbi,
  liquidityPoolAbi,
  lendingPoolAbi,
  lpTokenAbi,
  mockPriceOracleAbi,
} from "./abi/minimalAbis";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Contracts = {
  mockUSDT: ethers.Contract;
  liquidityPool: ethers.Contract;
  lendingPool: ethers.Contract;
  lpToken: ethers.Contract;
  mockPriceOracle: ethers.Contract;
};

type BorrowerRow = {
  address: string;
  collateralETH: string;
  borrowedAmount: string;
  repaymentAmount: string;
  active: boolean;
  liquidatable: boolean;
};

function formatUSDT(value: bigint): string {
  return ethers.formatUnits(value, 6);
}

function parseUSDT(value: string): bigint {
  return ethers.parseUnits(value || "0", 6);
}

function formatETH(value: bigint): string {
  return ethers.formatEther(value);
}

function parseETH(value: string): bigint {
  return ethers.parseEther(value || "0");
}

function formatUSD8(value: bigint): string {
  return ethers.formatUnits(value, 8);
}

function shortAddress(address: string): string {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function App() {
  const [account, setAccount] = useState<string>("");
  const [contracts, setContracts] = useState<Contracts | null>(null);

  const [status, setStatus] = useState("Ready.");
  const [usdtBalance, setUsdtBalance] = useState("-");
  const [lpTokenBalance, setLpTokenBalance] = useState("-");

  const [collateralETH, setCollateralETH] = useState("-");
  const [borrowedAmount, setBorrowedAmount] = useState("-");
  const [maxBorrowAmount, setMaxBorrowAmount] = useState("-");
  const [repaymentAmount, setRepaymentAmount] = useState("-");
  const [isLiquidatable, setIsLiquidatable] = useState("-");

  const [availableLiquidity, setAvailableLiquidity] = useState("-");
  const [totalPoolValue, setTotalPoolValue] = useState("-");
  const [ethPrice, setEthPrice] = useState("-");

  const [collateralInput, setCollateralInput] = useState("");
  const [borrowInput, setBorrowInput] = useState("");
  const [withdrawCollateralInput, setWithdrawCollateralInput] = useState("");

  const [depositLiquidityInput, setDepositLiquidityInput] = useState("");
  const [withdrawLiquidityInput, setWithdrawLiquidityInput] = useState("");

  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState("");
  const [liquidationRepayInput, setLiquidationRepayInput] = useState("");

  const [newEthPriceInput, setNewEthPriceInput] = useState("");

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("MetaMask is not installed.");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const connectedAccount = await signer.getAddress();

    const mockUSDT = new ethers.Contract(
      addresses.mockUSDT,
      mockUSDTAbi,
      signer
    );

    const liquidityPool = new ethers.Contract(
      addresses.liquidityPool,
      liquidityPoolAbi,
      signer
    );

    const lendingPool = new ethers.Contract(
      addresses.lendingPool,
      lendingPoolAbi,
      signer
    );

    const lpToken = new ethers.Contract(addresses.lpToken, lpTokenAbi, signer);

    const mockPriceOracle = new ethers.Contract(
      addresses.mockPriceOracle,
      mockPriceOracleAbi,
      signer
    );

    const connectedContracts = {
      mockUSDT,
      liquidityPool,
      lendingPool,
      lpToken,
      mockPriceOracle,
    };

    setAccount(connectedAccount);
    setContracts(connectedContracts);

    setStatus("Wallet connected.");
    await refreshState(connectedAccount, connectedContracts);
    await loadBorrowers(connectedContracts);
  }

  async function refreshState(
    currentAccount = account,
    currentContracts = contracts
  ) {
    if (!currentAccount || !currentContracts) return;

    const {
      mockUSDT,
      liquidityPool,
      lendingPool,
      lpToken,
      mockPriceOracle,
    } = currentContracts;

    const usdt = await mockUSDT.balanceOf(currentAccount);
    setUsdtBalance(`${formatUSDT(usdt)} MockUSDT`);

    const lp = await lpToken.balanceOf(currentAccount);
    setLpTokenBalance(`${formatUSDT(lp)} LPT`);

    const position = await lendingPool.positions(currentAccount);
    setCollateralETH(`${formatETH(position.collateralETH)} ETH`);
    setBorrowedAmount(`${formatUSDT(position.borrowedAmount)} MockUSDT`);

    const maxBorrow = await lendingPool.getMaxBorrowAmount(currentAccount);
    setMaxBorrowAmount(`${formatUSDT(maxBorrow)} MockUSDT`);

    const repayment = await lendingPool.getRepaymentAmount(currentAccount);
    setRepaymentAmount(`${formatUSDT(repayment)} MockUSDT`);

    const liquidatable = await lendingPool.isLiquidatable(currentAccount);
    setIsLiquidatable(liquidatable ? "Yes" : "No");

    const available = await liquidityPool.availableLiquidity();
    setAvailableLiquidity(`${formatUSDT(available)} MockUSDT`);

    const totalValue = await liquidityPool.totalPoolValue();
    setTotalPoolValue(`${formatUSDT(totalValue)} MockUSDT`);

    const price = await mockPriceOracle.getETHPrice();
    setEthPrice(`$${formatUSD8(price)}`);
  }

  async function loadBorrowers(currentContracts = contracts) {
    if (!currentContracts) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const borrowerAddresses: string[] =
        await currentContracts.lendingPool.getAllBorrowers();

      const rows: BorrowerRow[] = [];

      for (const borrowerAddress of borrowerAddresses) {
        const summary = await currentContracts.lendingPool.getBorrowerSummary(
          borrowerAddress
        );

        if (summary.borrowedAmount > 0n) {
          rows.push({
            address: borrowerAddress,
            collateralETH: formatETH(summary.collateralETH),
            borrowedAmount: formatUSDT(summary.borrowedAmount),
            repaymentAmount: formatUSDT(summary.repaymentAmount),
            active: summary.active,
            liquidatable: summary.liquidatable,
          });
        }
      }

      setBorrowers(rows);

      if (rows.length === 0) {
        setSelectedBorrower("");
      }

      setStatus("Borrower list refreshed.");
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage || error?.message || "Failed to load borrowers."
      );
    }
  }

  async function refreshAll() {
    await refreshState();
    await loadBorrowers();
  }

  async function runTx(label: string, fn: () => Promise<any>) {
    try {
      if (!contracts) {
        setStatus("Please connect wallet first.");
        return;
      }

      setStatus(`${label}...`);
      const tx = await fn();
      await tx.wait();

      setStatus(`${label} completed.`);
      await refreshAll();
    } catch (error: any) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || "Transaction failed.");
    }
  }

  async function depositCollateral() {
    await runTx("Depositing collateral", async () => {
      return contracts!.lendingPool.depositCollateral({
        value: parseETH(collateralInput),
      });
    });
  }

  async function borrow() {
    await runTx("Borrowing MockUSDT", async () => {
      return contracts!.lendingPool.borrow(parseUSDT(borrowInput));
    });
  }

  async function approveRepayment() {
    await runTx("Approving repayment", async () => {
      const repayment = await contracts!.lendingPool.getRepaymentAmount(account);
      return contracts!.mockUSDT.approve(addresses.liquidityPool, repayment);
    });
  }

  async function repay() {
    await runTx("Repaying loan", async () => {
      return contracts!.lendingPool.repay();
    });
  }

  async function withdrawCollateral() {
    await runTx("Withdrawing collateral", async () => {
      return contracts!.lendingPool.withdrawCollateral(
        parseETH(withdrawCollateralInput)
      );
    });
  }

  async function approveLiquidity() {
    await runTx("Approving liquidity deposit", async () => {
      return contracts!.mockUSDT.approve(
        addresses.liquidityPool,
        parseUSDT(depositLiquidityInput)
      );
    });
  }

  async function depositLiquidity() {
    await runTx("Depositing liquidity", async () => {
      return contracts!.liquidityPool.depositLiquidity(
        parseUSDT(depositLiquidityInput)
      );
    });
  }

  async function withdrawLiquidity() {
    await runTx("Withdrawing liquidity", async () => {
      return contracts!.liquidityPool.withdrawLiquidity(
        parseUSDT(withdrawLiquidityInput)
      );
    });
  }

  async function approveLiquidation() {
    if (!selectedBorrower) {
      setStatus("Please select a borrower first.");
      return;
    }

    await runTx("Approving liquidation repayment", async () => {
      return contracts!.mockUSDT.approve(
        addresses.liquidityPool,
        parseUSDT(liquidationRepayInput)
      );
    });
  }

  async function liquidate() {
    if (!selectedBorrower) {
      setStatus("Please select a borrower first.");
      return;
    }

    await runTx("Liquidating position", async () => {
      return contracts!.lendingPool.liquidate(
        selectedBorrower,
        parseUSDT(liquidationRepayInput)
      );
    });
  }

  async function setETHPrice() {
    await runTx("Updating ETH price", async () => {
      const priceWith8Decimals = ethers.parseUnits(newEthPriceInput || "0", 8);
      return contracts!.mockPriceOracle.setETHPrice(priceWith8Decimals);
    });
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Hardhat Local Demo</p>
          <h1>Artemis Lending Pool</h1>
          <p className="subtitle">
            Collateralised borrowing, liquidity provision, and liquidation.
          </p>
        </div>

        <button className="primary-button" onClick={connectWallet}>
          {account ? "Wallet Connected" : "Connect Wallet"}
        </button>
      </header>

      <section className="wallet-card">
        <div>
          <span className="label">Connected account</span>
          <strong>{account ? shortAddress(account) : "Not connected"}</strong>
          {account && <p className="muted">{account}</p>}
        </div>

        <div>
          <span className="label">MockUSDT balance</span>
          <strong>{usdtBalance}</strong>
        </div>

        <div>
          <span className="label">ETH price</span>
          <strong>{ethPrice}</strong>
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <span className="label">Collateral</span>
          <strong>{collateralETH}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Borrowed</span>
          <strong>{borrowedAmount}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Available liquidity</span>
          <strong>{availableLiquidity}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Total pool value</span>
          <strong>{totalPoolValue}</strong>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-heading">
            <div>
              <h2>Borrower Position</h2>
              <p>Deposit ETH, borrow MockUSDT, repay, and withdraw collateral.</p>
            </div>
            <span
              className={
                isLiquidatable === "Yes" ? "badge danger" : "badge success"
              }
            >
              Liquidatable: {isLiquidatable}
            </span>
          </div>

          <div className="details">
            <p>
              <span>Max borrow</span>
              <strong>{maxBorrowAmount}</strong>
            </p>
            <p>
              <span>Repayment amount</span>
              <strong>{repaymentAmount}</strong>
            </p>
          </div>

          <div className="form-row">
            <input
              value={collateralInput}
              onChange={(e) => setCollateralInput(e.target.value)}
              placeholder="ETH collateral, e.g. 1"
            />
            <button onClick={depositCollateral}>Deposit Collateral</button>
          </div>

          <div className="form-row">
            <input
              value={borrowInput}
              onChange={(e) => setBorrowInput(e.target.value)}
              placeholder="Borrow amount, e.g. 1000"
            />
            <button onClick={borrow}>Borrow</button>
          </div>

          <div className="form-row">
            <button onClick={approveRepayment}>Approve Repayment</button>
            <button onClick={repay}>Repay</button>
          </div>

          <div className="form-row">
            <input
              value={withdrawCollateralInput}
              onChange={(e) => setWithdrawCollateralInput(e.target.value)}
              placeholder="ETH to withdraw, e.g. 1"
            />
            <button onClick={withdrawCollateral}>Withdraw Collateral</button>
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <h2>Liquidity Pool</h2>
              <p>Provide MockUSDT liquidity and receive LP tokens.</p>
            </div>
          </div>

          <div className="details">
            <p>
              <span>Your LP token balance</span>
              <strong>{lpTokenBalance}</strong>
            </p>
            <p>
              <span>Available liquidity</span>
              <strong>{availableLiquidity}</strong>
            </p>
          </div>

          <div className="form-row">
            <input
              value={depositLiquidityInput}
              onChange={(e) => setDepositLiquidityInput(e.target.value)}
              placeholder="USDT amount, e.g. 1000"
            />
            <button onClick={approveLiquidity}>Approve USDT</button>
            <button onClick={depositLiquidity}>Deposit Liquidity</button>
          </div>

          <div className="form-row">
            <input
              value={withdrawLiquidityInput}
              onChange={(e) => setWithdrawLiquidityInput(e.target.value)}
              placeholder="LP shares, e.g. 1000"
            />
            <button onClick={withdrawLiquidity}>Withdraw Liquidity</button>
          </div>
        </div>
      </section>

      <section className="grid liquidation-grid">
        <div className="card wide-card">
          <div className="card-heading">
            <div>
              <h2>Liquidation Market</h2>
              <p>
                Borrowers with active debt are listed here. Select a borrower to
                liquidate when the position becomes under-collateralised.
              </p>
            </div>
            <button onClick={() => loadBorrowers()}>Refresh Borrowers</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Collateral</th>
                  <th>Debt</th>
                  <th>Repayment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No active borrowers found.
                    </td>
                  </tr>
                ) : (
                  borrowers.map((borrower) => (
                    <tr
                      key={borrower.address}
                      className={
                        selectedBorrower === borrower.address
                          ? "selected-row"
                          : ""
                      }
                    >
                      <td>
                        <span className="mono">
                          {shortAddress(borrower.address)}
                        </span>
                      </td>
                      <td>{borrower.collateralETH} ETH</td>
                      <td>{borrower.borrowedAmount} MockUSDT</td>
                      <td>{borrower.repaymentAmount} MockUSDT</td>
                      <td>
                        <span
                          className={
                            borrower.liquidatable
                              ? "badge danger"
                              : "badge success"
                          }
                        >
                          {borrower.liquidatable ? "Liquidatable" : "Healthy"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="secondary-button"
                          onClick={() => setSelectedBorrower(borrower.address)}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="selected-box">
            <span className="label">Selected borrower</span>
            <strong>
              {selectedBorrower ? shortAddress(selectedBorrower) : "None"}
            </strong>
            {selectedBorrower && <p className="muted">{selectedBorrower}</p>}
          </div>

          <div className="form-row">
            <input
              value={liquidationRepayInput}
              onChange={(e) => setLiquidationRepayInput(e.target.value)}
              placeholder="Repay amount, e.g. 500"
            />
            <button onClick={approveLiquidation}>Approve Liquidation</button>
            <button onClick={liquidate}>Liquidate</button>
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div>
              <h2>Oracle Controls</h2>
              <p>Change ETH price locally to demonstrate liquidation.</p>
            </div>
          </div>

          <div className="oracle-price">
            <span className="label">Current ETH price</span>
            <strong>{ethPrice}</strong>
          </div>

          <div className="form-row">
            <input
              value={newEthPriceInput}
              onChange={(e) => setNewEthPriceInput(e.target.value)}
              placeholder="New ETH price, e.g. 1000"
            />
            <button onClick={setETHPrice}>Set ETH Price</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Status</h2>
            <p>Latest transaction or system message.</p>
          </div>
          <button onClick={refreshAll}>Refresh State</button>
        </div>
        <pre>{status}</pre>
      </section>
    </main>
  );
}

export default App;