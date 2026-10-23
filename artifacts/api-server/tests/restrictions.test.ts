import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  createRestrictionStore,
  parseRestrictArgs,
  protectOptionsFor,
} from "../src/bot/restrictions.ts";

test("cheklash, ro'yxat va bekor qilish ishlaydi", () => {
  const store = createRestrictionStore(new DatabaseSync(":memory:"));
  assert.equal(store.isRestricted(42), false);
  store.restrict(42, "raqobatchi");
  store.restrict(7, "");
  assert.equal(store.isRestricted(42), true);
  assert.deepEqual(store.list().map((row) => row.user_id), [7, 42]);
  store.restrict(42, "yangi izoh");
  assert.equal(store.list().find((row) => row.user_id === 42)?.note, "yangi izoh");
  assert.equal(store.unrestrict(42), true);
  assert.equal(store.unrestrict(42), false);
  assert.equal(store.isRestricted(42), false);
});

test("protect_content faqat cheklangan chatga qo'yiladi", () => {
  const store = createRestrictionStore(new DatabaseSync(":memory:"));
  store.restrict(42, "");
  assert.deepEqual(protectOptionsFor(store, 42), { protect_content: true });
  assert.deepEqual(protectOptionsFor(store, 43), {});
  assert.deepEqual(protectOptionsFor(store, "@kanal"), {});
});

test("argumentlar tekshiriladi", () => {
  assert.deepEqual(parseRestrictArgs("123 raqobatchi kanal"), { userId: 123, note: "raqobatchi kanal" });
  assert.deepEqual(parseRestrictArgs("123"), { userId: 123, note: "" });
  assert.equal(parseRestrictArgs(""), null);
  assert.equal(parseRestrictArgs("@ali"), null);
  assert.equal(parseRestrictArgs("0"), null);
  assert.equal(parseRestrictArgs("-5"), null);
});
