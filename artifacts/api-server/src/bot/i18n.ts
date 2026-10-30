/**
 * Foydalanuvchiga ko'rinadigan matnlar (uz / ru / en) va joriy update tili.
 *
 * - Har Telegram update `runWithLang(lang, ...)` ichida ishlanadi (telegram.ts).
 * - `t("key", { vars })` joriy tilda matn qaytaradi; kontekst bo'lmasa — o'zbekcha.
 * - Admin xabarlari o'zbekcha qoladi (bu yerga qo'shilmaydi).
 * Yangi matn qo'shganda uchala tilni ham yozing (test buni tekshiradi).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { MovieLang } from "./post-language";

export type Lang = MovieLang;
export const LANGS: readonly Lang[] = ["uz", "ru", "en"];

// Bitta umumiy saqlagich (database.ts ham shu orqali tilni o'qiydi).
const storage = new AsyncLocalStorage<Lang>();

export function currentLang(): Lang {
  return storage.getStore() ?? "uz";
}

export function runWithLang<T>(lang: Lang, fn: () => T): T {
  return storage.run(lang, fn);
}

export function isLang(value: unknown): value is Lang {
  return value === "uz" || value === "ru" || value === "en";
}

/** Telegram `language_code` -> taklif qilinadigan til (aniq bo'lmasa null). */
export function suggestLangFromTelegram(code: string | undefined): Lang | null {
  const base = (code ?? "").toLowerCase().split("-")[0];
  if (base === "uz") return "uz";
  if (base === "ru") return "ru";
  if (base === "en") return "en";
  return null;
}

export const LANG_BUTTON: Record<Lang, string> = {
  uz: "🇺🇿 O‘zbekcha",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
};

/** "{lang} tilida" kabi gaplar uchun til nomi (UI tilida). */
const LANG_NAME: Record<Lang, Record<Lang, string>> = {
  uz: { uz: "o‘zbek", ru: "rus", en: "ingliz" },
  ru: { uz: "узбекском", ru: "русском", en: "английском" },
  en: { uz: "Uzbek", ru: "Russian", en: "English" },
};

export function langName(lang: Lang, ui: Lang = currentLang()): string {
  return LANG_NAME[ui][lang];
}

type Entry = Record<Lang, string>;

