import assert from "node:assert/strict";
import test from "node:test";
import { buildLanguagePicker, parseSetLangData } from "../src/bot/language-picker.ts";
import { MESSAGES, LANGS, runWithLang, t, translate, suggestLangFromTelegram } from "../src/bot/i18n.ts";

test("til tugmalari: taklif qilingan til birinchi", () => {
  const kb = buildLanguagePicker("ru");
  assert.deepEqual(kb.inline_keyboard.map((row) => row[0]!.callback_data), ["setlang:ru", "setlang:uz", "setlang:en"]);
  assert.deepEqual(buildLanguagePicker(null).inline_keyboard.map((row) => row[0]!.callback_data), ["setlang:uz", "setlang:ru", "setlang:en"]);
});

test("deep-link kodi tugmaga qo'shiladi va o'qiladi", () => {
  const kb = buildLanguagePicker(null, "101");
  assert.equal(kb.inline_keyboard[0]![0]!.callback_data, "setlang:uz:101");
  assert.deepEqual(parseSetLangData("setlang:en:101"), { lang: "en", payload: "101" });
  assert.deepEqual(parseSetLangData("setlang:ru"), { lang: "ru", payload: null });
  assert.equal(parseSetLangData("setlang:fr"), null);
  assert.equal(parseSetLangData("lang:menu"), null);
  const long = buildLanguagePicker(null, "x".repeat(80));
  assert.equal(long.inline_keyboard[0]![0]!.callback_data, "setlang:uz");
});

test("Telegram tilidan taklif", () => {
  assert.equal(suggestLangFromTelegram("ru"), "ru");
  assert.equal(suggestLangFromTelegram("en-US"), "en");
  assert.equal(suggestLangFromTelegram("uz"), "uz");
  assert.equal(suggestLangFromTelegram("de"), null);
  assert.equal(suggestLangFromTelegram(undefined), null);
});

test("har bir matn uchala tilda yozilgan", () => {
  for (const [key, entry] of Object.entries(MESSAGES)) {
    for (const lang of LANGS) {
      assert.ok((entry as Record<string, string>)[lang]?.trim(), `${key}.${lang} bo'sh`);
    }
  }
});

test("t(): kontekst tili, o'zgaruvchilar, default uz", () => {
  assert.equal(t("kb.catalog"), "🎬 Katalog");
  assert.equal(runWithLang("ru", () => t("kb.catalog")), "🎬 Каталог");
  assert.equal(translate("en", "catalog.movies", { n: 5 }), "Movies: 5");
  assert.equal(runWithLang("en", () => t("notFound.code", { code: "7", lang: "English" })).startsWith("⚠️ Code «7»"), true);
});
