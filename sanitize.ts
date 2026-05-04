// Обёртка над OpenAI SDK. Вызывается ТОЛЬКО на сервере.
// Ключ читается из process.env.OPENAI_API_KEY и никогда не уезжает на клиент.

import OpenAI from "openai";
import { sanitizeHtml, sanitizePlainText } from "./sanitize";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY не задан. Создайте файл .env и положите туда ключ."
      );
    }
    client = new OpenAI({
      apiKey: key,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

export interface BuildPromptArgs {
  name: string;
  section: string;
  fields: Record<string, string>; // выбранные пользователем поля
  urlContext?: { url: string; text: string } | null;
  html: boolean;
}

const SYSTEM_PROMPT =
  "Ты SEO-копирайтер. Пиши полезное, точное, неводянистое описание товара на " +
  "русском языке. Не выдумывай технические характеристики, которых нет в данных. " +
  "Если данных мало — пиши аккуратно и обобщённо. Соблюдай требуемый формат вывода.";

const HTML_FORMAT_RULES =
  "Формат ответа: чистая HTML-разметка БЕЗ CSS, без атрибутов style/class, без тегов script. " +
  "Допустимы только теги: div, p, h2, h3, ul, ol, li, table, tbody, tr, td, b, strong, br. " +
  "Не используй markdown. Не оборачивай ответ в ```. Не добавляй пояснений до или после разметки.";

const PLAIN_FORMAT_RULES =
  "Формат ответа: обычный текст, разбитый на абзацы пустой строкой. " +
  "Без HTML, без markdown, без эмодзи, без вступлений вроде «Вот описание». " +
  "Никаких пояснений до или после описания.";

function buildUserMessage(args: BuildPromptArgs): string {
  const lines: string[] = [];
  lines.push(`Наименование: ${args.name}`);
  lines.push(`Раздел: ${args.section}`);

  const otherFields = Object.entries(args.fields).filter(
    ([k, v]) => v && v.trim() && k !== "Наименование" && k !== "Раздел"
  );
  if (otherFields.length > 0) {
    lines.push("");
    lines.push("Дополнительные поля:");
    for (const [k, v] of otherFields) {
      // Урезаем слишком длинные поля чтобы не выходить за лимиты.
      const val = v.length > 800 ? v.slice(0, 800) + "…" : v;
      lines.push(`- ${k}: ${val}`);
    }
  }

  if (args.urlContext && args.urlContext.text) {
    lines.push("");
    lines.push(`Контекст со страницы ${args.urlContext.url}:`);
    lines.push(args.urlContext.text);
  }

  lines.push("");
  lines.push(args.html ? HTML_FORMAT_RULES : PLAIN_FORMAT_RULES);
  lines.push("");
  lines.push("Верни только готовое описание, без комментариев и без вступлений.");

  return lines.join("\n");
}

export interface GenerateArgs extends BuildPromptArgs {
  model: string;
}

export async function generateDescription(args: GenerateArgs): Promise<string> {
  const c = getClient();
  const completion = await c.chat.completions.create({
    model: args.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(args) },
    ],
    temperature: 0.4,
  });

  const raw = completion.choices[0]?.message?.content || "";
  if (!raw.trim()) {
    throw new Error("OpenAI вернул пустой ответ");
  }

  return args.html ? sanitizeHtml(raw) : sanitizePlainText(raw);
}
