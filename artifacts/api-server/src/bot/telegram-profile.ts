export type ProfileLang = "default" | "uz" | "ru" | "en";

export type BotProfile = {
  description: string;
  shortDescription: string;
  commands: Array<{ command: string; description: string }>;
};

const UZ: BotProfile = {
  description: "🎬 Kino va seriallar katalogi. Kino kodini yuboring yoki nomini yozing. Katalog: /catalog",
  shortDescription: "Kino va seriallar katalogi — kod yoki nom bo‘yicha",
  commands: [
    { command: "start", description: "Botni boshlash" },
    { command: "catalog", description: "Katalogni ko‘rish" },
    { command: "search", description: "Kino nomi bo‘yicha qidirish" },
    { command: "new", description: "So‘nggi qo‘shilganlar" },
    { command: "top", description: "Eng ko‘p ko‘rilganlar" },
    { command: "mysubs", description: "Yangi qism xabarlarim" },
    { command: "fav", description: "Sevimlilarim" },
    { command: "request", description: "Kino so‘rash (topilmagan kino)" },
    { command: "language", description: "Tilni o‘zgartirish" },
  ],
};

const RU: BotProfile = {
  description: "🎬 Каталог фильмов и сериалов. Отправьте код фильма или напишите название. Каталог: /catalog",
  shortDescription: "Каталог фильмов и сериалов — по коду или названию",
  commands: [
    { command: "start", description: "Запустить бота" },
    { command: "catalog", description: "Открыть каталог" },
    { command: "search", description: "Поиск фильма по названию" },
    { command: "new", description: "Недавно добавленные" },
    { command: "top", description: "Самые просматриваемые" },
    { command: "mysubs", description: "Мои уведомления о новых сериях" },
    { command: "fav", description: "Мои избранные" },
    { command: "request", description: "Запросить фильм (если не найден)" },
    { command: "language", description: "Сменить язык" },
  ],
};

const EN: BotProfile = {
  description: "🎬 Movies and series catalog. Send a movie code or type a title. Catalog: /catalog",
  shortDescription: "Movies & series catalog — by code or title",
  commands: [
    { command: "start", description: "Start the bot" },
    { command: "catalog", description: "Open the catalog" },
    { command: "search", description: "Search movies by title" },
    { command: "new", description: "Recently added" },
    { command: "top", description: "Most watched" },
    { command: "mysubs", description: "My new-episode alerts" },
    { command: "fav", description: "My favorites" },
    { command: "request", description: "Request a movie (if not found)" },
    { command: "language", description: "Change language" },
  ],
};

/** default — boshqa tillar va til ko'rsatilmagan holat (hozirgi o'zbekcha matn saqlanadi). */
export const PROFILE_BY_LANG: Record<ProfileLang, BotProfile> = {
  default: UZ,
  uz: UZ,
  ru: RU,
  en: EN,
};
