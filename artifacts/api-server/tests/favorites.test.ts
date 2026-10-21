import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFavoriteRow,
  buildFavoritesKeyboard,
  parseFavoriteData,
  replaceFavoriteRow,
} from "../src/bot/favorites.ts";

test("tugma matni holatga qarab o'zgaradi; callback tanib olinadi va 64 baytdan oshmaydi", () => {
  const off = buildFavoriteRow("movie", "NQ", false)[0]!;
  const on = buildFavoriteRow("series", "MTAx", true)[0]!;
  assert.ok(off.text.startsWith("⭐") && on.text.startsWith("✅"));
  assert.deepEqual(parseFavoriteData(off.callback_data!), { kind: "movie", encoded: "NQ" });
  assert.deepEqual(parseFavoriteData(on.callback_data!), { kind: "series", encoded: "MTAx" });
  assert.ok(Buffer.byteLength(on.callback_data!) <= 64);
});

test("qism tugmasi: alohida matn, fav:e:<ID> callback, faqat raqamli ID qabul qilinadi", () => {
  const off = buildFavoriteRow("episode", "27", false)[0]!;
  const on = buildFavoriteRow("episode", "27", true)[0]!;
  assert.ok(off.text.includes("Qismni sevimlilarga"));
  assert.ok(on.text.includes("Sevimli qism"));
  assert.equal(off.callback_data, "fav:e:27");
  assert.deepEqual(parseFavoriteData("fav:e:27"), { kind: "episode", encoded: "27" });
  for (const bad of ["fav:e:", "fav:e:abc", "fav:e:1.5", "fav:e:-3", "fav:e:1234567890123"]) {
    assert.equal(parseFavoriteData(bad), null, bad);
  }
});

test("noto'g'ri yoki begona callback rad etiladi", () => {
  for (const bad of ["fav:", "fav:x:NQ", "fav:m:", "fav:m:a b", "fav:list", "ntf:NQ", "fav:m:" + "x".repeat(51), ""]) {
    assert.equal(parseFavoriteData(bad), null, bad);
  }
});

test("replaceFavoriteRow: faqat sevimli qatorini almashtiradi (qism qatorini ham), boshqa tugmalarga tegmaydi", () => {
  const rows = [
    [{ text: "a", callback_data: "x" }],
    [{ text: "n", callback_data: "ntf:MTAx" }],
    buildFavoriteRow("episode", "27", false),
  ];
  const out = replaceFavoriteRow(rows, buildFavoriteRow("episode", "27", true));
  assert.equal(out.length, 3);
  assert.equal(out[0]![0]!.callback_data, "x");
  assert.equal(out[1]![0]!.callback_data, "ntf:MTAx");
  assert.ok(out[2]![0]!.text.startsWith("✅"));
  assert.equal(replaceFavoriteRow([[{ text: "a", callback_data: "x" }]], buildFavoriteRow("movie", "NQ", false)).length, 2);
});

test("ro'yxat klaviaturasi: tur bo'yicha callback (qism: ep:ID), 64 belgi, bo'sh bo'lsa undefined", () => {
  const enc = (v: string) => Buffer.from(v).toString("base64url");
  const kb = buildFavoritesKeyboard(
    [
      { kind: "episode", code: "27", title: "THE PITT — 1-fasl 5-qism" },
      { kind: "series", code: "101", title: "THE PITT" },
      { kind: "movie", code: "5", title: "X".repeat(100) },
    ],
    enc,
  )!;
  assert.equal(kb.inline_keyboard[0]![0]!.callback_data, "ep:27");
  assert.equal(kb.inline_keyboard[0]![0]!.text, "📺 THE PITT — 1-fasl 5-qism");
  assert.equal(kb.inline_keyboard[1]![0]!.callback_data, "series:" + enc("101"));
  assert.equal(kb.inline_keyboard[2]![0]!.callback_data, "movie:" + enc("5"));
  assert.ok(kb.inline_keyboard[2]![0]!.text.length <= 64);
  assert.equal(buildFavoritesKeyboard([], enc), undefined);
});
