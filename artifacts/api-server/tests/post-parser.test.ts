import assert from "node:assert/strict";
import test from "node:test";
import { parsePostText, splitGenres } from "../src/bot/post-parser.ts";

test("label bilan: nom va janr ajratiladi (emoji va belgilar tozalanadi)", () => {
  const r = parsePostText("🎬 Nomi: Oltin qo'llar\n🎭 Janr: Drama, tibbiyot\n📅 2024");
  assert.equal(r.title, "Oltin qo'llar");
  assert.deepEqual(r.genres, ["Drama", "Tibbiyot"]);
});

test("Kino nomi / Janri / markdown belgilar", () => {
  const r = parsePostText("**Kino nomi:** «The Pitt»\n_Janri_: Tibbiy drama; Serial");
  assert.equal(r.title, "The Pitt");
  assert.deepEqual(r.genres, ["Tibbiy drama", "Serial"]);
});

test("kirill label: Название / Жанр", () => {
  const r = parsePostText("Название: Интерстеллар\nЖанр: Фантастика, Драма");
  assert.equal(r.title, "Интерстеллар");
  assert.deepEqual(r.genres, ["Фантастика", "Драма"]);
});

test("bir qatorda: Nomi ... | Janr ...", () => {
  const r = parsePostText("🎬 Nomi: Interstellar | Janr: Fantastika, Drama");
  assert.equal(r.title, "Interstellar");
  assert.deepEqual(r.genres, ["Fantastika", "Drama"]);
});

test("label yo'q: birinchi qator nom, hashtag qatori janr", () => {
  const r = parsePostText("🔥 Interstellar (2014)\nFantastik film haqida...\n#fantastika #drama");
  assert.equal(r.title, "Interstellar (2014)");
  assert.deepEqual(r.genres, ["Fantastika", "Drama"]);
});

test("bo'sh yoki mazmunsiz matn: null va bo'sh ro'yxat", () => {
  assert.deepEqual(parsePostText(""), { title: null, genres: [] });
  assert.deepEqual(parsePostText(undefined), { title: null, genres: [] });
  assert.deepEqual(parsePostText("#a #b"), { title: null, genres: ["A", "B"] });
});

test("janr dublikatlari (katta-kichik harf) olib tashlanadi, soni cheklanadi", () => {
  assert.deepEqual(splitGenres("drama, DRAMA, Drama"), ["Drama"]);
  const many = splitGenres("a,b,c,d,e,f,g,h,i,j");
  assert.equal(many.length, 8);
});

test("🎬 qatori birinchi bo'lmasa ham nom bo'ladi; xizmat qatorlari nom emas", () => {
  const r = parsePostText("🔥 YANGI KINO\n🎬 Shifokor uchun 10.000 soat qoidasi\nJanr: Tibbiyot, Biografiya, Drama\nTarjima: O'zbek tilida (Professional dublyaj)\nReyting: IMDb 7.5/10");
  assert.equal(r.title, "Shifokor uchun 10.000 soat qoidasi");
  assert.deepEqual(r.genres, ["Tibbiyot", "Biografiya", "Drama"]);
});

test("label ham 🎬 ham yo'q: Janr/Tarjima qatorlari nom bo'lib qolmaydi", () => {
  const r = parsePostText("Janr: Drama\nTarjima: O'zbek tilida\nOltin qo'llar\n#drama");
  assert.equal(r.title, "Oltin qo'llar");
  assert.deepEqual(r.genres, ["Drama"]);
});

test("Nomi: label 🎬 dan ustun turadi", () => {
  const r = parsePostText("🎬 Reklama\nNomi: Haqiqiy nom");
  assert.equal(r.title, "Haqiqiy nom");
});
