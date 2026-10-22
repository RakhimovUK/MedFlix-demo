import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createRequestsStore } from "../src/bot/requests-store.ts";
import {
  buildRequestKeyboard,
  buildRequestText,
  createRequestFlow,
  parseRequestCallback,
} from "../src/bot/request-flow.ts";

type Call = { method: string; body: Record<string, unknown> };

function setup(
  options: { failGroup?: boolean; failUsers?: number[]; limit?: number; noTarget?: boolean } = {},
) {
  const db = new DatabaseSync(":memory:");
  const store = createRequestsStore(db);
  const calls: Call[] = [];
  let nextMessageId = 500;
  const flow = createRequestFlow({
    api: async <T>(method: string, body: Record<string, unknown>) => {
      calls.push({ method, body });
      if (method === "sendMessage") {
        if (options.failGroup && body.chat_id === "-100999") throw new Error("chat not found");
        if (options.failUsers?.includes(Number(body.chat_id))) {
          throw new Error("Forbidden: bot was blocked by the user");
        }
        return { message_id: nextMessageId++ } as T;
      }
      return true as T;
    },
    store,
    target: options.noTarget ? null : { chatId: "-100999", threadId: 109 },
    adminIds: () => ["1", "2"],
    isAdmin: (id) => id === 1 || id === 2,
    dailyLimit: options.limit,
  });
  return { db, store, calls, flow };
}

const sent = (calls: Call[], chatId: unknown) =>
  calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === chatId);

test("so'rov guruh topiciga ✅/❌/💬 tugmalari bilan yuboriladi va xabar id saqlanadi", async () => {
  const { store, calls, flow } = setup();
  const result = await flow.submit({ userId: 77, userName: "Ali (@ali)", query: "Oltin qollar", queryNorm: "oltin qollar" });
  assert.equal(result.status, "created");
  const groupMsg = sent(calls, "-100999")[0]!;
  assert.equal(groupMsg.body.message_thread_id, 109);
  const buttons = (groupMsg.body.reply_markup as ReturnType<typeof buildRequestKeyboard>).inline_keyboard.flat();
  assert.deepEqual(buttons.map((b) => b.callback_data), ["rq:ok:1", "rq:no:1", "rq:cm:1"]);
  assert.deepEqual(buttons.map((b) => b.text), ["✅ Qo‘shildi", "❌ Rad etish", "💬 Izoh"]);
  assert.match(String(groupMsg.body.text), /#1/);
  const saved = store.getRequest(1)!;
  assert.equal(saved.groupMessageId, 500);
  assert.equal(saved.threadId, 109);
});

test("bir xil so'rov ikki marta yuborilmaydi (duplicate), kunlik limit ishlaydi", async () => {
  const { flow } = setup({ limit: 2 });
  const input = { userId: 5, userName: "U", query: "abc kino", queryNorm: "abc kino" };
  assert.equal((await flow.submit(input)).status, "created");
  assert.equal((await flow.submit(input)).status, "duplicate");
  assert.equal((await flow.submit({ ...input, query: "boshqa", queryNorm: "boshqa" })).status, "created");
  assert.equal((await flow.submit({ ...input, query: "uchinchi", queryNorm: "uchinchi" })).status, "limited");
});

test("guruhga yuborib bo'lmasa adminlarga shaxsiy yuboriladi", async () => {
  const { calls, flow } = setup({ failGroup: true });
  const result = await flow.submit({ userId: 9, userName: "X", query: "kino", queryNorm: "kino" });
  assert.deepEqual(result, { status: "created", id: 1, delivered: true });
  assert.equal(sent(calls, "1").length, 1);
  assert.equal(sent(calls, "2").length, 1);
});

test("✅ Qo'shildi: foydalanuvchiga xabar, xabar tahrirlanadi, ikkinchi bosish rad etiladi", async () => {
  const { store, calls, flow } = setup();
  await flow.submit({ userId: 77, userName: "Ali", query: "Kino X", queryNorm: "kino x" });
  const click = { id: "cb1", fromId: 1, fromName: "Admin1", data: "rq:ok:1", chatId: "-100999", messageId: 500, threadId: 109 };
  assert.equal(await flow.handleCallback(click), true);
  assert.equal(store.getRequest(1)!.status, "approved");
  assert.match(String(sent(calls, 77)[0]!.body.text), /qo‘shildi/);
  const edit = calls.find((c) => c.method === "editMessageText")!;
  assert.match(String(edit.body.text), /Qo‘shildi — Admin1/);
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });

  await flow.handleCallback({ ...click, id: "cb2" });
  assert.equal(sent(calls, 77).length, 1);
  const last = calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!;
  assert.match(String(last.body.text), /allaqachon/);
});

test("❌ rad etish foydalanuvchiga yetadi; admin bo'lmagan bosa rad etiladi", async () => {
  const { store, calls, flow } = setup();
  await flow.submit({ userId: 77, userName: "Ali", query: "Kino Y", queryNorm: "kino y" });
  await flow.handleCallback({ id: "c1", fromId: 999, fromName: "Kimdir", data: "rq:no:1", chatId: "-100999", messageId: 500 });
  assert.equal(store.getRequest(1)!.status, "pending");
  await flow.handleCallback({ id: "c2", fromId: 2, fromName: "Admin2", data: "rq:no:1", chatId: "-100999", messageId: 500 });
  assert.equal(store.getRequest(1)!.status, "rejected");
  assert.match(String(sent(calls, 77)[0]!.body.text), /rad etildi/);
});

