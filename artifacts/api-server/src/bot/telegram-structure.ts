/** Kanal postlari (tizim posti, mundarija) hozircha o'zbekcha katalog bo'yicha. */
const PUBLIC_LANG = "uz" as const;
import {
  buildContentsPages,
  formatTelegramPostLink,
  parseTelegramPostLink,
  type TelegramPostReference,
} from "./catalog-content";
import { getPostsChannelId, getRequiredSubscriptions } from "./config";
import { getSetting, listGenres, listMovies, listSeries, runWithLang } from "./database";
import { logger } from "../lib/logger";
import { parseStoredPostRefs } from "./contents-delivery";
import { t, type Lang } from "./i18n";
import { botInfo, telegramApi } from "./telegram-state";

/** ru/en mundarija postlari alohida: /setcontents ru|en ... yoki CONTENTS_POST_LINKS_RU/_EN. */
export const EXTRA_CONTENTS_LANGS = ["ru", "en"] as const satisfies readonly Lang[];
export type ExtraContentsLang = (typeof EXTRA_CONTENTS_LANGS)[number];

export function contentsSettingKey(lang: Lang): string {
  return lang === "uz" ? "contents_posts" : `contents_posts_${lang}`;
}

/** Env'dan post havolalarini o'qiydi (vergul yoki bo'shliq bilan ajratilgan t.me havolalari). */
export function readPostLinksFromEnv(name: string): TelegramPostReference[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((part) => parseTelegramPostLink(part))
    .filter((reference): reference is TelegramPostReference => reference !== null);
}

// Standart qiymatlar: STRUCTURE_POST_LINK va CONTENTS_POST_LINKS env'lari bilan almashtiriladi.
export const defaultStructurePost: TelegramPostReference = readPostLinksFromEnv(
  "STRUCTURE_POST_LINK",
)[0] ?? {
  chatId: getPostsChannelId(),
  messageId: 17,
};

export const envContentsPosts = readPostLinksFromEnv("CONTENTS_POST_LINKS");

export const defaultContentsPosts: TelegramPostReference[] =
  envContentsPosts.length > 0
    ? envContentsPosts
    : [22, 23, 24, 25, 26].map((messageId) => ({
        chatId: getPostsChannelId(),
        messageId,
      }));

export const contentsCache = new Map<string, string>();

export function getStructurePostReference(): TelegramPostReference {
  const chatId = getSetting("structure_post_chat_id");
  const messageId = Number(getSetting("structure_post_message_id"));

  if (chatId && Number.isInteger(messageId) && messageId > 0) {
    return { chatId, messageId };
  }

  return defaultStructurePost;
}

/**
 * Til bo'yicha baza kanal mundarija postlari. uz — doim bor (standart 22–26);
 * ru/en — faqat sozlangan bo'lsa, aks holda bo'sh ro'yxat (foydalanuvchiga inline katalog).
 */
export function getContentsPostReferences(lang: Lang = "uz"): TelegramPostReference[] {
  if (lang !== "uz") {
    return (
      parseStoredPostRefs(getSetting(contentsSettingKey(lang))) ??
      readPostLinksFromEnv(`CONTENTS_POST_LINKS_${lang.toUpperCase()}`)
    );
  }
  try {
    const raw = getSetting("contents_posts");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const refs = parsed.filter(
          (item): item is TelegramPostReference =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as TelegramPostReference).chatId === "string" &&
            Number.isInteger((item as TelegramPostReference).messageId),
        );
        if (refs.length > 0) {
          return refs;
        }
      }
    }
  } catch {
    // buzilgan sozlama bo'lsa, standart ro'yxat ishlatiladi
  }

  return defaultContentsPosts;
}

/** Ochiq (public) kanaldagi mundarija postlari: /setpubcontents yoki PUBLIC_CONTENTS_POST_LINKS. */
export function getPublicContentsPostReferences(): TelegramPostReference[] {
  return (
    parseStoredPostRefs(getSetting("public_contents_posts")) ??
    readPostLinksFromEnv("PUBLIC_CONTENTS_POST_LINKS")
  );
}

