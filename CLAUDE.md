# CLAUDE.md — MedFlix Telegram bot (Claude Code uchun yo'riqnoma)

Egasi: Ubaydullo (o'zbek tilida yozadi, dasturchi emas). Barcha kod o'zgarishlarini Claude Code
shu repoda qiladi va `main` ga push qiladi. Bot **Railway**'da ishlaydi: `main` ga har push
avtomatik deploy bo'ladi. Replit endi ishlatilmaydi.

## Egasi bilan ishlash qoidalari
- Javoblar qisqa, o'zbek tilida, oddiy so'zlar bilan. Har javob oxirida "Upgrade ro'yxati" (✅ ⏳ ⏸).
- Navbatdagi ishlarni so'ramasdan ketma-ket bajaraver; faqat qaytarib bo'lmaydigan va ikki xil
  tushunish mumkin bo'lgan qarorda to'xtab so'ra.
- Push: har kichik o'zgarishda emas — 3–4 vazifani birga qilib, bitta push (o'zbekcha commit xabari).
  "Push qilinganmi?" deb so'rama.
- Commit'dan oldin: `pnpm --filter @workspace/api-server test` va typecheck o'tishi shart.
- Mavjud ma'lumotni o'zgartiradigan migratsiyadan oldin avtomatik zaxira (`VACUUM INTO`) va migratsiya testi.
- Token va sirlarni fayllarga yozma (repo ochiq). Sirlar faqat Railway Variables'da.
- Egasiga buyruq berish kerak bo'lsa (u telefondan ishlaydi): qisqa, bitta nusxalanadigan blok.

## Deploy (Railway)
- `main` ga push -> Railway o'zi build va deploy qiladi (Activity: "Deployment successful").
- SQLite fayli doimiy diskda bo'lishi SHART: servisda Volume (masalan `/data`) va
  `DATABASE_PATH=/data/kino-bot.sqlite`. Volume bo'lmasa har deploy'da baza o'chadi.
