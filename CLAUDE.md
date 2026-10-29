# CLAUDE.md — MedFlix Telegram bot (Claude Code uchun yo'riqnoma)

Egasi: Ubaydullo (o'zbek tilida yozadi, dasturchi emas). Oldin kod Replit Shell orqali
qo'lda qo'yilar edi; endi barcha o'zgarishlarni Claude Code to'g'ridan-to'g'ri shu
repoda qiladi (1 oy sinov muddati). Replit faqat botni ishga tushirish uchun qoladi.

## Egasi bilan ishlash qoidalari
- Javoblar qisqa, o'zbek tilida, oddiy so'zlar bilan. Texnik atamalar kam.
- Vazifalarni kichik qilib bo'l (token tejash). Har javob oxirida "Upgrade ro'yxati" (holat: ✅ ⏳ ⏸).
- "Push qilinganmi?" deb so'rama. Muammo aytilmasa push qilingan deb hisobla. Push'ni o'zing bajar.
- Har o'zgarishdan oldin shuni tekshir: `pnpm --filter @workspace/api-server test` va
  `pnpm run typecheck` o'tishi shart. Yiqilsa commit qilma.
- Faqat Telegram `main` shoxiga kichik, tushunarli commitlar (o'zbekcha xabar).
- Token va sirlarni fayllarga yozma (`TELEGRAM_BOT_TOKEN` faqat Replit Secrets'da). Repo ochiq.
- Mavjud ma'lumotlarni buzadigan o'zgarishdan oldin zaxira (`/backup`) va migratsiya testi bo'lsin.
- Telefon orqali ishlaydi: qo'lda nusxalanadigan buyruq berish kerak bo'lsa, bloklar ≤120 qator.

## Loyiha
- TypeScript / Node 24, pnpm monorepo. Bot: `artifacts/api-server/src/bot/`.
- Telegram long polling, SQLite (`node:sqlite`, fayl `DATABASE_PATH`, odatda `data/kino-bot.sqlite`).
- Testlar: `artifacts/api-server/tests/*.test.ts` (node --test, strip-types).
- Ishga tushirish (Replit): `pkill -f "dist/index.mjs"; pnpm run build; PORT=8080 NODE_ENV=production nohup node artifacts/api-server/dist/index.mjs &`
  Bir vaqtda faqat BITTA nusxa ishlasin (ikkita bo'lsa 409 Conflict va "Kino topilmadi").
- Muhim env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`, `DATABASE_PATH`, `AUTO_BACKUP`, `AUTO_BACKUP_HOUR_UTC`.
- Kanal: MF_Base (yopiq, `-1004418309907`): tizim posti 17, mundarija postlari 22–26.

## Modullar (qisqacha)
- `telegram.ts` — handleMessage, polling, start. `telegram-*.ts` — types/state/structure/subscription/menu/delivery/callbacks/admin-ops/user-commands/admin-commands/profile.
- `database.ts` — sxema va saqlash. `config.ts`, `keyboards.ts`.
- Qidiruv: `smart-search.ts`, `search-store.ts`, `alias-learning.ts`. So'rovlar: `request-flow.ts`, `request-guard.ts`, `requests-store.ts`.
- Post tahlili: `post-parser.ts` (nom, janr), `post-language.ts` (til belgisi).
- Mundarija: `contents-delivery.ts`, `catalog-content.ts`. Serial: `series-card.ts`, `series-navigation.ts`, `series-notify.ts`.
- Cheklov: `restrictions.ts`, `restriction-runtime.ts` (`protectFor(chatId)` -> `protect_content`).

## Bajarilganlar
Kod tartibi va sub-kodlar (1.A), qism navigatsiyasi, mundarija (5 post + ochiq kanallar `/setpubcontents`),
`/deletepart`, serial auto-delete, poster (`/setposter`...), so'rovlar topic (✅/❌/💬), post parser,
aqlli qidiruv, `/alias`, avtomatik so'rov, telegram.ts bo'linishi, `/restrict`,
til 1-vazifa (bot profili uz/ru/en), til 2-vazifa (`post-language.ts`).

## Asosiy maqsad: bitta botda 3 til (uz / ru / en)
Foydalanuvchi tilni tanlaydi; bot faqat shu tildagi kontentni beradi. Bir xil kod (masalan `1`)
har tilda boshqa kino (boshqa video va poster) bo'lishi mumkin.

Qarorlar (o'zgartirma):
- Til FAQAT postdagi `Til:` / `Язык:` / `Language:` belgisidan olinadi. Nomga qarab taxmin qilinmaydi.
- Bir nechta til yoki belgi yo'q bo'lsa, admin 🇺🇿/🇷🇺/🇬🇧 tugmalari bilan tanlaydi.
- Kino kaliti `(lang, code)`. Mavjud barcha ma'lumot `uz` bo'ladi.
- Foydalanuvchi tilining boshlang'ichi Telegram `language_code`; keyin o'zi tanlaydi.
- Kod shu tilda yo'q bo'lsa: "«1» kodi 🇬🇧 English tilida hali biriktirilmagan…" + 📚 Katalog tugmasi, admin so'roviga 🌐 til belgisi.
- Poster va caption Gemini orqali tayyorlanadi; mini post (synopsis) admin tasdig'idan keyin ko'rinadi.

## Navbat (tartib bilan, har biri alohida kichik commit)
3. Ko'p tilli/belgisiz post uchun admin tanlovi (`decidePostLanguage` ni `telegram.ts` post oqimiga ulash; kutilayotgan post mexanizmi).
4. `/backup`, so'ng `movies.lang` (default `uz`). Eng xavfli qism: migratsiya testi shart.
5. `series`, `series_episodes`, `genres`, `movie_posts` ga `lang`.
6. `bot_users.lang`, `getUserLang/setUserLang`.
7. Qidiruv foydalanuvchi tilida. 8. Yetkazish, tugmalar, sevimlilar, progress tilga bog'liq.
9. Admin ish tili `/lang`. 10. "Kod topilmadi" javobi. 11. `/start` da til tanlash, `/language`, menyu 3 tilda.
12. Qolgan xabarlar 3 tilda (2–3 bo'lak). 13. Mini post (synopsis) va "Haqida" tugmasi.

## 1 oylik reja
- 1-hafta: 3–6-vazifalar (til asosi, baza migratsiyasi). Har migratsiyadan oldin zaxira.
- 2-hafta: 7–10-vazifalar (qidiruv, yetkazish, `/lang`, topilmadi javobi). Haqiqiy botda sinov.
- 3-hafta: 11–12 (til tanlash, matnlar). Foydalanuvchilarga e'lon.
- 4-hafta: 13 (synopsis), eski kinolarni tekshirish, zaxira/monitoring, qoldiq xatolar.
- Parallel: xFilms klon boti (`RakhimovUK/xFilms-demo`, brend xFilms, bot xFilmsRobot) — MedFlix til ishlari barqarorlashgach shu kodni asos qilib olish.
- Server olingach: deploy (doimiy diskli VPS yoki Oracle; Render free'da disk yo'q). Shu paytgacha Replit.

## Ehtiyot bo'l
- Telegram bot nusxa ikkita bo'lmasin. Token faqat Secrets'da.
- `telegram.ts` ga yangi mantiq qo'shma: mos `telegram-*.ts` modulga qo'y.
- Sandboxda `@types/node` yo'q bo'lishi mumkin: typecheck'ni bazaviy xatolar bilan solishtir.
