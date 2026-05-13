const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:3001";

const rawGateway =
  (import.meta.env.VITE_PINATA_GATEWAY as string | undefined) ??
  "https://gateway.pinata.cloud";

export const GATEWAY_URL = rawGateway
  .replace(/\/ipfs\/?$/, "")
  .replace(/\/$/, "");

export type EventName =
  | "CollateralDeposited"
  | "Borrowed"
  | "Repaid"
  | "CollateralWithdrawn"
  | "Liquidated"
  | "LiquidityDeposited"
  | "LiquidityWithdrawn";

export type TransactionRecord = {
  event: EventName;
  user: string;
  data: Record<string, unknown>;
  txHash: string;
  timestamp: number;
};

export type HistoryEntry = {
  cid: string;
  event: EventName;
  timestamp: number;
  txHash: string;
  user: string;
};

export async function checkBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadToIPFS(record: TransactionRecord): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`Backend upload failed: ${res.statusText}`);
  const json = await res.json();
  return json.cid as string;
}

export async function fetchFromIPFS(cid: string): Promise<TransactionRecord> {
  const url = `${GATEWAY_URL}/ipfs/${cid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gateway fetch failed: ${res.statusText}`);
  return res.json() as Promise<TransactionRecord>;
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch(`${BACKEND_URL}/history`);
  if (!res.ok) throw new Error("Failed to fetch history from backend");
  return res.json() as Promise<HistoryEntry[]>;
}
