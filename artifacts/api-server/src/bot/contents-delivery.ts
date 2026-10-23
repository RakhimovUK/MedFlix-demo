export type ContentsPostRef = { chatId: string; messageId: number };

/**
 * Baza kanaldagi Mundarija postlarini (settings: contents_posts) ketma-ket
 * foydalanuvchiga nusxalaydi. Struktura posti (tizim ma'lumoti) o'tkazib yuboriladi.
 * Bitta post xato bersa, qolganlari yuborilishda davom etadi.
 */
export async function copyContentsPosts(opts: {
  refs: ContentsPostRef[];
  pageCount: number;
  exclude?: ContentsPostRef;
  copy: (ref: ContentsPostRef) => Promise<void>;
  onError?: (ref: ContentsPostRef, err: unknown) => void;
}): Promise<{ sent: number; failed: number }> {
  const used = Math.max(1, Math.min(opts.pageCount, opts.refs.length));
  let sent = 0;
  let failed = 0;

  for (const ref of opts.refs.slice(0, used)) {
    if (
      opts.exclude &&
      ref.chatId === opts.exclude.chatId &&
      ref.messageId === opts.exclude.messageId
    ) {
      continue;
    }
    try {
      await opts.copy(ref);
      sent += 1;
    } catch (err: unknown) {
      failed += 1;
      opts.onError?.(ref, err);
    }
  }

  return { sent, failed };
}

/** Saqlangan post ro'yxatini (JSON) o'qiydi. Sozlama yo'q/buzuq bo'lsa null; "[]" — ataylab o'chirilgan. */
export function parseStoredPostRefs(raw: string | null): ContentsPostRef[] | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(
      (item): item is ContentsPostRef =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ContentsPostRef).chatId === "string" &&
        Number.isInteger((item as ContentsPostRef).messageId),
    );
  } catch {
    return null;
  }
}
