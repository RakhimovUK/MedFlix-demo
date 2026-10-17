export type RateDecision = "ok" | "warn" | "drop";

type RateOptions = {
  windowMs?: number;
  maxInWindow?: number;
  blockMs?: number;
  now?: () => number;
};

type State = { hits: number[]; blockedUntil: number };

/** Foydalanuvchi bo'yicha oddiy surilma-oyna cheklovi. */
export function createRateLimiter(options: RateOptions = {}) {
  const windowMs = options.windowMs ?? 10_000;
  const maxInWindow = options.maxInWindow ?? 12;
  const blockMs = options.blockMs ?? 20_000;
  const now = options.now ?? Date.now;
  const states = new Map<string, State>();
  let checks = 0;

  function prune(t: number): void {
    for (const [key, state] of states) {
      const idle = state.blockedUntil <= t && state.hits.every((h) => t - h >= windowMs);
      if (idle) {
        states.delete(key);
      }
    }
  }

  return {
    /** "ok" — qabul; "warn" — chegara endi oshdi (bir marta ogohlantirish); "drop" — blok davomida. */
    check(key: string): RateDecision {
      const t = now();
      checks += 1;
      if (checks % 500 === 0) {
        prune(t);
      }

      const state = states.get(key) ?? { hits: [], blockedUntil: 0 };
      states.set(key, state);

      if (state.blockedUntil > t) {
        return "drop";
      }

      state.hits = state.hits.filter((hit) => t - hit < windowMs);
      state.hits.push(t);
      if (state.hits.length > maxInWindow) {
        state.blockedUntil = t + blockMs;
        state.hits = [];
        return "warn";
      }
      return "ok";
    },
    size(): number {
      return states.size;
    },
  };
}
