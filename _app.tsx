// Безопасное извлечение текста по URL для дополнительного контекста генерации.
//
// Безопасность:
//   • Разрешены только схемы http/https (никаких file://, ftp://, javascript:).
//   • Жёсткий таймаут (по умолчанию 10 с).
//   • Лимит длины извлечённого текста.
//   • Никаких автоматических редиректов на нестандартные схемы.

import * as cheerio from "cheerio";

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/i;
const TIMEOUT_MS = Number(process.env.URL_FETCH_TIMEOUT_MS) || 10_000;
const TEXT_LIMIT = Number(process.env.URL_TEXT_LIMIT) || 8000;

export function extractFirstUrl(value: string): string | null {
  if (!value) return null;
  const m = value.match(URL_REGEX);
  if (!m) return null;
  const url = m[0].replace(/[),.;]+$/, ""); // убираем хвостовые знаки препинания
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface FetchedContext {
  url: string;
  text: string;
  bytes: number;
  truncated: boolean;
  contentType: string;
}

export async function fetchUrlContext(url: string): Promise<FetchedContext> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Запрещённая схема URL: разрешены только http и https");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "SEO-Generator/1.0 (+server-side fetch)",
        Accept: "text/html,text/plain,application/json,application/xhtml+xml;q=0.9,*/*;q=0.5",
      },
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) {
      throw new Error(`Таймаут загрузки URL (${TIMEOUT_MS} мс)`);
    }
    throw new Error(`Не удалось загрузить URL: ${msg}`);
  }
  clearTimeout(timer);

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} при загрузке URL`);
  }

  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await resp.arrayBuffer());
  const bytes = buf.length;

  let text = "";

  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const html = buf.toString("utf8");
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    text = $("main").text() || $("article").text() || $("body").text() || $.root().text();
  } else if (contentType.includes("text/") || contentType.includes("application/json")) {
    text = buf.toString("utf8");
  } else if (contentType.includes("application/pdf")) {
    throw new Error("Извлечение текста из PDF в этой версии не поддерживается");
  } else if (
    contentType.includes("application/vnd.openxmlformats") ||
    contentType.includes("application/msword")
  ) {
    throw new Error("Извлечение текста из DOCX/XLSX по URL в этой версии не поддерживается");
  } else {
    // best-effort: попробуем как текст
    text = buf.toString("utf8");
  }

  // Чистим от множественных пробелов и переносов.
  text = text.replace(/\s+/g, " ").trim();

  let truncated = false;
  if (text.length > TEXT_LIMIT) {
    text = text.slice(0, TEXT_LIMIT);
    truncated = true;
  }

  return { url, text, bytes, truncated, contentType };
}
