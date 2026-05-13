import express from "express";
import cors from "cors";
import { PinataSDK } from "pinata";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const app = express();
app.use(cors());
app.use(express.json());

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud",
});

type EventName =
  | "CollateralDeposited"
  | "Borrowed"
  | "Repaid"
  | "CollateralWithdrawn"
  | "Liquidated";

type HistoryEntry = {
  cid: string;
  event: EventName;
  timestamp: number;
  txHash: string;
  user: string;
};

// Shared in-memory registry — all connected users see the same history
const history: HistoryEntry[] = [];

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/upload", async (req, res) => {
  try {
    const record = req.body;
    const result = await pinata.upload.public.json(
      record as unknown as Record<string, unknown>
    );
    const entry: HistoryEntry = {
      cid: result.cid,
      event: record.event,
      timestamp: record.timestamp,
      txHash: record.txHash,
      user: record.user,
    };
    history.unshift(entry);
    res.json({ cid: result.cid });
  } catch (err: any) {
    console.error("Pinata upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/history", (_req, res) => {
  res.json(history);
});

const PORT = process.env.IPFS_BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`IPFS backend running on http://localhost:${PORT}`);
  console.log(`Pinata JWT: ${process.env.PINATA_JWT ? "configured" : "MISSING"}`);
});
