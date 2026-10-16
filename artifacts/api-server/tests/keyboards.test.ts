import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogKeyboard,
  buildStartKeyboard,
  buildSubscriptionKeyboard,
  decodeCallbackValue,
  encodeCallbackValue,
  movieKeyboard,
  seriesKeyboard,
} from "../src/bot/keyboards.ts";

const movie = (i: number) => ({ code: String(100 + i), title: "Film ".repeat(30) + i });
const serie = { code: "101", title: "THE PITT", seasonCount: 1, episodeCount: 15 };

test("callback qiymati qaytib dekodlanadi (o'zbekcha harflar bilan ham)", () => {
  for (const v of ["101", "Sarguzasht", "Oʻzbek kino", "Драма"]) {
    assert.equal(decodeCallbackValue(encodeCallbackValue(v)), v);
  }
});

test("tugma matni 64 belgidan, callback 64 baytdan oshmaydi, ro'yxat 25 tagacha", () => {
  const kb = movieKeyboard(Array.from({ length: 40 }, (_, i) => movie(i)))!;
  assert.equal(kb.inline_keyboard.length, 25);
  for (const [b] of kb.inline_keyboard) {
    assert.ok(b!.text.length <= 64);
    assert.ok(Buffer.byteLength(b!.callback_data!) <= 64);
  }
  assert.equal(movieKeyboard([]), undefined);
  assert.equal(seriesKeyboard([]), undefined);
});

test("katalog: janr, kino, serial tartibida; hammasi bo'sh bo'lsa undefined", () => {
  const kb = buildCatalogKeyboard([{ name: "Drama", movieCount: 2 }], [movie(1)], [serie])!;
  const prefixes = kb.inline_keyboard.map((r) => r[0]!.callback_data!.split(":")[0]);
  assert.deepEqual(prefixes, ["genre", "movie", "series"]);
  assert.equal(buildCatalogKeyboard([], [], []), undefined);
});

test("obuna klaviaturasi: oxirida 'Tekshirish'; start: muhokama faqat URL bo'lsa", () => {
  const sub = buildSubscriptionKeyboard([{ chatId: "-1", label: "Kanal", url: "https://t.me/k" }]);
  assert.equal(sub.inline_keyboard.length, 2);
  assert.equal(sub.inline_keyboard[1]![0]!.callback_data, "subscription:check");
  assert.equal(buildStartKeyboard().inline_keyboard.length, 1);
  assert.equal(buildStartKeyboard("https://t.me/c").inline_keyboard.length, 2);
});