export function formatStructurePost(): string {
  const movies = listMovies(PUBLIC_LANG);
  const series = listSeries(PUBLIC_LANG);
  const genres = listGenres();
  const startVideoConfigured = Boolean(
    getSetting("start_channel_chat_id") &&
      getSetting("start_channel_message_id"),
  );
  const requiredSubscriptions = getRequiredSubscriptions();
  const contentsRefs = getContentsPostReferences();
  const usedPages = Math.max(
    1,
    Math.min(
      buildContentsPages(listMovies(PUBLIC_LANG), listSeries(PUBLIC_LANG), botInfo.username).length,
      contentsRefs.length,
    ),
  );
  const contentsLines = contentsRefs
    .slice(0, usedPages)
    .map((ref, index) =>
      usedPages > 1
        ? `• ${index + 1}-qism: ${formatTelegramPostLink(ref)}`
        : `• ${formatTelegramPostLink(ref)}`,
    );
  for (const lang of EXTRA_CONTENTS_LANGS) {
    const refs = getContentsPostReferences(lang);
    if (refs.length > 0) {
      contentsLines.push(`• ${lang.toUpperCase()}: ${refs.map(formatTelegramPostLink).join(" ")}`);
    }
  }

  return [
    "🩺 MEDFLIX BOT — TIZIM MA’LUMOTI",
    "",
    "📦 DATABASE",
    `• SQLite: ${movies.length} ta kino/material`,
    `• Seriallar: ${series.length} ta, jami ${series.reduce((sum, item) => sum + item.episodeCount, 0)} ta qism`,
    `• Janrlar: ${genres.length} ta`,
    "",
    "📚 MUNDARIJA (barcha kodlar)",
    ...contentsLines,
    "",
    "🔌 API VA ISHLASH STRUKTURASI",
    "• Telegram Bot API + long polling",
    "• Kino yetkazish: copyMessage",
    "• Qidiruv: kod va nom bo‘yicha",
    "• Katalog: baza kanaldagi Mundarija posti",
    "",
    "👤 USER FLOW",
    "• /start — welcome va start video",
    "• Kod yoki nom yuborish — kino olish",
    "• /catalog — katalogni ko‘rish",
    "• /search — qidiruv",
    `• Majburiy obuna: ${requiredSubscriptions.length > 0 ? "yoqilgan" : "o‘chirilgan"}`,
    "",
    "🔐 ADMIN COMMANDS",
    "• /add KOD | Nomi — 1-post",
    "• /addpost KOD | Tartib | Izoh — qo‘shimcha post",
    "• /addseries KOD | Serial nomi",
    "• /addpart KOD | Fasl | Qism | Nomi",
    "• /editpart KOD | Fasl | Qism | Yangi nom",
    "• /setposter KOD — poster qo‘shish/yangilash",
    "• /delposter KOD · /getposter KOD",
    "• /admin — admin panel (tugmalar)",
    "• /backup — bazaning zaxira nusxasi",
    "• /version — bot qaysi commit bilan ishlayapti",
    "• /editparts KOD | FASL (keyingi qatorlarda: QISM | nom)",
    "• /stats — foydalanuvchilar va kontent statistikasi",
    "• /broadcast — xabarga reply qilib: hammaga yuborish (/broadcast test — sinov)",
    "• /genre KOD | Janr 1, Janr 2",
    "• /alias KOD | so‘z — qidiruvga muqobil so‘z qo‘shish (/alias KOD — ro‘yxat)",
    "• /delalias KOD | so‘z — muqobil so‘zni o‘chirish",
    "• /setstart",
    "• /setstructure POST_LINK",
    "• /setcontents [ru|en] POST_LINK",
    "• /delete KOD",
    "• /list",
    `• Start video: ${startVideoConfigured ? "sozlangan" : "sozlanmagan"}`,
    "",
    `🔄 Oxirgi sinxronlash: ${new Date().toISOString()}`,
  ].join("\n");
}

export function refreshContentsPost(): Promise<boolean> {
  return runWithLang(PUBLIC_LANG, () => refreshContentsPostInner());
}

