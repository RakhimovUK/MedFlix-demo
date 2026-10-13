import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTION_LIMIT,
  buildSeriesCaption,
  normalizeDescription,
  truncateAtBoundary,
} from "../src/bot/series-card.ts";

const base = { title: "THE PITT", code: "101", seasons: [1], episodeCount: 15 };

test("tavsif yo'q bo'lsa eski ko'rinish saqlanadi", () => {
  const text = buildSeriesCaption({ ...base, description: null });
  assert.equal(text, "📺 THE PITT\n\n🔢 Kod: 101\n📂 1-fasl\n🎬 15 ta qism");
});

test("tavsif bor bo'lsa tavsif + kod/fasl/qism chiqadi", () => {
  const text = buildSeriesCaption({ ...base, description: "The Pitt\n\nShifoxona haqida serial." });
  assert.ok(text.startsWith("The Pitt\n\nShifoxona haqida serial."));
  assert.ok(text.endsWith("🔢 Kod: 101\n📂 1-fasl\n🎬 15 ta qism"));
});

test("uzun tavsif 1024 belgidan oshmaydi va gap chegarasida kesiladi", () => {
  const long = Array.from({ length: 80 }, (_, i) => `Bu ${i}-gap matni.`).join(" ");
  const text = buildSeriesCaption({ ...base, seasons: [1, 2], description: long });
  assert.ok(text.length <= CAPTION_LIMIT);
  assert.ok(text.includes("📂 Fasllar: 2 ta"));
  assert.ok(text.includes("-gap matni.\n\n🔢"));
});

test("so'z chegarasida kesilsa … qo'yiladi, surrogate buzilmaydi", () => {
  const out = truncateAtBoundary("so'z ".repeat(50) + "😀".repeat(50), 60);
  assert.ok(out.length <= 60);
  assert.ok(!/[\ud800-\udbff]$/.test(out));
  assert.equal(normalizeDescription("  \n "), null);
});
