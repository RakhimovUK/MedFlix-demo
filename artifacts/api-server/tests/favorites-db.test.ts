import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-fav-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

db.upsertMovie({ code: "M1", title: "Kino 1", channelChatId: "-1", channelMessageId: 10 });
db.upsertMovie({ code: "M2", title: "Kino 2", channelChatId: "-1", channelMessageId: 11 });
db.upsertSeries({ code: "S1", title: "Serial 1" });

test("sevimli almashadi: qo'shiladi, olib tashlanadi; noma'lum kod yoki tur noto'g'ri bo'lsa null", () => {
  assert.equal(db.isFavorite(1, "movie", "M1"), false);
  assert.equal(db.toggleFavorite(1, "movie", "M1"), true);
  assert.equal(db.isFavorite(1, "movie", "M1"), true);
  assert.equal(db.toggleFavorite(1, "movie", "M1"), false);
  assert.equal(db.toggleFavorite(1, "movie", "YOQ"), null);
  assert.equal(db.toggleFavorite(1, "series", "M1"), null);
  assert.equal(db.toggleFavorite(1, "movie", "S1"), null);
});

test("ro'yxat: oxirgi qo'shilgan birinchi, foydalanuvchilar alohida, kino va serial aralash", () => {
  db.toggleFavorite(1, "movie", "M1");
  db.toggleFavorite(1, "series", "S1");
  db.toggleFavorite(1, "movie", "M2");
  db.toggleFavorite(2, "movie", "M1");
  assert.deepEqual(db.listFavorites(1).map((f) => f.code), ["M2", "S1", "M1"]);
  assert.deepEqual(db.listFavorites(2).map((f) => [f.kind, f.code]), [["movie", "M1"]]);
  assert.deepEqual(db.listFavorites(99), []);
  assert.equal(db.listFavorites(1, 2).length, 2);
});

test("o'chirilgan kino/serial ro'yxatda ko'rinmaydi", () => {
  db.deleteMovie("M2");
  db.deleteSeries("S1");
  assert.deepEqual(db.listFavorites(1).map((f) => f.code), ["M1"]);
});
