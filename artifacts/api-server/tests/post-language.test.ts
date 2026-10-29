import assert from "node:assert/strict";
import test from "node:test";
import {
  decidePostLanguage,
  detectPostLanguages,
  normalizeLangToken,
} from "../src/bot/post-language.ts";

test("Til: O'zbek variantlari -> uz", () => {
  for (const v of ["O'zbek", "o‘zbek", "Ozbek", "Uzbek", "uz", "O'zbekcha", "o'zbek tilida", "Ўзбек"]) {
    assert.deepEqual(detectPostLanguages(`🌐 Til: ${v}`), ["uz"], v);
  }
});

test("Язык: Русский / Russian -> ru", () => {
  assert.deepEqual(detectPostLanguages("Язык: Русский"), ["ru"]);
  assert.deepEqual(detectPostLanguages("Language: Russian"), ["ru"]);
  assert.deepEqual(detectPostLanguages("Til: ruscha"), ["ru"]);
});

test("Language: English / Inglizcha -> en", () => {
  assert.deepEqual(detectPostLanguages("Language: English"), ["en"]);
  assert.deepEqual(detectPostLanguages("Tili: Inglizcha"), ["en"]);
});

test("ko'p til: tartib uz-ru-en, takrorsiz", () => {
  assert.deepEqual(detectPostLanguages("Til: English, O'zbek, uz"), ["uz", "en"]);
  assert.deepEqual(detectPostLanguages("Язык: русский и английский"), ["ru", "en"]);
  assert.deepEqual(detectPostLanguages("Language: Uzbek / Russian / English"), ["uz", "ru", "en"]);
  assert.deepEqual(detectPostLanguages("Til: o'zbek va rus"), ["uz", "ru"]);
});

test("til nomga yoki matnga qarab taxmin qilinmaydi", () => {
  assert.deepEqual(detectPostLanguages("🎬 Nomi: Русский рейс\nJanr: Drama"), []);
  assert.deepEqual(detectPostLanguages("Nomi: The English Patient\nO'zbek tilida"), []);
  assert.deepEqual(detectPostLanguages(""), []);
  assert.deepEqual(detectPostLanguages(null), []);
});

test("noma'lum qiymat e'tiborsiz", () => {
  assert.deepEqual(detectPostLanguages("Til: Fransuz"), []);
  assert.deepEqual(detectPostLanguages("Til: Fransuz, Rus"), ["ru"]);
});

test("boshqa belgilar (Tarjima, Janr) til hisoblanmaydi", () => {
  assert.deepEqual(detectPostLanguages("Tarjima: O'zbek\nJanr: Drama"), []);
});

test("bir qatorda: Nomi | Til", () => {
  assert.deepEqual(detectPostLanguages("🎬 Nomi: Steve | Til: English"), ["en"]);
});

test("qaror: bitta til -> auto; ko'p yoki yo'q -> admin so'raladi", () => {
  assert.deepEqual(decidePostLanguage("Til: Rus"), { kind: "auto", lang: "ru" });
  assert.deepEqual(decidePostLanguage("Til: uz, en"), { kind: "ask", options: ["uz", "en"], reason: "multi" });
  assert.deepEqual(decidePostLanguage("Nomi: Steve"), { kind: "ask", options: ["uz", "ru", "en"], reason: "none" });
});

test("normalizeLangToken", () => {
  assert.equal(normalizeLangToken("ENG"), "en");
  assert.equal(normalizeLangToken("xyz"), null);
});
