// Общие типы, используемые и на сервере, и на клиенте.

export type FileFormat = "csv" | "xlsx";

export interface CsvMeta {
  delimiter: string; // например ";" или ","
  hasBom: boolean;
  newline: "\r\n" | "\n";
}

export interface XlsxMeta {
  sheetName: string;
}

// Серверная сессия — хранится в памяти процесса, в БД ничего не пишется.
export interface UploadSession {
  id: string;
  format: FileFormat;
  originalFilename: string;
  headers: string[]; // заголовки в исходном порядке
  // Для CSV храним строки как объекты "заголовок -> значение".
  // Для XLSX храним сырой буфер, чтобы при сохранении сохранить форматирование
  // всех остальных колонок без изменений; модифицируем только колонку описания.
  csvRows?: Record<string, string>[];
  csvMeta?: CsvMeta;
  xlsxBuffer?: Buffer;
  xlsxMeta?: XlsxMeta;
  // Карта rowIndex -> новое значение для колонки описания.
  // Ключом используем индекс строки (0-based, без учёта строки заголовка).
  generated: Map<number, { column: string; value: string }>;
  totalRows: number;
  createdAt: number;
}

// Ответ /api/upload
export interface UploadResponse {
  uploadId: string;
  format: FileFormat;
  originalFilename: string;
  headers: string[];
  totalRows: number;
  detected: {
    nameColumn: string; // обязательное, обнаруженное
    sectionColumn: string; // обязательное, обнаруженное
    descriptionColumns: string[]; // целевые колонки для записи (минимум одна)
  };
}

export interface UploadErrorResponse {
  error: string;
  details?: {
    headers?: string[];
    missing?: ("name" | "section" | "description")[];
  };
}

// Запрос /api/generate-row
export interface GenerateRowRequest {
  uploadId: string;
  rowIndex: number; // 0-based
  promptColumns: string[]; // выбранные пользователем колонки контекста
  descriptionColumn: string; // колонка, куда писать
  model: string;
  html: boolean;
  skipFilled: boolean;
}

export interface GenerateRowResponse {
  rowIndex: number;
  status: "ok" | "skipped" | "error";
  description?: string;
  reason?: string; // для skipped
  error?: string; // для error
  fetchedUrl?: { url: string; bytes: number; truncated: boolean } | null;
}