export const MESSAGES = {
  // Til tanlash
  "lang.choose": {
    uz: "🌐 Tilni tanlang / Выберите язык / Choose language",
    ru: "🌐 Tilni tanlang / Выберите язык / Choose language",
    en: "🌐 Tilni tanlang / Выберите язык / Choose language",
  },
  "lang.set": {
    uz: "✅ Til: {lang}\nEndi kinolar va seriallar shu tilda ko‘rsatiladi. O‘zgartirish: /language",
    ru: "✅ Язык: {lang}\nТеперь фильмы и сериалы показываются на этом языке. Изменить: /language",
    en: "✅ Language: {lang}\nMovies and series are now shown in this language. Change: /language",
  },
  "lang.button": { uz: "🌐 Til", ru: "🌐 Язык", en: "🌐 Language" },

  // Start
  "start.welcome": {
    uz: "Kino botga xush kelibsiz.\n\nKino ko‘rish uchun kino kodini yuboring.\nMasalan: 101",
    ru: "Добро пожаловать в кино-бот.\n\nЧтобы посмотреть фильм, отправьте его код.\nНапример: 101",
    en: "Welcome to the movie bot.\n\nSend a movie code to watch it.\nFor example: 101",
  },
  "kb.catalog": { uz: "🎬 Katalog", ru: "🎬 Каталог", en: "🎬 Catalog" },
  "kb.search": { uz: "🔍 Qidirish", ru: "🔍 Поиск", en: "🔍 Search" },
  "kb.new": { uz: "🆕 Yangilari", ru: "🆕 Новинки", en: "🆕 New" },
  "kb.top": { uz: "🔥 Top", ru: "🔥 Топ", en: "🔥 Top" },
  "kb.favorites": { uz: "⭐ Sevimlilar", ru: "⭐ Избранное", en: "⭐ Favorites" },
  "kb.discussion": { uz: "💬 Muhokama chati", ru: "💬 Чат обсуждения", en: "💬 Discussion chat" },
  "kb.contents": { uz: "📚 Katalog", ru: "📚 Каталог", en: "📚 Catalog" },

  // Obuna
  "sub.required": {
    uz: "Botdan foydalanish uchun avval kanal va muhokama chatiga obuna bo‘ling.\n\nObuna bo‘lgach, «✅ Tekshirish» tugmasini bosing.",
    ru: "Чтобы пользоваться ботом, сначала подпишитесь на канал и чат обсуждения.\n\nПосле подписки нажмите «✅ Проверить».",
    en: "To use the bot, first subscribe to the channel and the discussion chat.\n\nThen press «✅ Check».",
  },
  "sub.check": { uz: "✅ Tekshirish", ru: "✅ Проверить", en: "✅ Check" },
  "sub.confirmed": { uz: "Obuna tasdiqlandi.", ru: "Подписка подтверждена.", en: "Subscription confirmed." },
  "sub.thanks": {
    uz: "Rahmat. Endi kino kodi yoki nomini yuborishingiz mumkin.",
    ru: "Спасибо. Теперь можете отправить код или название фильма.",
    en: "Thank you. Now you can send a movie code or title.",
  },
  "sub.notYet": {
    uz: "Hali barcha kanallarga obuna bo‘lmagansiz.",
    ru: "Вы ещё не подписались на все каналы.",
    en: "You haven't subscribed to all channels yet.",
  },
  "sub.pleaseAll": {
    uz: "Iltimos, barcha ko‘rsatilgan kanal va chatlarga obuna bo‘lib, qayta tekshiring.",
    ru: "Пожалуйста, подпишитесь на все указанные каналы и чаты и проверьте снова.",
    en: "Please subscribe to all the listed channels and chats, then check again.",
  },

  // /id
  "id.yours": { uz: "Sizning Telegram ID raqamingiz: {id}", ru: "Ваш Telegram ID: {id}", en: "Your Telegram ID: {id}" },
  "id.admin": { uz: "Admin holati: {state}", ru: "Статус админа: {state}", en: "Admin status: {state}" },
  "id.yes": { uz: "tasdiqlangan", ru: "подтверждён", en: "confirmed" },
  "id.no": { uz: "tasdiqlanmagan", ru: "не подтверждён", en: "not confirmed" },

  // Qidiruv va topilmadi
  "search.prompt": {
    uz: "Qidirish uchun kino kodini yoki nomini yuboring. Masalan: /search Interstellar",
    ru: "Для поиска отправьте код или название фильма. Например: /search Interstellar",
    en: "To search, send a movie code or title. For example: /search Interstellar",
  },
  "search.help": {
    uz: "Kino kodini yoki nomini yuboring. Masalan: 101 yoki Interstellar",
    ru: "Отправьте код или название фильма. Например: 101 или Interstellar",
    en: "Send a movie code or title. For example: 101 or Interstellar",
  },
  "search.found": { uz: "«{q}» bo‘yicha topilgan materiallar:", ru: "Найдено по запросу «{q}»:", en: "Results for «{q}»:" },
  "search.foundSeries": { uz: "«{q}» bo‘yicha seriallar:", ru: "Сериалы по запросу «{q}»:", en: "Series for «{q}»:" },
  "search.genreMovies": { uz: "🎭 «{q}» janridagi kinolar:", ru: "🎭 Фильмы жанра «{q}»:", en: "🎭 «{q}» movies:" },
  "search.genreSeries": { uz: "🎭 «{q}» janridagi seriallar:", ru: "🎭 Сериалы жанра «{q}»:", en: "🎭 «{q}» series:" },
  "search.didYouMean": { uz: "Shuni nazarda tutdingizmi?", ru: "Возможно, вы имели в виду:", en: "Did you mean:" },
  "notFound.generic": {
    uz: "Kino topilmadi. Kod yoki nomni tekshirib qayta yuboring.",
    ru: "Фильм не найден. Проверьте код или название и отправьте снова.",
    en: "Movie not found. Check the code or title and try again.",
  },
  "notFound.text": {
    uz: "Bu kod yoki nom bo‘yicha kino topilmadi. Qayta tekshirib ko‘ring.",
    ru: "По этому коду или названию фильм не найден. Проверьте ещё раз.",
    en: "No movie found for this code or title. Please check again.",
  },
  "notFound.code": {
    uz: "⚠️ «{code}» kodi {lang} tilida hali biriktirilmagan.\nKodni tekshiring yoki katalogdan tanlang.",
    ru: "⚠️ Код «{code}» на {lang} языке пока не привязан.\nПроверьте код или выберите из каталога.",
    en: "⚠️ Code «{code}» is not assigned in {lang} yet.\nCheck the code or pick from the catalog.",
  },
  "notFound.otherLangs": {
    uz: "Bu kod boshqa tilda bor: {langs}. Tilni o‘zgartirish: /language",
    ru: "Этот код есть на другом языке: {langs}. Сменить язык: /language",
    en: "This code exists in another language: {langs}. Change language: /language",
  },

  // So'rovlar
  "request.duplicate": {
    uz: "Bu so‘rovingiz adminlarga allaqachon yuborilgan. Javobni kuting — natija shu botga keladi.",
    ru: "Этот запрос уже отправлен админам. Ждите ответа — он придёт в этот бот.",
    en: "This request has already been sent to the admins. Please wait — the answer will come to this bot.",
  },
  "request.limited": {
    uz: "Bugungi so‘rovlar limitiga yetdingiz. Ertaga qayta urinib ko‘ring.",
    ru: "Вы достигли дневного лимита запросов. Попробуйте завтра.",
    en: "You have reached today's request limit. Please try again tomorrow.",
  },
  "request.notFoundPrefix": { uz: "Afsuski, bu kino topilmadi. ", ru: "К сожалению, этот фильм не найден. ", en: "Sorry, this movie was not found. " },
  "request.sentAuto": {
    uz: "Afsuski, bu kino topilmadi, lekin so‘rovingiz adminlarga yuborildi. Admin javobi shu botga keladi.",
    ru: "К сожалению, этот фильм не найден, но ваш запрос отправлен админам. Ответ придёт в этот бот.",
    en: "Sorry, this movie was not found, but your request has been sent to the admins. The answer will come to this bot.",
  },
  "request.sent": {
    uz: "✅ So‘rovingiz adminlarga yuborildi: «{q}». Javob shu botga keladi.",
    ru: "✅ Ваш запрос отправлен админам: «{q}». Ответ придёт в этот бот.",
    en: "✅ Your request was sent to the admins: «{q}». The answer will come to this bot.",
  },
  "request.format": {
    uz: "Format: /request Kino nomi\nMasalan: /request Oltin qo‘llar",
    ru: "Формат: /request Название фильма\nНапример: /request Interstellar",
    en: "Format: /request Movie title\nFor example: /request Interstellar",
  },
  "request.approved": {
    uz: "✅ So‘ragan kinongiz qo‘shildi: «{q}»\nNomi yoki kodi bilan botdan qidirib ko‘ring.",
    ru: "✅ Запрошенный фильм добавлен: «{q}»\nНайдите его в боте по названию или коду.",
    en: "✅ The movie you requested has been added: «{q}»\nSearch for it in the bot by title or code.",
  },
  "request.rejected": {
    uz: "❌ Afsuski, «{q}» so‘rovi hozircha rad etildi.",
    ru: "❌ К сожалению, запрос «{q}» пока отклонён.",
    en: "❌ Unfortunately, the request «{q}» was declined for now.",
  },
  "request.adminNote": {
    uz: "📩 Admindan xabar (so‘rov: «{q}»):\n\n{note}",
    ru: "📩 Сообщение от админа (запрос: «{q}»):\n\n{note}",
    en: "📩 Message from admin (request: «{q}»):\n\n{note}",
  },

  "guard.short": { uz: "So‘rov juda qisqa. Kino nomini to‘liqroq yozing.", ru: "Запрос слишком короткий. Напишите название полнее.", en: "The request is too short. Write the full movie title." },
  "guard.long": { uz: "So‘rov juda uzun. Faqat kino nomini yozing.", ru: "Запрос слишком длинный. Напишите только название фильма.", en: "The request is too long. Write only the movie title." },
  "guard.code": {
    uz: "Bu kod bo‘yicha kino topilmadi. Kodni tekshirib qayta yuboring yoki 📚 Katalogdan tanlang.",
    ru: "По этому коду фильм не найден. Проверьте код или выберите в 📚 Каталоге.",
    en: "No movie found for this code. Check the code or pick from the 📚 Catalog.",
  },
  "guard.greeting": { uz: "Salom! Kino kodini yoki nomini yuboring, men topib beraman.", ru: "Привет! Отправьте код или название фильма — я найду.", en: "Hi! Send a movie code or title and I'll find it." },
  "guard.link": { uz: "Havolalar so‘rov sifatida qabul qilinmaydi. Kino nomini yozing.", ru: "Ссылки не принимаются как запрос. Напишите название фильма.", en: "Links are not accepted as requests. Write the movie title." },

  // Obunalar (seriallar)
  "mysubs.empty": {
    uz: "Hozircha hech qaysi serialga obuna bo‘lmagansiz.\nSerial kartasidagi «🔔 Yangi qismlar haqida xabar ber» tugmasini bosing.",
    ru: "Вы пока не подписаны ни на один сериал.\nНажмите «🔔 Сообщать о новых сериях» на карточке сериала.",
    en: "You are not subscribed to any series yet.\nPress «🔔 Notify me about new episodes» on a series card.",
  },
  "mysubs.header": { uz: "🔔 Xabar oladigan seriallaringiz:", ru: "🔔 Ваши подписки на сериалы:", en: "🔔 Series you get notified about:" },
  "notify.on": { uz: "🔔 Yangi qism chiqsa, xabar beramiz.", ru: "🔔 Сообщим, когда выйдет новая серия.", en: "🔔 We'll notify you when a new episode is out." },
  "notify.off": { uz: "🔕 Xabar o‘chirildi.", ru: "🔕 Уведомления выключены.", en: "🔕 Notifications turned off." },
  "notify.subscribe": { uz: "🔔 Yangi qismlar haqida xabar ber", ru: "🔔 Сообщать о новых сериях", en: "🔔 Notify me about new episodes" },
  "notify.unsubscribe": { uz: "🔕 Xabarni o‘chirish", ru: "🔕 Отключить уведомления", en: "🔕 Turn off notifications" },
  "notify.newEpisode": { uz: "🔔 Yangi qism chiqdi!", ru: "🔔 Вышла новая серия!", en: "🔔 New episode is out!" },

  // Katalog
  "catalog.empty": { uz: "Katalog hozircha bo‘sh.", ru: "Каталог пока пуст.", en: "The catalog is empty for now." },
  "catalog.noMovies": { uz: "Hozircha bazada kino yo‘q.", ru: "Пока в базе нет фильмов.", en: "There are no movies yet." },
  "catalog.base": { uz: "MedFlix bazasi:", ru: "База MedFlix:", en: "MedFlix library:" },
  "catalog.seriesSection": { uz: "Seriallar va ko‘p qismli kinolar:", ru: "Сериалы и многосерийные фильмы:", en: "Series and multi-part movies:" },
  "catalog.title": { uz: "🎬 MedFlix katalogi", ru: "🎬 Каталог MedFlix", en: "🎬 MedFlix catalog" },
  "catalog.movies": { uz: "Kinolar: {n} ta", ru: "Фильмы: {n}", en: "Movies: {n}" },
  "catalog.series": { uz: "Seriallar: {n} ta", ru: "Сериалы: {n}", en: "Series: {n}" },
  "catalog.pick": { uz: "Kerakli janr, kino yoki serialni tanlang.", ru: "Выберите жанр, фильм или сериал.", en: "Pick a genre, movie or series." },
  "catalog.unavailable": {
    uz: "📚 Mundarija hozir mavjud emas. Kino yoki serial kodini yuboring yoki 🔍 Qidirish tugmasidan foydalaning.",
    ru: "📚 Оглавление сейчас недоступно. Отправьте код фильма или сериала или воспользуйтесь 🔍 Поиском.",
    en: "📚 The contents are not available right now. Send a movie or series code or use 🔍 Search.",
  },
  "genre.header": { uz: "{g} janridagi materiallar:", ru: "Материалы жанра {g}:", en: "{g} titles:" },
  "new.header": { uz: "🆕 So‘nggi qo‘shilganlar", ru: "🆕 Недавно добавленные", en: "🆕 Recently added" },
  "new.empty": { uz: "Hozircha yangi kontent yo‘q.", ru: "Пока нет нового контента.", en: "No new content yet." },
  "top.header": { uz: "🔥 Eng ko‘p ko‘rilganlar (oxirgi 30 kun)", ru: "🔥 Самые просматриваемые (последние 30 дней)", en: "🔥 Most watched (last 30 days)" },
  "top.empty": {
    uz: "🔥 Reyting hali shakllanmagan. Ko‘rishlar hisoblana boshladi, birozdan keyin qaytib keling.",
    ru: "🔥 Рейтинг ещё не сформирован. Просмотры уже считаются — загляните позже.",
    en: "🔥 The ranking isn't ready yet. Views are being counted — check back later.",
  },

  // Kino va seriallar
  "movie.notFound": { uz: "Bu kino bazada topilmadi.", ru: "Этот фильм не найден в базе.", en: "This movie was not found." },
  "series.notFound": { uz: "Serial kodi bazada topilmadi.", ru: "Код сериала не найден.", en: "Series code not found." },
  "series.notFoundShort": { uz: "Serial topilmadi.", ru: "Сериал не найден.", en: "Series not found." },
  "series.noEpisodes": { uz: "{title} uchun hali qism qo‘shilmagan.", ru: "Для «{title}» ещё нет серий.", en: "No episodes have been added for {title} yet." },
  "series.noEpisodesSeason": {
    uz: "{title} {s}-faslida hali qism qo‘shilmagan.",
    ru: "В {s} сезоне «{title}» ещё нет серий.",
    en: "Season {s} of {title} has no episodes yet.",
  },
  "series.noEpisodesAtAll": { uz: "Bu serialda qismlar topilmadi.", ru: "В этом сериале нет серий.", en: "No episodes found in this series." },
  "series.continue": { uz: "▶️ Davom ettirish — {s}-fasl, {e}-qism", ru: "▶️ Продолжить — {s} сезон, {e} серия", en: "▶️ Continue — S{s} E{e}" },
  "series.seasonButton": { uz: "📂 {s}-fasl — {n} ta qism", ru: "📂 {s} сезон — {n} серий", en: "📂 Season {s} — {n} episodes" },
  "series.code": { uz: "Kod: {code}", ru: "Код: {code}", en: "Code: {code}" },
  "series.seasonCount": { uz: "{s}-fasl — {n} ta qism", ru: "{s} сезон — {n} серий", en: "Season {s} — {n} episodes" },
  "series.pickEpisode": { uz: "Ko‘rish uchun qismni tanlang:", ru: "Выберите серию для просмотра:", en: "Pick an episode to watch:" },
  "series.total": { uz: "Jami: {n} ta qism", ru: "Всего: {n} серий", en: "Total: {n} episodes" },
  "series.short": { uz: "{s} fasl, {e} qism", ru: "{s} сез., {e} сер.", en: "{s} seasons, {e} eps" },
  "notify.episode": { uz: "{s}-fasl, {e}-qism", ru: "{s} сезон, {e} серия", en: "Season {s}, episode {e}" },
  "episode.label": { uz: "{e}-qism", ru: "{e} серия", en: "Episode {e}" },
  "episode.labelSeason": { uz: "{s}-fasl {e}-qism", ru: "{s} сезон {e} серия", en: "S{s} E{e}" },
  "episode.notFound": { uz: "Bu serial qismi bazada topilmadi.", ru: "Эта серия не найдена.", en: "This episode was not found." },
  "episode.gone": { uz: "Bu qism topilmadi yoki o‘chirilgan.", ru: "Эта серия не найдена или удалена.", en: "This episode was not found or was deleted." },
  "episode.prev": { uz: "⬅️ Oldingi qism", ru: "⬅️ Предыдущая серия", en: "⬅️ Previous episode" },
  "episode.next": { uz: "Keyingi qism ➡️", ru: "Следующая серия ➡️", en: "Next episode ➡️" },
  "episode.all": { uz: "📋 Barcha qismlar", ru: "📋 Все серии", en: "📋 All episodes" },
  "episode.watch": { uz: "▶️ Ko‘rish", ru: "▶️ Смотреть", en: "▶️ Watch" },
  "card.code": { uz: "🔢 Kod: {code}", ru: "🔢 Код: {code}", en: "🔢 Code: {code}" },
  "card.season": { uz: "📂 {s}-fasl", ru: "📂 {s} сезон", en: "📂 Season {s}" },
  "card.seasons": { uz: "📂 Fasllar: {n} ta", ru: "📂 Сезонов: {n}", en: "📂 Seasons: {n}" },
  "card.episodes": { uz: "🎬 {n} ta qism", ru: "🎬 Серий: {n}", en: "🎬 {n} episodes" },
  "discuss.button": { uz: "💬 Muhokama qilish", ru: "💬 Обсудить", en: "💬 Discuss" },

  "about.button": { uz: "ℹ️ Haqida", ru: "ℹ️ О фильме", en: "ℹ️ About" },
  "about.none": { uz: "Bu kino haqida ma’lumot hali yo‘q.", ru: "Описание пока недоступно.", en: "No description yet." },

  // Sevimlilar
  "fav.header": { uz: "⭐ Sevimlilaringiz", ru: "⭐ Ваше избранное", en: "⭐ Your favorites" },
  "fav.empty": {
    uz: "Hozircha sevimlilar yo‘q.\nKino yoki serial qismi ostidagi «⭐ Sevimlilarga qo‘shish» tugmasini bosing.",
    ru: "В избранном пока пусто.\nНажмите «⭐ В избранное» под фильмом или серией.",
    en: "No favorites yet.\nPress «⭐ Add to favorites» under a movie or episode.",
  },
  "fav.add": { uz: "⭐ Sevimlilarga qo‘shish", ru: "⭐ В избранное", en: "⭐ Add to favorites" },
  "fav.remove": { uz: "✅ Sevimlilarda (olib tashlash)", ru: "✅ В избранном (убрать)", en: "✅ In favorites (remove)" },
  "fav.addEpisode": { uz: "⭐ Qismni sevimlilarga qo‘shish", ru: "⭐ Серию в избранное", en: "⭐ Add episode to favorites" },
  "fav.removeEpisode": { uz: "✅ Sevimli qism (olib tashlash)", ru: "✅ Серия в избранном (убрать)", en: "✅ Favorite episode (remove)" },
  "fav.added": { uz: "⭐ Sevimlilarga qo‘shildi.", ru: "⭐ Добавлено в избранное.", en: "⭐ Added to favorites." },
  "fav.removed": { uz: "Sevimlilardan olib tashlandi.", ru: "Удалено из избранного.", en: "Removed from favorites." },

  // Kanal mundarijasi postlari (har til o'z postlarida)
  "contents.header": { uz: "📚 MEDFLIX — MUNDARIJA", ru: "📚 MEDFLIX — СОДЕРЖАНИЕ", en: "📚 MEDFLIX — CONTENTS" },
  "contents.movies": { uz: "🎬 KINOLAR", ru: "🎬 ФИЛЬМЫ", en: "🎬 MOVIES" },
  "contents.series": { uz: "📺 SERIALLAR", ru: "📺 СЕРИАЛЫ", en: "📺 SERIES" },
  "contents.continued": { uz: "{section} (davomi)", ru: "{section} (продолжение)", en: "{section} (continued)" },
  "contents.episodes": { uz: "{n} qism", ru: "{n} сер.", en: "{n} eps" },
  "contents.footer": {
    uz: "🔎 Kino nomini bosing yoki kodni botga yuboring.",
    ru: "🔎 Нажмите на название фильма или отправьте код боту.",
    en: "🔎 Tap a movie title or send its code to the bot.",
  },
  "contents.empty": { uz: "Hali kino qo‘shilmagan.", ru: "Фильмов пока нет.", en: "No movies yet." },
  "contents.placeholder": {
    uz: "Bu post hozircha bo‘sh. Mundarija davomi shu yerga yoziladi.",
    ru: "Этот пост пока пуст. Продолжение содержания появится здесь.",
    en: "This post is empty for now. More contents will appear here.",
  },

  // Umumiy xatolar
  "error.badButton": { uz: "Tugma ma’lumotini o‘qib bo‘lmadi.", ru: "Не удалось прочитать данные кнопки.", en: "Couldn't read the button data." },
  "error.unknownButton": { uz: "Noma’lum tugma.", ru: "Неизвестная кнопка.", en: "Unknown button." },
  "error.adminOnly": { uz: "Bu bo‘lim faqat admin uchun.", ru: "Этот раздел только для админов.", en: "This section is for admins only." },
} satisfies Record<string, Entry>;

export type MessageKey = keyof typeof MESSAGES;

export function translate(
  lang: Lang,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const entry: Entry = MESSAGES[key];
  const template = entry[lang] || entry.uz;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Joriy update tilida matn. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(currentLang(), key, vars);
}
