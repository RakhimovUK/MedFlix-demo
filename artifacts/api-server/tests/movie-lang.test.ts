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
  CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, poster_file_id TEXT, poster_caption TEXT
  );
  CREATE TABLE series_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, series_id INTEGER NOT NULL,
    season_number INTEGER NOT NULL DEFAULT 1, episode_number INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '', channel_chat_id TEXT NOT NULL, channel_message_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (series_id, season_number, episode_number),
    FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
  );
  INSERT INTO series (code, title, poster_file_id) VALUES ('S1', 'Eski serial', 'SPHOTO');
  INSERT INTO series_episodes (series_id, season_number, episode_number, title, channel_chat_id, channel_message_id)
    VALUES (1, 1, 1, '1-qism', '-100', 31), (1, 1, 2, '2-qism', '-100', 32);
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

test("serial migratsiyasi: eski seriallar uz, qismlar saqlanadi", () => {
  const series = db.findSeries("S1");
  assert.equal(series?.title, "Eski serial");
  assert.equal(series?.episodeCount, 2);
  assert.equal(db.getSeriesPoster("S1"), "SPHOTO");
  assert.ok(existsSync(`${dbPath}.before-series-lang.bak`));
});

test("til konteksti: kod shu tildagi kino/serialga bog'lanadi", () => {
  db.upsertMovie({ code: "7", lang: "ru", title: "Седьмой", channelChatId: "-300", channelMessageId: 70 });
  assert.equal(db.findMovie("7"), null);
  assert.equal(db.runWithLang("ru", () => db.findMovie("7"))?.title, "Седьмой");
  assert.equal(db.runWithLang("ru", () => db.currentLang()), "ru");
  assert.equal(db.currentLang(), "uz");

  db.runWithLang("en", () => {
    assert.equal(db.findSeries("S1"), null);
    db.upsertSeries({ code: "S1", title: "Old series" });
    db.upsertSeriesEpisode({ seriesCode: "S1", seasonNumber: 1, episodeNumber: 1, title: "Ep 1", channelChatId: "-200", channelMessageId: 41 });
    assert.equal(db.findSeries("S1")?.episodeCount, 1);
    assert.equal(db.getSeriesPoster("S1"), null);
  });
  assert.equal(db.findSeries("S1")?.title, "Eski serial");
  assert.equal(db.findSeries("S1")?.episodeCount, 2);
  assert.equal(db.listSeries("en").length, 1);
  assert.equal(db.listSeries().length, 2);
});

test("janrlar soni joriy til bo'yicha", () => {
  db.setMovieGenres("2", ["Drama"]);
  const uzDrama = db.listGenres().find((g) => g.name === "Drama");
  assert.equal(uzDrama?.movieCount, 2);
  const enDrama = db.runWithLang("en", () => db.listGenres().find((g) => g.name === "Drama"));
  assert.equal(enDrama?.movieCount, 0);
});

test("foydalanuvchi tili: tanlamagan bo'lsa uz", () => {
  assert.equal(db.getStoredUserLang(555), null);
  assert.equal(db.getUserLang(555), "uz");
  db.setUserLang(555, "en");
  assert.equal(db.getUserLang(555), "en");
  db.touchBotUser(555);
  assert.equal(db.getStoredUserLang(555), "en");
});
