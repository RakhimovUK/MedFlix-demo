/** Tugma bosilganda oldingi navigatsiya xabarlarini o'chirib, chat tarixini qisqa saqlaydi. */
export const CLEANUP_PREFIXES = [
  "genre:",
  "movie:",
  "series:",
  "season:",
  "episode:",
  "eps:",
  "ep:",
];

export function shouldCleanup(data: string): boolean {
  return CLEANUP_PREFIXES.some((prefix) => data.startsWith(prefix));
}

export function createNavCleanup(
  deleteMessage: (chatId: number, messageId: number) => Promise<void>,
) {
  const tracked = new Map<number, number[]>();
  const sentCounts = new Map<number, number>();

  function track(chatId: number, messageId: number): void {
    const list = tracked.get(chatId) ?? [];
    list.push(messageId);
    tracked.set(chatId, list.slice(-30));
  }

  function noteSent(chatId: number): void {
    sentCounts.set(chatId, (sentCounts.get(chatId) ?? 0) + 1);
  }

  function restore(chatId: number, ids: number[]): void {
    tracked.set(chatId, [...ids, ...(tracked.get(chatId) ?? [])].slice(-30));
  }

  /**
   * action ichida chatga yangi xabar yuborilsa, tugma turgan xabar va
   * oldin kuzatilgan sahifalar o'chiriladi. Xato yoki yangi xabar bo'lmasa,
   * hech narsa o'chirilmaydi.
   */
  async function run(
    chatId: number,
    tappedMessageId: number,
    action: () => Promise<void>,
  ): Promise<void> {
    const stale = tracked.get(chatId) ?? [];
    tracked.delete(chatId);
    const before = sentCounts.get(chatId) ?? 0;

    try {
      await action();
    } catch (err: unknown) {
      restore(chatId, stale);
      throw err;
    }

    if ((sentCounts.get(chatId) ?? 0) <= before) {
      restore(chatId, stale);
      return;
    }

    for (const id of new Set([tappedMessageId, ...stale])) {
      try {
        await deleteMessage(chatId, id);
      } catch {
        // allaqachon o'chirilgan bo'lishi mumkin
      }
    }
  }

  return { track, noteSent, run };
}
