import { z } from "zod";

const REQUIRED_COLUMNS = {
  orders: ["수주번호", "사업자 등록번호", "실적대리점", "수주금액"],
  customers: ["사업자 등록번호"],
  products: ["수주번호"]
} as const;

type CsvSource = keyof typeof REQUIRED_COLUMNS;

const COLUMN_ALIASES: Record<CsvSource, Record<string, string[]>> = {
  orders: {
    수주번호: ["수주번호", "주문번호", "오더번호", "order_no", "orderno"],
    "사업자 등록번호": ["사업자 등록번호", "사업자등록번호", "사업자번호", "biz_no", "business_no"],
    실적대리점: ["실적대리점", "대리점", "대리점명", "영업대리점", "agency", "agency_name"],
    수주금액: ["수주금액", "주문금액", "매출금액", "합계금액", "order_amount", "sales_amount"],
    기준일자: ["기준일자", "기준일자일", "주문일자", "수주일자", "일자", "date", "order_date"],
    시: ["시", "시도", "광역시도", "city"],
    구: ["구", "시군구", "군구", "district"],
    동: ["동", "읍면동", "행정동", "법정동", "town"]
  },
  customers: {
    "사업자 등록번호": ["사업자 등록번호", "사업자등록번호", "사업자번호", "biz_no", "business_no"],
    실적대리점: ["실적대리점", "대리점", "대리점명", "agency", "agency_name"],
    최초주문금액: ["최초주문금액", "최초주문 금액", "first_order_amount", "first_amount"]
  },
  products: {
    수주번호: ["수주번호", "주문번호", "오더번호", "order_no", "orderno"],
    "카테고리(중분류)": ["카테고리(중분류)", "카테고리중분류", "중분류", "품목중분류", "mid_category"],
    수량: ["수량", "판매수량", "qty", "quantity"],
    신제품구분: ["신제품구분", "신제품여부", "신제품", "new_product", "is_new_product"],
    수주금액: ["수주금액", "주문금액", "품목금액", "amount", "sales_amount"]
  }
};

const csvRecordSchema = z.record(z.string(), z.string().nullable().optional());

export type RawCsvRecord = z.infer<typeof csvRecordSchema>;

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .replace(/["'`]/g, "")
    .replace(/[\s_()[\]{}\-\/]/g, "")
    .trim()
    .toLowerCase();
}

function hasAnyAlias(headers: Set<string>, aliases: string[]): boolean {
  return aliases.some((alias) => headers.has(normalizeHeader(alias)));
}

function collectHeaders(rows: RawCsvRecord[]): { raw: Set<string>; normalized: Set<string> } {
  const raw = new Set<string>();
  const normalized = new Set<string>();

  for (const row of rows.slice(0, 20)) {
    for (const key of Object.keys(row)) {
      raw.add(key);
      normalized.add(normalizeHeader(key));
    }
  }

  return { raw, normalized };
}

function findMissingColumns(normalizedHeaders: Set<string>, source: CsvSource): string[] {
  const missing = REQUIRED_COLUMNS[source].filter((required) => {
    const aliases = COLUMN_ALIASES[source][required] ?? [required];
    return !hasAnyAlias(normalizedHeaders, aliases);
  });
  return missing;
}

function tryShiftedHeader(rows: RawCsvRecord[], source: CsvSource): RawCsvRecord[] | null {
  if (rows.length < 2) {
    return null;
  }

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const headerValues = keys.map((key) => (firstRow[key] ?? "").trim());

  const candidateHeaderSet = new Set(headerValues.map((value) => normalizeHeader(value)).filter(Boolean));
  const missingFromShifted = findMissingColumns(candidateHeaderSet, source);

  if (missingFromShifted.length > Math.floor(REQUIRED_COLUMNS[source].length / 2)) {
    return null;
  }

  const shiftedRows: RawCsvRecord[] = rows.slice(1).map((row) => {
    const rebuilt: RawCsvRecord = {};
    keys.forEach((key, index) => {
      const shiftedHeader = headerValues[index] || `col_${index + 1}`;
      rebuilt[shiftedHeader] = (row[key] ?? "").trim();
    });
    return rebuilt;
  });

  const headers = collectHeaders(shiftedRows);
  const missing = findMissingColumns(headers.normalized, source);

  return missing.length === 0 ? shiftedRows : null;
}

export function validateCsvRows(rows: unknown[], source: keyof typeof REQUIRED_COLUMNS): RawCsvRecord[] {
  const parsed = z.array(csvRecordSchema).safeParse(rows);
  if (!parsed.success) {
    throw new Error(`${source} CSV 파싱에 실패했습니다.`);
  }

  const originalRows = parsed.data;
  const headers = collectHeaders(originalRows);
  const missing = findMissingColumns(headers.normalized, source);
  if (missing.length === 0) {
    return originalRows;
  }

  const shiftedRows = tryShiftedHeader(originalRows, source);
  if (shiftedRows) {
    return shiftedRows;
  }

  const detectedHeaders = Array.from(headers.raw).slice(0, 20).join(", ") || "(없음)";
  throw new Error(`${source} CSV 필수 컬럼 누락: ${missing.join(", ")} | 감지된 헤더: ${detectedHeaders}`);
}

export function pickValue(row: RawCsvRecord, candidates: string[]): string {
  const byKey = new Map(Object.entries(row).map(([k, v]) => [normalizeHeader(k), (v ?? "").trim()]));
  for (const key of candidates) {
    const value = byKey.get(normalizeHeader(key));
    if (value) {
      return value;
    }
  }
  return "";
}
