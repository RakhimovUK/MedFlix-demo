import assert from "node:assert/strict";
import test from "node:test";
import {
  groupHits,
  looksLikeCode,
  normalizeText,
  scoreText,
  smartSearch,
  type AliasEntry,
} from "../src/bot/smart-search.ts";

const catalog = {
  movies: [
    { code: "1", title: "Oltin qo'llar", genres: ["Drama", "Tibbiy drama"] },
    { code: "1.A", title: "Oltin qo'llar 2", genres: ["Drama"] },
    { code: "2", title: "Interstellar", genres: ["Fantastika"] },
    { code: "101", title: "Garri Potter", genres: ["Fantastika", "Sarguzasht"] },
  ],
  series: [{ code: "S1", title: "The Pitt" }],
};

const codes = (hits: ReturnType<typeof smartSearch>) => hits.map((h) => h.code);

test("normalizeText: apostrof, kirill, tinish belgilari birxil bo'ladi", () => {
  assert.equal(normalizeText("Qo‘llar"), "qollar");
  assert.equal(normalizeText("Қўллар"), "qollar");
  assert.equal(normalizeText("  O'ZBEK,  kino!! "), "ozbek kino");
});

test("kod bo'yicha: aniq mos birinchi, 1.a kichik harfda ham ishlaydi", () => {
  const hits = smartSearch("1.a", catalog);
  assert.equal(hits[0]?.code, "1.A");
  assert.equal(hits[0]?.via, "code");
  assert.equal(smartSearch("#101", catalog)[0]?.code, "101");
});

test("nom bo'yicha: qisman, apostrofsiz va imlo xatosi bilan", () => {
  assert.ok(codes(smartSearch("oltin", catalog)).includes("1"));
  assert.equal(smartSearch("qollar", catalog)[0]?.via, "title");
  assert.equal(codes(smartSearch("interstelar", catalog))[0], "2");
  assert.equal(codes(smartSearch("the pit", catalog))[0], "S1");
  assert.deepEqual(smartSearch("zzzzzz", catalog), []);
});

test("janr bo'yicha: Tibbiyot -> Tibbiy drama kinolari, Drama -> drama kinolari", () => {
  const medical = smartSearch("Tibbiyot", catalog);
  assert.deepEqual(codes(medical), ["1"]);
  assert.equal(medical[0]?.via, "genre");
  assert.deepEqual(codes(smartSearch("drama", catalog)).sort(), ["1", "1.A"]);
  assert.deepEqual(codes(smartSearch("fantastika", catalog)).sort(), ["101", "2"]);
});

test("alias: faqat yetarli hits bo'lsa ishlaydi va birinchi chiqadi", () => {
  const weak: AliasEntry[] = [{ aliasNorm: "harry poter", kind: "movie", code: "101", hits: 1 }];
  assert.ok(!codes(smartSearch("harry poter", catalog, weak)).includes("101"));
  const strong: AliasEntry[] = [{ aliasNorm: "harry poter", kind: "movie", code: "101", hits: 2 }];
  const hits = smartSearch("Harry Poter", catalog, strong);
  assert.equal(hits[0]?.code, "101");
  assert.equal(hits[0]?.via, "alias");
});

test("scoreText chegaralari va looksLikeCode", () => {
  assert.equal(scoreText("ab", "xyz"), 0);
  assert.equal(scoreText("drama", "drama"), 100);
  assert.equal(looksLikeCode("999"), true);
  assert.equal(looksLikeCode("1.a"), true);
  assert.equal(looksLikeCode("oltin qollar"), false);
});

test("groupHits: aniq nom -> primary, janr -> genre, imlo xatosi -> faqat fuzzy", () => {
  const exact = groupHits(smartSearch("oltin", catalog));
  assert.ok(exact.primary.length >= 1);
  assert.equal(exact.fuzzy.length, 0);

  const byGenre = groupHits(smartSearch("Tibbiyot", catalog));
  assert.deepEqual(byGenre.genre.map((h) => h.code), ["1"]);
  assert.equal(byGenre.primary.length, 0);

  const typo = groupHits(smartSearch("interstelar", catalog));
  assert.deepEqual(typo.fuzzy.map((h) => h.code), ["2"]);
  assert.equal(typo.primary.length, 0);

  assert.deepEqual(groupHits([]), { primary: [], genre: [], fuzzy: [] });
});

test("normalizatsiya: oʻ / o‘ / o' va kirill-lotin bir xil natija beradi, so'z tartibi muhim emas", () => {
  for (const q of ["Oltin qo'llar", "oltin qo‘llar", "OLTIN QOʻLLAR", "Олтин қўллар", "qollar oltin"]) {
    assert.equal(smartSearch(q, catalog)[0]?.code, "1", q);
  }
  assert.equal(smartSearch("Oltin-qo'llar!!", catalog)[0]?.code, "1");
});

test("kodning bir qismi boshqa kodni topib bermaydi (10 -> 101 emas)", () => {
  assert.deepEqual(smartSearch("10", catalog).filter((h) => h.via === "code"), []);
  assert.equal(smartSearch("101", catalog)[0]?.code, "101");
});

test("so'z tartibi farqi imlo xatosi emas (primary), qisqa kod nomga mos kelmaydi", () => {
  const ordered = groupHits(smartSearch("qollar oltin", catalog));
  assert.ok(ordered.primary.some((h) => h.code === "1"));
  assert.equal(ordered.fuzzy.length, 0);
  assert.deepEqual(smartSearch("10", catalog), []);
  assert.deepEqual(smartSearch("1.a", catalog).map((h) => h.code), ["1.A"]);
});
