// Валидация и поиск обязательных колонок по заголовкам.
//
// Правила (из ТЗ):
//  • Поле наименования: ровно одно из строгого списка названий.
//  • Поле раздела: либо ровно "Раздел", либо любая колонка, содержащая слово
//    "раздел" без учёта регистра.
//  • Колонки описания: всё, в чьём названии есть "описание" или "описания"
//    (без учёта регистра).

const ALLOWED_NAME_HEADERS = [
  "Наименование",
  "Наименования",
  "Наименование элемента",
  "Наименование элементов",
];

function normalize(header: string): string {
  // Убираем BOM, обрезаем пробелы. Регистр не трогаем — нужен для сравнений.
  return header.replace(/^\uFEFF/, "").trim();
}

function lower(header: string): string {
  return normalize(header).toLowerCase();
}

export function findNameColumn(headers: string[]): string | null {
  const allowedLower = ALLOWED_NAME_HEADERS.map((h) => h.toLowerCase());
  for (const h of headers) {
    if (allowedLower.includes(lower(h))) {
      return h;
    }
  }
  return null;
}

export function findSectionColumn(headers: string[]): string | null {
  // 1) точное совпадение "Раздел" (с учётом регистра-без-учёта)
  for (const h of headers) {
    if (lower(h) === "раздел") return h;
  }
  // 2) любая колонка, содержащая слово "раздел"
  for (const h of headers) {
    if (lower(h).includes("раздел")) return h;
  }
  return null;
}

export function findDescriptionColumns(headers: string[]): string[] {
  // Колонки, в названии которых есть "описание" или "описания".
  // "описания" уже включает "описани" — но проверим оба явно для прозрачности.
  return headers.filter((h) => {
    const l = lower(h);
    return l.includes("описание") || l.includes("описания");
  });
}

export interface ValidationResult {
  ok: boolean;
  nameColumn: string | null;
  sectionColumn: string | null;
  descriptionColumns: string[];
  missing: ("name" | "section" | "description")[];
}

export function validateColumns(headers: string[]): ValidationResult {
  const nameColumn = findNameColumn(headers);
  const sectionColumn = findSectionColumn(headers);
  const descriptionColumns = findDescriptionColumns(headers);

  const missing: ("name" | "section" | "description")[] = [];
  if (!nameColumn) missing.push("name");
  if (!sectionColumn) missing.push("section");
  if (descriptionColumns.length === 0) missing.push("description");

  return {
    ok: missing.length === 0,
    nameColumn,
    sectionColumn,
    descriptionColumns,
    missing,
  };
}
