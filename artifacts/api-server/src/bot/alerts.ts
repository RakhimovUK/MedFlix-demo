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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
