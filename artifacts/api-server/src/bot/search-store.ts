import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;

export type AliasKind = "movie" | "series";

export type StoredAlias = {
  aliasNorm: string;
  kind: AliasKind;
  code: string;
  hits: number;
};

/** Qo'lda qo'shilgan alias darhol ishlashi uchun hits qiymati. */
export const MANUAL_ALIAS = 100;

/** Qidiruv katalogi va alias (search_aliases) uchun saqlash qatlami. */
export function createSearchStore(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_aliases (
      alias_norm TEXT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      hits INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (alias_norm, kind, code)
    );
  `);

  function listSearchCatalog(): {
    movies: Array<{ code: string; title: string; genres: string[] }>;
    series: Array<{ code: string; title: string }>;
  } {
    const movies = (
      db
        .prepare(
          `SELECT movies.code, movies.title,
                  GROUP_CONCAT(genres.name, char(31)) AS genres
           FROM movies
           LEFT JOIN movie_genres ON movie_genres.movie_id = movies.id
           LEFT JOIN genres ON genres.id = movie_genres.genre_id
           GROUP BY movies.id`,
        )
        .all() as Row[]
    ).map((row) => ({
      code: String(row.code),
      title: String(row.title),
      genres: row.genres ? String(row.genres).split("\u001f") : [],
    }));
    const series = (
      db.prepare("SELECT code, title FROM series").all() as Row[]
    ).map((row) => ({ code: String(row.code), title: String(row.title) }));
    return { movies, series };
  }

  function mapAlias(row: Row): StoredAlias {
    return {
      aliasNorm: String(row.alias_norm),
      kind: String(row.kind) as AliasKind,
      code: String(row.code),
      hits: Number(row.hits),
    };
  }

  function listAliases(): StoredAlias[] {
    return (
      db
        .prepare("SELECT alias_norm, kind, code, hits FROM search_aliases")
        .all() as Row[]
    ).map(mapAlias);
  }

  function listAliasesForCode(kind: AliasKind, code: string): StoredAlias[] {
    return (
      db
        .prepare(
          `SELECT alias_norm, kind, code, hits FROM search_aliases
           WHERE kind = ? AND code = ? ORDER BY alias_norm`,
        )
        .all(kind, code) as Row[]
    ).map(mapAlias);
  }

  /** Alias qo'shadi yoki hits ni belgilangan qiymatga (odatda MANUAL_ALIAS) ko'taradi. */
  function setAlias(
    aliasNorm: string,
    kind: AliasKind,
    code: string,
    hits = MANUAL_ALIAS,
  ): void {
    db.prepare(
      `INSERT INTO search_aliases (alias_norm, kind, code, hits)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(alias_norm, kind, code)
       DO UPDATE SET hits = excluded.hits, updated_at = CURRENT_TIMESTAMP`,
    ).run(aliasNorm, kind, code, hits);
  }

  /** Foydalanuvchi tanlovi: hits ni 1 ga oshiradi (yo'q bo'lsa 1 dan boshlaydi). */
  function bumpAlias(aliasNorm: string, kind: AliasKind, code: string): number {
    db.prepare(
      `INSERT INTO search_aliases (alias_norm, kind, code, hits)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(alias_norm, kind, code)
       DO UPDATE SET hits = hits + 1, updated_at = CURRENT_TIMESTAMP`,
    ).run(aliasNorm, kind, code);
    const row = db
      .prepare(
        "SELECT hits FROM search_aliases WHERE alias_norm = ? AND kind = ? AND code = ?",
      )
      .get(aliasNorm, kind, code) as Row;
    return Number(row.hits);
  }

  function removeAlias(aliasNorm: string, kind: AliasKind, code: string): boolean {
    const result = db
      .prepare(
        "DELETE FROM search_aliases WHERE alias_norm = ? AND kind = ? AND code = ?",
      )
      .run(aliasNorm, kind, code);
    return Number(result.changes) > 0;
  }

  return {
    listSearchCatalog,
    listAliases,
    listAliasesForCode,
    setAlias,
    bumpAlias,
    removeAlias,
  };
}

export type SearchStore = ReturnType<typeof createSearchStore>;
