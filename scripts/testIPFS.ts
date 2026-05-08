import { uploadToIPFS, fetchFromIPFS, getCidIndex } from "./ipfsStorage.js";

async function main() {
  console.log("Testing IPFS upload...");

  const cid = await uploadToIPFS({
    event: "CollateralDeposited",
    user: "0x1234567890abcdef1234567890abcdef12345678",
    data: { amountETH: "1.0" },
    txHash: "0xabc123",
    blockNumber: 1,
    timestamp: Date.now(),
  });

  console.log("Fetching back from IPFS...");
  const fetched = await fetchFromIPFS(cid);
  console.log("Retrieved data:", JSON.stringify(fetched, null, 2));

  console.log("\nLocal CID index:");
  console.log(getCidIndex());
}

main().catch(console.error);
