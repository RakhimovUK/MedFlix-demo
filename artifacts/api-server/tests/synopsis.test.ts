import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  aboutCallback,
  buildAboutText,
  createSynopsisStore,
  parseAboutData,
  parseReviewData,
  reviewCallback,
} from "../src/bot/synopsis.ts";

test("qoralama tasdiqlanmaguncha foydalanuvchiga ko'rinmaydi", () => {
  const store = createSynopsisStore(new DatabaseSync(":memory:"));
  store.saveDraft("movie", 1, "  Qisqa mazmun  ");
  assert.equal(store.getApproved("movie", 1), null);
  assert.deepEqual(store.get("movie", 1), { kind: "movie", contentId: 1, text: "Qisqa mazmun", status: "draft" });
  assert.equal(store.approve("movie", 1), true);
  assert.equal(store.getApproved("movie", 1), "Qisqa mazmun");
});

test("yangi matn qayta qoralamaga tushadi; o'chirish", () => {
  const store = createSynopsisStore(new DatabaseSync(":memory:"));
  store.saveDraft("series", 5, "A");
  store.approve("series", 5);
  store.saveDraft("series", 5, "B");
  assert.equal(store.getApproved("series", 5), null);
  assert.equal(store.get("series", 5)?.text, "B");
  assert.equal(store.remove("series", 5), true);
  assert.equal(store.get("series", 5), null);
  assert.equal(store.approve("series", 5), false);
});

test("kino va serial alohida", () => {
  const store = createSynopsisStore(new DatabaseSync(":memory:"));
  store.saveDraft("movie", 1, "Kino");
  store.saveDraft("series", 1, "Serial");
  assert.equal(store.get("movie", 1)?.text, "Kino");
  assert.equal(store.get("series", 1)?.text, "Serial");
});

test("callback ma'lumotlari", () => {
  assert.equal(aboutCallback("movie", 12), "about:m:12");
  assert.deepEqual(parseAboutData("about:s:3"), { kind: "series", contentId: 3 });
  assert.equal(parseAboutData("about:x:3"), null);
  assert.equal(reviewCallback("ok", "series", 7), "syn:ok:s:7");
  assert.deepEqual(parseReviewData("syn:no:m:9"), { action: "no", kind: "movie", contentId: 9 });
  assert.equal(parseReviewData("syn:maybe:m:9"), null);
});

test("Haqida matni sarlavha bilan, 4096 dan oshmaydi", () => {
  assert.equal(buildAboutText("🎬 Steve", "Matn"), "🎬 Steve\n\nMatn");
  assert.equal(buildAboutText("T", "x".repeat(5000)).length, 4096);
});
