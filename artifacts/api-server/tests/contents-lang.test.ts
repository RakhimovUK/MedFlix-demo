import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildContentsPages,
  buildStartPayload,
  parseStartPayload,
} from "../src/bot/catalog-content.ts";
import { runWithLang } from "../src/bot/i18n.ts";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-cl-")), "t.sqlite");
const db = await import("../src/bot/database.ts");
const structure = await import("../src/bot/telegram-structure.ts");

const movies = [{ code: "101", title: "Film" }];
const series = [{ code: "S1", title: "Serial", episodeCount: 4 }];

test("uz mundarija matni va havolalari avvalgidek (kanal postlari o'zgarmaydi)", () => {
  const [page] = buildContentsPages(movies, series, "MedFlix_robot");
  assert.match(page, /^📚 MEDFLIX — MUNDARIJA\n/);
  assert.match(page, /🎬 KINOLAR/);
  assert.match(page, /📺 SERIALLAR/);
  assert.match(page, /\(4 qism\)/);
  assert.match(page, /\?start=101"/);
  assert.match(page, /🔎 Kino nomini bosing yoki kodni botga yuboring\.$/);
});

test("ru mundarija: matnlar ruscha, havolada til belgisi", () => {
  const [page] = runWithLang("ru", () => buildContentsPages(movies, series, "MedFlix_robot"));
  assert.match(page, /^📚 MEDFLIX — СОДЕРЖАНИЕ\n/);
  assert.match(page, /🎬 ФИЛЬМЫ/);
  assert.match(page, /📺 СЕРИАЛЫ/);
  assert.match(page, /\(4 сер\.\)/);
  assert.match(page, /\?start=ru_101">Film<\/a>/);
  assert.match(page, /\?start=ru_S1">Serial<\/a>/);
  assert.doesNotMatch(page, /KINOLAR|qism|Kino nomini/);
});

test("en mundarija: bo'sh katalog va davomi sarlavhasi inglizcha", () => {
  const [empty] = runWithLang("en", () => buildContentsPages([], [], "MedFlix_robot"));
  assert.match(empty, /No movies yet\./);

  const many = Array.from({ length: 91 }, (_, i) => ({ code: `M${i + 1}`, title: `Film ${i + 1}` }));
  const pages = runWithLang("en", () => buildContentsPages(many, [], "MedFlix_robot"));
  assert.equal(pages.length, 2);
  assert.match(pages[0], /📚 MEDFLIX — CONTENTS \(1\/2\)/);
  assert.match(pages[1], /🎬 MOVIES \(continued\)/);
  assert.match(pages[1], /\?start=en_M91"/);
});

test("start payload: til belgisi o'qiladi, tilsiz kod o'zgarmaydi", () => {
  assert.equal(buildStartPayload("101", "uz"), "101");
  assert.equal(buildStartPayload("101", "ru"), "ru_101");
  assert.deepEqual(parseStartPayload("ru_101"), { lang: "ru", code: "101" });
  assert.deepEqual(parseStartPayload("EN_S1"), { lang: "en", code: "S1" });
  assert.deepEqual(parseStartPayload("101"), { lang: null, code: "101" });
  assert.deepEqual(parseStartPayload("DH"), { lang: null, code: "DH" });
});

test("ru/en postlari: sozlanmagan -> bo'sh, sozlansa o'z kaliti, uz ga ta'sir qilmaydi", () => {
  assert.deepEqual(structure.getContentsPostReferences("ru"), []);
  assert.deepEqual(structure.getContentsPostReferences("en"), []);
  const uzBefore = structure.getContentsPostReferences("uz");
  assert.ok(uzBefore.length > 0);

  const ruRefs = [{ chatId: "-1001", messageId: 30 }, { chatId: "-1001", messageId: 31 }];
  db.setSetting(structure.contentsSettingKey("ru"), JSON.stringify(ruRefs));
  assert.equal(structure.contentsSettingKey("ru"), "contents_posts_ru");
  assert.deepEqual(structure.getContentsPostReferences("ru"), ruRefs);
  assert.deepEqual(structure.getContentsPostReferences("en"), []);
  assert.deepEqual(structure.getContentsPostReferences("uz"), uzBefore);

  db.setSetting(structure.contentsSettingKey("ru"), "[]");
  assert.deepEqual(structure.getContentsPostReferences("ru"), []);
});

test("tizim postida ru mundarija havolalari ko'rinadi", () => {
  db.setSetting("contents_posts_ru", JSON.stringify([{ chatId: "-1004418309907", messageId: 40 }]));
  const text = structure.formatStructurePost();
  assert.match(text, /• RU: https:\/\/t\.me\/c\/4418309907\/40/);
  assert.doesNotMatch(text, /• EN:/);
  db.setSetting("contents_posts_ru", "[]");
});