async function refreshContentsPostInner(): Promise<boolean> {
  const pages = buildContentsPages(listMovies(PUBLIC_LANG), listSeries(PUBLIC_LANG), botInfo.username);
  const baseOk = await updateContentsPosts(
    getContentsPostReferences(),
    pages,
    getStructurePostReference(),
  );
  // Har bir ochiq kanal alohida: uning postlari sahifa tartibida to'ldiriladi (hammasida bir xil mundarija).
  const publicRefs = getPublicContentsPostReferences();
  let publicOk = true;
  for (const chat of Array.from(new Set(publicRefs.map((ref) => ref.chatId)))) {
    const group = publicRefs.filter((ref) => ref.chatId === chat);
    if (!(await updateContentsPosts(group, pages))) {
      publicOk = false;
    }
  }
  // ru/en: o'z tilidagi kinolar, o'z postlari, matnlar shu tilda (sozlanmagan til o'tkaziladi).
  let extraOk = true;
  for (const lang of EXTRA_CONTENTS_LANGS) {
    const refs = getContentsPostReferences(lang);
    if (refs.length === 0) continue;
    const ok = await runWithLang(lang, () =>
      updateContentsPosts(
        refs,
        buildContentsPages(listMovies(lang), listSeries(lang), botInfo.username),
        getStructurePostReference(),
      ),
    );
    if (!ok) extraOk = false;
  }
  return baseOk && publicOk && extraOk;
}

/** Berilgan postlarni sahifalar bilan tahrirlaydi. structure — tizim posti (o'tkazib yuboriladi). */
async function updateContentsPosts(
  refs: TelegramPostReference[],
  pages: string[],
  structure?: TelegramPostReference,
): Promise<boolean> {
  const dropped = Math.max(0, pages.length - refs.length);
  let allOk = true;

  if (dropped > 0) {
    logger.warn(
      { pages: pages.length, posts: refs.length },
      "Contents do not fit into the configured posts",
    );
  }

  for (let index = 0; index < refs.length; index += 1) {
    const reference = refs[index];
    if (
      structure &&
      reference.chatId === structure.chatId &&
      reference.messageId === structure.messageId
    ) {
      continue;
    }

    let text =
      index < pages.length
        ? pages[index]
        : `${t("contents.header")} (${index + 1}/${refs.length})\n\n${t("contents.placeholder")}`;
    if (dropped > 0 && index === refs.length - 1) {
      text += `\n\n⚠️ Joy yetmadi: yana ${dropped} sahifa yozilmadi. /setcontents bilan qo‘shimcha post qo‘shing.`;
    }

    const key = `${reference.chatId}/${reference.messageId}`;
    if (contentsCache.get(key) === text) {
      continue;
    }

    try {
      await telegramApi("editMessageText", {
        chat_id: reference.chatId,
        message_id: reference.messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      contentsCache.set(key, text);
      logger.info(
        { chatId: reference.chatId, messageId: reference.messageId },
        "Contents post updated",
      );
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      if (errorText.includes("message is not modified")) {
        contentsCache.set(key, text);
        continue;
      }

      allOk = false;
      logger.warn(
        { err, chatId: reference.chatId, messageId: reference.messageId },
        "Failed to update contents post",
      );
    }
  }

  return allOk;
}

export function refreshStructurePost(): Promise<boolean> {
  return runWithLang(PUBLIC_LANG, () => refreshStructurePostInner());
}

async function refreshStructurePostInner(): Promise<boolean> {
  const structureUpdated = await updateStructurePost();
  await refreshContentsPost();
  return structureUpdated;
}

export function updateStructurePost(): Promise<boolean> {
  return runWithLang(PUBLIC_LANG, () => updateStructurePostInner());
}

async function updateStructurePostInner(): Promise<boolean> {
  const reference = getStructurePostReference();

  try {
    await telegramApi("editMessageText", {
      chat_id: reference.chatId,
      message_id: reference.messageId,
      text: formatStructurePost(),
      disable_web_page_preview: true,
    });
    logger.info(
      { chatId: reference.chatId, messageId: reference.messageId },
      "Structure post updated",
    );
    return true;
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err);
    if (errorText.includes("message is not modified")) {
      return true;
    }

    logger.warn(
      { err, chatId: reference.chatId, messageId: reference.messageId },
      "Failed to update structure post",
    );
    return false;
  }
}
