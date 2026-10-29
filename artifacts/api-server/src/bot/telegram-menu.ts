import { getAdminIds } from "./config";
import { logger } from "../lib/logger";
import { telegramApi } from "./telegram-state";
import { PROFILE_BY_LANG, type ProfileLang } from "./telegram-profile";

export async function configureBotCommands(): Promise<void> {
  await telegramApi("setMyCommands", {
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
  });

  const adminCommands = [
    { command: "start", description: "Botni boshlash" },
    { command: "catalog", description: "Katalogni ko‘rish" },
    { command: "search", description: "Kino nomi bo‘yicha qidirish" },
    { command: "new", description: "So‘nggi qo‘shilganlar" },
    { command: "top", description: "Eng ko‘p ko‘rilganlar" },
    { command: "mysubs", description: "Yangi qism xabarlarim" },
    { command: "fav", description: "Sevimlilarim" },
    { command: "request", description: "Kino so‘rash (topilmagan kino)" },
    { command: "language", description: "Tilni o‘zgartirish" },
    { command: "add", description: "Kanal postidan kino qo‘shish" },
    { command: "addpost", description: "Kinoga qo‘shimcha post qo‘shish" },
    { command: "addseries", description: "Serial yoki ko‘p qismli kino yaratish" },
    { command: "addpart", description: "Serial qismi qo‘shish" },
    { command: "editpart", description: "Serial qismi nomini tahrirlash" },
    { command: "admin", description: "Admin panel (tugmalar)" },
    { command: "backup", description: "Bazaning zaxira nusxasini olish" },
    { command: "version", description: "Bot versiyasi (qaysi commit)" },
    { command: "editparts", description: "Ko‘p qism nomini bir xabarda tahrirlash" },
    { command: "stats", description: "Bot statistikasi" },
    { command: "broadcast", description: "Barcha foydalanuvchilarga xabar yuborish" },
    { command: "setposter", description: "Kino/serial posterini o‘rnatish" },
    { command: "delposter", description: "Kino/serial posterini o‘chirish" },
    { command: "getposter", description: "Kino/serial posteri holatini ko‘rish" },
    { command: "genre", description: "Kino janrini belgilash" },
    { command: "alias", description: "Qidiruvga muqobil so‘z qo‘shish" },
    { command: "delalias", description: "Muqobil so‘zni o‘chirish" },
    { command: "setstart", description: "Start videosini o‘rnatish" },
    { command: "setstructure", description: "Avto-yangilanadigan postni sozlash" },
    { command: "setcontents", description: "Mundarija postini sozlash" },
    { command: "setpubcontents", description: "Ochiq kanal mundarijasi" },
    { command: "lang", description: "Admin ish tili (uz/ru/en)" },
    { command: "restrict", description: "Foydalanuvchini cheklash (forward/saqlash yo‘q)" },
    { command: "unrestrict", description: "Cheklovni olib tashlash" },
    { command: "restricted", description: "Cheklanganlar ro‘yxati" },
    { command: "delete", description: "Kino kodini o‘chirish" },
    { command: "deleteseries", description: "Serialni o‘chirish" },
    { command: "deletepart", description: "Serial qismini o‘chirish" },
    { command: "list", description: "Kinolar ro‘yxati" },
  ];

  for (const adminId of getAdminIds()) {
    const chatId = Number(adminId);
    if (!Number.isSafeInteger(chatId)) {
      logger.warn({ adminId }, "Skipping invalid Telegram admin ID");
      continue;
    }

    try {
      await telegramApi("setMyCommands", {
        commands: adminCommands,
        scope: { type: "chat", chat_id: chatId },
      });
    } catch (err: unknown) {
      logger.error({ err, adminId }, "Failed to configure admin commands");
    }
  }
}

/** Har bir til uchun profil tavsifi, qisqa tavsif va buyruqlar. Xato bo'lsa start to'xtamaydi. */
export async function configureBotProfile(): Promise<void> {
  for (const lang of Object.keys(PROFILE_BY_LANG) as ProfileLang[]) {
    const profile = PROFILE_BY_LANG[lang];
    const scope = lang === "default" ? {} : { language_code: lang };
    try {
      await telegramApi("setMyDescription", { description: profile.description, ...scope });
      await telegramApi("setMyShortDescription", { short_description: profile.shortDescription, ...scope });
      await telegramApi("setMyCommands", { commands: profile.commands, ...scope });
    } catch (err: unknown) {
      logger.error({ err, lang }, "Failed to configure bot profile");
    }
  }
}
