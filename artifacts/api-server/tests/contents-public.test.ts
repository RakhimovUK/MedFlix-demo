import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredPostRefs } from "../src/bot/contents-delivery.ts";

test("saqlangan ro'yxat: to'g'ri JSON o'qiladi, noto'g'ri elementlar tashlanadi", () => {
  const raw = JSON.stringify([
    { chatId: "@pub", messageId: 5 },
    { chatId: "-1001", messageId: 6 },
    { chatId: 7, messageId: 8 },
    { chatId: "@x", messageId: 1.5 },
    "xato",
  ]);
  assert.deepEqual(parseStoredPostRefs(raw), [
    { chatId: "@pub", messageId: 5 },
    { chatId: "-1001", messageId: 6 },
  ]);
});

test("sozlama yo'q yoki buzuq bo'lsa null, '[]' esa ataylab o'chirilgan", () => {
  assert.equal(parseStoredPostRefs(null), null);
  assert.equal(parseStoredPostRefs(""), null);
  assert.equal(parseStoredPostRefs("{buzuq"), null);
  assert.equal(parseStoredPostRefs('{"a":1}'), null);
  assert.deepEqual(parseStoredPostRefs("[]"), []);
});
