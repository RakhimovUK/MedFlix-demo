import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSearchStore } from "../src/bot/search-store.ts";

test("katalog: kinolar janrlari bilan, seriallar alohida", () => {
  const db = new DatabaseSync(":memory:");
  db.function("cur_lang", () => "uz");
  db.exec(`
    CREATE TABLE movies (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, lang TEXT NOT NULL DEFAULT 'uz');
    CREATE TABLE genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    CREATE TABLE movie_genres (movie_id INTEGER, genre_id INTEGER);
    CREATE TABLE series (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, lang TEXT NOT NULL DEFAULT 'uz');
    INSERT INTO movies (code, title) VALUES ('1', 'Oltin qo''llar'), ('2', 'Janrsiz kino');
    INSERT INTO movies (code, title, lang) VALUES ('1', 'Golden hands', 'en');
    INSERT INTO genres (name) VALUES ('Drama'), ('Tibbiyot');
    INSERT INTO movie_genres VALUES (1, 1), (1, 2);
    INSERT INTO series (code, title) VALUES ('S1', 'The Pitt');
  `);
  const catalog = createSearchStore(db).listSearchCatalog();
  assert.equal(catalog.movies.length, 2);
  const first = catalog.movies.find((m) => m.code === "1")!;
  assert.deepEqual([...first.genres].sort(), ["Drama", "Tibbiyot"]);
  assert.deepEqual(catalog.movies.find((m) => m.code === "2")!.genres, []);
  assert.deepEqual(catalog.series, [{ code: "S1", title: "The Pitt" }]);
});
