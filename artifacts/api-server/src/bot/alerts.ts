type AlertOptions = {
  cooldownMs?: number;
  maxPerHour?: number;
  now?: () => number;
};

/** Bir xil xato uchun takroriy ogohlantirishlarni va umumiy oqimni cheklaydi. */
export function createAlertThrottle(options: AlertOptions = {}) {
  const cooldownMs = options.cooldownMs ?? 10 * 60 * 1000;
  const maxPerHour = options.maxPerHour ?? 6;
  const now = options.now ?? Date.now;
  const lastByKey = new Map<string, number>();
  let sent: number[] = [];

  return {
    allow(key: string): boolean {
      const t = now();
      sent = sent.filter((time) => t - time < 60 * 60 * 1000);
      const last = lastByKey.get(key);
      if (last !== undefined && t - last < cooldownMs) {
        return false;
      }
      if (sent.length >= maxPerHour) {
        return false;
      }
      lastByKey.set(key, t);
      sent.push(t);
      return true;
    },
  };
}

function causeCode(err: unknown): string | undefined {
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  if (cause && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message) return message.slice(0, 60);
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = causeCode(err);
  return code && !message.includes(code) ? `${message} (${code})` : message;
}

/**
 * Server va Telegram orasidagi qisqa tarmoq uzilishlari (internet "lip" etishi,
 * Telegram 5xx, vaqt tugashi). Polling o'zi qayta ulanadi — darhol ogohlantirish shart emas.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const text = `${errorMessage(err)} ${err instanceof Error ? err.name : ""}`.toLowerCase();
  return [
    "fetch failed",
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "eai_again",
    "enetunreach",
    "ehostunreach",
    "epipe",
    "socket hang up",
    "other side closed",
    "und_err",
    "timeouterror",
    "aborterror",
    "operation was aborted",
    "bad gateway",
    "gateway timeout",
    "service unavailable",
    "internal server error",
    "telegram api error: 5",
  ].some((fragment) => text.includes(fragment));
}

/**
 * Polling uzilishini kuzatadi: bir martalik uzilishda jim turadi, faqat
 * `graceMs` dan uzoq davom etsa bir marta ogohlantiradi va tiklanganda xabar beradi.
 */
export function createOutageTracker(options: { graceMs?: number; now?: () => number } = {}) {
  const graceMs = options.graceMs ?? 3 * 60 * 1000;
  const now = options.now ?? Date.now;
  let since: number | undefined;
  let alerted = false;

  return {
    /** Xato bo'ldi. Ogohlantirish kerak bo'lsa uzilish davomiyligini (ms) qaytaradi. */
    failure(): number | undefined {
      const t = now();
      since ??= t;
      if (!alerted && t - since >= graceMs) {
        alerted = true;
        return t - since;
      }
      return undefined;
    },
    /** Muvaffaqiyatli so'rov. Avval ogohlantirilgan bo'lsa uzilish davomiyligini (ms) qaytaradi. */
    success(): number | undefined {
      const result = alerted && since !== undefined ? now() - since : undefined;
      since = undefined;
      alerted = false;
      return result;
    },
    /** Hozir uzilish davom etyaptimi (backoff uchun ketma-ket xatolar). */
    get failing(): boolean {
      return since !== undefined;
    },
  };
}

/** Foydalanuvchi sabab bo'lgan oddiy Telegram holatlari adminni bezovta qilmasin. */
export function isIgnorableTelegramError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return [
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
    "message is not modified",
    "message to delete not found",
    "query is too old",
    "message can't be deleted",
  ].some((fragment) => message.includes(fragment));
}

export function alertKey(source: string, err: unknown): string {
  return `${source}:${errorMessage(err).replace(/\d+/g, "#").slice(0, 80)}`;
}

export function formatAlert(source: string, err: unknown, at: Date = new Date()): string {
  const message = errorMessage(err).replace(/\s+/g, " ").slice(0, 300);
  return [
    "⚠️ MEDFLIX: xatolik",
    `Manba: ${source}`,
    `Xato: ${message}`,
    `Vaqt: ${at.toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ].join("\n");
}