test("💬 izoh: tugma -> admin yozadi -> foydalanuvchiga 'Admindan xabar' ketadi", async () => {
  const { store, calls, flow } = setup();
  await flow.submit({ userId: 77, userName: "Ali", query: "Kino Z", queryNorm: "kino z" });
  await flow.handleCallback({ id: "c1", fromId: 1, fromName: "Admin1", data: "rq:cm:1", chatId: "-100999", messageId: 500, threadId: 109 });
  assert.equal(flow.hasPendingComment(1), true);
  const prompt = sent(calls, "-100999").at(-1)!;
  assert.equal(prompt.body.reply_to_message_id, 500);

  const consumed = await flow.handleMessage({ chatId: "-100999", fromId: 1, text: "Bu kino tez orada qo'shiladi", messageId: 600, threadId: 109 });
  assert.equal(consumed, true);
  assert.match(String(sent(calls, 77).at(-1)!.body.text), /Admindan xabar[\s\S]*tez orada/);
  assert.equal(store.getRequest(1)!.adminNote, "Bu kino tez orada qo'shiladi");
  assert.equal(store.getRequest(1)!.status, "pending");
  assert.equal(flow.hasPendingComment(1), false);
  const edit = calls.filter((c) => c.method === "editMessageText").at(-1)!;
  assert.match(String(edit.body.text), /Izoh: Bu kino/);
  assert.ok((edit.body.reply_markup as { inline_keyboard: unknown[] }).inline_keyboard.length > 0);
});

test("so'rov xabariga oddiy reply ham izoh hisoblanadi; boshqalarning xabari e'tiborsiz", async () => {
  const { calls, flow } = setup();
  await flow.submit({ userId: 77, userName: "Ali", query: "Kino R", queryNorm: "kino r" });
  assert.equal(await flow.handleMessage({ chatId: "-100999", fromId: 555, text: "salom", messageId: 1, replyToMessageId: 500 }), false);
  assert.equal(await flow.handleMessage({ chatId: "-100999", fromId: 1, text: "oddiy gap", messageId: 2 }), false);
  assert.equal(await flow.handleMessage({ chatId: "-100999", fromId: 1, text: "Javob: ko'ramiz", messageId: 3, replyToMessageId: 500, threadId: 109 }), true);
  assert.match(String(sent(calls, 77).at(-1)!.body.text), /Javob: ko'ramiz/);
});

test("/cancel kutilayotgan izohni bekor qiladi; foydalanuvchi botni bloklagan bo'lsa ogohlantiradi", async () => {
  const { calls, flow } = setup({ failUsers: [88] });
  await flow.submit({ userId: 88, userName: "Blok", query: "Kino B", queryNorm: "kino b" });
  await flow.handleCallback({ id: "c1", fromId: 1, fromName: "A", data: "rq:cm:1", chatId: "-100999", messageId: 500 });
  assert.equal(await flow.handleMessage({ chatId: "-100999", fromId: 1, text: "/cancel", messageId: 7 }), true);
  assert.equal(flow.hasPendingComment(1), false);

  await flow.handleMessage({ chatId: "-100999", fromId: 1, text: "Izoh", messageId: 8, replyToMessageId: 500 });
  assert.match(String(sent(calls, "-100999").at(-1)!.body.text), /yetmadi/);
});

test("guruh sozlanmagan (target null): so'rov adminlarga shaxsiy yuboriladi, izoh tugma orqali ishlaydi", async () => {
  const { calls, flow } = setup({ noTarget: true });
  assert.equal(flow.isTargetChat("-100999"), false);
  const result = await flow.submit({ userId: 5, userName: "U", query: "kino q", queryNorm: "kino q" });
  assert.deepEqual(result, { status: "created", id: 1, delivered: true });
  assert.equal(sent(calls, "1").length, 1);
  assert.equal(sent(calls, "-100999").length, 0);
  await flow.handleCallback({ id: "c", fromId: 1, fromName: "A", data: "rq:cm:1", chatId: 1, messageId: 900 });
  assert.equal(await flow.handleMessage({ chatId: 1, fromId: 1, text: "Javob bor", messageId: 901 }), true);
  assert.match(String(sent(calls, 5).at(-1)!.body.text), /Admindan xabar[\s\S]*Javob bor/);
});

test("callback va matn yordamchilari", () => {
  assert.deepEqual(parseRequestCallback("rq:cm:12"), { action: "cm", id: 12 });
  assert.equal(parseRequestCallback("rq:xx:1"), null);
  assert.equal(parseRequestCallback("bc:ok:1"), null);
  const text = buildRequestText({
    id: 3, userId: 1, userName: "Ali (@ali)", query: "kino", queryNorm: "kino", status: "pending",
    adminNote: null, resolvedBy: null, groupChatId: null, groupMessageId: null, threadId: null,
    createdAt: "2026-10-20 10:30:00",
  });
  assert.match(text, /2026-10-20 15:30/);
});
