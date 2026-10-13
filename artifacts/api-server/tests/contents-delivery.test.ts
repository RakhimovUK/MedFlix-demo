import assert from "node:assert/strict";
import test from "node:test";
import { copyContentsPosts } from "../src/bot/contents-delivery.ts";

const refs = [22, 23, 24, 25, 26].map((messageId) => ({ chatId: "-100", messageId }));

test("faqat ishlatilgan sahifalar soni nusxalanadi, tartib saqlanadi", async () => {
  const copied: number[] = [];
  const result = await copyContentsPosts({
    refs,
    pageCount: 2,
    copy: async (ref) => void copied.push(ref.messageId),
  });
  assert.deepEqual(copied, [22, 23]);
  assert.deepEqual(result, { sent: 2, failed: 0 });
});

test("kamida bitta post yuboriladi va struktura posti o'tkazib yuboriladi", async () => {
  const copied: number[] = [];
  await copyContentsPosts({
    refs,
    pageCount: 0,
    copy: async (ref) => void copied.push(ref.messageId),
  });
  assert.deepEqual(copied, [22]);

  const skipped: number[] = [];
  const result = await copyContentsPosts({
    refs,
    pageCount: 3,
    exclude: { chatId: "-100", messageId: 23 },
    copy: async (ref) => void skipped.push(ref.messageId),
  });
  assert.deepEqual(skipped, [22, 24]);
  assert.equal(result.sent, 2);
});

test("o'chirilgan post xatosi qolganlarini to'xtatmaydi", async () => {
  const errors: number[] = [];
  const copied: number[] = [];
  const result = await copyContentsPosts({
    refs,
    pageCount: 3,
    copy: async (ref) => {
      if (ref.messageId === 23) throw new Error("message to copy not found");
      copied.push(ref.messageId);
    },
    onError: (ref) => void errors.push(ref.messageId),
  });
  assert.deepEqual(copied, [22, 24]);
  assert.deepEqual(errors, [23]);
  assert.deepEqual(result, { sent: 2, failed: 1 });
});

test("hamma post xato bersa sent=0 qaytadi (bot yiqilmaydi)", async () => {
  const result = await copyContentsPosts({
    refs,
    pageCount: 2,
    copy: async () => {
      throw new Error("chat not found");
    },
  });
  assert.deepEqual(result, { sent: 0, failed: 2 });
});
