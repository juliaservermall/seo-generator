// Санитайзер: оставляет только смысловые теги, разрешённые в ТЗ,
// и удаляет любые атрибуты (style/class/onclick/...).
//
// Разрешённые теги: div, p, h2, h3, ul, ol, li, table, tbody, tr, td,
//                   b, strong, br, thead, th (добавили для табличной разметки —
//                   часто GPT генерирует th в шапке; если не нужно, удалите ниже).
//
// Всё остальное (script, style, span, a, img и т.п.) — вырезается, содержимое
// тега сохраняется как текст.

import * as cheerio from "cheerio";

const ALLOWED_TAGS = new Set([
  "div",
  "p",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "table",
  "tbody",
  "thead",
  "tr",
  "td",
  "th",
  "b",
  "strong",
  "br",
]);

export function sanitizeHtml(html: string): string {
  // Убираем markdown code fences типа ```html ... ```
  let cleaned = html.trim();
  cleaned = cleaned.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const $ = cheerio.load(cleaned, null, false);

  // Полностью удаляем опасные узлы.
  $("script, style, noscript, iframe, svg, link, meta").remove();

  // Снимаем все атрибуты у разрешённых, заменяем неразрешённые на их содержимое.
  $("*").each((_i, el) => {
    if (el.type !== "tag") return;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Заменяем неразрешённый тег его текстом, сохраняя пробельный знак.
      $(el).replaceWith($(el).contents());
      return;
    }
    // Чистим атрибуты.
    const attrs = el.attribs ? Object.keys(el.attribs) : [];
    for (const a of attrs) {
      $(el).removeAttr(a);
    }
  });

  return $.root().html()?.trim() || "";
}

// Для обычного текста: убираем markdown-маркеры и HTML, нормализуем переносы.
export function sanitizePlainText(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  // Снимаем теги, если модель вдруг вернула HTML.
  const $ = cheerio.load(cleaned);
  $("script, style").remove();
  cleaned = $.root().text();
  // Нормализуем многократные пустые строки.
  cleaned = cleaned.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // Убираем markdown-выделения **bold**, *italic*, # heading.
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "$1");
  cleaned = cleaned.replace(/(^|\s)\*([^*]+)\*/g, "$1$2");
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");
  return cleaned;
}
