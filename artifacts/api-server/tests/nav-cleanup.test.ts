import assert from "node:assert/strict";
import test from "node:test";
import { createNavCleanup, shouldCleanup } from "../src/bot/nav-cleanup.ts";

function setup() {
  const deleted: Array<[number, number]> = [];
  const nav = createNavCleanup(async (chatId, messageId) => {
    deleted.push([chatId, messageId]);
  });
  return { nav, deleted };
}

test("yangi xabar yuborilsa tugma turgan va eski sahifalar o'chadi", async () => {
  const { nav, deleted } = setup();
  nav.track(1, 10);
  nav.track(1, 11);
  await nav.run(1, 12, async () => {
    nav.noteSent(1);
  });
  assert.deepEqual(deleted.map((d) => d[1]).sort(), [10, 11, 12]);
});

test("yangi xabar yuborilmasa hech narsa o'chmaydi, sahifalar saqlanadi", async () => {
  const { nav, deleted } = setup();
  nav.track(1, 10);
  await nav.run(1, 12, async () => {});
  assert.deepEqual(deleted, []);
  await nav.run(1, 13, async () => nav.noteSent(1));
  assert.deepEqual(deleted.map((d) => d[1]).sort(), [10, 13]);
});

test("xato bo'lsa qayta tashlanadi va hech narsa o'chmaydi", async () => {
  const { nav, deleted } = setup();
  nav.track(1, 10);
  await assert.rejects(
    nav.run(1, 12, async () => {
      nav.noteSent(1);
      throw new Error("boom");
    }),
  );
  assert.deepEqual(deleted, []);
});

test("action ichida kuzatilgan yangi sahifalar o'chmaydi", async () => {
  const { nav, deleted } = setup();
  await nav.run(1, 12, async () => {
    nav.noteSent(1);
    nav.track(1, 20);
  });
  assert.deepEqual(deleted.map((d) => d[1]), [12]);
  await nav.run(1, 21, async () => nav.noteSent(1));
  assert.deepEqual(deleted.map((d) => d[1]).sort(), [12, 20, 21]);
});

test("o'chirish xatosi e'tiborga olinmaydi, chatlar alohida", async () => {
  const calls: number[] = [];
  const nav = createNavCleanup(async (_chatId, messageId) => {
    calls.push(messageId);
    throw new Error("message to delete not found");
  });
  nav.track(2, 5);
  await nav.run(1, 9, async () => nav.noteSent(1));
  assert.deepEqual(calls, [9]);
  assert.equal(shouldCleanup("season:abc:1"), true);
  assert.equal(shouldCleanup("eps:5"), true);
  assert.equal(shouldCleanup("catalog"), false);
  assert.equal(shouldCleanup("subscription:check"), false);
});