- Bir vaqtda faqat BITTA bot nusxasi (ikkita bo'lsa 409 Conflict va "Kino topilmadi").
- Muhim env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`, `DATABASE_PATH`, `AUTO_BACKUP`, `AUTO_BACKUP_HOUR_UTC`,
  `TELEGRAM_REQUIRED_CHANNEL_IDS/URLS`, `TELEGRAM_DISCUSSION_URL`.
- Kanal: MF_Base (yopiq, `-1004418309907`): tizim posti 17, mundarija postlari 22–26.

## Loyiha
- TypeScript / Node 24, pnpm monorepo. Bot: `artifacts/api-server/src/bot/`. Build: esbuild.
- Telegram long polling, SQLite (`node:sqlite`).
- Testlar: `artifacts/api-server/tests/*.test.ts` (`node --test`, strip-types, `tests/resolve-ts.mjs`
  kengaytmasiz importlarni ochadi). Bot oqimini tekshirish uchun soxta Telegram (fetch mock) bilan
  `startTelegramBot()` ni ishga tushirib sinash foydali.

## Modullar (qisqacha)
- `telegram.ts` — handleMessage, polling (har update `runWithLang` ichida), start.
- `telegram-*.ts` — types/state/structure/subscription/menu/profile/delivery/callbacks/admin-ops/user-commands/admin-commands.
  `telegram.ts` ga yangi mantiq qo'shma, mos modulga qo'y.
- `database.ts` — sxema, migratsiyalar, saqlash. `config.ts`, `keyboards.ts`, `alerts.ts`, `telegram-api.ts`.
- `i18n.ts` — til konteksti va foydalanuvchi matnlari (uz/ru/en). `language-picker.ts` — til tugmalari.
- Qidiruv: `smart-search.ts`, `search-store.ts`, `alias-learning.ts`. So'rovlar: `request-flow.ts`, `request-guard.ts`, `requests-store.ts`.
- Post tahlili: `post-parser.ts` (nom, janr), `post-language.ts` (til belgisi), `add-language.ts` (/add da til tanlash).
- Mundarija: `contents-delivery.ts`, `catalog-content.ts`. Serial: `series-card.ts`, `series-navigation.ts`, `series-notify.ts`.
- Mini post: `synopsis.ts`. Cheklov: `restrictions.ts`, `restriction-runtime.ts` (`protectFor(chatId)`).

## Bitta botda 3 til (uz / ru / en) — tayyor
Qarorlar (o'zgartirma):
- Kino/serial kaliti `(lang, code)`: bir xil kod har tilda boshqa kino bo'lishi mumkin. Eski ma'lumot `uz`.
- Til FAQAT postdagi `Til:` / `Язык:` / `Language:` belgisidan; nomdan taxmin qilinmaydi.
  Ko'p tilli yoki belgisiz post -> admin `addlang:` tugmalari bilan tanlaydi.
- Foydalanuvchi tilni o'zi tanlaydi (`/start`, `/language`, "🌐 Til"); Telegram tili faqat taklif.
- Admin matnlari o'zbekcha. Kanal postlari (tizim, mundarija) doim `uz` (`PUBLIC_LANG`).

Arxitektura:
- `movies`, `series`: `lang` ustuni, UNIQUE(lang, code). Qismlar, postlar, janrlar id orqali tilga ergashadi.
- `i18n.ts`: `currentLang()` (AsyncLocalStorage), `runWithLang()`, `t("key", {vars})`. `database.ts` SQL'da
  `cur_lang()` funksiyasi — kod bo'yicha barcha qidiruvlar joriy tilda. Yangi kodda tilni parametr bilan
  uzatma, `currentLang()` ishlat. Fon ishlari (taymerlar) kontekstsiz = `uz`.
- Yangi foydalanuvchi matnini faqat `i18n.ts` ga qo'sh (test uchala til yozilganini tekshiradi).
- `bot_users.lang`: NULL = tanlamagan -> `uz`. Admin `/lang uz|ru|en` — admin ish tili.
- Kod topilmasa: "«1» kodi … tilida hali biriktirilmagan" + boshqa tillarda borligi + 📚 Katalog tugmasi.
  Nom topilmasa: avtomatik so'rov + 📚 Katalog. So'rov kartasida 🌐 til, admin javoblari foydalanuvchi tilida.
- `/catalog`: `uz` — kanal mundarija postlari; `ru/en` — inline katalog.
- Mini post: `/synopsis KOD | matn` -> qoralama -> admin ✅ -> foydalanuvchida "ℹ️ Haqida". `/delsynopsis KOD`.

## Bajarilganlar (tarix)
Kod tartibi, sub-kodlar (1.A), qism navigatsiyasi, mundarija (5 post + `/setpubcontents`), `/deletepart`,
serial auto-delete, poster (`/setposter`), so'rovlar topic (✅/❌/💬), post parser, aqlli qidiruv, `/alias`,
avtomatik so'rov, `/restrict`, telegram.ts bo'linishi, Railway deploy, 3 tilli bot (1–13 vazifalar),
polling uzilishlarida jim qayta ulanish (`alerts.ts`).

## Navbat (tartib bilan)
1. Haqiqiy botda sinov natijalarini kutish: ru/en kino qo'shish, til tanlash, so'rovlar. Xatolarni tuzatish.
2. Railway Volume va `DATABASE_PATH` borligini egasidan tasdiqlatish (yo'q bo'lsa — birinchi navbatda).
3. Rus/ingliz kanal mundarijasi (alohida postlar, `/setcontents` ga til qo'shish).
4. Monitoring: zaxira nusxalar haqiqatan olinayotganini tekshirish, `/stats` da tillar bo'yicha son.
5. Eski kinolar migratsiyasi (kerak bo'lsa).
6. xFilms klon boti (`RakhimovUK/xFilms-demo`, brend xFilms, bot xFilmsRobot) — shu kod asosida.

## Ehtiyot bo'l
- Bot nusxasi ikkita bo'lmasin; token faqat Railway Variables'da.
- Sandboxda `@types/node` yoki npm yo'q bo'lishi mumkin: typecheck'ni bazaviy xatolar bilan solishtir.
