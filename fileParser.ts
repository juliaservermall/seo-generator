// Список моделей OpenAI, доступных в UI.
// Чтобы добавить новую модель — допишите её сюда. Никаких других правок не требуется:
// строка `id` передаётся в OpenAI как параметр `model`.
//
// ВАЖНО: имена моделей в этом списке заданы по требованиям ТЗ.
// Если в вашем аккаунте OpenAI они называются иначе — отредактируйте `id`.

export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-5.4-nano", label: "gpt-5.4-nano (быстрая, по умолчанию)" },
  { id: "gpt-5.4-mini", label: "gpt-5.4-mini" },
  { id: "gpt-5.4", label: "gpt-5.4" },
];

export const DEFAULT_MODEL = "gpt-5.4-nano";

export function isAllowedModel(id: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === id);
}
