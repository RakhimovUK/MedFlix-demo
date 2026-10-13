import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-pp-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

const add = (code: string, season: number, ep: number, msg: number) =>
  db.upsertSeriesEpisode({ seriesCode: code, seasonNumber: season, episodeNumber: ep, title: "", channelChatId: "-100", channelMessageId: msg })!;

db.upsertSeries({ code: "A", title: "Serial A" });
db.upsertSeries({ code: "B", title: "Serial B" });
const a1 = add("A", 1, 1, 1);
const a2 = add("A", 1, 2, 2);
const b1 = add("B", 1, 1, 3);

test("poster: yo'q bo'lsa null, o'rnatilsa qaytadi, noma'lum serial false", () => {
  assert.equal(db.getSeriesPoster("A"), null);
  assert.equal(db.setSeriesPoster("A", "FILE_ID_1"), true);
  assert.equal(db.getSeriesPoster("A"), "FILE_ID_1");
  assert.equal(db.getSeriesPoster("B"), null);
  assert.equal(db.setSeriesPoster("YOQ", "X"), false);
});

test("progress: foydalanuvchi va serial bo'yicha alohida", () => {
  assert.equal(db.getSeriesProgress(1, "A"), null);
  db.saveSeriesProgress(1, a2.id);
  db.saveSeriesProgress(2, a1.id);
  db.saveSeriesProgress(1, b1.id);
  assert.equal(db.getSeriesProgress(1, "A")!.episodeNumber, 2);
  assert.equal(db.getSeriesProgress(2, "A")!.episodeNumber, 1);
  assert.equal(db.getSeriesProgress(1, "B")!.id, b1.id);
  db.saveSeriesProgress(1, a1.id);
  assert.equal(db.getSeriesProgress(1, "A")!.episodeNumber, 1);
  assert.equal(db.getSeriesProgress(1, "B")!.id, b1.id);
});

test("progress: o'chirilgan qism va mavjud bo'lmagan ID xavfsiz", () => {
  db.saveSeriesProgress(3, 999999);
  assert.equal(db.getSeriesProgress(3, "A"), null);
  db.saveSeriesProgress(4, a2.id);
  db.deleteSeriesEpisode("A", 1, 2);
  assert.equal(db.getSeriesProgress(4, "A"), null);
});
