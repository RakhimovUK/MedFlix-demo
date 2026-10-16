import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { classifySendError, runBroadcast } from "../src/bot/broadcast.ts";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-bc-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

test("xato turlari to'g'ri aniqlanadi", () => {
  assert.deepEqual(classifySendError("Forbidden: bot was blocked by the user"), { kind: "blocked" });
  assert.deepEqual(classifySendError("Too Many Requests: retry after 7"), { kind: "retry", seconds: 7 });
  assert.deepEqual(classifySendError("Bad Request: something"), { kind: "other" });
});

test("tarqatish: yuborilgan, bloklagan va xatolar hisoblanadi, to'xtamaydi", async () => {
  const sent: number[] = [];
  const sleeps: number[] = [];
  const result = await runBroadcast({
    recipients: [1, 2, 3, 4],
    send: async (id) => {
      if (id === 2) throw new Error("Forbidden: bot was blocked by the user");
      if (id === 3) throw new Error("Bad Request: boom");
      sent.push(id);
    },
    sleep: async (ms) => void sleeps.push(ms),
  });
  assert.deepEqual(sent, [1, 4]);
  assert.deepEqual(result, { total: 4, sent: 2, blocked: 1, failed: 1, blockedIds: [2] });
  assert.equal(sleeps.length, 4);
});

test("429 bo'lsa kutib, bir marta qayta urinadi", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await runBroadcast({
    recipients: [9],
    send: async () => {
      calls += 1;
      if (calls === 1) throw new Error("Too Many Requests: retry after 2");
    },
    sleep: async (ms) => void sleeps.push(ms),
  });
  assert.equal(calls, 2);
  assert.equal(result.sent, 1);
  assert.ok(sleeps.includes(2500));
});

test("bazada: bloklanganlar ro'yxatdan chiqadi, qaytsa tiklanadi", () => {
  db.touchBotUser(101);
  db.touchBotUser(102);
  db.touchBotUser(103);
  db.markBotUserBlocked([102]);
  assert.deepEqual(db.listBroadcastRecipients().sort(), [101, 103]);
  db.touchBotUser(102);
  assert.deepEqual(db.listBroadcastRecipients().sort(), [101, 102, 103]);
});
