import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminIds,
  getDiscussionUrl,
  getPostsChannelId,
  getRequiredSubscriptions,
  isAdmin,
} from "../src/bot/config.ts";

test("admin ID'lar bo'shliq bilan ham o'qiladi, bo'sh env admin bermaydi", () => {
  const env = { TELEGRAM_ADMIN_IDS: " 111, 222 ,," };
  assert.deepEqual(getAdminIds(env), ["111", "222"]);
  assert.equal(isAdmin(222, env), true);
  assert.equal(isAdmin(333, env), false);
  assert.equal(isAdmin(111, {}), false);
});

test("majburiy obuna: kanal va chatlar URL'lari indeks bo'yicha mos keladi", () => {
  const subs = getRequiredSubscriptions({
    TELEGRAM_REQUIRED_CHANNEL_IDS: "-100a",
    TELEGRAM_REQUIRED_CHANNEL_URLS: "https://t.me/k",
    TELEGRAM_REQUIRED_CHAT_IDS: "-100b",
  });
  assert.equal(subs.length, 2);
  assert.deepEqual([subs[0]!.chatId, subs[0]!.url], ["-100a", "https://t.me/k"]);
  assert.deepEqual([subs[1]!.chatId, subs[1]!.url], ["-100b", undefined]);
  assert.deepEqual(getRequiredSubscriptions({}), []);
});

test("muhokama havolasi: bo'sh bo'lsa undefined", () => {
  assert.equal(getDiscussionUrl({ TELEGRAM_DISCUSSION_URL: "  " }), undefined);
  assert.equal(getDiscussionUrl({ TELEGRAM_DISCUSSION_URL: " https://t.me/c " }), "https://t.me/c");
});

test("postlar kanali: env bo'lsa env, bo'lmasa eski standart", () => {
  assert.equal(getPostsChannelId({ TELEGRAM_POSTS_CHANNEL_ID: " -100999 " }), "-100999");
  assert.equal(getPostsChannelId({}), "-1004418309907");
});
