type Button = { text: string; callback_data: string };
type Keyboard = { inline_keyboard: Button[][] };

export type RecentMovie = { code: string; title: string };
export type RecentEpisode = {
  id: number;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
};
export type TopItem = {
  kind: "movie" | "series";
  code: string;
  title: string;
  viewers: number;
};

type Encode = (value: string) => string;

const clip = (text: string) => text.slice(0, 64);

export const NEW_HEADER = "🆕 So‘nggi qo‘shilganlar";
export const TOP_HEADER = "🔥 Eng ko‘p ko‘rilganlar (oxirgi 30 kun)";

export function buildNewKeyboard(
  movies: RecentMovie[],
  episodes: RecentEpisode[],
  encode: Encode,
): Keyboard | undefined {
  const rows: Button[][] = [
    ...episodes.map((episode) => [
      {
        text: clip(`📺 ${episode.seriesTitle} — ${episode.seasonNumber}-fasl ${episode.episodeNumber}-qism`),
        callback_data: `ep:${episode.id}`,
      },
    ]),
    ...movies.map((movie) => [
      {
        text: clip(`🎬 ${movie.code} — ${movie.title}`),
        callback_data: `movie:${encode(movie.code)}`,
      },
    ]),
  ];
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

export function buildTopKeyboard(
  items: TopItem[],
  encode: Encode,
): Keyboard | undefined {
  const rows = items.map((item, index) => [
    {
      text: clip(
        `${index + 1}. ${item.kind === "series" ? "📺" : "🎬"} ${item.title} · 👁 ${item.viewers}`,
      ),
      callback_data: `${item.kind === "series" ? "series" : "movie"}:${encode(item.code)}`,
    },
  ]);
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}
