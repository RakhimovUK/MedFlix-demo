import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-views-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

db.upsertSeries({ code: "S1", title: "Serial 1" });
const ep1 = db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 1, episodeNumber: 1, title: "", channelChatId: "-1", channelMessageId: 1 })!;
const ep2 = db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 1, episodeNumber: 2, title: "", channelChatId: "-1", channelMessageId: 2 })!;
db.upsertMovie({ code: "M1", title: "Kino 1", channelChatId: "-1", channelMessageId: 10 });
db.upsertMovie({ code: "M2", title: "Kino 2", channelChatId: "-1", channelMessageId: 11 });
const m1 = db.findMovie("M1")!;
const m2 = db.findMovie("M2")!;
const NOW = new Date("2026-06-30T12:00:00Z");

test("bir foydalanuvchining bir kundagi takroriy ko'rishi bir marta hisoblanadi", () => {
  db.recordMovieView(1, m1.id, "2026-06-30");
  db.recordMovieView(1, m1.id, "2026-06-30");
  db.recordMovieView(1, m1.id, "2026-06-29");
  const top = db.listTopContent(10, 30, NOW);
  assert.equal(top.find((t) => t.code === "M1")!.viewers, 2);
});

test("top: ko'proq tomoshabin yuqorida, serial qismlari serial bo'yicha yig'iladi", () => {
  db.recordMovieView(2, m2.id, "2026-06-30");
  db.recordEpisodeView(1, ep1.id, "2026-06-30");
  db.recordEpisodeView(2, ep2.id, "2026-06-30");
  db.recordEpisodeView(3, ep2.id, "2026-06-30");
  const top = db.listTopContent(10, 30, NOW);
  assert.deepEqual(top.map((t) => [t.kind, t.code, t.viewers]), [
    ["series", "S1", 3],
    ["movie", "M1", 2],
    ["movie", "M2", 1],
  ]);
  assert.equal(db.listTopContent(2, 30, NOW).length, 2);
});

test("30 kundan eski ko'rishlar hisobga olinmaydi", () => {
  db.recordMovieView(9, m2.id, "2026-04-01");
  const top = db.listTopContent(10, 30, NOW);
  assert.equal(top.find((t) => t.code === "M2")!.viewers, 1);
});

test("mavjud bo'lmagan qism/kino ko'rishi xato bermaydi va yozilmaydi; o'chirilgan kino topda yo'q", () => {
  db.recordEpisodeView(1, 999999, "2026-06-30");
  db.recordMovieView(1, 999999, "2026-06-30");
  db.deleteMovie("M2");
  assert.ok(!db.listTopContent(10, 30, NOW).some((t) => t.code === "M2"));
});

test("yangi qismlar: har bir serialning eng oxirgi qismi bir marta", () => {
  const recent = db.listRecentEpisodes(5);
  assert.equal(recent.length, 1);
  assert.equal(recent[0]!.id, ep2.id);
  assert.equal(recent[0]!.episodeNumber, 2);
  assert.equal(recent[0]!.seriesTitle, "Serial 1");
});
