export type NavEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
};

export type NavButton = { text: string; callback_data: string };

export type EpisodeNeighbors<T extends NavEpisode> = {
  previous: T | null;
  next: T | null;
  index: number;
  total: number;
};

const TELEGRAM_TEXT_LIMIT = 4096;
const PAGE_TEXT_BUDGET = 3500;
const PAGE_MAX_EPISODES = 40;
const BUTTONS_PER_ROW = 5;

export function sortEpisodes<T extends NavEpisode>(episodes: T[]): T[] {
  return [...episodes].sort(
    (a, b) =>
      a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
  );
}

/** Faqat bazada mavjud qismlar orasidan oldingi/keyingisini topadi. */
export function getEpisodeNeighbors<T extends NavEpisode>(
  episodes: T[],
  currentId: number,
): EpisodeNeighbors<T> | null {
  const sorted = sortEpisodes(episodes);
  const index = sorted.findIndex((episode) => episode.id === currentId);
  if (index < 0) {
    return null;
  }

  return {
    previous: index > 0 ? sorted[index - 1]! : null,
    next: index < sorted.length - 1 ? sorted[index + 1]! : null,
    index,
    total: sorted.length,
  };
}

export function parseEpisodeId(value: string): number | null {
  if (!/^\d{1,12}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function episodeCallback(episodeId: number): string {
  return `ep:${episodeId}`;
}

export function episodeListCallback(episodeId: number): string {
  return `eps:${episodeId}`;
}

/** 1-qator: oldingi/keyingi (bor bo'lsa). 2-qator: barcha qismlar. */
export function buildEpisodeNavigationRows(
  neighbors: EpisodeNeighbors<NavEpisode>,
  currentId: number,
): NavButton[][] {
  const row: NavButton[] = [];
  if (neighbors.previous) {
    row.push({
      text: "⬅️ Oldingi qism",
      callback_data: episodeCallback(neighbors.previous.id),
    });
  }
  if (neighbors.next) {
    row.push({
      text: "Keyingi qism ➡️",
      callback_data: episodeCallback(neighbors.next.id),
    });
  }

  const rows: NavButton[][] = [];
  if (row.length > 0) {
    rows.push(row);
  }
  rows.push([
    { text: "📋 Barcha qismlar", callback_data: episodeListCallback(currentId) },
  ]);
  return rows;
}

export type EpisodeListPage = {
  text: string;
  keyboard: NavButton[][];
};

function episodeLine(episode: NavEpisode, multiSeason: boolean): string {
  const label = multiSeason
    ? `${episode.seasonNumber}-fasl ${episode.episodeNumber}-qism`
    : `${episode.episodeNumber}-qism`;
  return episode.title ? `${label} — ${episode.title}` : label;
}

/** Telegram xabar uzunligi va tugmalar sonidan oshmaydigan sahifalar. */
export function buildEpisodeListPages(
  seriesTitle: string,
  seriesCode: string,
  episodes: NavEpisode[],
): EpisodeListPage[] {
  const sorted = sortEpisodes(episodes);
  const multiSeason = new Set(sorted.map((e) => e.seasonNumber)).size > 1;
  const header = `📺 ${seriesTitle}\nKod: ${seriesCode}\nJami: ${sorted.length} ta qism\n`;

  const groups: NavEpisode[][] = [];
  let current: NavEpisode[] = [];
  let used = header.length;
  for (const episode of sorted) {
    const line = episodeLine(episode, multiSeason).slice(0, 200);
    if (
      current.length > 0 &&
      (current.length >= PAGE_MAX_EPISODES || used + line.length + 1 > PAGE_TEXT_BUDGET)
    ) {
      groups.push(current);
      current = [];
      used = header.length;
    }
    current.push(episode);
    used += line.length + 1;
  }
  if (current.length > 0) {
    groups.push(current);
  }

  return groups.map((group, pageIndex) => {
    const lines = group.map((e) => episodeLine(e, multiSeason).slice(0, 200));
    const pageInfo = groups.length > 1 ? ` (${pageIndex + 1}/${groups.length})` : "";
    const text = [`${header.trimEnd()}${pageInfo}`, "", ...lines].join("\n");
    const buttons: NavButton[] = group.map((e) => ({
      text: multiSeason ? `${e.seasonNumber}-${e.episodeNumber}` : `${e.episodeNumber}`,
      callback_data: episodeCallback(e.id),
    }));
    const keyboard: NavButton[][] = [];
    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
      keyboard.push(buttons.slice(i, i + BUTTONS_PER_ROW));
    }
    return { text: text.slice(0, TELEGRAM_TEXT_LIMIT), keyboard };
  });
}
