import { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

import { CONTRACT_ADDRESSES as addresses } from "./config/addresses";
import {
  mockUSDTAbi,
  liquidityPoolAbi,
  lendingPoolAbi,
  lpTokenAbi,
  priceOracleAbi,
} from "./abi/minimalAbis";
import {
  isIPFSConfigured,
  uploadToIPFS,
  saveToHistory,
  loadHistory,
  GATEWAY_URL,
  type TransactionRecord,
  type HistoryEntry,
  type EventName,
} from "./services/ipfsService";

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
  priceOracle: ethers.Contract;
};

type BorrowerRow = {
  address: string;
  collateralETH: string;
  borrowedAmount: string;
  repaymentAmount: string;
  maxLiquidationRepay: string;
  borrowedAmountRaw: bigint;
  maxLiquidationRepayRaw: bigint;
  active: boolean;
  liquidatable: boolean;
};

const SEPOLIA_CHAIN_ID = "0xaa36a7";

function toBigInt(value: any): bigint {
  return BigInt(value.toString());
}

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

function eventBadgeClass(event: string): string {
  if (event === "Liquidated") return "danger";
  if (event === "Borrowed") return "info";
  if (event === "LiquidityWithdrawn") return "info";
  return "success";
}

function App() {
  const [account, setAccount] = useState<string>("");
  const [contracts, setContracts] = useState<Contracts | null>(null);

  const [status, setStatus] = useState("Ready.");
  const [usdtBalance, setUsdtBalance] = useState("-");
  const [lpTokenBalance, setLpTokenBalance] = useState("-");
  const [lpTokenTotalSupply, setLpTokenTotalSupply] = useState("-");

  const [collateralETH, setCollateralETH] = useState("-");
  const [borrowedAmount, setBorrowedAmount] = useState("-");
  const [remainingBorrowCapacity, setRemainingBorrowCapacity] = useState("-");
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

  const [ipfsHistory, setIpfsHistory] = useState<HistoryEntry[]>([]);
  const [ipfsUploading, setIpfsUploading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<EventName | "All">("All");

  function resetDisplayedState() {
    setUsdtBalance("-");
    setLpTokenBalance("-");
    setLpTokenTotalSupply("-");
    setCollateralETH("-");
    setBorrowedAmount("-");
    setRemainingBorrowCapacity("-");
    setRepaymentAmount("-");
    setIsLiquidatable("-");
    setAvailableLiquidity("-");
    setTotalPoolValue("-");
    setEthPrice("-");
    setBorrowers([]);
    setSelectedBorrower("");
  }

  async function ensureCorrectNetwork() {
    if (!window.ethereum) return false;

    const chainId = await window.ethereum.request({
      method: "eth_chainId",
    });

    if (addresses.network === "sepolia" && chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });

        return true;
      } catch (error: any) {
        const message = "Please switch MetaMask to Sepolia testnet.";
        setStatus(message);
        window.alert(message);
        console.error(error);
        return false;
      }
    }

    return true;
  }

  function buildContracts(signer: ethers.Signer): Contracts {
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

    const priceOracle = new ethers.Contract(
      addresses.priceOracle,
      priceOracleAbi,
      signer
    );

    return {
      mockUSDT,
      liquidityPool,
      lendingPool,
      lpToken,
      priceOracle,
    };
  }

  async function initialiseWallet(requestAccounts = true) {
    if (!window.ethereum) {
      setStatus("MetaMask is not installed.");
      return null;
    }

    const correctNetwork = await ensureCorrectNetwork();

    if (!correctNetwork) {
      return null;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    if (requestAccounts) {
      await provider.send("eth_requestAccounts", []);
    }

    const signer = await provider.getSigner();
    const connectedAccount = await signer.getAddress();
    const connectedContracts = buildContracts(signer);

    setAccount(connectedAccount);
    setContracts(connectedContracts);
    setIpfsHistory(loadHistory());

    await refreshState(connectedAccount, connectedContracts);
    await loadBorrowers(connectedContracts);

    return {
      account: connectedAccount,
      contracts: connectedContracts,
    };
  }

  async function connectWallet() {
    try {
      const result = await initialiseWallet(true);

      if (result) {
        setStatus("Wallet connected.");
      }
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage || error?.message || "Failed to connect wallet."
      );
    }
  }

  useEffect(() => {
    setIpfsHistory(loadHistory());

    if (!window.ethereum) return;

    async function handleAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) {
        setAccount("");
        setContracts(null);
        resetDisplayedState();
        setStatus("Wallet disconnected.");
        return;
      }

      try {
        await initialiseWallet(false);
        setStatus("Wallet account changed. State refreshed.");
      } catch (error: any) {
        console.error(error);
        setStatus(
          error?.shortMessage ||
            error?.message ||
            "Failed to refresh after account change."
        );
      }
    }

    function handleChainChanged() {
      resetDisplayedState();
      setAccount("");
      setContracts(null);
      setStatus(
        "Network changed. Please reconnect wallet and make sure the contract addresses match the selected network."
      );
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function refreshState(
    currentAccount = account,
    currentContracts = contracts
  ) {
    if (!currentAccount || !currentContracts) return;

    const { mockUSDT, liquidityPool, lendingPool, lpToken, priceOracle } =
      currentContracts;

    const usdt = toBigInt(await mockUSDT.balanceOf(currentAccount));
    setUsdtBalance(`${formatUSDT(usdt)} MockUSDT`);

    const lp = toBigInt(await lpToken.balanceOf(currentAccount));
    setLpTokenBalance(`${formatUSDT(lp)} LPT`);

    const lpSupply = toBigInt(await lpToken.totalSupply());
    setLpTokenTotalSupply(`${formatUSDT(lpSupply)} LPT`);

    const position = await lendingPool.positions(currentAccount);
    const collateralRaw = toBigInt(position.collateralETH);
    const borrowedRaw = toBigInt(position.borrowedAmount);

    setCollateralETH(`${formatETH(collateralRaw)} ETH`);
    setBorrowedAmount(`${formatUSDT(borrowedRaw)} MockUSDT`);

    const maxBorrowRaw = toBigInt(
      await lendingPool.getMaxBorrowAmount(currentAccount)
    );

    const remaining =
      maxBorrowRaw > borrowedRaw ? maxBorrowRaw - borrowedRaw : 0n;

    setRemainingBorrowCapacity(`${formatUSDT(remaining)} MockUSDT`);

    const repayment = toBigInt(
      await lendingPool.getRepaymentAmount(currentAccount)
    );
    setRepaymentAmount(`${formatUSDT(repayment)} MockUSDT`);

    const liquidatable = await lendingPool.isLiquidatable(currentAccount);
    setIsLiquidatable(liquidatable ? "Yes" : "No");

    const available = toBigInt(await liquidityPool.availableLiquidity());
    setAvailableLiquidity(`${formatUSDT(available)} MockUSDT`);

    const totalValue = toBigInt(await liquidityPool.totalPoolValue());
    setTotalPoolValue(`${formatUSDT(totalValue)} MockUSDT`);

    const price = toBigInt(await priceOracle.getETHPrice());
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

        const collateralRaw = toBigInt(summary.collateralETH);
        const borrowedRaw = toBigInt(summary.borrowedAmount);
        const repaymentRaw = toBigInt(summary.repaymentAmount);

        if (borrowedRaw > 0n && summary.liquidatable) {
          const maxLiquidationRepayRaw = toBigInt(
            await currentContracts.lendingPool.getMaxLiquidationRepayment(
              borrowerAddress
            )
          );

          rows.push({
            address: borrowerAddress,
            collateralETH: formatETH(collateralRaw),
            borrowedAmount: formatUSDT(borrowedRaw),
            repaymentAmount: formatUSDT(repaymentRaw),
            maxLiquidationRepay: formatUSDT(maxLiquidationRepayRaw),
            borrowedAmountRaw: borrowedRaw,
            maxLiquidationRepayRaw,
            active: summary.active,
            liquidatable: summary.liquidatable,
          });
        }
      }

      setBorrowers(rows);

      const selectedStillVisible = rows.some(
        (borrower) => borrower.address === selectedBorrower
      );

      if (!selectedStillVisible) {
        setSelectedBorrower("");
      }

      setStatus("Liquidation market refreshed.");
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

  async function runTx(
    label: string,
    fn: () => Promise<any>,
    ipfsEvent?: { event: EventName; data: Record<string, unknown> }
  ) {
    try {
      if (!contracts) {
        setStatus("Please connect wallet first.");
        return;
      }

      setStatus(`${label}...`);
      const tx = await fn();
      const receipt = await tx.wait();

      setStatus(`${label} completed.`);
      await refreshAll();

      if (ipfsEvent && isIPFSConfigured()) {
        setIpfsUploading(true);

        try {
          const record: TransactionRecord = {
            event: ipfsEvent.event,
            user: account,
            data: ipfsEvent.data,
            txHash: receipt.hash,
            timestamp: Date.now(),
          };

          const cid = await uploadToIPFS(record);

          saveToHistory({
            cid,
            event: record.event,
            timestamp: record.timestamp,
            txHash: record.txHash,
            user: record.user,
          });

          setIpfsHistory(loadHistory());
          setStatus(
            `${label} completed. Saved to IPFS: ${cid.slice(0, 16)}...`
          );
        } catch (err: any) {
          console.error("IPFS upload failed:", err);
          setStatus(`${label} completed, but IPFS upload failed.`);
        } finally {
          setIpfsUploading(false);
        }
      }
    } catch (error: any) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || "Transaction failed.");
    }
  }

  async function depositCollateral() {
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const inputAmount = parseETH(collateralInput);

      if (inputAmount <= 0n) {
        const message = "Please enter a collateral amount greater than zero.";
        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Depositing collateral",
        async () => {
          return contracts!.lendingPool.depositCollateral({
            value: inputAmount,
          });
        },
        {
          event: "CollateralDeposited",
          data: { amount: `${collateralInput} ETH` },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          "Collateral deposit failed."
      );
    }
  }

  async function borrow() {
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const inputAmount = parseUSDT(borrowInput);

      if (inputAmount <= 0n) {
        const message = "Please enter a borrow amount greater than zero.";
        setStatus(message);
        window.alert(message);
        return;
      }

      const position = await contracts.lendingPool.positions(account);
      const borrowedRaw = toBigInt(position.borrowedAmount);
      const maxBorrowRaw = toBigInt(
        await contracts.lendingPool.getMaxBorrowAmount(account)
      );

      const remaining =
        maxBorrowRaw > borrowedRaw ? maxBorrowRaw - borrowedRaw : 0n;

      if (remaining === 0n) {
        const message =
          "You have reached the borrowing limit. You cannot borrow more unless you deposit more collateral or repay your loan.";
        setStatus(message);
        window.alert(message);
        return;
      }

      if (inputAmount > remaining) {
        const message = `Borrow amount exceeds your remaining borrow capacity. Maximum additional borrow amount is ${formatUSDT(
          remaining
        )} MockUSDT.`;
        setStatus(message);
        window.alert(message);
        return;
      }

      const available = toBigInt(
        await contracts.liquidityPool.availableLiquidity()
      );

      if (inputAmount > available) {
        const message = `Borrow amount exceeds available pool liquidity. Current available liquidity is ${formatUSDT(
          available
        )} MockUSDT. Please deposit more liquidity first.`;
        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Borrowing MockUSDT",
        async () => {
          return contracts!.lendingPool.borrow(inputAmount);
        },
        {
          event: "Borrowed",
          data: { amount: `${borrowInput} MockUSDT` },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || "Borrow failed.");
    }
  }

  async function approveRepayment() {
    await runTx("Approving full repayment", async () => {
      const repayment = await contracts!.lendingPool.getRepaymentAmount(account);
      return contracts!.mockUSDT.approve(addresses.liquidityPool, repayment);
    });
  }

  async function repay() {
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const repayment = toBigInt(
        await contracts.lendingPool.getRepaymentAmount(account)
      );

      if (repayment === 0n) {
        const message = "You do not have an active loan to repay.";
        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Repaying full loan",
        async () => {
          return contracts!.lendingPool.repay();
        },
        {
          event: "Repaid",
          data: { note: "Full repayment including fixed 5% interest" },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(error?.shortMessage || error?.message || "Repayment failed.");
    }
  }

  async function withdrawCollateral() {
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const inputAmount = parseETH(withdrawCollateralInput);

      if (inputAmount <= 0n) {
        const message =
          "Please enter a collateral withdrawal amount greater than zero.";
        setStatus(message);
        window.alert(message);
        return;
      }

      const maxWithdrawable = toBigInt(
        await contracts.lendingPool.getMaxWithdrawableCollateral(account)
      );

      if (inputAmount > maxWithdrawable) {
        const message = `Withdrawal amount exceeds your maximum withdrawable collateral. Maximum withdrawable amount is ${formatETH(
          maxWithdrawable
        )} ETH.`;

        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Withdrawing collateral",
        async () => {
          return contracts!.lendingPool.withdrawCollateral(inputAmount);
        },
        {
          event: "CollateralWithdrawn",
          data: { amount: `${withdrawCollateralInput} ETH` },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          "Collateral withdrawal failed."
      );
    }
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
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const inputAmount = parseUSDT(depositLiquidityInput);

      if (inputAmount <= 0n) {
        const message =
          "Please enter a liquidity deposit amount greater than zero.";
        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Depositing liquidity",
        async () => {
          return contracts!.liquidityPool.depositLiquidity(inputAmount);
        },
        {
          event: "LiquidityDeposited",
          data: { amount: `${depositLiquidityInput} MockUSDT` },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          "Liquidity deposit failed."
      );
    }
  }

  async function withdrawLiquidity() {
    if (!contracts || !account) {
      setStatus("Please connect wallet first.");
      return;
    }

    try {
      const inputShares = parseUSDT(withdrawLiquidityInput);

      if (inputShares <= 0n) {
        const message = "Please enter an LP token amount greater than zero.";
        setStatus(message);
        window.alert(message);
        return;
      }

      const lpBalance = toBigInt(await contracts.lpToken.balanceOf(account));
      const lpTotalSupply = toBigInt(await contracts.lpToken.totalSupply());
      const available = toBigInt(
        await contracts.liquidityPool.availableLiquidity()
      );
      const totalValue = toBigInt(
        await contracts.liquidityPool.totalPoolValue()
      );

      if (inputShares > lpBalance) {
        const message = `Withdrawal amount exceeds your LP token balance. Maximum LP token amount you can burn is ${formatUSDT(
          lpBalance
        )} LPT.`;

        setStatus(message);
        window.alert(message);
        return;
      }

      if (lpTotalSupply === 0n || totalValue === 0n) {
        const message = "There is no pool value available for withdrawal.";
        setStatus(message);
        window.alert(message);
        return;
      }

      const expectedWithdrawAmount =
        (inputShares * totalValue) / lpTotalSupply;

      if (expectedWithdrawAmount > available) {
        const maxWithdrawableShares =
          (available * lpTotalSupply) / totalValue;

        const message = `You cannot withdraw this many LP tokens because part of the pool value is currently locked in active loans. Maximum withdrawable LP token amount based on available liquidity is ${formatUSDT(
          maxWithdrawableShares
        )} LPT. Current available liquidity is ${formatUSDT(
          available
        )} MockUSDT.`;

        setStatus(message);
        window.alert(message);
        return;
      }

      await runTx(
        "Withdrawing liquidity by LP tokens",
        async () => {
          return contracts!.liquidityPool.withdrawLiquidity(inputShares);
        },
        {
          event: "LiquidityWithdrawn",
          data: {
            lpTokensBurned: `${withdrawLiquidityInput} LPT`,
            expectedWithdrawAmount: `${formatUSDT(
              expectedWithdrawAmount
            )} MockUSDT`,
          },
        }
      );
    } catch (error: any) {
      console.error(error);
      setStatus(
        error?.shortMessage ||
          error?.message ||
          "Liquidity withdrawal failed."
      );
    }
  }

  function getSelectedBorrowerRow(): BorrowerRow | undefined {
    return borrowers.find((borrower) => borrower.address === selectedBorrower);
  }

  function getLiquidationRepayAmount(): bigint | null {
    if (!selectedBorrower) {
      const message = "Please select a borrower first.";
      setStatus(message);
      window.alert(message);
      return null;
    }

    const selected = getSelectedBorrowerRow();

    if (!selected) {
      const message =
        "Selected borrower is no longer liquidatable. Please refresh the liquidation market.";
      setStatus(message);
      window.alert(message);
      return null;
    }

    const inputAmount = parseUSDT(liquidationRepayInput);

    if (inputAmount <= 0n) {
      const message =
        "Please enter a liquidation repay amount greater than zero.";
      setStatus(message);
      window.alert(message);
      return null;
    }

    if (inputAmount > selected.maxLiquidationRepayRaw) {
      const message = `Liquidation repay amount exceeds the maximum allowed amount. Maximum liquidation repay is ${selected.maxLiquidationRepay} MockUSDT. Please enter an amount less than or equal to this value.`;

      setStatus(message);
      window.alert(message);
      return null;
    }

    return inputAmount;
  }

  async function approveLiquidation() {
    const repayAmount = getLiquidationRepayAmount();

    if (repayAmount === null) return;

    await runTx("Approving liquidation repayment", async () => {
      return contracts!.mockUSDT.approve(addresses.liquidityPool, repayAmount);
    });
  }

  async function liquidate() {
    const repayAmount = getLiquidationRepayAmount();

    if (repayAmount === null) return;

    await runTx(
      "Liquidating position",
      async () => {
        return contracts!.lendingPool.liquidate(selectedBorrower, repayAmount);
      },
      {
        event: "Liquidated",
        data: {
          borrower: selectedBorrower,
          repayAmount: `${liquidationRepayInput} MockUSDT`,
        },
      }
    );
  }

  const selectedBorrowerRow = getSelectedBorrowerRow();

  const filteredHistory =
    historyFilter === "All"
      ? ipfsHistory
      : ipfsHistory.filter((entry) => entry.event === historyFilter);

  return (
    <main className="app">
      <header className="hero">
        <div>
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
              <span>Remaining borrow capacity</span>
              <strong>{remainingBorrowCapacity}</strong>
            </p>
            <p>
              <span>Full repayment amount</span>
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
            <button onClick={approveRepayment}>Approve Full Repayment</button>
            <button onClick={repay}>Repay Full Loan</button>
          </div>

          <div className="form-row">
            <input
              value={withdrawCollateralInput}
              onChange={(e) => setWithdrawCollateralInput(e.target.value)}
              placeholder="ETH to withdraw, e.g. 0.25"
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
              <span>Total LP token supply</span>
              <strong>{lpTokenTotalSupply}</strong>
            </p>
            <p>
              <span>Available liquidity</span>
              <strong>{availableLiquidity}</strong>
            </p>
          </div>

          <p className="muted">
            LP tokens represent your share of the pool. To withdraw all
            available value, enter your LP token balance, not the MockUSDT
            amount. If loans are active, part of the pool value may be locked as
            outstanding debt and cannot be withdrawn until it is repaid or
            liquidated.
          </p>

          <div className="form-row">
            <input
              value={depositLiquidityInput}
              onChange={(e) => setDepositLiquidityInput(e.target.value)}
              placeholder="USDT amount to deposit, e.g. 1000"
            />
            <button onClick={approveLiquidity}>Approve USDT</button>
            <button onClick={depositLiquidity}>Deposit Liquidity</button>
          </div>

          <div className="form-row">
            <input
              value={withdrawLiquidityInput}
              onChange={(e) => setWithdrawLiquidityInput(e.target.value)}
              placeholder="LP token amount to burn, e.g. 1952.380952"
            />
            <button onClick={withdrawLiquidity}>Withdraw by LP Tokens</button>
          </div>
        </div>
      </section>

      <section className="grid liquidation-grid">
        <div className="card wide-card">
          <div className="card-heading">
            <div>
              <h2>Liquidation Market</h2>
              <p>
                Only borrowers whose positions are currently liquidatable are
                listed here.
              </p>
            </div>
            <button onClick={() => loadBorrowers()}>
              Refresh Liquidation Market
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Collateral</th>
                  <th>Debt</th>
                  <th>Max Repay</th>
                  <th>Full Repayment</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      No liquidatable borrowers found.
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
                      <td>{borrower.maxLiquidationRepay} MockUSDT</td>
                      <td>{borrower.repaymentAmount} MockUSDT</td>
                      <td>
                        <span className="badge danger">Liquidatable</span>
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

            {selectedBorrowerRow && (
              <p className="muted">
                Max liquidation repay:{" "}
                {selectedBorrowerRow.maxLiquidationRepay} MockUSDT
              </p>
            )}
          </div>

          <div className="form-row">
            <input
              value={liquidationRepayInput}
              onChange={(e) => setLiquidationRepayInput(e.target.value)}
              placeholder="Repay amount, e.g. 525"
            />
            <button onClick={approveLiquidation}>Approve Liquidation</button>
            <button onClick={liquidate}>Liquidate</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Transaction History</h2>
            <p>
              {isIPFSConfigured()
                ? "Each transaction is permanently stored on IPFS via Pinata. Click a CID to view the raw JSON record."
                : "Add VITE_PINATA_JWT to frontend/.env to enable IPFS transaction history."}
            </p>
          </div>

          <div className="heading-actions">
            {ipfsUploading && (
              <span className="badge info">Uploading to IPFS...</span>
            )}

            {ipfsHistory.length > 0 && (
              <button
                className="secondary-button"
                onClick={() => {
                  localStorage.removeItem("artemis_ipfs_history");
                  setIpfsHistory([]);
                }}
              >
                Clear History
              </button>
            )}
          </div>
        </div>

        {!isIPFSConfigured() ? (
          <div className="empty-notice">
            IPFS not configured — add <code>VITE_PINATA_JWT</code> to{" "}
            <code>frontend/.env</code> to enable.
          </div>
        ) : (
          <>
            <div className="filter-bar">
              {(
                [
                  "All",
                  "CollateralDeposited",
                  "Borrowed",
                  "Repaid",
                  "CollateralWithdrawn",
                  "Liquidated",
                  "LiquidityDeposited",
                  "LiquidityWithdrawn",
                ] as const
              ).map((f) => (
                <button
                  key={f}
                  className={`filter-btn${
                    historyFilter === f ? " active" : ""
                  }`}
                  onClick={() => setHistoryFilter(f)}
                >
                  {f === "CollateralDeposited"
                    ? "Collateral In"
                    : f === "CollateralWithdrawn"
                    ? "Collateral Out"
                    : f === "LiquidityDeposited"
                    ? "Liquidity In"
                    : f === "LiquidityWithdrawn"
                    ? "Liquidity Out"
                    : f}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="empty-notice">
                No transactions recorded for this filter.
              </div>
            ) : (
              <div className="table-wrapper history-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Account</th>
                      <th>Time</th>
                      <th>Tx Hash</th>
                      <th>IPFS CID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((entry) => (
                      <tr key={entry.cid}>
                        <td>
                          <span
                            className={`badge ${eventBadgeClass(entry.event)}`}
                          >
                            {entry.event}
                          </span>
                        </td>
                        <td>
                          <span className="mono">
                            {shortAddress(entry.user)}
                          </span>
                        </td>
                        <td>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </td>
                        <td>
                          <span className="mono">
                            {entry.txHash.slice(0, 14)}...
                          </span>
                        </td>
                        <td>
                          <a
                            href={`${GATEWAY_URL}/ipfs/${entry.cid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ipfs-link"
                          >
                            {entry.cid.slice(0, 16)}...
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
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