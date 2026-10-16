import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUptime,
  formatVersionMessage,
  resolveVersion,
} from "../src/bot/version-info.ts";

const started = new Date("2026-10-15T00:00:00Z");

test("git bor bo'lsa commit, sarlavha va toza holat aniqlanadi", () => {
  const info = resolveVersion(
    {},
    (args) => {
      if (args[0] === "rev-parse") return "7788103";
      if (args[0] === "status") return "";
      return "Katalog tugmasi";
    },
    started,
  );
  assert.equal(info.commit, "7788103");
  assert.equal(info.dirty, false);
  assert.equal(info.subject, "Katalog tugmasi");
});

test("commit qilinmagan o'zgarish bo'lsa dirty=true", () => {
  const info = resolveVersion(
    {},
    (args) => (args[0] === "status" ? " M telegram.ts" : "abc1234"),
    started,
  );
  assert.equal(info.dirty, true);
});

test("env commit ustun turadi, git bo'lmasa noma'lum", () => {
  const env = resolveVersion({ RENDER_GIT_COMMIT: "1234567890abcdef" }, () => null, started);
  assert.equal(env.commit, "1234567");
  assert.equal(env.source, "env");
  const none = resolveVersion({}, () => null, started);
  assert.equal(none.source, "noma'lum");
});

test("xabar formati va ishlash vaqti", () => {
  assert.equal(formatUptime(90 * 60000), "1 soat 30 daqiqa");
  assert.equal(formatUptime(26 * 3600000), "1 kun 2 soat 0 daqiqa");
  const text = formatVersionMessage(
    resolveVersion({}, (a) => (a[0] === "status" ? "" : "7788103"), started),
    { movies: 5, series: 1, episodes: 15 },
    new Date("2026-10-15T03:12:00Z"),
    "v24.13.0",
  );
  assert.ok(text.includes("• Commit: 7788103"));
  assert.ok(text.includes("2026-10-15 00:00 UTC (3 soat 12 daqiqa oldin)"));
  assert.ok(text.includes("5 ta kino, 1 ta serial (15 ta qism)"));
});
