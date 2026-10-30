import assert from "node:assert/strict";
import test from "node:test";
import {
  alertKey,
  createAlertThrottle,
  formatAlert,
  isIgnorableTelegramError,
} from "../src/bot/alerts.ts";

test("bir xil xato cooldown ichida bir marta, keyin yana ruxsat", () => {
  let t = 0;
  const th = createAlertThrottle({ cooldownMs: 1000, now: () => t });
  assert.equal(th.allow("a"), true);
  assert.equal(th.allow("a"), false);
  assert.equal(th.allow("b"), true);
  t = 1500;
  assert.equal(th.allow("a"), true);
});

test("soatiga umumiy chegara", () => {
  let t = 0;
  const th = createAlertThrottle({ cooldownMs: 0, maxPerHour: 3, now: () => t });
  assert.deepEqual([1, 2, 3, 4].map((i) => th.allow("k" + i)), [true, true, true, false]);
  t = 61 * 60 * 1000;
  assert.equal(th.allow("k5"), true);
});

test("oddiy Telegram holatlari e'tiborsiz, haqiqiy xato yo'q", () => {
  assert.equal(isIgnorableTelegramError(new Error("Forbidden: bot was blocked by the user")), true);
  assert.equal(isIgnorableTelegramError(new Error("Bad Request: message is not modified")), true);
  assert.equal(isIgnorableTelegramError(new Error("boom")), false);
});

test("kalit raqamlardan mustaqil, xabar qisqartiriladi va vaqt UTC", () => {
  assert.equal(alertKey("S", new Error("fail 123")), alertKey("S", new Error("fail 456")));
  const text = formatAlert("Manba", new Error("x".repeat(1000)), new Date("2026-01-02T03:04:05Z"));
  assert.ok(text.includes("2026-01-02 03:04:05 UTC"));
  assert.ok(text.split("\n")[2]!.length < 320);
});

test("vaqtinchalik tarmoq xatolari taniladi, haqiqiy xato emas", async () => {
  const { isTransientNetworkError } = await import("../src/bot/alerts.ts");
  const fetchFailed = new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) });
  assert.equal(isTransientNetworkError(fetchFailed), true);
  assert.equal(isTransientNetworkError(new Error("Telegram API error: 502")), true);
  assert.equal(isTransientNetworkError(new DOMException("The operation timed out.", "TimeoutError")), true);
  assert.equal(isTransientNetworkError(new Error("Unauthorized")), false);
  assert.equal(isTransientNetworkError(new Error("Conflict: terminated by other getUpdates request")), false);
  assert.ok(formatAlert("S", fetchFailed).includes("fetch failed (ECONNRESET)"));
});

test("uzilish kuzatuvchisi: qisqa uzilishda jim, uzoq bo'lsa bir marta, keyin tiklandi", async () => {
  const { createOutageTracker } = await import("../src/bot/alerts.ts");
  let t = 0;
  const tr = createOutageTracker({ graceMs: 1000, now: () => t });
  assert.equal(tr.failure(), undefined);
  t = 500;
  assert.equal(tr.success(), undefined); // qisqa uzilish — xabar yo'q
  t = 1000;
  assert.equal(tr.failure(), undefined);
  t = 2500;
  assert.equal(tr.failure(), 1500);
  t = 3000;
  assert.equal(tr.failure(), undefined); // takror yo'q
  t = 4000;
  assert.equal(tr.success(), 3000);
  assert.equal(tr.failing, false);
});
