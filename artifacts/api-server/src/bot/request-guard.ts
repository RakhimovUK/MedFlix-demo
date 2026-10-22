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
      return "So‘rov juda qisqa. Kino nomini to‘liqroq yozing.";
    case "long":
      return "So‘rov juda uzun. Faqat kino nomini yozing.";
    case "code":
      return "Bu kod bo‘yicha kino topilmadi. Kodni tekshirib qayta yuboring yoki 📚 Katalogdan tanlang.";
    case "greeting":
      return "Salom! Kino kodini yoki nomini yuboring, men topib beraman.";
    case "link":
      return "Havolalar so‘rov sifatida qabul qilinmaydi. Kino nomini yozing.";
  }
}
