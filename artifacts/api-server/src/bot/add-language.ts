/**
 * /add paytida kino tilini tanlash (3-vazifa).
 *
 * Postda bitta til aniq yozilgan bo'lsa ("Til: English") kino avtomatik shu tilga saqlanadi.
 * Ko'p tilli yoki til belgisi yo'q bo'lsa, admin tugma bilan tanlaydi: "addlang:uz|ru|en|cancel".
 */
import type { MovieLang } from "./post-language";

export const LANG_LABELS: Record<MovieLang, string> = {
  uz: "🇺🇿 O‘zbek",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
};

export type PendingAdd = {
  code: string;
  title: string;
  channelChatId: string;
  channelMessageId: number;
  genres: string[];
  options: MovieLang[];
};

const PREFIX = "addlang:";

export function buildLanguageChoiceKeyboard(options: MovieLang[]): {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
} {
  return {
    inline_keyboard: [
      options.map((lang) => ({ text: LANG_LABELS[lang], callback_data: `${PREFIX}${lang}` })),
      [{ text: "❌ Bekor qilish", callback_data: `${PREFIX}cancel` }],
    ],
  };
}

export function parseAddLangData(data: string): MovieLang | "cancel" | null {
  if (!data.startsWith(PREFIX)) return null;
  const value = data.slice(PREFIX.length);
  return value === "uz" || value === "ru" || value === "en" || value === "cancel"
    ? value
    : null;
}

export function languageQuestionText(
  pending: Pick<PendingAdd, "code" | "title">,
  reason: "multi" | "none",
): string {
  return [
    `${pending.code} — ${pending.title}`,
    "",
    reason === "multi"
      ? "Postda bir nechta til ko‘rsatilgan. Qaysi til bazasiga qo‘shamiz?"
      : "Postda til ko‘rsatilmagan (Til: / Язык: / Language:). Qaysi til bazasiga qo‘shamiz?",
  ].join("\n");
}

export function createPendingAddStore(ttlMs = 15 * 60 * 1000, now: () => number = Date.now) {
  const items = new Map<string, { entry: PendingAdd; expiresAt: number }>();
  return {
    set(userId: number | string, entry: PendingAdd): void {
      items.set(String(userId), { entry, expiresAt: now() + ttlMs });
    },
    /** Olib tashlaydi va qaytaradi; muddati o'tgan bo'lsa null. */
    take(userId: number | string): PendingAdd | null {
      const key = String(userId);
      const item = items.get(key);
      items.delete(key);
      if (!item || item.expiresAt < now()) return null;
      return item.entry;
    },
  };
}
