/**
 * Kanal posti matnidan (caption) kino nomi va janrlarni ajratib oladi.
 *
 * Qo'llab-quvvatlanadigan ko'rinishlar:
 *   🎬 Nomi: Oltin qo'llar          (Kino nomi / Nom / Name / Title / Название)
 *   🎭 Janr: Drama, Tibbiyot        (Janri / Janrlar / Genre / Жанр)
 *   #drama #tibbiyot                (faqat hashtaglardan iborat qator -> janr)
 *   🎬 Oltin qo'llar                (🎬 bilan boshlangan qator -> nom)
 * Label bo'lmasa, birinchi mazmunli qator nom sifatida olinadi
 * (Janr/Tarjima/Reyting/Yil kabi xizmat qatorlari nom bo'lmaydi).
 */

export type ParsedPost = { title: string | null; genres: string[] };

const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;

const TITLE_LABEL =
  /^(?:kino|film|serial|multfilm|multik)?\s*(?:nomi|nom|name|title|название|номи)\s*[:：=\-–—]\s*(.+)$/iu;
const GENRE_LABEL =
  /^(?:janri|janr|janrlar|genre|genres|жанр|жанры|жанри)\s*[:：=\-–—]\s*(.+)$/iu;
const INLINE_GENRE_SPLIT =
  /\s*[|•·]\s*(?=(?:janri|janr|janrlar|genre|genres|жанр|жанры)\s*[:：=\-–—])/iu;

const CLAPPER = /^[\s*_~]*🎬/u;
const META_LABEL =
  /^(?:janri|janr|janrlar|genre|genres|жанр|tarjima|tilda|til|reyting|rating|imdb|yil|yili|davlat|sifat|sifati|davomiyligi|davomiylik|rejissyor|aktyorlar|rollarda|qismlar|fasl|format|kod|kodi|kino kodi|ko'rish|yuklab)\s*[:：=\-–—]/iu;

const MAX_TITLE = 150;
const MAX_GENRES = 8;
const MAX_GENRE_LENGTH = 40;

function cleanLine(line: string): string {
  return line
    .replace(EMOJI, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^[«"“”‘'`]+/u, "")
    .replace(/[»"“”’'`]+$/u, "")
    .replace(/[.\s]+$/u, "")
    .trim()
    .slice(0, MAX_TITLE);
  return value.length > 0 ? value : null;
}

function prettifyGenre(raw: string): string {
  const value = raw.trim().slice(0, MAX_GENRE_LENGTH);
  if (!value) return "";
  const isUniform =
    value === value.toLowerCase() || value === value.toUpperCase();
  const base = isUniform ? value.toLowerCase() : value;
  return base.charAt(0).toLocaleUpperCase("uz") + base.slice(1);
}

export function splitGenres(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,;/|•·]+|\s*#/u)) {
    const genre = prettifyGenre(
      part.replace(/^#+/u, "").replace(/[.\s]+$/u, ""),
    );
    const key = genre.toLocaleLowerCase("uz");
    if (!genre || seen.has(key)) continue;
    seen.add(key);
    result.push(genre);
    if (result.length >= MAX_GENRES) break;
  }
  return result;
}

function isHashtagOnly(line: string): boolean {
  const tokens = line.split(/\s+/u).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => /^#\S+$/u.test(token));
}

export function parsePostText(text: string | null | undefined): ParsedPost {
  let clapperLine: string | null = null;
  const lines = (text ?? "")
    .split(/\r?\n/u)
    .flatMap((line) => {
      const cleaned = cleanLine(line);
      if (clapperLine === null && CLAPPER.test(line) && cleaned) {
        clapperLine = cleaned;
      }
      return INLINE_GENRE_SPLIT.test(cleaned)
        ? cleaned.split(INLINE_GENRE_SPLIT)
        : [cleaned];
    })
    .map((line) => line.trim())
    .filter(Boolean);

  let title: string | null = null;
  let genres: string[] = [];

  for (const line of lines) {
    const titleMatch = TITLE_LABEL.exec(line);
    if (titleMatch && !title) {
      title = cleanTitle(titleMatch[1] ?? "");
      continue;
    }
    const genreMatch = GENRE_LABEL.exec(line);
    if (genreMatch && genres.length === 0) {
      genres = splitGenres(genreMatch[1] ?? "");
    }
  }

  if (genres.length === 0) {
    const tagLine = lines.find(isHashtagOnly);
    if (tagLine) genres = splitGenres(tagLine);
  }

  if (!title && clapperLine && !META_LABEL.test(clapperLine)) {
    title = cleanTitle(clapperLine);
  }

  if (!title) {
    const first = lines.find(
      (line) =>
        !isHashtagOnly(line) &&
        !GENRE_LABEL.test(line) &&
        !META_LABEL.test(line) &&
        line.length <= 120 &&
        !/^https?:\/\//iu.test(line),
    );
    title = first ? cleanTitle(first) : null;
  }

  return { title, genres };
}
