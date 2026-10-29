/**
 * Post matnidan KINO TILINI aniqlaydi.
 *
 * Qoida: til FAQAT aniq belgidan olinadi: "Til:", "Tillar:", "Язык:", "Language:".
 * Kino nomi yoki matnning qolgan qismiga qarab til taxmin qilinmaydi.
 *
 *   Til: O'zbek                -> ["uz"]
 *   Язык: Русский              -> ["ru"]
 *   Language: English, Uzbek   -> ["en", "uz"]  (ko'p tilli)
 */

export type MovieLang = "uz" | "ru" | "en";

export const MOVIE_LANGS: readonly MovieLang[] = ["uz", "ru", "en"];

export type LanguageDecision =
  | { kind: "auto"; lang: MovieLang }
  | { kind: "ask"; options: MovieLang[]; reason: "multi" | "none" };

const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;

const LANG_LABEL =
  /^(?:til|tili|tillar|tilda|lang|language|languages|язык|языки|тил)\s*[:：=\-–—]\s*(.+)$/iu;

const WORDS: Record<MovieLang, string[]> = {
  uz: [
    "uz", "uzb", "uzbek", "uzbekcha", "ozbek", "ozbekcha", "ozbekistan",
    "ўзбек", "узбек", "узбекский", "ўзбекча", "узбекча", "o'zbek", "o‘zbek",
    "o`zbek", "oʻzbek", "o'zbekcha", "o‘zbekcha", "oʻzbekcha",
  ],
  ru: [
    "ru", "rus", "russian", "russkiy", "ruscha", "russkij", "русский", "рус",
    "русском", "русча", "русский язык", "по-русски",
  ],
  en: [
    "en", "eng", "english", "ingliz", "inglizcha", "english language",
    "английский", "англ", "английском", "инглиз", "инглизча",
  ],
};

const LOOKUP = new Map<string, MovieLang>();
for (const lang of MOVIE_LANGS) {
  for (const word of WORDS[lang]) LOOKUP.set(word, lang);
}

function normalizeToken(raw: string): string {
  return raw
    .toLocaleLowerCase("uz")
    .replace(/[’ʻʼ`´]/gu, "'")
    .replace(/\b(?:tilida|tilidagi|tilda|tili|tiliga|tili|til|language|язык|языке)\b/giu, " ")
    .replace(/[().*_~"«»]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLangToken(raw: string): MovieLang | null {
  const token = normalizeToken(raw);
  if (!token) return null;
  const direct = LOOKUP.get(token) ?? LOOKUP.get(token.replace(/'/g, ""));
  if (direct) return direct;
  const apostropheFree = token.replace(/'/g, "");
  return LOOKUP.get(apostropheFree) ?? null;
}

function splitValue(value: string): string[] {
  return value
    .split(/[,;/|&+•·]+|\s+(?:va|и|and|yoki|или|or)\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Postdagi "Til:" belgisidan tillar ro'yxati (takrorlarsiz, uz-ru-en tartibida). */
export function detectPostLanguages(text: string | null | undefined): MovieLang[] {
  const found = new Set<MovieLang>();
  const lines = (text ?? "").split(/\r?\n/u);
  for (const rawLine of lines) {
    const cleaned = rawLine.replace(EMOJI, "").replace(/[*_~]/g, "");
    for (const segment of cleaned.split(/\s*[|•·]\s*(?=\S+\s*[:：=])/u)) {
      const match = LANG_LABEL.exec(segment.replace(/\s+/g, " ").trim());
      if (!match) continue;
      for (const part of splitValue(match[1] ?? "")) {
        const lang = normalizeLangToken(part);
        if (lang) found.add(lang);
      }
    }
  }
  return MOVIE_LANGS.filter((lang) => found.has(lang));
}

/** Bitta til aniq -> avtomatik. Aks holda admin tanlaydi. */
export function decidePostLanguage(
  text: string | null | undefined,
): LanguageDecision {
  const langs = detectPostLanguages(text);
  if (langs.length === 1) return { kind: "auto", lang: langs[0]! };
  if (langs.length > 1) return { kind: "ask", options: langs, reason: "multi" };
  return { kind: "ask", options: [...MOVIE_LANGS], reason: "none" };
}
