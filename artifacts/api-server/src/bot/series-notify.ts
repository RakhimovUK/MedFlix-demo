export type EpisodeRef = { seasonNumber: number; episodeNumber: number };

const NOTIFY_PREFIX = "ntf:";

/** Yangi qism serialning hozirgi eng oxirgi qismidan keyin kelsagina xabar beriladi. */
export function isNewLatestEpisode(
  existing: EpisodeRef[],
  added: EpisodeRef,
): boolean {
  if (existing.length === 0) {
    return false;
  }
  const key = (e: EpisodeRef) => e.seasonNumber * 1_000_000 + e.episodeNumber;
  const addedKey = key(added);
  return existing.every((episode) => key(episode) < addedKey);
}

export function formatNewEpisodeMessage(input: {
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
}): string {
  const lines = [
    "🔔 Yangi qism chiqdi!",
    `📺 ${input.seriesTitle}`,
    `${input.seasonNumber}-fasl, ${input.episodeNumber}-qism`,
  ];
  if (input.episodeTitle) {
    lines.push(input.episodeTitle);
  }
  return lines.join("\n");
}

export function isUnreachableUserError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return [
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
  ].some((fragment) => message.includes(fragment));
}

type Button = { text: string; callback_data?: string; url?: string };

export function buildNotifyRow(encodedCode: string, subscribed: boolean): Button[] {
  return [
    {
      text: subscribed
        ? "🔕 Xabarni o‘chirish"
        : "🔔 Yangi qismlar haqida xabar ber",
      callback_data: `${NOTIFY_PREFIX}${encodedCode}`,
    },
  ];
}

export function parseNotifyData(data: string): string | null {
  if (!data.startsWith(NOTIFY_PREFIX)) {
    return null;
  }
  const value = data.slice(NOTIFY_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,50}$/.test(value) ? value : null;
}

/** Tugmalar ichidagi xabar-tugma qatorini yangisiga almashtiradi (yo'q bo'lsa oxiriga qo'shadi). */
export function replaceNotifyRow<T extends { callback_data?: string }>(
  rows: T[][],
  newRow: T[],
): T[][] {
  const isNotifyRow = (row: T[]) =>
    row.some((b) => b.callback_data?.startsWith(NOTIFY_PREFIX));
  return rows.some(isNotifyRow)
    ? rows.map((row) => (isNotifyRow(row) ? newRow : row))
    : [...rows, newRow];
}

export async function notifySubscribers(options: {
  subscribers: number[];
  send: (chatId: number) => Promise<void>;
  onUnreachable: (chatId: number) => void;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ sent: number; removed: number; failed: number }> {
  const delayMs = options.delayMs ?? 40;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const result = { sent: 0, removed: 0, failed: 0 };

  for (const chatId of options.subscribers) {
    try {
      await options.send(chatId);
      result.sent += 1;
    } catch (err: unknown) {
      if (isUnreachableUserError(err)) {
        options.onUnreachable(chatId);
        result.removed += 1;
      } else {
        result.failed += 1;
      }
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return result;
}
