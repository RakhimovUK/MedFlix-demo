type Button = { text: string; callback_data?: string; url?: string };
type Keyboard = { inline_keyboard: Button[][] };

export type FavoriteKind = "movie" | "series" | "episode";
/** episode uchun `code` — qism ID raqami (matn ko'rinishida), `title` esa tayyor sarlavha. */
export type FavoriteItem = { kind: FavoriteKind; code: string; title: string };

export const FAVORITES_HEADER = "⭐ Sevimlilaringiz";
export const FAVORITES_EMPTY =
  "Hozircha sevimlilar yo‘q.\nKino yoki serial qismi ostidagi «⭐ Sevimlilarga qo‘shish» tugmasini bosing.";

const PREFIX = "fav:";
const KIND_CHAR: Record<FavoriteKind, string> = { movie: "m", series: "s", episode: "e" };
const CHAR_KIND: Record<string, FavoriteKind> = { m: "movie", s: "series", e: "episode" };

const LABELS: Record<FavoriteKind, { off: string; on: string }> = {
  movie: { off: "⭐ Sevimlilarga qo‘shish", on: "✅ Sevimlilarda (olib tashlash)" },
  series: { off: "⭐ Sevimlilarga qo‘shish", on: "✅ Sevimlilarda (olib tashlash)" },
  episode: { off: "⭐ Qismni sevimlilarga qo‘shish", on: "✅ Sevimli qism (olib tashlash)" },
};

/** `ref`: kino/serial uchun base64 kod, qism uchun ID raqami. */
export function buildFavoriteRow(
  kind: FavoriteKind,
  ref: string,
  isFavorite: boolean,
): Button[] {
  return [
    {
      text: isFavorite ? LABELS[kind].on : LABELS[kind].off,
      callback_data: `${PREFIX}${KIND_CHAR[kind]}:${ref}`,
    },
  ];
}

export function parseFavoriteData(
  data: string,
): { kind: FavoriteKind; encoded: string } | null {
  const match = /^fav:([mse]):([A-Za-z0-9_-]{1,50})$/.exec(data);
  if (!match) {
    return null;
  }
  const kind = CHAR_KIND[match[1]!]!;
  const ref = match[2]!;
  if (kind === "episode" && !/^\d{1,12}$/.test(ref)) {
    return null;
  }
  return { kind, encoded: ref };
}

/** Tugmalar ichidagi sevimli-tugma qatorini almashtiradi (yo'q bo'lsa oxiriga qo'shadi). */
export function replaceFavoriteRow<T extends { callback_data?: string }>(
  rows: T[][],
  newRow: T[],
): T[][] {
  const isFavoriteRow = (row: T[]) =>
    row.some((b) => /^fav:[mse]:/.test(b.callback_data ?? ""));
  return rows.some(isFavoriteRow)
    ? rows.map((row) => (isFavoriteRow(row) ? newRow : row))
    : [...rows, newRow];
}

export function buildFavoritesKeyboard(
  items: FavoriteItem[],
  encode: (value: string) => string,
): Keyboard | undefined {
  const rows = items.map((item) => [
    {
      text: `${item.kind === "movie" ? "🎬" : "📺"} ${item.title}`.slice(0, 64),
      callback_data:
        item.kind === "episode" ? `ep:${item.code}` : `${item.kind}:${encode(item.code)}`,
    },
  ]);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}
