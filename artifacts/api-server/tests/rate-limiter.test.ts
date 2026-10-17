import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "../src/bot/rate-limiter.ts";

function setup() {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 10_000, maxInWindow: 3, blockMs: 20_000, now: () => t });
  return { limiter, advance: (ms: number) => { t += ms; } };
}

test("chegaragacha ok, oshganda bir marta warn, keyin blok davomida drop", () => {
  const { limiter } = setup();
  assert.deepEqual([1, 2, 3].map(() => limiter.check("u")), ["ok", "ok", "ok"]);
  assert.equal(limiter.check("u"), "warn");
  assert.deepEqual([1, 2, 3].map(() => limiter.check("u")), ["drop", "drop", "drop"]);
});

test("blok tugagach yana ok", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 4; i++) limiter.check("u");
  advance(19_000);
  assert.equal(limiter.check("u"), "drop");
  advance(1_500);
  assert.equal(limiter.check("u"), "ok");
});

test("sekin yuborgan foydalanuvchi hech qachon cheklanmaydi (oyna suriladi)", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 20; i++) {
    assert.equal(limiter.check("u"), "ok");
    advance(4_000);
  }
});

test("foydalanuvchilar bir-biriga ta'sir qilmaydi", () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.check("spam");
  assert.equal(limiter.check("spam"), "drop");
  assert.equal(limiter.check("oddiy"), "ok");
});

test("xotira: faol bo'lmagan yozuvlar tozalanadi", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 100; i++) limiter.check("u" + i);
  assert.equal(limiter.size(), 100);
  advance(60_000);
  for (let i = 0; i < 500; i++) limiter.check("faol");
  assert.ok(limiter.size() < 100);
});
