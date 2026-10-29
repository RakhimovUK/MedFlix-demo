import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

// Eski sxemadagi baza (lang ustuni yo'q) yaratamiz.
const dir = mkdtempSync(path.join(tmpdir(), "medflix-lang-"));
const dbPath = path.join(dir, "old.sqlite");
const old = new DatabaseSync(dbPath);
old.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    channel_chat_id TEXT NOT NULL,
    channel_message_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    poster_file_id TEXT,
    poster_caption TEXT
  );
  CREATE TABLE genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
  CREATE TABLE movie_genres (
    movie_id INTEGER NOT NULL, genre_id INTEGER NOT NULL,
    PRIMARY KEY (movie_id, genre_id),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
  );
  CREATE TABLE movie_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, movie_id INTEGER NOT NULL,
    post_number INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
    channel_chat_id TEXT NOT NULL, channel_message_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (movie_id, post_number),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
  );
  INSERT INTO movies (code, title, channel_chat_id, channel_message_id, poster_file_id)
    VALUES ('1', 'Eski kino', '-100', 11, 'PHOTO1'), ('2', 'Ikkinchi', '-100', 12, NULL);
  INSERT INTO genres (name) VALUES ('Drama');
  INSERT INTO movie_genres VALUES (1, 1);
  INSERT INTO movie_posts (movie_id, post_number, title, channel_chat_id, channel_message_id)
    VALUES (1, 1, 'Eski kino', '-100', 11), (1, 2, 'Davomi', '-100', 13);
`);
old.close();

process.env.DATABASE_PATH = dbPath;
const db = await import("../src/bot/database.ts");

test("migratsiya: eski kinolar uz bo'ladi, aloqalar saqlanadi, zaxira yaratiladi", () => {
  const movie = db.findMovie("1");
  assert.equal(movie?.title, "Eski kino");
  assert.equal(movie?.lang, "uz");
  assert.equal(movie?.id, 1);
  assert.equal(db.listMovies().length, 2);
  assert.equal(db.getMoviePoster("1"), "PHOTO1");
  assert.deepEqual(
    db.listMoviePosts("1").map((p) => p.postNumber),
    [1, 2],
  );
  assert.equal(db.listMoviesByGenre("Drama").length, 1);
  assert.ok(existsSync(`${dbPath}.before-lang.bak`));
});

test("bir xil kod boshqa tilda alohida kino bo'ladi", () => {
  db.upsertMovie({
    code: "1",
    lang: "en",
    title: "Old movie",
    channelChatId: "-200",
    channelMessageId: 21,
  });
  assert.equal(db.findMovie("1")?.title, "Eski kino");
  assert.equal(db.findMovie("1", "en")?.title, "Old movie");
  assert.equal(db.findMovie("1", "ru"), null);
  assert.equal(db.listMovies().length, 3);
  assert.equal(db.listMovies("en").length, 1);
  assert.equal(db.listMovies("uz").length, 2);
});

test("upsert shu til ichida yangilaydi, boshqa tilga tegmaydi", () => {
  db.upsertMovie({ code: "1", lang: "en", title: "Old movie 2", channelChatId: "-200", channelMessageId: 22 });
  assert.equal(db.findMovie("1", "en")?.title, "Old movie 2");
  assert.equal(db.findMovie("1")?.title, "Eski kino");
  assert.equal(db.listMovies("en").length, 1);
});

test("postlar, janr va poster tilga bog'liq", () => {
  assert.deepEqual(db.listMoviePosts("1", "en").map((p) => p.postNumber), [1]);
  db.upsertMoviePost({ movieCode: "1", lang: "en", postNumber: 2, title: "Part", channelChatId: "-200", channelMessageId: 23 });
  assert.equal(db.listMoviePosts("1", "en").length, 2);
  assert.equal(db.listMoviePosts("1").length, 2);

  assert.equal(db.setMovieGenres("1", ["Action"], "en"), true);
  assert.equal(db.listMoviesByGenre("Action").length, 1);
  assert.equal(db.listMoviesByGenre("Action", "uz").length, 0);
  assert.equal(db.listMoviesByGenre("Drama", "en").length, 0);

  assert.equal(db.setMoviePoster("1", "ENPHOTO", null, "en"), true);
  assert.equal(db.getMoviePoster("1", "en"), "ENPHOTO");
  assert.equal(db.getMoviePoster("1"), "PHOTO1");
  assert.equal(db.clearMoviePoster("1", "en"), true);
  assert.equal(db.getMoviePoster("1"), "PHOTO1");
});

test("qidiruv tilga qarab filtrlanadi", () => {
  assert.equal(db.searchMovies("movie").length, 1);
  assert.equal(db.searchMovies("movie", "uz").length, 0);
  assert.equal(db.searchMovies("kino", "uz").length, 1);
});

test("o'chirish faqat shu tilni o'chiradi", () => {
  assert.equal(db.deleteMovie("1", "en"), true);
  assert.equal(db.findMovie("1", "en"), null);
  assert.equal(db.findMovie("1")?.title, "Eski kino");
  assert.equal(db.deleteMovie("1", "en"), false);
});
