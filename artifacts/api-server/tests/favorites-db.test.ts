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
const ep1 = db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 1, episodeNumber: 1, title: "", channelChatId: "-1", channelMessageId: 21 })!;
const ep2 = db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 2, episodeNumber: 3, title: "", channelChatId: "-1", channelMessageId: 22 })!;

test("sevimli almashadi: qo'shiladi, olib tashlanadi; noma'lum kod yoki tur noto'g'ri bo'lsa null", () => {
  assert.equal(db.isFavorite(1, "movie", "M1"), false);
  assert.equal(db.toggleFavorite(1, "movie", "M1"), true);
  assert.equal(db.isFavorite(1, "movie", "M1"), true);
  assert.equal(db.toggleFavorite(1, "movie", "M1"), false);
  assert.equal(db.toggleFavorite(1, "movie", "YOQ"), null);
  assert.equal(db.toggleFavorite(1, "series", "M1"), null);
  assert.equal(db.toggleFavorite(1, "movie", "S1"), null);
});

test("qism sevimlisi: qo'shiladi/olib tashlanadi, noma'lum yoki noto'g'ri ID null, serial sevimlisidan mustaqil", () => {
  const id = String(ep1.id);
  assert.equal(db.isFavorite(1, "episode", id), false);
  assert.equal(db.toggleFavorite(1, "episode", id), true);
  assert.equal(db.isFavorite(1, "episode", id), true);
  assert.equal(db.isFavorite(1, "series", "S1"), false);
  assert.equal(db.toggleFavorite(1, "episode", id), false);
  for (const bad of ["999999", "abc", "-1", "1.5", ""]) {
    assert.equal(db.toggleFavorite(1, "episode", bad), null, bad);
  }
});

test("ro'yxat: aralash (kino, serial, qism), oxirgi qo'shilgani birinchi, qism sarlavhasi, foydalanuvchilar alohida", () => {
  db.toggleFavorite(1, "movie", "M1");
  db.toggleFavorite(1, "series", "S1");
  db.toggleFavorite(1, "episode", String(ep2.id));
  db.toggleFavorite(1, "movie", "M2");
  db.toggleFavorite(2, "movie", "M1");
  const list = db.listFavorites(1);
  assert.deepEqual(list.map((f) => f.kind), ["movie", "episode", "series", "movie"]);
  const episode = list.find((f) => f.kind === "episode")!;
  assert.equal(episode.code, String(ep2.id));
  assert.equal(episode.title, "Serial 1 — 2-fasl 3-qism");
  assert.deepEqual(db.listFavorites(2).map((f) => [f.kind, f.code]), [["movie", "M1"]]);
  assert.deepEqual(db.listFavorites(99), []);
  assert.equal(db.listFavorites(1, 2).length, 2);
});

test("o'chirilgan qism, serial va kino ro'yxatda ko'rinmaydi", () => {
  db.toggleFavorite(1, "episode", String(ep1.id));
  assert.ok(db.listFavorites(1).some((f) => f.code === String(ep1.id)));
  db.deleteSeriesEpisode("S1", 2, 3);
  assert.ok(!db.listFavorites(1).some((f) => f.code === String(ep2.id)));
  db.deleteMovie("M2");
  db.deleteSeries("S1");
  assert.deepEqual(db.listFavorites(1).map((f) => f.code), ["M1"]);
});
