/**
 * Avto-o'rganish: foydalanuvchi imlo xatosi bilan qidirib, "Shuni nazarda tutdingizmi?"
 * ro'yxatidan birini bosganda, shu so'rov o'sha kino bilan bog'lanadi (alias hits +1).
 */

export type LearnKind = "movie" | "series";

type Remembered = { queryNorm: string; keys: Set<string>; expiresAt: number };

export function createAliasLearner(deps: {
  bump: (aliasNorm: string, kind: LearnKind, code: string) => number;
  ttlMs?: number;
  now?: () => number;
}) {
  const ttl = deps.ttlMs ?? 10 * 60 * 1000;
  const now = deps.now ?? Date.now;
  const lastSearches = new Map<number, Remembered>();

  /** Imlo xatosi (fuzzy) natijalari ko'rsatilganda chaqiriladi. */
  function remember(userId: number, queryNorm: string, keys: string[]): void {
    if (!queryNorm || keys.length === 0) {
      lastSearches.delete(userId);
      return;
    }
    lastSearches.set(userId, {
      queryNorm,
      keys: new Set(keys),
      expiresAt: now() + ttl,
    });
  }

  function forget(userId: number): void {
    lastSearches.delete(userId);
  }

  /** Natija tugmasi bosilganda. Bog'langan bo'lsa true (bir qidiruv uchun bir marta). */
  function onSelect(userId: number, kind: LearnKind, code: string): boolean {
    const entry = lastSearches.get(userId);
    if (!entry) return false;
    if (entry.expiresAt < now()) {
      lastSearches.delete(userId);
      return false;
    }
    if (!entry.keys.has(`${kind}:${code}`)) return false;
    lastSearches.delete(userId);
    deps.bump(entry.queryNorm, kind, code);
    return true;
  }

  return { remember, forget, onSelect };
}

export type AliasLearner = ReturnType<typeof createAliasLearner>;
