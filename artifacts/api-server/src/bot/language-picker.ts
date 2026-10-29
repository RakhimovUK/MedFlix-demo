/**
 * Foydalanuvchi tilini tanlash tugmalari (/start, /language, "🌐 Til").
 * callback_data: "setlang:<uz|ru|en>" yoki "setlang:<til>:<deep-link kodi>".
 */
import { LANGS, LANG_BUTTON, type Lang } from "./i18n";

const PREFIX = "setlang:";
const CALLBACK_LIMIT = 64;

export function buildLanguagePicker(
  suggested: Lang | null,
  payload?: string,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const order = suggested ? [suggested, ...LANGS.filter((lang) => lang !== suggested)] : [...LANGS];
  return {
    inline_keyboard: order.map((lang) => {
      const withPayload = payload ? `${PREFIX}${lang}:${payload}` : "";
      const data =
        withPayload && Buffer.byteLength(withPayload, "utf8") <= CALLBACK_LIMIT
          ? withPayload
          : `${PREFIX}${lang}`;
      return [{ text: LANG_BUTTON[lang], callback_data: data }];
    }),
  };
}

export function parseSetLangData(data: string): { lang: Lang; payload: string | null } | null {
  if (!data.startsWith(PREFIX)) return null;
  const rest = data.slice(PREFIX.length);
  const separator = rest.indexOf(":");
  const lang = separator >= 0 ? rest.slice(0, separator) : rest;
  if (lang !== "uz" && lang !== "ru" && lang !== "en") return null;
  const payload = separator >= 0 ? rest.slice(separator + 1) : "";
  return { lang, payload: payload || null };
}
