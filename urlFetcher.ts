// Сборка результирующего файла в исходном формате.
//
// CSV: переэмитим через papaparse, восстанавливая разделитель, BOM
// и тип переноса строк. Изменяется только колонка описания (см. UploadSession.generated).
//
// XLSX: грузим оригинальный буфер, точечно правим только нужные ячейки колонки
// описания через прямую запись по адресу. Все прочие ячейки, форматирование,
// формулы и стили остаются исходными.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { UploadSession } from "./types";

export function buildCsv(session: UploadSession): { buffer: Buffer; mime: string; ext: string } {
  if (!session.csvRows || !session.csvMeta) {
    throw new Error("Сессия не является CSV");
  }
  // Применяем сгенерированные значения, не трогая остальные колонки.
  const rows = session.csvRows.map((row, idx) => {
    const gen = session.generated.get(idx);
    if (!gen) return row;
    return { ...row, [gen.column]: gen.value };
  });

  const csv = Papa.unparse(
    {
      fields: session.headers,
      data: rows.map((r) => session.headers.map((h) => r[h] ?? "")),
    },
    {
      delimiter: session.csvMeta.delimiter,
      newline: session.csvMeta.newline,
      quotes: false, // papaparse сам решит, где нужны кавычки
    }
  );

  const withBom = session.csvMeta.hasBom ? "\uFEFF" + csv : csv;
  return {
    buffer: Buffer.from(withBom, "utf8"),
    mime: "text/csv; charset=utf-8",
    ext: "csv",
  };
}

export function buildXlsx(session: UploadSession): { buffer: Buffer; mime: string; ext: string } {
  if (!session.xlsxBuffer || !session.xlsxMeta) {
    throw new Error("Сессия не является XLSX");
  }
  // Работаем поверх копии исходного буфера.
  const wb = XLSX.read(session.xlsxBuffer, { type: "buffer", cellStyles: true });
  const sheetName = session.xlsxMeta.sheetName;
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) throw new Error("Лист XLSX повреждён");
  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Карта "название колонки -> индекс колонки в листе".
  const headerToCol = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = ws[addr];
    if (cell) headerToCol.set(String(cell.v ?? ""), c);
  }

  for (const [rowIdx, gen] of session.generated.entries()) {
    const col = headerToCol.get(gen.column);
    if (col == null) continue;
    const sheetRow = range.s.r + 1 + rowIdx;
    const addr = XLSX.utils.encode_cell({ r: sheetRow, c: col });
    const existing = ws[addr];
    // Сохраняем форматирование (s) если оно было.
    ws[addr] = { t: "s", v: gen.value, ...(existing?.s ? { s: existing.s } : {}) };
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
  return {
    buffer: Buffer.from(out),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  };
}
