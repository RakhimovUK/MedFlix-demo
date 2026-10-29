/**
 * Mini post (synopsis): kino/serial haqida qisqa matn.
 *
 * Admin matnni yuboradi (/synopsis KOD | matn) -> "draft". Admin ✅ bosgandan keyingina
 * "approved" bo'ladi va foydalanuvchilarga "ℹ️ Haqida" tugmasi chiqadi.
 * Matn kino/serial qatoriga (id) bog'langan, shuning uchun har til uchun alohida.
 */
import type { DatabaseSync } from "node:sqlite";

export type SynopsisKind = "movie" | "series";
export type SynopsisStatus = "draft" | "approved";
export type Synopsis = { kind: SynopsisKind; contentId: number; text: string; status: SynopsisStatus };

export const SYNOPSIS_MAX = 3500;

const KIND_CHAR: Record<SynopsisKind, string> = { movie: "m", series: "s" };
const CHAR_KIND: Record<string, SynopsisKind> = { m: "movie", s: "series" };

export function createSynopsisStore(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synopses (
      kind TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, content_id)
    );
  `);

  function get(kind: SynopsisKind, contentId: number): Synopsis | null {
    const row = db
      .prepare("SELECT text, status FROM synopses WHERE kind = ? AND content_id = ?")
      .get(kind, contentId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      kind,
      contentId,
      text: String(row.text),
      status: row.status === "approved" ? "approved" : "draft",
    };
  }

  return {
    get,
    /** Faqat tasdiqlangan matn (foydalanuvchiga ko'rsatish uchun). */
    getApproved(kind: SynopsisKind, contentId: number): string | null {
      const item = get(kind, contentId);
      return item && item.status === "approved" ? item.text : null;
    },
    /** Yangi matn har doim qoralama bo'lib saqlanadi (qayta tasdiq kerak). */
    saveDraft(kind: SynopsisKind, contentId: number, text: string): void {
      db.prepare(
        `INSERT INTO synopses (kind, content_id, text, status) VALUES (?, ?, ?, 'draft')
         ON CONFLICT(kind, content_id) DO UPDATE SET
           text = excluded.text, status = 'draft', updated_at = CURRENT_TIMESTAMP`,
      ).run(kind, contentId, text.trim().slice(0, SYNOPSIS_MAX));
    },
    approve(kind: SynopsisKind, contentId: number): boolean {
      const result = db
        .prepare(
          "UPDATE synopses SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE kind = ? AND content_id = ?",
        )
        .run(kind, contentId);
      return Number(result.changes) > 0;
    },
    remove(kind: SynopsisKind, contentId: number): boolean {
      const result = db
        .prepare("DELETE FROM synopses WHERE kind = ? AND content_id = ?")
        .run(kind, contentId);
      return Number(result.changes) > 0;
    },
  };
}

export type SynopsisStore = ReturnType<typeof createSynopsisStore>;

/** "about:m:12" — foydalanuvchi "Haqida" tugmasi. */
export function aboutCallback(kind: SynopsisKind, contentId: number): string {
  return `about:${KIND_CHAR[kind]}:${contentId}`;
}

/** "syn:ok:m:12" / "syn:no:m:12" — admin tasdiqlash tugmalari. */
export function reviewCallback(action: "ok" | "no", kind: SynopsisKind, contentId: number): string {
  return `syn:${action}:${KIND_CHAR[kind]}:${contentId}`;
}

export function parseAboutData(data: string): { kind: SynopsisKind; contentId: number } | null {
  const match = /^about:([ms]):(\d{1,12})$/u.exec(data);
  if (!match) return null;
  return { kind: CHAR_KIND[match[1]!]!, contentId: Number(match[2]) };
}

export function parseReviewData(
  data: string,
): { action: "ok" | "no"; kind: SynopsisKind; contentId: number } | null {
  const match = /^syn:(ok|no):([ms]):(\d{1,12})$/u.exec(data);
  if (!match) return null;
  return {
    action: match[1] as "ok" | "no",
    kind: CHAR_KIND[match[2]!]!,
    contentId: Number(match[3]),
  };
}

export function buildAboutText(title: string, text: string): string {
  return `${title.slice(0, 200)}\n\n${text}`.slice(0, 4096);
}
