type Button = { text: string; callback_data?: string; url?: string };
type Keyboard = { inline_keyboard: Button[][] };

export type FavoriteKind = "movie" | "series";
export type FavoriteItem = { kind: FavoriteKind; code: string; title: string };

export const FAVORITES_HEADER = "⭐ Sevimlilaringiz";
export const FAVORITES_EMPTY =
  "Hozircha sevimlilar yo‘q.\nKino yoki serial ostidagi «⭐ Sevimlilarga qo‘shish» tugmasini bosing.";

const PREFIX = "fav:";

export function buildFavoriteRow(
  kind: FavoriteKind,
  encodedCode: string,
  isFavorite: boolean,
): Button[] {
  return [
    {
      text: isFavorite ? "✅ Sevimlilarda (olib tashlash)" : "⭐ Sevimlilarga qo‘shish",
      callback_data: `${PREFIX}${kind === "movie" ? "m" : "s"}:${encodedCode}`,
    },
  ];
}

export function parseFavoriteData(
  data: string,
): { kind: FavoriteKind; encoded: string } | null {
  const match = /^fav:([ms]):([A-Za-z0-9_-]{1,50})$/.exec(data);
  if (!match) {
    return null;
  }
  return { kind: match[1] === "m" ? "movie" : "series", encoded: match[2]! };
}

/** Tugmalar ichidagi sevimli-tugma qatorini almashtiradi (yo'q bo'lsa oxiriga qo'shadi). */
export function replaceFavoriteRow<T extends { callback_data?: string }>(
  rows: T[][],
  newRow: T[],
): T[][] {
  const isFavoriteRow = (row: T[]) =>
    row.some((b) => /^fav:[ms]:/.test(b.callback_data ?? ""));
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
      text: `${item.kind === "series" ? "📺" : "🎬"} ${item.title}`.slice(0, 64),
      callback_data: `${item.kind}:${encode(item.code)}`,
    },
  ]);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}
