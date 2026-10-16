import assert from "node:assert/strict";
import test from "node:test";
import { createTelegramApi } from "../src/bot/telegram-api.ts";

function setup(response: unknown = { ok: true, result: { message_id: 7 } }, httpOk = true) {
  const calls: Array<{ url: string; body: any }> = [];
  const outgoing: number[] = [];
  const api = createTelegramApi({
    token: "TOKEN",
    onOutgoing: (chatId) => outgoing.push(chatId),
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return { ok: httpOk, status: httpOk ? 200 : 400, json: async () => response } as Response;
    },
  });
  return { api, calls, outgoing };
}

test("sendText to'g'ri URL va tanaga so'rov yuboradi, markup faqat berilganda", async () => {
  const { api, calls, outgoing } = setup();
  await api.sendText(5, "salom");
  await api.sendText(5, "tugma", { inline_keyboard: [[{ text: "a", callback_data: "b" }]] });
  assert.equal(calls[0]!.url, "https://api.telegram.org/botTOKEN/sendMessage");
  assert.deepEqual(calls[0]!.body, { chat_id: 5, text: "salom" });
  assert.ok(calls[1]!.body.reply_markup);
  assert.deepEqual(outgoing, [5, 5]);
});

test("onOutgoing faqat chiquvchi usul va raqamli chat_id uchun chaqiriladi", async () => {
  const { api, outgoing } = setup();
  await api.answerCallbackQuery("q1");
  await api.telegramApi("sendMessage", { chat_id: "@kanal", text: "x" });
  await api.telegramApi("deleteMessage", { chat_id: 9, message_id: 1 });
  await api.telegramApi("copyMessage", { chat_id: 9 });
  assert.deepEqual(outgoing, [9]);
});

test("answerCallbackQuery: matn faqat berilganda yuboriladi", async () => {
  const { api, calls } = setup();
  await api.answerCallbackQuery("q1");
  await api.answerCallbackQuery("q2", "Topilmadi");
  assert.deepEqual(calls[0]!.body, { callback_query_id: "q1" });
  assert.deepEqual(calls[1]!.body, { callback_query_id: "q2", text: "Topilmadi" });
});

test("Telegram xatosi Error bo'lib ko'tariladi (tavsif bilan)", async () => {
  const { api, outgoing } = setup({ ok: false, description: "chat not found" }, false);
  await assert.rejects(() => api.sendText(1, "x"), /chat not found/);
  assert.deepEqual(outgoing, []);
});
