// Парсинг загруженного файла.
//
// Цели:
//  • CSV — корректно определить кодировку (UTF-8 BOM), разделитель,
//    тип переноса строк, чтобы при обратной записи файл выглядел как исходный.
//  • XLSX — сохранить буфер целиком, чтобы при сохранении изменилась только
//    одна колонка, а форматирование, формулы, прочие листы и стили остались.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CsvMeta, FileFormat, XlsxMeta } from "./types";

export function detectFormat(filename: string, buf: Buffer): FileFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || lower.endsWith(".xls")) {
    return "xlsx";
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    return "csv";
  }
  // Эвристика по содержимому: XLSX начинается с PK (zip).
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) {
    return "xlsx";
  }
  return "csv";
}

function detectDelimiter(sample: string): string {
  // Используем СТРОКУ ЗАГОЛОВКА: она не может быть внутри многострочного
  // квотированного поля, поэтому даёт самый чистый сигнал. Если в файле
  // есть многострочные ячейки (как в нашем примере с HTML-описаниями), считать
  // вхождения по нескольким физическим строкам опасно — переносы внутри
  // ячейки портят статистику.
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  const headerLine = sample.split(/\r?\n/, 1)[0] || "";
  for (const d of candidates) {
    const escaped = d === "\t" ? "\t" : `\\${d}`;
    const score = (headerLine.match(new RegExp(escaped, "g")) || []).length;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  meta: CsvMeta;
}

export function parseCsv(buf: Buffer): ParsedCsv {
  // Снимаем BOM.
  let text = buf.toString("utf8");
  let hasBom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    hasBom = true;
    text = text.slice(1);
  }
  // Определяем перенос строк.
  const newline: "\r\n" | "\n" = text.includes("\r\n") ? "\r\n" : "\n";
  // Определяем разделитель.
  const delimiter = detectDelimiter(text);

  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: false,
  });

  const data = result.data;
  if (data.length === 0) {
    return {
      headers: [],
      rows: [],
      meta: { delimiter, hasBom, newline },
    };
  }

  const headers = (data[0] || []).map((h) => (h ?? "").toString());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    // Пропускаем полностью пустую "хвостовую" строку (часто бывает в конце файла).
    if (i === data.length - 1 && row.every((c) => c === "" || c === undefined)) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? "").toString();
    }
    rows.push(obj);
  }

  return {
    headers,
    rows,
    meta: { delimiter, hasBom, newline },
  };
}

export interface ParsedXlsx {
  headers: string[];
  rowCount: number; // строк данных, без заголовка
  meta: XlsxMeta;
}

// Для XLSX отдаём только заголовки и количество строк — вся работа со строками
// идёт по индексу прямо в буфере, чтобы сохранить форматирование.
export function parseXlsxHeaders(buf: Buffer): ParsedXlsx {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("XLSX-файл не содержит листов");
  }
  const ws = wb.Sheets[sheetName];
  if (!ws["!ref"]) {
    return { headers: [], rowCount: 0, meta: { sheetName } };
  }
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = ws[addr];
    headers.push(cell ? String(cell.v ?? "") : "");
  }
  const rowCount = range.e.r - range.s.r; // вычитаем 1 строку заголовка
  return { headers, rowCount, meta: { sheetName } };
}

// Чтение конкретной строки данных из XLSX (0-based индекс строки данных).
export function readXlsxRow(
  buf: Buffer,
  sheetName: string,
  headers: string[],
  rowIndex: number
): Record<string, string> {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return {};
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const sheetRow = range.s.r + 1 + rowIndex; // +1 пропускает заголовок
  const obj: Record<string, string> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerIdx = c - range.s.c;
    const header = headers[headerIdx] ?? "";
    const addr = XLSX.utils.encode_cell({ r: sheetRow, c });
    const cell = ws[addr];
    obj[header] = cell ? String(cell.v ?? "") : "";
  }
  return obj;
}
