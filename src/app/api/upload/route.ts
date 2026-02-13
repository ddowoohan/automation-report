import { NextResponse } from "next/server";

import { parseCsvFile } from "@/lib/csv/parse";
import { validateCsvRows } from "@/features/preprocessing/csv-schema";
import { buildAnalysisDataset, prepareCustomers, prepareOrders, prepareProducts } from "@/features/preprocessing/merge";
import { createSession } from "@/lib/session-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const ordersFile = formData.get("orders") as File | null;
    const customersFile = formData.get("customers") as File | null;
    const productsFile = formData.get("products") as File | null;

    if (!ordersFile || !customersFile || !productsFile) {
      return NextResponse.json({ error: "CSV 파일 3개를 모두 업로드해주세요." }, { status: 400 });
    }

    const [orderRowsRaw, customerRowsRaw, productRowsRaw] = await Promise.all([
      parseCsvFile(ordersFile),
      parseCsvFile(customersFile),
      parseCsvFile(productsFile)
    ]);

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
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
