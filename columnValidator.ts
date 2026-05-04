// Простое хранилище сессий в памяти процесса.
// Без БД (по требованиям ТЗ): живёт пока живёт сервер dev.
// Для боевого использования замените на Redis/файлы — интерфейс минимальный.
//
// Используется через globalThis, чтобы переживать hot-reload в Next.js dev.

import type { UploadSession } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __seoSessions: Map<string, UploadSession> | undefined;
}

const store: Map<string, UploadSession> =
  globalThis.__seoSessions || (globalThis.__seoSessions = new Map());

// Сессии старше TTL очищаются при следующем обращении.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 часов

function gc() {
  const now = Date.now();
  for (const [id, s] of store.entries()) {
    if (now - s.createdAt > TTL_MS) store.delete(id);
  }
}

export function putSession(s: UploadSession): void {
  gc();
  store.set(s.id, s);
}

export function getSession(id: string): UploadSession | undefined {
  gc();
  return store.get(id);
}

export function deleteSession(id: string): void {
  store.delete(id);
}
