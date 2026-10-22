import type { DatabaseSync } from "node:sqlite";

export type MovieRequestStatus = "pending" | "approved" | "rejected";

export type MovieRequest = {
  id: number;
  userId: number;
  userName: string;
  query: string;
  queryNorm: string;
  status: MovieRequestStatus;
  adminNote: string | null;
  resolvedBy: number | null;
  groupChatId: string | null;
  groupMessageId: number | null;
  threadId: number | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

function mapRequest(row: Row): MovieRequest {
  const nullableNumber = (value: unknown) =>
    value === null || value === undefined ? null : Number(value);
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: String(row.user_name ?? ""),
    query: String(row.query),
    queryNorm: String(row.query_norm),
    status: String(row.status) as MovieRequestStatus,
    adminNote: row.admin_note === null ? null : String(row.admin_note ?? "") || null,
    resolvedBy: nullableNumber(row.resolved_by),
    groupChatId: row.group_chat_id === null ? null : String(row.group_chat_id ?? "") || null,
    groupMessageId: nullableNumber(row.group_message_id),
    threadId: nullableNumber(row.thread_id),
    createdAt: String(row.created_at),
  };
}

/** Foydalanuvchi so'rovlari (movie_requests) saqlash qatlami. */
export function createRequestsStore(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS movie_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      query TEXT NOT NULL,
      query_norm TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      resolved_by INTEGER,
      group_chat_id TEXT,
      group_message_id INTEGER,
      thread_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_movie_requests_user
      ON movie_requests (user_id, created_at);
  `);

  function createRequest(input: {
    userId: number;
    userName: string;
    query: string;
    queryNorm: string;
  }): { request: MovieRequest; duplicate: boolean } {
    const existing = db
      .prepare(
        `SELECT * FROM movie_requests
         WHERE user_id = ? AND query_norm = ? AND status = 'pending'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(input.userId, input.queryNorm) as Row | undefined;
    if (existing) {
      return { request: mapRequest(existing), duplicate: true };
    }
    const result = db
      .prepare(
        `INSERT INTO movie_requests (user_id, user_name, query, query_norm)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.userId, input.userName, input.query, input.queryNorm);
    const row = db
      .prepare("SELECT * FROM movie_requests WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as Row;
    return { request: mapRequest(row), duplicate: false };
  }

  function getRequest(id: number): MovieRequest | null {
    const row = db
      .prepare("SELECT * FROM movie_requests WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? mapRequest(row) : null;
  }

  function getRequestByGroupMessage(
    groupChatId: string,
    groupMessageId: number,
  ): MovieRequest | null {
    const row = db
      .prepare(
        "SELECT * FROM movie_requests WHERE group_chat_id = ? AND group_message_id = ?",
      )
      .get(groupChatId, groupMessageId) as Row | undefined;
    return row ? mapRequest(row) : null;
  }

  function setRequestMessage(
    id: number,
    groupChatId: string,
    groupMessageId: number,
    threadId: number | null,
  ): void {
    db.prepare(
      `UPDATE movie_requests
       SET group_chat_id = ?, group_message_id = ?, thread_id = ?
       WHERE id = ?`,
    ).run(groupChatId, groupMessageId, threadId, id);
  }

  /** Faqat kutilayotgan (pending) so'rovni hal qiladi; ikkinchi marta bosilsa false. */
  function resolveRequest(
    id: number,
    status: "approved" | "rejected",
    adminId: number,
  ): boolean {
    const result = db
      .prepare(
        `UPDATE movie_requests
         SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
      )
      .run(status, adminId, id);
    return Number(result.changes) > 0;
  }

  function saveRequestNote(id: number, note: string): void {
    db.prepare("UPDATE movie_requests SET admin_note = ? WHERE id = ?").run(note, id);
  }

  function countRecentRequests(userId: number, hours = 24): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total FROM movie_requests
         WHERE user_id = ? AND created_at >= datetime('now', ?)`,
      )
      .get(userId, `-${hours} hours`) as Row;
    return Number(row.total);
  }

  return {
    createRequest,
    getRequest,
    getRequestByGroupMessage,
    setRequestMessage,
    resolveRequest,
    saveRequestNote,
    countRecentRequests,
  };
}

export type RequestsStore = ReturnType<typeof createRequestsStore>;
