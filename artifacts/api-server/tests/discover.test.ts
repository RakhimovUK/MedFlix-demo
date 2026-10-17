import assert from "node:assert/strict";
import test from "node:test";
import { buildNewKeyboard, buildTopKeyboard } from "../src/bot/discover.ts";

const enc = (v: string) => Buffer.from(v).toString("base64url");

test("yangi: avval qismlar (ep:ID), keyin kinolar (movie:KOD); bo'sh bo'lsa undefined", () => {
  const kb = buildNewKeyboard(
    [{ code: "9", title: "Film" }],
    [{ id: 5, seriesTitle: "THE PITT", seasonNumber: 1, episodeNumber: 16 }],
    enc,
  )!;
  assert.deepEqual(kb.inline_keyboard.map((r) => r[0]!.callback_data), ["ep:5", "movie:" + enc("9")]);
  assert.ok(kb.inline_keyboard[0]![0]!.text.includes("1-fasl 16-qism"));
  assert.equal(buildNewKeyboard([], [], enc), undefined);
});

test("top: tartib raqami, tomoshabin soni, tur bo'yicha to'g'ri callback va 64 belgi", () => {
  const kb = buildTopKeyboard(
    [
      { kind: "series", code: "101", title: "THE PITT", viewers: 7 },
      { kind: "movie", code: "1", title: "X".repeat(100), viewers: 3 },
    ],
    enc,
  )!;
  assert.equal(kb.inline_keyboard[0]![0]!.text, "1. 📺 THE PITT · 👁 7");
  assert.equal(kb.inline_keyboard[0]![0]!.callback_data, "series:" + enc("101"));
  assert.equal(kb.inline_keyboard[1]![0]!.callback_data, "movie:" + enc("1"));
  for (const [b] of kb.inline_keyboard) {
    assert.ok(b!.text.length <= 64);
    assert.ok(Buffer.byteLength(b!.callback_data) <= 64);
  }
  assert.equal(buildTopKeyboard([], enc), undefined);
});
