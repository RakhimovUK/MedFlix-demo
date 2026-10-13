import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEpisodeListPages,
  buildEpisodeNavigationRows,
  getEpisodeNeighbors,
  parseEpisodeId,
} from "../src/bot/series-navigation.ts";

// Ataylab tartibsiz va kodlar orasida bo'shliq bilan (3 va 4-qism yo'q).
const episodes = [
  { id: 30, seasonNumber: 2, episodeNumber: 1, title: "" },
  { id: 12, seasonNumber: 1, episodeNumber: 5, title: "O'rta" },
  { id: 11, seasonNumber: 1, episodeNumber: 1, title: "Boshlanish" },
  { id: 31, seasonNumber: 2, episodeNumber: 2, title: "Final" },
];

const callbacks = (id: number) =>
  buildEpisodeNavigationRows(getEpisodeNeighbors(episodes, id)!, id).map((row) =>
    row.map((b) => b.callback_data),
  );

test("birinchi qismda 'Oldingi' tugmasi yo'q", () => {
  const rows = buildEpisodeNavigationRows(getEpisodeNeighbors(episodes, 11)!, 11);
  assert.deepEqual(rows[0]!.map((b) => b.text), ["Keyingi qism ➡️"]);
  assert.deepEqual(callbacks(11), [["ep:12"], ["eps:11"]]);
});

test("o'rta qismda ikkala tugma bitta qatorda, 'Barcha qismlar' alohida qatorda", () => {
  // 1-fasl 5-qismdan keyin bo'shliqni sakramasdan 2-fasl 1-qismga o'tadi
  assert.deepEqual(callbacks(12), [["ep:11", "ep:30"], ["eps:12"]]);
});

test("oxirgi qismda 'Keyingi' tugmasi yo'q", () => {
  const rows = buildEpisodeNavigationRows(getEpisodeNeighbors(episodes, 31)!, 31);
  assert.deepEqual(rows[0]!.map((b) => b.text), ["⬅️ Oldingi qism"]);
  assert.equal(rows.length, 2);
});

test("bitta qismli serialda faqat 'Barcha qismlar' bor", () => {
  const single = [episodes[0]!];
  const rows = buildEpisodeNavigationRows(getEpisodeNeighbors(single, 30)!, 30);
  assert.deepEqual(rows.map((r) => r.map((b) => b.callback_data)), [["eps:30"]]);
});

test("o'chirilgan/noma'lum qism null qaytaradi, xato bermaydi", () => {
  assert.equal(getEpisodeNeighbors(episodes, 999), null);
});

test("callback ID tekshiruvi", () => {
  assert.equal(parseEpisodeId("12"), 12);
  for (const bad of ["", "0", "-1", "1.5", "abc", "1e3", "99999999999999999"]) {
    assert.equal(parseEpisodeId(bad), null, bad);
  }
});

test("ko'p qismli serial ro'yxati Telegram chegarasidan oshmaydi", () => {
  const many = Array.from({ length: 250 }, (_, i) => ({
    id: i + 1,
    seasonNumber: 1,
    episodeNumber: i + 1,
    title: "Juda uzun qism nomi ".repeat(8),
  }));
  const pages = buildEpisodeListPages("Serial", "S1", many);
  assert.ok(pages.length > 1);
  for (const page of pages) {
    assert.ok(page.text.length <= 4096);
    assert.ok(page.keyboard.flat().length <= 100);
  }
  assert.equal(pages.flatMap((p) => p.keyboard.flat()).length, 250);
});
