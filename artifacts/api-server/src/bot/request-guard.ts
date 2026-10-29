import { t } from "./i18n";
/**
 * Matn adminlarga "so'rov" bo'lib borishi mumkinmi? Spamdan himoya:
 * kod ko'rinishidagi matn, salomlashuv, havola va juda qisqa/uzun matn so'rovga aylanmaydi.
 */

export type RequestGuardReason = "short" | "long" | "code" | "greeting" | "link";

export type RequestGuardResult =
  | { ok: true }
  | { ok: false; reason: RequestGuardReason };

const GREETING_WORDS = new Set([
  "salom", "salam", "assalom", "assalomu", "alaykum", "aleykum", "alaykumu",
  "hayrli", "tong", "kun", "kech", "qalaysiz", "qalesiz", "rahmat", "raxmat",
  "hi", "hello", "hey", "privet", "zdravstvuyte", "ok", "okey", "yaxshi",
  "bot", "admin", "start", "help", "yordam", "boshla", "nima", "gap",
  "salomlar", "dostlar", "va", "ha", "yoq", "yo",
]);

const LINK = /(?:https?:\/\/|t\.me\/|www\.|\b\w+\.(?:com|ru|uz|org|net|me)\b|@\w{4,})/iu;
const CODE_LIKE = /^#?\d+(?:\.[0-9a-z]+)?$/iu;

export function checkRequestText(raw: string): RequestGuardResult {
  const text = raw.trim();
  if (text.length > 100) return { ok: false, reason: "long" };
  if (LINK.test(text)) return { ok: false, reason: "link" };
  if (CODE_LIKE.test(text)) return { ok: false, reason: "code" };

  const letters = text.replace(/[^\p{L}\p{N}]+/gu, "");
  if (letters.length < 3) return { ok: false, reason: "short" };

  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  if (tokens.length > 0 && tokens.every((token) => GREETING_WORDS.has(token))) {
    return { ok: false, reason: "greeting" };
  }
  return { ok: true };
}

export function describeGuardReason(reason: RequestGuardReason): string {
  switch (reason) {
    case "short":
      return t("guard.short");
    case "long":
      return t("guard.long");
    case "code":
      return t("guard.code");
    case "greeting":
      return t("guard.greeting");
    case "link":
      return t("guard.link");
  }
}
