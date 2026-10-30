import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  formatEditPartsResult,
  formatStatsMessage,
  parseBackupHour,
  parseEditParts,
  shouldRunBackup,
} from "../src/bot/admin-tools.ts";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-at-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

test("editparts: sarlavha va qatorlar to'g'ri o'qiladi", () => {
  const r = parseEditParts("101 | 2\n1 | Birinchi\n3 | Uchinchi | davomi");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.code, "101");
    assert.equal(r.season, 2);
    assert.deepEqual(r.items, [
      { episode: 1, title: "Birinchi" },
      { episode: 3, title: "Uchinchi | davomi" },
    ]);
  }
  const short = parseEditParts("#abc\n1 | Nom");
  assert.ok(short.ok && short.code === "ABC" && short.season === 1);
});

test("editparts: xato qatorlar alohida ko'rsatiladi, sarlavha xatosi rad etiladi", () => {
  const r = parseEditParts("101\n1 | A\nxato qator\n1 | takror\n2 |\n3 | " + "x".repeat(101));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.items.length, 1);
    assert.equal(r.lineErrors.length, 4);
  }
  assert.equal(parseEditParts("101").ok, false);
  assert.equal(parseEditParts("101 | 0\n1 | A").ok, false);
  const text = formatEditPartsResult({ code: "101", season: 1, updated: [1, 3], missing: [9], lineErrors: ["x"] });
  assert.ok(text.includes("2 ta qism yangilandi") && text.includes("Topilmadi: 9"));
});

test("editparts: bazada ko'p qism bitta tranzaksiyada yangilanadi", () => {
  db.upsertSeries({ code: "S1", title: "Serial" });
  for (const ep of [1, 2, 3]) {
    db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 1, episodeNumber: ep, title: "", channelChatId: "-100", channelMessageId: ep });
  }
  const res = db.updateSeriesEpisodeTitles("S1", 1, [
    { episode: 1, title: "Bir" },
    { episode: 3, title: "Uch" },
    { episode: 9, title: "Yo'q" },
  ]);
  assert.deepEqual(res, { updated: [1, 3], missing: [9] });
  assert.equal(db.findSeriesEpisode("S1", 1, 3)?.title, "Uch");
  assert.equal(db.findSeriesEpisode("S1", 1, 2)?.title, "");
});

test("avto-zaxira: soat va kun bo'yicha bir marta ishlaydi", () => {
  assert.equal(parseBackupHour(undefined), 21);
  assert.equal(parseBackupHour("3"), 3);
  assert.equal(parseBackupHour("99"), 21);
  const at = (iso: string) => new Date(iso);
  assert.equal(shouldRunBackup(at("2026-10-15T20:59:00Z"), null, 21), false);
  assert.equal(shouldRunBackup(at("2026-10-15T21:01:00Z"), "2026-10-14", 21), true);
  assert.equal(shouldRunBackup(at("2026-10-15T23:00:00Z"), "2026-10-15", 21), false);
});

test("stats: foydalanuvchilar hisobi va xabar formati", () => {
  db.touchBotUser(11);
  db.touchBotUser(11);
  db.touchBotUser(12);
  const stats = db.getBotStats();
  assert.equal(stats.users, 2);
  assert.equal(stats.activeDay, 2);
  assert.equal(stats.newDay, 2);
  assert.equal(stats.series, 1);
  assert.equal(stats.episodes, 3);
  const text = formatStatsMessage(stats);
  assert.ok(text.includes("Foydalanuvchilar: 2") && text.includes("Seriallar: 1 ta (3 ta qism)"));
  // Til bo'yicha: seriallar uz, foydalanuvchilar til tanlamagan.
  assert.deepEqual(stats.seriesByLang, { uz: 1 });
  assert.equal(stats.usersByLang?.["-"], 2);
  assert.ok(text.includes("• Til: uz 0 · ru 0 · en 0 · tanlamagan 2"));
  assert.ok(text.includes("• uz 1 · ru 0 · en 0"));
  assert.ok(!text.includes("Baza fayli"));
});

test("stats: baza fayli va avto-zaxira holati", () => {
  const stats = db.getBotStats();
  const ok = formatStatsMessage(stats, {
    databasePath: "/data/kino-bot.sqlite",
    backup: { enabled: true, lastOkAt: "2026-10-29T21:00:12.000Z", lastError: null },
  });
  assert.ok(ok.includes("💾 Baza fayli: /data/kino-bot.sqlite"));
  assert.ok(ok.includes("🗄 Avto-zaxira: oxirgi muvaffaqiyatli: 2026-10-29 21:00 UTC"));
  assert.ok(!ok.includes("⚠️"));

  const failed = formatStatsMessage(stats, {
    backup: { enabled: true, lastOkAt: null, lastError: "Bad Request: chat not found" },
  });
  assert.ok(failed.includes("hali yuborilmagan") && failed.includes("⚠️ Oxirgi xato: Bad Request: chat not found"));

  const off = formatStatsMessage(stats, { backup: { enabled: false, lastOkAt: null, lastError: null } });
  assert.ok(off.includes("o‘chirilgan (AUTO_BACKUP=off)"));
  assert.ok(db.getDatabasePath().endsWith("t.sqlite"));
});
