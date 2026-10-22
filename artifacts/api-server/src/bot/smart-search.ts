/**
 * Qidiruv uchun matnni normallashtirish va yumshoq (fuzzy) solishtirish.
 * "Qo'llar", "qo‘llar", "qollar", "Қўллар" — hammasi bir xil ko'rinishga keladi.
 */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
  щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o",
  қ: "q", ғ: "g", ҳ: "h",
};

const APOSTROPHES = /[ʻʼ’‘`´'ʹ′]/gu;

export function normalizeText(input: string): string {
  let value = input.toLowerCase();
  value = value.replace(/[а-яёўқғҳ]/gu, (ch) => CYRILLIC[ch] ?? ch);
  value = value.normalize("NFKD").replace(/\p{M}+/gu, "");
  value = value.replace(APOSTROPHES, "");
  value = value.replace(/[^\p{L}\p{N}.]+/gu, " ");
  return value.replace(/\s+/g, " ").trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length] ?? max + 1;
}

function typoTolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/** So'z so'zga mosmi: aynan, prefiks, bir xil o'zak (5 harf) yoki 1-2 harf xato. */
export function tokenMatches(queryToken: string, textToken: string): boolean {
  if (queryToken === textToken) return true;
  if (queryToken.length >= 3 && textToken.startsWith(queryToken)) return true;
  if (
    queryToken.length >= 5 &&
    textToken.length >= 5 &&
    queryToken.slice(0, 5) === textToken.slice(0, 5)
  ) {
    return true;
  }
  const tolerance = typoTolerance(Math.min(queryToken.length, textToken.length));
  return tolerance > 0 && levenshtein(queryToken, textToken, tolerance) <= tolerance;
}

/** So'z aniq yoki prefiks sifatida mos (imlo xatosiz). */
export function tokenMatchesStrict(queryToken: string, textToken: string): boolean {
  return (
    queryToken === textToken ||
    (queryToken.length >= 3 && textToken.startsWith(queryToken))
  );
}

/**
 * 0..100: so'rov matnga qanchalik mos. 0 — mos emas.
 * 100 aynan, 90 ichida, 80 barcha so'zlar mos (tartibdan qat'i nazar),
 * 70 barcha so'zlar mos (imlo xatosi bilan), 65 butun matn yaqin.
 */
export function scoreText(queryNorm: string, textNorm: string): number {
  if (!queryNorm || !textNorm) return 0;
  if (queryNorm === textNorm) return 100;
  if (queryNorm.length >= 2 && textNorm.includes(queryNorm)) return 90;
  if (queryNorm.length < 3) return 0;

  const queryTokens = tokenize(queryNorm);
  const textTokens = tokenize(textNorm);
  if (
    queryTokens.length > 0 &&
    queryTokens.every((q) => textTokens.some((t) => tokenMatchesStrict(q, t)))
  ) {
    return 80;
  }
  if (
    queryTokens.length > 0 &&
    queryTokens.every((q) => textTokens.some((t) => tokenMatches(q, t)))
  ) {
    return 70;
  }

  if (queryNorm.length >= 5 && levenshtein(queryNorm, textNorm, 2) <= 2) {
    return 65;
  }
  return 0;
}


export type CatalogMovie = { code: string; title: string; genres: string[] };
export type CatalogSeries = { code: string; title: string };
export type AliasEntry = {
  aliasNorm: string;
  kind: "movie" | "series";
  code: string;
  hits: number;
};

export type SearchVia = "code" | "alias" | "title" | "genre";
export type SearchHit = {
  kind: "movie" | "series";
  code: string;
  title: string;
  via: SearchVia;
  score: number;
};

/** Avto-o'rganilgan alias ishlashi uchun kamida shuncha marta tanlanishi kerak (qo'lda qo'shilgani — 100). */
export const MIN_ALIAS_HITS = 2;
export const MANUAL_ALIAS_HITS = 100;
const MAX_HITS = 20;

export function normalizeCodeLike(value: string): string {
  return value.trim().replace(/^#/, "").toUpperCase();
}

export function looksLikeCode(value: string): boolean {
  return /^#?\d+(?:\.[0-9a-z]+)?$/iu.test(value.trim());
}

export function smartSearch(
  query: string,
  catalog: { movies: CatalogMovie[]; series: CatalogSeries[] },
  aliases: AliasEntry[] = [],
): SearchHit[] {
  const raw = query.trim();
  const queryNorm = normalizeText(raw);
  if (!raw || !queryNorm) return [];

  const best = new Map<string, SearchHit>();
  const push = (hit: SearchHit) => {
    const key = `${hit.kind}:${hit.code}`;
    const existing = best.get(key);
    if (!existing || existing.score < hit.score) best.set(key, hit);
  };

  const codeQuery = normalizeCodeLike(raw);
  // Qisqa kod ("10", "1.a") faqat kod bo'yicha qidiriladi, nomlarga tasodifan mos kelmasin.
  const codeOnly = looksLikeCode(raw) && queryNorm.length < 4;

  const items: Array<{ kind: "movie" | "series"; code: string; title: string }> = [
    ...catalog.movies.map((m) => ({ kind: "movie" as const, ...m })),
    ...catalog.series.map((s) => ({ kind: "series" as const, ...s })),
  ];

  for (const item of items) {
    const itemCode = item.code.toUpperCase();
    if (itemCode === codeQuery) {
      push({ kind: item.kind, code: item.code, title: item.title, via: "code", score: 200 });
    }

    const titleScore = codeOnly ? 0 : scoreText(queryNorm, normalizeText(item.title));
    if (titleScore > 0) {
      push({ kind: item.kind, code: item.code, title: item.title, via: "title", score: titleScore });
    }
  }

  for (const alias of aliases) {
    if (alias.aliasNorm !== queryNorm || alias.hits < MIN_ALIAS_HITS) continue;
    const item = items.find((i) => i.kind === alias.kind && i.code === alias.code);
    if (item) {
      push({ kind: item.kind, code: item.code, title: item.title, via: "alias", score: 150 });
    }
  }

  for (const movie of catalog.movies) {
    if (codeOnly) break;
    const genreScore = Math.max(
      0,
      ...movie.genres.map((genre) => scoreText(queryNorm, normalizeText(genre))),
    );
    if (genreScore >= 70) {
      push({ kind: "movie", code: movie.code, title: movie.title, via: "genre", score: 40 });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "uz"))
    .slice(0, MAX_HITS);
}

export type GroupedHits = {
  /** Kod yoki nom bo'yicha aniq/qisman mos kelganlar. */
  primary: SearchHit[];
  /** Faqat janr bo'yicha topilgan kinolar. */
  genre: SearchHit[];
  /** Faqat imlo xatosi bilan o'xshash nomlar ("Shuni nazarda tutdingizmi?"). */
  fuzzy: SearchHit[];
};

/** Natijalarni sarlavhalar uchun guruhlaydi: aniq/qisman -> janr -> o'xshash. */
export function groupHits(hits: SearchHit[]): GroupedHits {
  const grouped: GroupedHits = { primary: [], genre: [], fuzzy: [] };
  for (const hit of hits) {
    if (hit.via === "genre") grouped.genre.push(hit);
    else if (hit.via === "title" && hit.score < 80) grouped.fuzzy.push(hit);
    else grouped.primary.push(hit);
  }
  // O'xshash nomlar faqat boshqa hech narsa topilmaganda ko'rsatiladi.
  if (grouped.primary.length > 0 || grouped.genre.length > 0) grouped.fuzzy = [];
  return grouped;
}
