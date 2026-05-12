const JWT = import.meta.env.VITE_PINATA_JWT as string | undefined;

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

const STORAGE_KEY = "artemis_ipfs_history";

export function isIPFSConfigured(): boolean {
  return Boolean(JWT);
}

export async function uploadToIPFS(record: TransactionRecord): Promise<string> {
  if (!JWT) {
    throw new Error("VITE_PINATA_JWT not configured");
  }

  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });

  const file = new File([blob], `artemis-${record.event}.json`, {
    type: "application/json",
  });

  const form = new FormData();
  form.append("file", file);
  form.append("network", "public");
  form.append("name", `artemis-${record.event}-${record.timestamp}`);

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JWT}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed: ${text}`);
  }

  const json = await res.json();
  const cid = json?.data?.cid;

  if (!cid) {
    throw new Error("Pinata upload succeeded but CID was not returned");
  }

  return cid as string;
}

export async function fetchFromIPFS(cid: string): Promise<TransactionRecord> {
  const url = `${GATEWAY_URL}/ipfs/${cid}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Gateway fetch failed: ${res.statusText}`);
  }

  return res.json() as Promise<TransactionRecord>;
}

export function saveToHistory(entry: HistoryEntry): void {
  const existing = loadHistory();
  existing.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}