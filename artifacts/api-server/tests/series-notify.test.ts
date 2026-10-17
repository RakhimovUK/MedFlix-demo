import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotifyRow,
  formatNewEpisodeMessage,
  isNewLatestEpisode,
  notifySubscribers,
  parseNotifyData,
  replaceNotifyRow,
} from "../src/bot/series-notify.ts";

const eps = [
  { seasonNumber: 1, episodeNumber: 1 },
  { seasonNumber: 1, episodeNumber: 2 },
  { seasonNumber: 2, episodeNumber: 1 },
];

test("xabar faqat eng oxirgi yangi qism uchun: orqadagi, takroriy va birinchi qism uchun emas", () => {
  assert.equal(isNewLatestEpisode(eps, { seasonNumber: 2, episodeNumber: 2 }), true);
  assert.equal(isNewLatestEpisode(eps, { seasonNumber: 3, episodeNumber: 1 }), true);
  assert.equal(isNewLatestEpisode(eps, { seasonNumber: 1, episodeNumber: 5 }), false);
  assert.equal(isNewLatestEpisode(eps, { seasonNumber: 2, episodeNumber: 1 }), false);
  assert.equal(isNewLatestEpisode([], { seasonNumber: 1, episodeNumber: 1 }), false);
});

test("xabar matni nom bo'lsa nomni ham ko'rsatadi", () => {
  const withTitle = formatNewEpisodeMessage({ seriesTitle: "THE PITT", seasonNumber: 1, episodeNumber: 16, episodeTitle: "Final" });
  assert.deepEqual(withTitle.split("\n").slice(1), ["📺 THE PITT", "1-fasl, 16-qism", "Final"]);
  assert.equal(formatNewEpisodeMessage({ seriesTitle: "X", seasonNumber: 1, episodeNumber: 1 }).split("\n").length, 3);
});

test("tugma qatori: holatga qarab matn, callback 64 baytdan oshmaydi, noto'g'ri ma'lumot rad etiladi", () => {
  const on = buildNotifyRow("MTAx", true)[0]!;
  const off = buildNotifyRow("MTAx", false)[0]!;
  assert.ok(on.text.includes("o‘chirish") && off.text.includes("xabar ber"));
  assert.equal(parseNotifyData(on.callback_data!), "MTAx");
  assert.ok(Buffer.byteLength(on.callback_data!) <= 64);
  for (const bad of ["ntf:", "ntf:a b", "ntf:" + "x".repeat(51), "ep:5", ""]) {
    assert.equal(parseNotifyData(bad), null, bad);
  }
});

test("replaceNotifyRow: bor qatorni almashtiradi, yo'q bo'lsa qo'shadi", () => {
  const rows = [[{ text: "a", callback_data: "x" }], buildNotifyRow("MTAx", false)];
  const replaced = replaceNotifyRow(rows, buildNotifyRow("MTAx", true));
  assert.equal(replaced.length, 2);
  assert.ok(replaced[1]![0]!.text.includes("o‘chirish"));
  assert.equal(replaceNotifyRow([[{ text: "a", callback_data: "x" }]], buildNotifyRow("Zg", false)).length, 2);
});

test("obunachilarga yuborish: muvaffaqiyat, bloklagan o'chiriladi, boshqa xato hisoblanadi, oqim to'xtamaydi", async () => {
  const removed: number[] = [];
  const sentTo: number[] = [];
  const sleeps: number[] = [];
  const result = await notifySubscribers({
    subscribers: [1, 2, 3, 4],
    send: async (id) => {
      if (id === 2) throw new Error("Forbidden: bot was blocked by the user");
      if (id === 3) throw new Error("Too Many Requests");
      sentTo.push(id);
    },
    onUnreachable: (id) => removed.push(id),
    delayMs: 40,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  assert.deepEqual(result, { sent: 2, removed: 1, failed: 1 });
  assert.deepEqual(sentTo, [1, 4]);
  assert.deepEqual(removed, [2]);
  assert.equal(sleeps.length, 4);
});
