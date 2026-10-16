import assert from "node:assert/strict";
import test from "node:test";
import { adminHelpText, buildAdminPanelKeyboard, parseAdminAction } from "../src/bot/admin-panel.ts";

test("har bir tugma tanilgan amalga mos keladi, callback 64 baytdan oshmaydi", () => {
  for (const row of buildAdminPanelKeyboard().inline_keyboard) {
    for (const b of row) {
      assert.ok(parseAdminAction(b.callback_data!) !== null, b.text);
      assert.ok(Buffer.byteLength(b.callback_data!) <= 64);
    }
  }
});

test("noto'g'ri yoki begona callback null qaytaradi", () => {
  for (const bad of ["adm:", "adm:hack", "ep:5", "", "ADM:stats"]) {
    assert.equal(parseAdminAction(bad), null, bad);
  }
});

test("ko'rsatma matnlari faqat yo'riqnoma tugmalari uchun bor", () => {
  assert.ok(adminHelpText("movie")!.includes("/add KOD"));
  assert.ok(adminHelpText("poster")!.includes("/setposter"));
  assert.equal(adminHelpText("stats"), null);
});
