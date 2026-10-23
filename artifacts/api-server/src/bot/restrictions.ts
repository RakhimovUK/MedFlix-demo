import type { DatabaseSync } from "node:sqlite";

export type RestrictedUser = { user_id: number; note: string; created_at: string };

export type RestrictionStore = {
  isRestricted(userId: number): boolean;
  restrict(userId: number, note: string): void;
  unrestrict(userId: number): boolean;
  list(): RestrictedUser[];
};

/** Cheklangan foydalanuvchilar ro'yxati (ban emas: bot ishlashda davom etadi, faqat nusxa/forward/saqlash yopiladi). */
export function createRestrictionStore(db: DatabaseSync): RestrictionStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restricted_users (
      user_id INTEGER PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const findStatement = db.prepare("SELECT 1 FROM restricted_users WHERE user_id = ?");
  const upsertStatement = db.prepare(
    "INSERT INTO restricted_users (user_id, note) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET note = excluded.note",
  );
  const deleteStatement = db.prepare("DELETE FROM restricted_users WHERE user_id = ?");
  const listStatement = db.prepare(
    "SELECT user_id, note, created_at FROM restricted_users ORDER BY user_id",
  );

  return {
    isRestricted: (userId) => findStatement.get(userId) !== undefined,
    restrict: (userId, note) => {
      upsertStatement.run(userId, note);
    },
    unrestrict: (userId) => Number(deleteStatement.run(userId).changes) > 0,
    list: () => listStatement.all() as unknown as RestrictedUser[],
  };
}

/** Foydalanuvchi cheklangan bo'lsa copyMessage'ga qo'shiladigan parametr, aks holda bo'sh. */
export function protectOptionsFor(
  store: RestrictionStore,
  chatId: number | string,
): { protect_content?: true } {
  const id = typeof chatId === "number" ? chatId : Number(chatId);
  return Number.isSafeInteger(id) && store.isRestricted(id) ? { protect_content: true } : {};
}

/** "123456 izoh" -> { userId, note }. Noto'g'ri bo'lsa null. */
export function parseRestrictArgs(args: string): { userId: number; note: string } | null {
  const [idPart, ...rest] = args.trim().split(/\s+/);
  if (!idPart || !/^\d+$/.test(idPart)) {
    return null;
  }
  const userId = Number(idPart);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }
  return { userId, note: rest.join(" ") };
}
