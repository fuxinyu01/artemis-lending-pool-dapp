import { PinataSDK } from "pinata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY!,
});

const CID_INDEX_PATH = path.resolve("cids.json");

export type EventRecord = {
  event: "CollateralDeposited" | "Borrowed" | "Repaid" | "CollateralWithdrawn" | "Liquidated";
  user: string;
  data: Record<string, unknown>;
  txHash: string;
  blockNumber: number;
  timestamp: number;
};

type CidEntry = {
  event: string;
  user: string;
  cid: string;
  txHash: string;
  timestamp: number;
};

function loadIndex(): CidEntry[] {
  if (!fs.existsSync(CID_INDEX_PATH)) return [];
  return JSON.parse(fs.readFileSync(CID_INDEX_PATH, "utf-8"));
}

function saveIndex(index: CidEntry[]): void {
  fs.writeFileSync(CID_INDEX_PATH, JSON.stringify(index, null, 2));
}

export async function uploadToIPFS(record: EventRecord): Promise<string> {
  const result = await pinata.upload.public.json(record as unknown as Record<string, unknown>);
  const cid = result.cid;

  const index = loadIndex();
  index.push({
    event: record.event,
    user: record.user,
    cid,
    txHash: record.txHash,
    timestamp: record.timestamp,
  });
  saveIndex(index);

  console.log(`Uploaded ${record.event} for ${record.user} → CID: ${cid}`);
  return cid;
}

export async function fetchFromIPFS(cid: string): Promise<unknown> {
  const data = await pinata.gateways.public.get(cid);
  return data;
}

export function getCidIndex(): CidEntry[] {
  return loadIndex();
}