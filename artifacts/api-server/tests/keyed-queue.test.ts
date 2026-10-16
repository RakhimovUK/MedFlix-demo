import assert from "node:assert/strict";
import test from "node:test";
import { createKeyedQueue } from "../src/bot/keyed-queue.ts";

const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("bir chat vazifalari tartib bilan, ketma-ket bajariladi", async () => {
  const queue = createKeyedQueue();
  const order: string[] = [];
  const a = queue.run("1", async () => {
    await tick(20);
    order.push("a");
  });
  const b = queue.run("1", async () => {
    order.push("b");
  });
  await Promise.all([a, b]);
  assert.deepEqual(order, ["a", "b"]);
});

test("turli chatlar parallel ishlaydi", async () => {
  const queue = createKeyedQueue();
  const events: string[] = [];
  const slow = queue.run("1", async () => {
    events.push("slow:start");
    await tick(30);
    events.push("slow:end");
  });
  const fast = queue.run("2", async () => {
    events.push("fast");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(events, ["slow:start", "fast", "slow:end"]);
});

test("bir vaqtdagi vazifalar soni cheklanadi", async () => {
  const queue = createKeyedQueue({ maxConcurrent: 2 });
  let active = 0;
  let peak = 0;
  const jobs = ["a", "b", "c", "d", "e"].map((key) =>
    queue.run(key, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(10);
      active -= 1;
    }),
  );
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.equal(queue.pendingCount(), 0);
});

test("xato navbatni buzmaydi va onError chaqiriladi", async () => {
  const errors: string[] = [];
  const queue = createKeyedQueue({ onError: (err) => void errors.push(String(err)) });
  const done: string[] = [];
  await Promise.all([
    queue.run("1", async () => {
      throw new Error("boom");
    }),
    queue.run("1", async () => {
      done.push("keyingisi");
    }),
  ]);
  assert.equal(errors.length, 1);
  assert.deepEqual(done, ["keyingisi"]);
});

test("waitForCapacity navbat kamayganda ochiladi", async () => {
  const queue = createKeyedQueue({ maxConcurrent: 1 });
  const jobs = [1, 2, 3].map((n) => queue.run(String(n), async () => tick(10)));
  assert.equal(queue.pendingCount(), 3);
  await queue.waitForCapacity(2);
  assert.ok(queue.pendingCount() < 2);
  await Promise.all(jobs);
});
