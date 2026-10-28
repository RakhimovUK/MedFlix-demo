import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_BY_LANG } from "../src/bot/telegram-profile.ts";

const langs = ["default", "uz", "ru", "en"] as const;

test("tavsif va qisqa tavsif Telegram limitida", () => {
  for (const lang of langs) {
    const profile = PROFILE_BY_LANG[lang];
    assert.ok(profile.description.length > 0 && profile.description.length <= 512, lang);
    assert.ok(profile.shortDescription.length > 0 && profile.shortDescription.length <= 120, lang);
  }
});

test("buyruq nomlari barcha tillarda bir xil, tavsiflar 3..256 belgi", () => {
  const names = (lang: (typeof langs)[number]) =>
    PROFILE_BY_LANG[lang].commands.map((c) => c.command).sort().join(",");
  for (const lang of langs) {
    assert.equal(names(lang), names("default"), lang);
    for (const c of PROFILE_BY_LANG[lang].commands) {
      assert.ok(c.description.length >= 3 && c.description.length <= 256, `${lang}/${c.command}`);
    }
  }
});

test("ru va en tavsiflari o'zbekcha emas", () => {
  assert.notEqual(PROFILE_BY_LANG.en.description, PROFILE_BY_LANG.uz.description);
  assert.notEqual(PROFILE_BY_LANG.ru.description, PROFILE_BY_LANG.uz.description);
});
