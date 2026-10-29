import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLanguageChoiceKeyboard,
  createPendingAddStore,
  languageQuestionText,
  parseAddLangData,
} from "../src/bot/add-language.ts";

const entry = {
  code: "1",
  title: "Steve",
  channelChatId: "-100",
  channelMessageId: 5,
  genres: ["Drama"],
  options: ["uz", "en"] as Array<"uz" | "ru" | "en">,
};

test("tugmalar faqat taklif qilingan tillar + bekor", () => {
  const kb = buildLanguageChoiceKeyboard(["uz", "en"]);
  assert.deepEqual(kb.inline_keyboard[0]!.map((b) => b.callback_data), ["addlang:uz", "addlang:en"]);
  assert.equal(kb.inline_keyboard[1]![0]!.callback_data, "addlang:cancel");
});

test("callback ma'lumotini o'qish", () => {
  assert.equal(parseAddLangData("addlang:ru"), "ru");
  assert.equal(parseAddLangData("addlang:cancel"), "cancel");
  assert.equal(parseAddLangData("addlang:fr"), null);
  assert.equal(parseAddLangData("movie:1"), null);
});

test("savol matni sababga qarab", () => {
  assert.match(languageQuestionText(entry, "multi"), /bir nechta til/);
  assert.match(languageQuestionText(entry, "none"), /til ko‘rsatilmagan/);
});

test("kutilayotgan /add: bir marta olinadi, muddati o'tsa yo'q", () => {
  let t = 0;
  const store = createPendingAddStore(1000, () => t);
  store.set(7, entry);
  assert.deepEqual(store.take(7), entry);
  assert.equal(store.take(7), null);
  store.set(7, entry);
  t = 2000;
  assert.equal(store.take(7), null);
});
