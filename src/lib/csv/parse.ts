import Papa from "papaparse";

const ENCODING_CANDIDATES = ["utf-8", "euc-kr", "cp949", "utf-16le", "utf-16be"] as const;
const DELIMITER_CANDIDATES = [",", ";", "\t", "|", "，"] as const;

type CsvRow = Record<string, string>;

interface ParseCandidate {
  rows: CsvRow[];
  score: number;
}

function textQualityScore(text: string): number {
  if (!text) {
    return -1000;
  }

  let replacement = 0;
  let control = 0;
  let readable = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "�") {
      replacement += 1;
      continue;
    }
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) {
      control += 1;
      continue;
    }
    if (/[가-힣A-Za-z0-9\s_()[\]{}\-\/,.:]/.test(ch)) {
      readable += 1;
    }
  }

  return readable - replacement * 12 - control * 12;
}

function rowsQualityScore(rows: CsvRow[]): number {
  if (rows.length === 0) {
    return -1000;
  }

  const first = rows[0] ?? {};
  const headerText = Object.keys(first).join(" ");
  const valueText = rows
    .slice(0, 8)
    .flatMap((row) => Object.values(row).slice(0, 6))
    .join(" ");

  return textQualityScore(`${headerText} ${valueText}`);
}

function decodeWithEncoding(buffer: ArrayBufferLike, encoding: string): string | null {
  try {
    const decoded = new TextDecoder(encoding).decode(new Uint8Array(buffer));
    return normalizeText(decoded);
  } catch {
    return null;
  }
}

function normalizeText(text: string): string {
  const withoutBom = text.replace(/^\uFEFF/, "");
  const withoutExcelSep = withoutBom.replace(/^sep=.+\r?\n/i, "");
  return withoutExcelSep.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeRows(rows: Record<string, unknown>[]): CsvRow[] {
  return rows
    .map((row) => {
      const normalized: CsvRow = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.trim()] = String(value ?? "").trim();
      }
      return normalized;
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0));
}

function parseWithHeader(text: string, delimiter?: string): ParseCandidate | null {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim()
  });

  const rows = normalizeRows(result.data);
  const headerCount = result.meta.fields?.length ?? Object.keys(rows[0] ?? {}).length;

  if (headerCount < 2 || rows.length === 0) {
    return null;
  }

  const mismatchCount = result.errors.filter((error) => error.type === "FieldMismatch").length;
  const errorCount = result.errors.length;
  const quality = rowsQualityScore(rows);
  const score = rows.length * 10 + headerCount * 3 - mismatchCount - errorCount * 2 + quality;

  return { rows, score };
}

function uniqueHeaders(headers: string[]): string[] {
  const used = new Map<string, number>();

  return headers.map((rawHeader, index) => {
    const base = rawHeader.trim() || `col_${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function parseWithMatrix(text: string, delimiter?: string): ParseCandidate | null {
  const result = Papa.parse<string[]>(text, {
    header: false,
    delimiter,
    skipEmptyLines: "greedy"
  });

  const matrix = result.data.filter((row): row is string[] => Array.isArray(row));
  if (matrix.length < 2) {
    return null;
  }

  const headerIndex = matrix.findIndex((row) => row.filter((value) => String(value ?? "").trim().length > 0).length >= 2);
  if (headerIndex < 0 || headerIndex >= matrix.length - 1) {
    return null;
  }

  const headers = uniqueHeaders(matrix[headerIndex].map((cell) => String(cell ?? "").trim()));
  if (headers.length < 2) {
    return null;
  }

  const rows: CsvRow[] = matrix
    .slice(headerIndex + 1)
    .map((row) => {
      const record: CsvRow = {};
      headers.forEach((header, index) => {
        record[header] = String(row[index] ?? "").trim();
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0));

  if (rows.length === 0) {
    return null;
  }

  const quality = rowsQualityScore(rows);
  const score = rows.length * 8 + headers.length * 3 - result.errors.length * 2 + quality;
  return { rows, score };
}

function isLikelyXlsx(buffer: ArrayBufferLike): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  return parseCsvBuffer(buffer);
}

export function parseCsvBuffer(buffer: ArrayBufferLike): Record<string, string>[] {
  if (isLikelyXlsx(buffer)) {
    throw new Error("CSV 파싱 오류: 업로드한 파일이 XLSX 형식입니다. CSV(쉼표로 분리)로 저장한 파일을 업로드해주세요.");
  }

  const candidates: ParseCandidate[] = [];

  for (const encoding of ENCODING_CANDIDATES) {
    const text = decodeWithEncoding(buffer, encoding);
    if (!text) {
      continue;
    }

    const autoHeaderCandidate = parseWithHeader(text);
    if (autoHeaderCandidate) {
      candidates.push(autoHeaderCandidate);
    }

    for (const delimiter of DELIMITER_CANDIDATES) {
      const headerCandidate = parseWithHeader(text, delimiter);
      if (headerCandidate) {
        candidates.push(headerCandidate);
      }

      const matrixCandidate = parseWithMatrix(text, delimiter);
      if (matrixCandidate) {
        candidates.push(matrixCandidate);
      }
    }
  }

  if (candidates.length === 0) {
    if (isLikelyXlsx(buffer)) {
      throw new Error("CSV 파싱 오류: 업로드한 파일이 CSV가 아니라 XLSX 형식으로 보입니다. 엑셀에서 CSV(쉼표로 분리)로 다시 저장해주세요.");
    }
    throw new Error(
      "CSV 파싱 오류: 형식을 인식하지 못했습니다. 인코딩(UTF-8/CP949/UTF-16)과 구분자(, ; 탭 |)를 확인해주세요."
    );
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best.rows;
}
