import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createAliasLearner } from "../src/bot/alias-learning.ts";
import { createSearchStore } from "../src/bot/search-store.ts";
import { smartSearch } from "../src/bot/smart-search.ts";

const catalog = {
  movies: [{ code: "101", title: "Garri Potter", genres: [] }],
  series: [],
};

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE movies (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT);
    CREATE TABLE genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    CREATE TABLE movie_genres (movie_id INTEGER, genre_id INTEGER);
    CREATE TABLE series (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT);
  `);
  const store = createSearchStore(db);
  let time = 1_000;
  const learner = createAliasLearner({
    bump: (n, k, c) => store.bumpAlias(n, k, c),
    now: () => time,
    ttlMs: 1000,
  });
  return { store, learner, advance: (ms: number) => (time += ms) };
}

test("alias saqlash qatlami: set / bump / list / remove", () => {
  const { store } = setup();
  assert.equal(store.bumpAlias("x", "movie", "1"), 1);
  assert.equal(store.bumpAlias("x", "movie", "1"), 2);
  store.setAlias("y", "series", "S1");
  assert.deepEqual(store.listAliasesForCode("series", "S1"), [
    { aliasNorm: "y", kind: "series", code: "S1", hits: 100 },
  ]);
  assert.equal(store.listAliases().length, 2);
  assert.equal(store.removeAlias("y", "series", "S1"), true);
  assert.equal(store.removeAlias("y", "series", "S1"), false);
});

test("tanlanganda bog'lanadi: ikkinchi marta tanlangach alias qidiruvda ishlaydi", () => {
  const { store, learner } = setup();
  const q = "garri poter";
  assert.deepEqual(smartSearch(q, catalog, store.listAliases()).map((h) => h.via), ["title"]);

  learner.remember(7, q, ["movie:101"]);
  assert.equal(learner.onSelect(7, "movie", "101"), true);
  assert.equal(store.listAliases()[0]?.hits, 1);
  // 1 ta tanlov hali yetmaydi: nom bo'yicha topiladi, alias emas
  assert.equal(smartSearch(q, catalog, store.listAliases())[0]?.via, "title");

  learner.remember(8, q, ["movie:101"]);
  learner.onSelect(8, "movie", "101");
  const hit = smartSearch(q, catalog, store.listAliases())[0]!;
  assert.equal(hit.via, "alias");
  assert.equal(hit.code, "101");
});

test("faqat ro'yxatdagi natija, bir marta, muddati ichida bog'lanadi", () => {
  const { store, learner, advance } = setup();
  learner.remember(1, "abc", ["movie:5"]);
  assert.equal(learner.onSelect(1, "movie", "999"), false);
  assert.equal(learner.onSelect(1, "movie", "5"), true);
  assert.equal(learner.onSelect(1, "movie", "5"), false);

  learner.remember(2, "abc", ["movie:5"]);
  advance(2000);
  assert.equal(learner.onSelect(2, "movie", "5"), false);

  learner.remember(3, "abc", ["movie:5"]);
  learner.forget(3);
  assert.equal(learner.onSelect(3, "movie", "5"), false);
  assert.equal(store.listAliases().length, 1);
});

test("qo'lda alias (hits 100) darhol ishlaydi", () => {
  const { store } = setup();
  store.setAlias("garri", "movie", "101");
  const hit = smartSearch("Garri", catalog, store.listAliases())[0]!;
  assert.equal(hit.via, "alias");
});
