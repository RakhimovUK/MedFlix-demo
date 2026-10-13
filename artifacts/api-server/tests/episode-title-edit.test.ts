import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), "medflix-")),
  "test.sqlite",
);
const db = await import("../src/bot/database.ts");

test("qism nomi joyida o'zgaradi, post va ID o'zgarmaydi", () => {
  db.upsertSeries({ code: "T1", title: "Test serial" });
  const created = db.upsertSeriesEpisode({
    seriesCode: "T1", seasonNumber: 1, episodeNumber: 2,
    title: "Eski", channelChatId: "-100123", channelMessageId: 77,
  })!;

  assert.equal(db.updateSeriesEpisodeTitle("T1", 1, 2, "Yangi"), true);

  const after = db.findSeriesEpisode("T1", 1, 2)!;
  assert.equal(after.title, "Yangi");
  assert.equal(after.id, created.id);
  assert.equal(after.channelChatId, "-100123");
  assert.equal(after.channelMessageId, 77);
});

test("mavjud bo'lmagan qism yoki serial uchun false qaytaradi", () => {
  assert.equal(db.updateSeriesEpisodeTitle("T1", 1, 99, "X"), false);
  assert.equal(db.updateSeriesEpisodeTitle("YOQ", 1, 2, "X"), false);
});

test("boshqa serialning bir xil raqamli qismiga tegmaydi", () => {
  db.upsertSeries({ code: "T2", title: "Boshqa" });
  db.upsertSeriesEpisode({
    seriesCode: "T2", seasonNumber: 1, episodeNumber: 2,
    title: "Tegilmasin", channelChatId: "-100123", channelMessageId: 78,
  });
  db.updateSeriesEpisodeTitle("T1", 1, 2, "Yana yangi");
  assert.equal(db.findSeriesEpisode("T2", 1, 2)!.title, "Tegilmasin");
});
