import assert from "node:assert/strict";
import test from "node:test";
import { checkRequestText, describeGuardReason } from "../src/bot/request-guard.ts";

const reason = (text: string) => {
  const result = checkRequestText(text);
  return result.ok ? "ok" : result.reason;
};

test("oddiy kino nomlari so'rovga aylanadi", () => {
  assert.equal(reason("Oltin qo'llar"), "ok");
  assert.equal(reason("the pit"), "ok");
  assert.equal(reason("Garri Potter 2"), "ok");
});

test("kod ko'rinishidagi matn so'rov emas", () => {
  assert.equal(reason("999"), "code");
  assert.equal(reason("#101"), "code");
  assert.equal(reason("1.a"), "code");
});

test("salomlashuv, havola, qisqa va uzun matn so'rov emas", () => {
  assert.equal(reason("Salom"), "greeting");
  assert.equal(reason("assalomu alaykum"), "greeting");
  assert.equal(reason("rahmat!"), "greeting");
  assert.equal(reason("https://example.com/kino"), "link");
  assert.equal(reason("t.me/kanal"), "link");
  assert.equal(reason("@someone"), "link");
  assert.equal(reason("ab"), "short");
  assert.equal(reason("??"), "short");
  assert.equal(reason("a".repeat(101)), "long");
});

test("salom so'zi kino nomi bilan birga kelsa so'rov bo'ladi", () => {
  assert.equal(reason("salom kino nomi"), "ok");
  assert.ok(describeGuardReason("greeting").length > 0);
});
