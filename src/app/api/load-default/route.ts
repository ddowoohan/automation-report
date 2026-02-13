import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { validateCsvRows } from "@/features/preprocessing/csv-schema";
import { buildAnalysisDataset, prepareCustomers, prepareOrders, prepareProducts } from "@/features/preprocessing/merge";
import { parseCsvBuffer } from "@/lib/csv/parse";
import { createSession } from "@/lib/session-store";

export const runtime = "nodejs";

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

    const [ordersBuffer, customersBuffer, productsBuffer] = await Promise.all([
      fs.readFile(path.join(docsDir, ordersFile)),
      fs.readFile(path.join(docsDir, customersFile)),
      fs.readFile(path.join(docsDir, productsFile))
    ]);

    const [orderRowsRaw, customerRowsRaw, productRowsRaw] = [
      parseCsvBuffer(toArrayBuffer(ordersBuffer)),
      parseCsvBuffer(toArrayBuffer(customersBuffer)),
      parseCsvBuffer(toArrayBuffer(productsBuffer))
    ];

    const orderRows = validateCsvRows(orderRowsRaw, "orders");
    const customerRows = validateCsvRows(customerRowsRaw, "customers");
    const productRows = validateCsvRows(productRowsRaw, "products");

    const orders = prepareOrders(orderRows);
    const customers = prepareCustomers(customerRows, orders);
    const products = prepareProducts(productRows);

    const dataset = buildAnalysisDataset(orders, customers, products);
    const sessionId = createSession(dataset);

    const agencies = Array.from(new Set(dataset.orders.map((order) => order.agency))).sort((a, b) => a.localeCompare(b, "ko-KR"));

    return NextResponse.json({
      sessionId,
      agencies,
      counts: {
        orders: dataset.orders.length,
        customers: dataset.customers.length,
        products: dataset.products.length
      },
      defaultFiles: {
        orders: ordersFile,
        customers: customersFile,
        products: productsFile
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
