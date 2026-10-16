import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-mp-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

db.upsertMovie({ code: "1", title: "Kino A", channelChatId: "-100", channelMessageId: 1 });
db.upsertMovie({ code: "2", title: "Kino B", channelChatId: "-100", channelMessageId: 2 });
db.upsertSeries({ code: "101", title: "Serial A" });

test("kino poster: yo'q bo'lsa null, o'rnatilsa qaytadi, noma'lum kod false", () => {
  assert.equal(db.getMoviePoster("1"), null);
  assert.equal(db.setMoviePoster("1", "FILE_ID_1"), true);
  assert.equal(db.getMoviePoster("1"), "FILE_ID_1");
  assert.equal(db.getMoviePoster("2"), null);
  assert.equal(db.setMoviePoster("YOQ", "X"), false);
});

test("kino poster o'chirish: bor bo'lsa true, yo'q bo'lsa false, kino saqlanadi", () => {
  db.setMoviePoster("2", "FILE_B");
  assert.equal(db.clearMoviePoster("2"), true);
  assert.equal(db.getMoviePoster("2"), null);
  assert.equal(db.clearMoviePoster("2"), false);
  assert.equal(db.clearMoviePoster("YOQ"), false);
  assert.ok(db.findMovie("2"));
});

test("kino poster tavsifi: saqlanadi, bo'sh bo'lsa eskisi qoladi, o'chirilganda tozalanadi", () => {
  db.setMoviePoster("1", "F1", "Kino A tavsifi");
  assert.equal(db.getMoviePosterCaption("1"), "Kino A tavsifi");
  db.setMoviePoster("1", "F2");
  assert.equal(db.getMoviePosterCaption("1"), "Kino A tavsifi");
  assert.equal(db.getMoviePoster("1"), "F2");
  db.clearMoviePoster("1");
  assert.equal(db.getMoviePosterCaption("1"), null);
});

test("kino va serial posterlari bir-biridan mustaqil", () => {
  db.setMoviePoster("1", "MOVIE_FILE");
  db.setSeriesPoster("101", "SERIES_FILE");
  assert.equal(db.getMoviePoster("1"), "MOVIE_FILE");
  assert.equal(db.getSeriesPoster("101"), "SERIES_FILE");
  assert.equal(db.getSeriesPoster("1"), null);
  assert.equal(db.getMoviePoster("101"), null);
});
