export const CAPTION_LIMIT = 1024;

export function normalizeDescription(raw: string | null | undefined): string | null {
  const text = (raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : null;
}

/** Matnni max belgigacha gap/so'z chegarasida qisqartiradi (oxiriga … qo'yadi). */
export function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(0, max - 1);
  let cut = text.slice(0, room);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  const floor = Math.floor(room * 0.6);
  const sentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf(".\n"),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (sentence >= floor) return cut.slice(0, sentence + 1).trimEnd();
  const space = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  if (space >= floor) cut = cut.slice(0, space);
  return `${cut.trimEnd()}…`;
}

export function buildSeriesCaption(input: {
  title: string;
  code: string;
  seasons: number[];
  episodeCount: number;
  description: string | null;
}): string {
  const footer = [
    `🔢 Kod: ${input.code}`,
    input.seasons.length === 1
      ? `📂 ${input.seasons[0]}-fasl`
      : `📂 Fasllar: ${input.seasons.length} ta`,
    `🎬 ${input.episodeCount} ta qism`,
  ].join("\n");

  const description = normalizeDescription(input.description);
  if (!description) {
    return `📺 ${input.title.slice(0, 200)}\n\n${footer}`;
  }
  const body = truncateAtBoundary(description, CAPTION_LIMIT - footer.length - 2);
  return `${body}\n\n${footer}`;
}

export function buildMovieCaption(input: {
  title: string;
  code: string;
  description: string | null;
}): string {
  const footer = `🔢 Kod: ${input.code}`;
  const description = normalizeDescription(input.description);
  if (!description) {
    return `🎬 ${input.title.slice(0, 200)}\n\n${footer}`;
  }
  const body = truncateAtBoundary(description, CAPTION_LIMIT - footer.length - 2);
  return `${body}\n\n${footer}`;
}
