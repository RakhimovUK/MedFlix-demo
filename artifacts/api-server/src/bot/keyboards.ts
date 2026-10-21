import type { RequiredSubscription } from "./config";

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type ReplyMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

type MovieLike = { code: string; title: string };
type SeriesLike = {
  code: string;
  title: string;
  seasonCount: number;
  episodeCount: number;
};
type GenreLike = { name: string; movieCount: number };

export function encodeCallbackValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeCallbackValue(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function buildSubscriptionKeyboard(
  subscriptions: RequiredSubscription[],
): ReplyMarkup {
  const buttons: InlineKeyboardButton[] = subscriptions.map((subscription) => ({
    text: subscription.label,
    ...(subscription.url ? { url: subscription.url } : {}),
  }));

  buttons.push({ text: "✅ Tekshirish", callback_data: "subscription:check" });
  return { inline_keyboard: buttons.map((button) => [button]) };
}

export function buildStartKeyboard(discussionUrl?: string): ReplyMarkup {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: "🎬 Katalog", callback_data: "catalog" },
      { text: "🔍 Qidirish", callback_data: "search:help" },
    ],
    [
      { text: "🆕 Yangilari", callback_data: "discover:new" },
      { text: "🔥 Top", callback_data: "discover:top" },
    ],
    [{ text: "⭐ Sevimlilar", callback_data: "fav:list" }],
  ];
  if (discussionUrl) {
    rows.push([{ text: "💬 Muhokama chati", url: discussionUrl }]);
  }
  return { inline_keyboard: rows };
}

export function movieKeyboard(movies: MovieLike[]): ReplyMarkup | undefined {
  if (movies.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: movies.slice(0, 25).map((movie) => [
      {
        text: `${movie.code} — ${movie.title}`.slice(0, 64),
        callback_data: `movie:${encodeCallbackValue(movie.code)}`,
      },
    ]),
  };
}

export function seriesKeyboard(series: SeriesLike[]): ReplyMarkup | undefined {
  if (series.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: series.slice(0, 25).map((item) => [
      {
        text: `📺 ${item.code} — ${item.title} (${item.seasonCount} fasl, ${item.episodeCount} qism)`.slice(0, 64),
        callback_data: `series:${encodeCallbackValue(item.code)}`,
      },
    ]),
  };
}

export function buildGenreKeyboard(genres: GenreLike[]): ReplyMarkup | undefined {
  if (genres.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: genres.slice(0, 20).map((genre) => [
      {
        text: `${genre.name} (${genre.movieCount})`.slice(0, 64),
        callback_data: `genre:${encodeCallbackValue(genre.name)}`,
      },
    ]),
  };
}

export function buildCatalogKeyboard(
  genres: GenreLike[],
  movies: MovieLike[],
  series: SeriesLike[],
): ReplyMarkup | undefined {
  const rows = [
    ...(buildGenreKeyboard(genres)?.inline_keyboard ?? []),
    ...(movieKeyboard(movies)?.inline_keyboard ?? []),
    ...(seriesKeyboard(series)?.inline_keyboard ?? []),
  ];

  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}
