import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "medflix-sub-")), "t.sqlite");
const db = await import("../src/bot/database.ts");

db.upsertSeries({ code: "A", title: "Serial A" });
db.upsertSeries({ code: "B", title: "Serial B" });

test("obuna almashadi: yoqiladi, o'chadi; noma'lum serial null", () => {
  assert.equal(db.isSeriesSubscribed(1, "A"), false);
  assert.equal(db.toggleSeriesSubscription(1, "A"), true);
  assert.equal(db.isSeriesSubscribed(1, "A"), true);
  assert.equal(db.toggleSeriesSubscription(1, "A"), false);
  assert.equal(db.isSeriesSubscribed(1, "A"), false);
  assert.equal(db.toggleSeriesSubscription(1, "YOQ"), null);
});

test("obunalar foydalanuvchi va serial bo'yicha alohida", () => {
  db.toggleSeriesSubscription(1, "A");
  db.toggleSeriesSubscription(2, "A");
  db.toggleSeriesSubscription(2, "B");
  assert.deepEqual(db.listSeriesSubscribers("A").sort(), [1, 2]);
  assert.deepEqual(db.listSeriesSubscribers("B"), [2]);
  assert.deepEqual(db.listUserSubscriptions(2).map((s) => s.code).sort(), ["A", "B"]);
  db.removeSeriesSubscriber(1, "A");
  assert.deepEqual(db.listSeriesSubscribers("A"), [2]);
  db.removeSeriesSubscriber(99, "A");
  assert.deepEqual(db.listSeriesSubscribers("A"), [2]);
});

test("serial o'chirilsa uning obunalari ham o'chadi", () => {
  db.deleteSeries("B");
  assert.deepEqual(db.listSeriesSubscribers("B"), []);
  assert.deepEqual(db.listUserSubscriptions(2).map((s) => s.code), ["A"]);
});
