/**
 * Yangilanishlarni parallel qayta ishlash: bir chatdagi vazifalar tartib bilan
 * (ketma-ket), turli chatlarniki esa bir vaqtda bajariladi.
 */
export function createKeyedQueue(
  opts: { maxConcurrent?: number; onError?: (err: unknown) => void } = {},
) {
  const maxConcurrent = Math.max(1, opts.maxConcurrent ?? 10);
  const tails = new Map<string, Promise<void>>();
  const slotWaiters: Array<() => void> = [];
  const capacityWaiters: Array<{ max: number; resolve: () => void }> = [];
  let running = 0;
  let pending = 0;

  async function acquire(): Promise<void> {
    if (running < maxConcurrent) {
      running += 1;
      return;
    }
    await new Promise<void>((resolve) => slotWaiters.push(resolve));
  }

  function release(): void {
    const next = slotWaiters.shift();
    if (next) {
      next();
    } else {
      running -= 1;
    }
  }

  function notifyCapacity(): void {
    for (let i = capacityWaiters.length - 1; i >= 0; i -= 1) {
      const waiter = capacityWaiters[i]!;
      if (pending < waiter.max) {
        capacityWaiters.splice(i, 1);
        waiter.resolve();
      }
    }
  }

  function run(key: string, task: () => Promise<void>): Promise<void> {
    pending += 1;
    const previous = tails.get(key) ?? Promise.resolve();
    const current: Promise<void> = previous
      .then(async () => {
        await acquire();
        try {
          await task();
        } catch (err: unknown) {
          try {
            opts.onError?.(err);
          } catch {
            // xato ishlovchisi ham yiqilsa, navbat to'xtamasligi kerak
          }
        } finally {
          release();
        }
      })
      .then(() => {
        pending -= 1;
        if (tails.get(key) === current) {
          tails.delete(key);
        }
        notifyCapacity();
      });
    tails.set(key, current);
    return current;
  }

  function waitForCapacity(max: number): Promise<void> {
    if (pending < max) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => capacityWaiters.push({ max, resolve }));
  }

  return { run, waitForCapacity, pendingCount: () => pending };
}
