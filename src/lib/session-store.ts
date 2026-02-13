import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisDataset } from "@/types/domain";

interface SessionPayload {
  dataset: AnalysisDataset;
  createdAt: number;
}

interface PersistedSessionPayload {
  dataset: AnalysisDataset;
  createdAt: number;
}

const STORE = new Map<string, SessionPayload>();
const TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_DIR = path.join("/tmp", "desker-sales-sessions");

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function sessionFilePath(sessionId: string): string {
  return path.join(SESSION_DIR, `${sessionId}.json`);
}

function serializeDataset(dataset: AnalysisDataset): AnalysisDataset {
  return {
    ...dataset,
    orders: dataset.orders.map((order) => ({
      ...order,
      orderDate: order.orderDate ? order.orderDate.toISOString() : null
    })) as AnalysisDataset["orders"]
  };
}

function deserializeDataset(dataset: AnalysisDataset): AnalysisDataset {
  return {
    ...dataset,
    orders: dataset.orders.map((order) => ({
      ...order,
      orderDate: order.orderDate ? new Date(order.orderDate) : null
    }))
  };
}

function persistSession(sessionId: string, payload: SessionPayload) {
  ensureSessionDir();
  const filePayload: PersistedSessionPayload = {
    createdAt: payload.createdAt,
    dataset: serializeDataset(payload.dataset)
  };
  fs.writeFileSync(sessionFilePath(sessionId), JSON.stringify(filePayload), "utf-8");
}

function deletePersistedSession(sessionId: string) {
  const filePath = sessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function readPersistedSession(sessionId: string): SessionPayload | null {
  const filePath = sessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PersistedSessionPayload;
    return {
      createdAt: parsed.createdAt,
      dataset: deserializeDataset(parsed.dataset)
    };
  } catch {
    return null;
  }
}

function sweepExpired() {
  const now = Date.now();

  for (const [id, payload] of STORE.entries()) {
    if (now - payload.createdAt > TTL_MS) {
      STORE.delete(id);
      deletePersistedSession(id);
    }
  }

  if (!fs.existsSync(SESSION_DIR)) {
    return;
  }

  const files = fs.readdirSync(SESSION_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const sessionId = file.replace(/\.json$/, "");
    const payload = readPersistedSession(sessionId);
    if (!payload || now - payload.createdAt > TTL_MS) {
      deletePersistedSession(sessionId);
    }
  }
}

export function createSession(dataset: AnalysisDataset): string {
  sweepExpired();
  const sessionId = crypto.randomUUID();
  const payload = { dataset, createdAt: Date.now() };
  STORE.set(sessionId, payload);
  persistSession(sessionId, payload);
  return sessionId;
}

export function getSession(sessionId: string): AnalysisDataset | null {
  sweepExpired();

  const inMemory = STORE.get(sessionId);
  if (inMemory) {
    return inMemory.dataset;
  }

  const persisted = readPersistedSession(sessionId);
  if (!persisted) {
    return null;
  }

  if (Date.now() - persisted.createdAt > TTL_MS) {
    deletePersistedSession(sessionId);
    return null;
  }

  STORE.set(sessionId, persisted);
  return persisted.dataset;
}
