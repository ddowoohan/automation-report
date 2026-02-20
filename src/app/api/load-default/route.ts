import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { validateCsvRows } from "@/features/preprocessing/csv-schema";
import { buildAnalysisDataset, prepareCustomers, prepareOrders, prepareProducts } from "@/features/preprocessing/merge";
import { parseCsvBuffer, type ParseCsvBufferOptions } from "@/lib/csv/parse";
import { createSession } from "@/lib/session-store";

export const runtime = "nodejs";

type CsvSource = "orders" | "customers" | "products";

interface DefaultDataCache {
  signature: string;
  dataset: ReturnType<typeof buildAnalysisDataset>;
  agencies: string[];
  counts: {
    orders: number;
    customers: number;
    products: number;
  };
  defaultFiles: {
    orders: string;
    customers: string;
    products: string;
  };
}

const DEFAULT_PARSE_HINTS: Record<CsvSource, ParseCsvBufferOptions> = {
  orders: {
    encodings: ["utf-8", "utf-16le"],
    delimiters: [",", "\t"]
  },
  customers: {
    encodings: ["utf-16le", "cp949", "utf-8"],
    delimiters: ["\t", ","],
    includeMatrix: false
  },
  products: {
    encodings: ["utf-16le", "cp949", "utf-8"],
    delimiters: ["\t", ","],
    includeMatrix: false
  }
};

let defaultDataCache: DefaultDataCache | null = null;

function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_\-]/g, "");
}

function findCsvFile(files: string[], keywords: string[]): string | null {
  for (const file of files) {
    const normalized = normalizeName(file);
    if (keywords.some((keyword) => normalized.includes(normalizeName(keyword)))) {
      return file;
    }
  }
  return null;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return Uint8Array.from(buf).buffer;
}

function parseValidatedRows(buffer: Buffer, source: CsvSource) {
  const parseHint = DEFAULT_PARSE_HINTS[source];
  const arrayBuffer = toArrayBuffer(buffer);

  try {
    const hintedRows = parseCsvBuffer(arrayBuffer, { ...parseHint, exhaustive: false });
    return validateCsvRows(hintedRows, source);
  } catch {
    const fallbackRows = parseCsvBuffer(arrayBuffer);
    return validateCsvRows(fallbackRows, source);
  }
}

function buildSignature(fileStats: Array<{ name: string; size: number; mtimeMs: number }>): string {
  return fileStats.map((file) => `${file.name}:${file.size}:${Math.floor(file.mtimeMs)}`).join("|");
}

export async function POST() {
  try {
    const docsDir = path.join(process.cwd(), "docs");
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    const csvFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
      .map((entry) => entry.name);

    const ordersFile = findCsvFile(csvFiles, ["매출_수주", "매출수주", "orders", "order"]);
    const customersFile = findCsvFile(csvFiles, ["고객 마스터", "고객마스터", "customers", "customer"]);
    const productsFile = findCsvFile(csvFiles, ["제품 판매", "제품판매", "products", "product"]);

    if (!ordersFile || !customersFile || !productsFile) {
      return NextResponse.json(
        {
          error: "docs 폴더에서 기본 CSV 3개를 찾지 못했습니다.",
          files: csvFiles,
          expected: {
            orders: "매출_수주 데이터.csv",
            customers: "고객 마스터 데이터.csv",
            products: "제품 판매 데이터.csv"
          }
        },
        { status: 400 }
      );
    }

    const ordersPath = path.join(docsDir, ordersFile);
    const customersPath = path.join(docsDir, customersFile);
    const productsPath = path.join(docsDir, productsFile);

    const [ordersStat, customersStat, productsStat] = await Promise.all([
      fs.stat(ordersPath),
      fs.stat(customersPath),
      fs.stat(productsPath)
    ]);

    const signature = buildSignature([
      { name: ordersFile, size: ordersStat.size, mtimeMs: ordersStat.mtimeMs },
      { name: customersFile, size: customersStat.size, mtimeMs: customersStat.mtimeMs },
      { name: productsFile, size: productsStat.size, mtimeMs: productsStat.mtimeMs }
    ]);

    if (defaultDataCache && defaultDataCache.signature === signature) {
      const sessionId = createSession(defaultDataCache.dataset);
      return NextResponse.json({
        sessionId,
        agencies: defaultDataCache.agencies,
        counts: defaultDataCache.counts,
        defaultFiles: defaultDataCache.defaultFiles
      });
    }

    const [ordersBuffer, customersBuffer, productsBuffer] = await Promise.all([
      fs.readFile(ordersPath),
      fs.readFile(customersPath),
      fs.readFile(productsPath)
    ]);

    const orderRows = parseValidatedRows(ordersBuffer, "orders");
    const customerRows = parseValidatedRows(customersBuffer, "customers");
    const productRows = parseValidatedRows(productsBuffer, "products");

    const orders = prepareOrders(orderRows);
    const customers = prepareCustomers(customerRows, orders);
    const products = prepareProducts(productRows);

    const dataset = buildAnalysisDataset(orders, customers, products);
    const sessionId = createSession(dataset);

    const agencies = Array.from(new Set(dataset.orders.map((order) => order.agency))).sort((a, b) => a.localeCompare(b, "ko-KR"));
    const counts = {
      orders: dataset.orders.length,
      customers: dataset.customers.length,
      products: dataset.products.length
    };
    const defaultFiles = {
      orders: ordersFile,
      customers: customersFile,
      products: productsFile
    };

    defaultDataCache = {
      signature,
      dataset,
      agencies,
      counts,
      defaultFiles
    };

    return NextResponse.json({
      sessionId,
      agencies,
      counts,
      defaultFiles
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
