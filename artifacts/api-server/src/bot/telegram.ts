import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDatabaseBackup,
  deleteMovie,
  deleteSeries,
  deleteSeriesEpisode,
  findMovie,
  getLastDeliveredEpisodeMessage,
  setLastDeliveredEpisodeMessage,
  listMoviePosts,
  findSeries,
  findSeriesEpisode,
  findSeriesEpisodeById,
  clearSeriesPoster,
  getSeriesPoster,
  getSeriesPosterCaption,
  getSeriesProgress,
  saveSeriesProgress,
  setSeriesPoster,
  getSetting,
  listMovies,
  listSeries,
  listSeriesSeasons,
  listSeriesEpisodes,
  listGenres,
  listMoviesByGenre,
  searchSeries,
  setSetting,
  setMovieGenres,
  searchMovies,
  upsertSeries,
  updateSeriesEpisodeTitle,
  updateSeriesEpisodeTitles,
  getBotStats,
  listBroadcastRecipients,
  markBotUserBlocked,
  touchBotUser,
  upsertSeriesEpisode,
  upsertMovie,
  upsertMoviePost,
} from "./database";
import {
  buildEpisodeListPages,
  buildEpisodeNavigationRows,
  episodeCallback,
  episodeListCallback,
  getEpisodeNeighbors,
  parseEpisodeId,
} from "./series-navigation";
import { buildSeriesCaption, normalizeDescription } from "./series-card";
import { createNavCleanup, shouldCleanup } from "./nav-cleanup";
import {
  buildContentsPages,
  formatTelegramPostLink,
  parseTelegramPostLink,
  type TelegramPostReference,
} from "./catalog-content";
import { formatVersionMessage, resolveVersion, runGit } from "./version-info";
import {
  formatEditPartsResult,
  formatStatsMessage,
  parseBackupHour,
  parseEditParts,
  shouldRunBackup,
  todayKey,
} from "./admin-tools";
import { runBroadcast } from "./broadcast";
import { createKeyedQueue } from "./keyed-queue";
import { copyContentsPosts } from "./contents-delivery";
import { logger } from "../lib/logger";

type TelegramResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  title?: string;
  username?: string;
};

type TelegramForwardOrigin = {
  type?: string;
  chat?: TelegramChat;
  message_id?: number;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
  forward_origin?: TelegramForwardOrigin;
  forward_from_chat?: TelegramChat;
  forward_from_message_id?: number;
  reply_to_message?: TelegramMessage;
};

type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const token = process.env.TELEGRAM_BOT_TOKEN;
const pendingForwardedPosts = new Map<
  string,
  { channelChatId: string; channelMessageId: number }
>();
const pendingPosterRequests = new Map<string, { code: string; expiresAt: number }>();

// Chat tarixini qisqa saqlash: tugma bosilganda oldingi xabarlar o'chiriladi.
const navCleanup = createNavCleanup(async (chatId, messageId) => {
  await telegramApi("deleteMessage", { chat_id: chatId, message_id: messageId });
});
const OUTGOING_METHODS = new Set(["sendMessage", "sendPhoto", "sendVideo", "copyMessage"]);
const pendingBroadcasts = new Map<
  string,
  { sourceChatId: number; sourceMessageId: number; expiresAt: number }
>();
let broadcastRunning = false;
// Yangilanishlar: bir chat ketma-ket, turli chatlar parallel (ko'pi bilan 10 ta).
const updateQueue = createKeyedQueue({
  maxConcurrent: 10,
  onError: (err) => logger.error({ err }, "Failed to handle update"),
});
const versionInfo = resolveVersion(process.env, runGit);
const subscriptionCache = new Map<number, { subscribed: boolean; expiresAt: number }>();

type ReplyMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

type RequiredSubscription = {
  chatId: string;
  label: string;
  url?: string;
};

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram API error: ${response.status}`);
  }

  if (OUTGOING_METHODS.has(method) && typeof body.chat_id === "number") {
    navCleanup.noteSent(body.chat_id);
  }

  return payload.result;
}

async function sendText(
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function isAdmin(userId: number): boolean {
  return new Set(getAdminIds()).has(String(userId));
}

function getAdminIds(): string[] {
  return (process.env.TELEGRAM_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function getCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRequiredSubscriptions(): RequiredSubscription[] {
  const channelIds = getCsvEnv("TELEGRAM_REQUIRED_CHANNEL_IDS");
  const channelUrls = getCsvEnv("TELEGRAM_REQUIRED_CHANNEL_URLS");
  const chatIds = getCsvEnv("TELEGRAM_REQUIRED_CHAT_IDS");
  const chatUrls = getCsvEnv("TELEGRAM_REQUIRED_CHAT_URLS");

  return [
    ...channelIds.map((chatId, index) => ({
      chatId,
      label: "Asosiy kanalga obuna bo‘lish",
      url: channelUrls[index],
    })),
    ...chatIds.map((chatId, index) => ({
      chatId,
      label: "Muhokama chatiga qo‘shilish",
      url: chatUrls[index],
    })),
  ];
}

function encodeCallbackValue(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeCallbackValue(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function getDiscussionUrl(): string | undefined {
  const value = process.env.TELEGRAM_DISCUSSION_URL?.trim();
  return value || undefined;
}

/** Env'dan post havolalarini o'qiydi (vergul yoki bo'shliq bilan ajratilgan t.me havolalari). */
function readPostLinksFromEnv(name: string): TelegramPostReference[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((part) => parseTelegramPostLink(part))
    .filter((reference): reference is TelegramPostReference => reference !== null);
}

// Standart qiymatlar: STRUCTURE_POST_LINK va CONTENTS_POST_LINKS env'lari bilan almashtiriladi.
const defaultStructurePost: TelegramPostReference = readPostLinksFromEnv(
  "STRUCTURE_POST_LINK",
)[0] ?? {
  chatId: "-1004418309907",
  messageId: 17,
};

const envContentsPosts = readPostLinksFromEnv("CONTENTS_POST_LINKS");
const defaultContentsPosts: TelegramPostReference[] =
  envContentsPosts.length > 0
    ? envContentsPosts
    : [22, 23, 24, 25, 26].map((messageId) => ({
        chatId: "-1004418309907",
        messageId,
      }));

const contentsCache = new Map<string, string>();

function getStructurePostReference(): TelegramPostReference {
  const chatId = getSetting("structure_post_chat_id");
  const messageId = Number(getSetting("structure_post_message_id"));

  if (chatId && Number.isInteger(messageId) && messageId > 0) {
    return { chatId, messageId };
  }

  return defaultStructurePost;
}

function getContentsPostReferences(): TelegramPostReference[] {
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

function formatStructurePost(): string {
  const movies = listMovies();
  const series = listSeries();
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
      buildContentsPages(listMovies(), listSeries(), botUsername).length,
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
    "• /backup — bazaning zaxira nusxasi",
    "• /version — bot qaysi commit bilan ishlayapti",
    "• /editparts KOD | FASL (keyingi qatorlarda: QISM | nom)",
    "• /stats — foydalanuvchilar va kontent statistikasi",
    "• /broadcast — xabarga reply qilib: hammaga yuborish (/broadcast test — sinov)",
    "• /genre KOD | Janr 1, Janr 2",
    "• /setstart",
    "• /setstructure POST_LINK",
    "• /setcontents POST_LINK",
    "• /delete KOD",
    "• /list",
    `• Start video: ${startVideoConfigured ? "sozlangan" : "sozlanmagan"}`,
    "",
    `🔄 Oxirgi sinxronlash: ${new Date().toISOString()}`,
  ].join("\n");
}

let botUsername = "";

async function refreshContentsPost(): Promise<boolean> {
  const refs = getContentsPostReferences();
  const structure = getStructurePostReference();
  const pages = buildContentsPages(listMovies(), listSeries(), botUsername);
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
      reference.chatId === structure.chatId &&
      reference.messageId === structure.messageId
    ) {
      continue;
    }

    let text =
      index < pages.length
        ? pages[index]
        : `📚 MEDFLIX — MUNDARIJA (${index + 1}/${refs.length})\n\nBu post hozircha bo‘sh. Mundarija davomi shu yerga yoziladi.`;
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

async function refreshStructurePost(): Promise<boolean> {
  const structureUpdated = await updateStructurePost();
  await refreshContentsPost();
  return structureUpdated;
}

async function updateStructurePost(): Promise<boolean> {
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

function getSubscriptionKeyboard(): ReplyMarkup {
  const buttons: InlineKeyboardButton[] = getRequiredSubscriptions().map(
    (subscription) => ({
      text: subscription.label,
      ...(subscription.url ? { url: subscription.url } : {}),
    }),
  );

  buttons.push({ text: "✅ Tekshirish", callback_data: "subscription:check" });
  return {
    inline_keyboard: buttons.map((button) => [button]),
  };
}

async function isSubscribed(userId: number): Promise<boolean> {
  if (isAdmin(userId) || getRequiredSubscriptions().length === 0) {
    return true;
  }

  const cached = subscriptionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.subscribed;
  }

  for (const subscription of getRequiredSubscriptions()) {
    try {
      const member = await telegramApi<{ status: string }>("getChatMember", {
        chat_id: subscription.chatId,
        user_id: userId,
      });
      if (
        member.status !== "creator" &&
        member.status !== "administrator" &&
        member.status !== "member"
      ) {
        subscriptionCache.set(userId, {
          subscribed: false,
          expiresAt: Date.now() + 60_000,
        });
        return false;
      }
    } catch (err: unknown) {
      logger.error(
        { err, userId, requiredChatId: subscription.chatId },
        "Failed to check Telegram subscription",
      );
      subscriptionCache.set(userId, {
        subscribed: false,
        expiresAt: Date.now() + 15_000,
      });
      return false;
    }
  }

  subscriptionCache.set(userId, {
    subscribed: true,
    expiresAt: Date.now() + 60_000,
  });
  return true;
}

async function requireSubscription(
  chatId: number,
  userId: number,
): Promise<boolean> {
  if (await isSubscribed(userId)) {
    return true;
  }

  await sendText(
    chatId,
    [
      "Botdan foydalanish uchun avval kanal va muhokama chatiga obuna bo‘ling.",
      "",
      "Obuna bo‘lgach, «✅ Tekshirish» tugmasini bosing.",
    ].join("\n"),
    getSubscriptionKeyboard(),
  );
  return false;
}

function getStartKeyboard(): ReplyMarkup {
  const rows: InlineKeyboardButton[][] = [
    [
      { text: "🎬 Katalog", callback_data: "catalog" },
      { text: "🔍 Qidirish", callback_data: "search:help" },
    ],
  ];
  const discussionUrl = getDiscussionUrl();
  if (discussionUrl) {
    rows.push([{ text: "💬 Muhokama chati", url: discussionUrl }]);
  }
  return { inline_keyboard: rows };
}

async function configureBotCommands(): Promise<void> {
  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Botni boshlash" },
      { command: "catalog", description: "Katalogni ko‘rish" },
      { command: "search", description: "Kino nomi bo‘yicha qidirish" },
    ],
  });

  const adminCommands = [
    { command: "start", description: "Botni boshlash" },
    { command: "catalog", description: "Katalogni ko‘rish" },
    { command: "search", description: "Kino nomi bo‘yicha qidirish" },
    { command: "add", description: "Kanal postidan kino qo‘shish" },
    { command: "addpost", description: "Kinoga qo‘shimcha post qo‘shish" },
    { command: "addseries", description: "Serial yoki ko‘p qismli kino yaratish" },
    { command: "addpart", description: "Serial qismi qo‘shish" },
    { command: "editpart", description: "Serial qismi nomini tahrirlash" },
    { command: "backup", description: "Bazaning zaxira nusxasini olish" },
    { command: "version", description: "Bot versiyasi (qaysi commit)" },
    { command: "editparts", description: "Ko‘p qism nomini bir xabarda tahrirlash" },
    { command: "stats", description: "Bot statistikasi" },
    { command: "broadcast", description: "Barcha foydalanuvchilarga xabar yuborish" },
    { command: "setposter", description: "Serial posterini o‘rnatish" },
    { command: "delposter", description: "Serial posterini o‘chirish" },
    { command: "getposter", description: "Serial posteri holatini ko‘rish" },
    { command: "genre", description: "Kino janrini belgilash" },
    { command: "setstart", description: "Start videosini o‘rnatish" },
    { command: "setstructure", description: "Avto-yangilanadigan postni sozlash" },
    { command: "setcontents", description: "Mundarija postini sozlash" },
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

function normalizeCode(value: string): string {
  return value.trim().replace(/^#/, "").toUpperCase();
}

function commandParts(text: string): { command: string; args: string } {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  return {
    command: rawCommand.toLowerCase().split("@")[0],
    args: rest.join(" ").trim(),
  };
}

function formatMovieList(): string {
  const movies = listMovies();
  const series = listSeries();
  if (movies.length === 0 && series.length === 0) {
    return "Hozircha bazada kino yo‘q.";
  }

  return [
    "MedFlix bazasi:",
    "",
    "Kinolar:",
    ...movies.map((movie) => `${movie.code} — ${movie.title}`),
    "",
    "Seriallar va ko‘p qismli kinolar:",
    ...series.map(
      (item) => `${item.code} — ${item.title} (${item.episodeCount} qism)`,
    ),
  ].join("\n");
}

function movieKeyboard(movies: ReturnType<typeof listMovies>): ReplyMarkup | undefined {
  if (movies.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: movies.slice(0, 25).map((movie) => [
      {
        text: `${movie.code} — ${movie.title}`.slice(0, 64),
        callback_data: `movie:${encodeCallbackValue(movie.code)}`,
      },
    ]),
  };
}

function seriesKeyboard(series: ReturnType<typeof listSeries>): ReplyMarkup | undefined {
  if (series.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: series.slice(0, 25).map((item) => [
      {
        text: `📺 ${item.code} — ${item.title} (${item.seasonCount} fasl, ${item.episodeCount} qism)`.slice(0, 64),
        callback_data: `series:${encodeCallbackValue(item.code)}`,
      },
    ]),
  };
}

function genreKeyboard(): ReplyMarkup | undefined {
  const genres = listGenres();
  if (genres.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: genres.slice(0, 20).map((genre) => [
      {
        text: `${genre.name} (${genre.movieCount})`.slice(0, 64),
        callback_data: `genre:${encodeCallbackValue(genre.name)}`,
      },
    ]),
  };
}

function catalogKeyboard(
  movies: ReturnType<typeof listMovies>,
  series: ReturnType<typeof listSeries>,
): ReplyMarkup | undefined {
  const rows = [
    ...(genreKeyboard()?.inline_keyboard ?? []),
    ...(movieKeyboard(movies)?.inline_keyboard ?? []),
    ...(seriesKeyboard(series)?.inline_keyboard ?? []),
  ];

  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

/** "Katalog" tugmasi: baza kanaldagi Mundarija postlarini (contents_posts) nusxalab yuboradi. */
async function sendContents(chatId: number): Promise<void> {
  const movies = listMovies();
  const series = listSeries();
  if (movies.length === 0 && series.length === 0) {
    await sendText(chatId, "Katalog hozircha bo‘sh.");
    return;
  }

  const refs = getContentsPostReferences();
  const pageCount = buildContentsPages(movies, series, botUsername).length;
  const result = await copyContentsPosts({
    refs,
    pageCount,
    exclude: getStructurePostReference(),
    copy: async (ref) => {
      await telegramApi("copyMessage", {
        chat_id: chatId,
        from_chat_id: ref.chatId,
        message_id: ref.messageId,
      });
    },
    onError: (ref, err) => {
      logger.warn(
        { err, chatId: ref.chatId, messageId: ref.messageId },
        "Failed to copy contents post to user",
      );
    },
  });

  if (result.sent === 0) {
    logger.error({ refs }, "Contents posts could not be delivered");
    await sendText(
      chatId,
      "📚 Mundarija hozir mavjud emas. Kino yoki serial kodini yuboring yoki 🔍 Qidirish tugmasidan foydalaning.",
    );
  }
}

async function sendCatalog(chatId: number): Promise<void> {
  const movies = listMovies();
  const series = listSeries();
  const genres = listGenres();
  const lines = [
    "🎬 MedFlix katalogi",
    "",
    `Kinolar: ${movies.length} ta`,
    `Seriallar: ${series.length} ta`,
  ];

  if (genres.length > 0 || series.length > 0 || movies.length > 0) {
    lines.push("", "Kerakli janr, kino yoki serialni tanlang.");
  } else {
    lines.push("", "Katalog hozircha bo‘sh.");
  }

  await sendText(
    chatId,
    lines.join("\n"),
    catalogKeyboard(movies, series),
  );
}

async function sendMovieResults(
  chatId: number,
  movies: ReturnType<typeof listMovies>,
  heading: string,
): Promise<void> {
  if (movies.length === 0) {
    await sendText(chatId, "Kino topilmadi. Kod yoki nomni tekshirib qayta yuboring.");
    return;
  }

  await sendText(chatId, heading, movieKeyboard(movies));
}

async function sendSeriesEpisodes(
  chatId: number,
  seriesCode: string,
): Promise<void> {
  const series = findSeries(seriesCode);
  if (!series) {
    await sendText(chatId, "Serial kodi bazada topilmadi.");
    return;
  }

  const episodes = listSeriesEpisodes(seriesCode);
  if (episodes.length === 0) {
    await sendText(chatId, `${series.title} uchun hali qism qo‘shilmagan.`);
    return;
  }

  const seasons = listSeriesSeasons(seriesCode);
  const caption = buildSeriesCaption({
    title: series.title,
    code: series.code,
    seasons,
    episodeCount: episodes.length,
    description: getSeriesPosterCaption(series.code),
  });

  const rows: InlineKeyboardButton[][] = [];
  const progress = getSeriesProgress(chatId, series.code);
  if (progress) {
    rows.push([
      {
        text: `▶️ Davom ettirish — ${progress.seasonNumber}-fasl, ${progress.episodeNumber}-qism`,
        callback_data: episodeCallback(progress.id),
      },
    ]);
  }
  for (const seasonNumber of seasons) {
    const count = episodes.filter((e) => e.seasonNumber === seasonNumber).length;
    rows.push([
      {
        text: `📂 ${seasonNumber}-fasl — ${count} ta qism`,
        callback_data: `season:${encodeCallbackValue(series.code)}:${seasonNumber}`,
      },
    ]);
  }
  rows.push([
    { text: "📋 Barcha qismlar", callback_data: episodeListCallback(episodes[0]!.id) },
  ]);
  const replyMarkup = { inline_keyboard: rows };

  const poster = getSeriesPoster(series.code);
  if (poster) {
    try {
      await telegramApi("sendPhoto", {
        chat_id: chatId,
        photo: poster,
        caption,
        reply_markup: replyMarkup,
      });
      return;
    } catch (err: unknown) {
      logger.warn(
        { err, seriesCode: series.code },
        "Failed to send series poster; falling back to text",
      );
    }
  }

  await sendText(chatId, caption, replyMarkup);
}

async function sendSeriesSeasonEpisodes(
  chatId: number,
  seriesCode: string,
  seasonNumber: number,
): Promise<void> {
  const series = findSeries(seriesCode);
  if (!series) {
    await sendText(chatId, "Serial kodi bazada topilmadi.");
    return;
  }

  const episodes = listSeriesEpisodes(seriesCode, seasonNumber);
  if (episodes.length === 0) {
    await sendText(
      chatId,
      `${series.title} ${seasonNumber}-faslida hali qism qo‘shilmagan.`,
    );
    return;
  }

  await sendText(
    chatId,
    [
      `📺 ${series.title}`,
      `Kod: ${series.code}`,
      `${seasonNumber}-fasl — ${episodes.length} ta qism`,
      "",
      "Ko‘rish uchun qismni tanlang:",
    ].join("\n"),
    {
      inline_keyboard: episodes.slice(0, 50).map((episode) => [
        {
          text: `${episode.episodeNumber}-qism${episode.title ? ` — ${episode.title}` : ""}`.slice(
            0,
            64,
          ),
          callback_data: `episode:${encodeCallbackValue(series.code)}:${seasonNumber}:${episode.episodeNumber}`,
        },
      ]),
    },
  );
}

async function sendSeriesResults(
  chatId: number,
  series: ReturnType<typeof listSeries>,
  heading: string,
): Promise<void> {
  if (series.length === 0) {
    return;
  }

  await sendText(chatId, heading, seriesKeyboard(series));
}

async function deliverChannelPost(
  chatId: number,
  reference: {
    code: string;
    channelChatId: string;
    channelMessageId: number;
  },
  kind: "Kino" | "Qism",
  extraRows: InlineKeyboardButton[][] = [],
): Promise<number | null> {
  try {
    const discussionUrl = getDiscussionUrl();
    const keyboardRows: InlineKeyboardButton[][] = [
      ...extraRows,
      ...(discussionUrl
        ? [[{ text: "💬 Muhokama qilish", url: discussionUrl }]]
        : []),
    ];
    const result = await telegramApi<{ message_id: number }>("copyMessage", {
      chat_id: chatId,
      from_chat_id: reference.channelChatId,
      message_id: reference.channelMessageId,
      ...(keyboardRows.length > 0
        ? { reply_markup: { inline_keyboard: keyboardRows } }
        : {}),
    });
    return result.message_id;
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        err,
        code: reference.code,
        channelChatId: reference.channelChatId,
        channelMessageId: reference.channelMessageId,
      },
      `Failed to copy ${kind.toLowerCase()} message`,
    );

    let userMessage =
      `${kind} topildi, lekin kanal postini yuborib bo‘lmadi. Bot manba kanalga qo‘shilganini tekshiring.`;
    if (errorText.includes("message to copy not found")) {
      userMessage =
        `${kind} bazada bor, lekin kanal postining ID raqami topilmadi. Postni botga forward qilib, qaytadan qo‘shing.`;
    } else if (errorText.includes("chat not found")) {
      userMessage =
        "Kanal topilmadi. Forward orqali qaytadan /add qiling yoki kanal ID sini tekshiring.";
    } else if (
      errorText.includes("not enough rights") ||
      errorText.includes("bot is not a member")
    ) {
      userMessage =
        "Bot manba kanalga qo‘shilmagan yoki yetarli huquqqa ega emas. Botni kanalga admin qilib qo‘shing.";
    }

    await sendText(chatId, userMessage);
    return null;
  }
}

async function deliverMovie(
  chatId: number,
  movie: ReturnType<typeof findMovie>,
): Promise<void> {
  if (!movie) {
    await sendText(chatId, "Bu kino bazada topilmadi.");
    return;
  }

  const posts = listMoviePosts(movie.code);
  const references =
    posts.length > 0
      ? posts
      : [
          {
            channelChatId: movie.channelChatId,
            channelMessageId: movie.channelMessageId,
          },
        ];

  for (const post of references) {
    await deliverChannelPost(
      chatId,
      {
        code: movie.code,
        channelChatId: post.channelChatId,
        channelMessageId: post.channelMessageId,
      },
      "Kino",
    );
  }
}

async function deliverSeriesEpisode(
  chatId: number,
  seriesCode: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<void> {
  const episode = findSeriesEpisode(seriesCode, seasonNumber, episodeNumber);
  if (!episode) {
    await sendText(chatId, "Bu serial qismi bazada topilmadi.");
    return;
  }

  const previousMessageId = getLastDeliveredEpisodeMessage(chatId, seriesCode);

  const neighbors = getEpisodeNeighbors(
    listSeriesEpisodes(seriesCode),
    episode.id,
  );
  const navigationRows = neighbors
    ? buildEpisodeNavigationRows(neighbors, episode.id)
    : [];

  const deliveredMessageId = await deliverChannelPost(
    chatId,
    {
      code: `${seriesCode}-${episodeNumber}`,
      channelChatId: episode.channelChatId,
      channelMessageId: episode.channelMessageId,
    },
    "Qism",
    navigationRows,
  );

  if (deliveredMessageId === null) {
    return;
  }

  setLastDeliveredEpisodeMessage(chatId, seriesCode, deliveredMessageId);
  saveSeriesProgress(chatId, episode.id);

  if (previousMessageId !== null && previousMessageId !== deliveredMessageId) {
    try {
      await telegramApi("deleteMessage", {
        chat_id: chatId,
        message_id: previousMessageId,
      });
    } catch (err: unknown) {
      logger.warn(
        { err, chatId, seriesCode, previousMessageId },
        "Failed to auto-delete previous episode message",
      );
    }
  }
}

function getStartVideoReference(): {
  channelChatId: string;
  channelMessageId: number;
} | null {
  const channelChatId = getSetting("start_channel_chat_id");
  const channelMessageId = Number(getSetting("start_channel_message_id"));

  if (
    !channelChatId ||
    !Number.isInteger(channelMessageId) ||
    channelMessageId <= 0
  ) {
    return null;
  }

  return { channelChatId, channelMessageId };
}

function getForwardedChannelPost(
  message: TelegramMessage,
): { channelChatId: string; channelMessageId: number } | null {
  const origin = message.forward_origin;
  const originMessageId = origin?.message_id;
  if (
    origin?.type === "channel" &&
    origin.chat?.id !== undefined &&
    typeof originMessageId === "number" &&
    Number.isInteger(originMessageId) &&
    originMessageId > 0
  ) {
    return {
      channelChatId: String(origin.chat.id),
      channelMessageId: originMessageId,
    };
  }

  const legacyMessageId = message.forward_from_message_id;
  if (
    message.forward_from_chat?.id !== undefined &&
    typeof legacyMessageId === "number" &&
    Number.isInteger(legacyMessageId) &&
    legacyMessageId > 0
  ) {
    return {
      channelChatId: String(message.forward_from_chat.id),
      channelMessageId: legacyMessageId,
    };
  }

  return null;
}

async function sendEpisodeList(
  chatId: number,
  seriesCode: string,
): Promise<void> {
  const series = findSeries(seriesCode);
  const episodes = series ? listSeriesEpisodes(seriesCode) : [];
  if (!series || episodes.length === 0) {
    await sendText(chatId, "Bu serialda qismlar topilmadi.");
    return;
  }

  for (const page of buildEpisodeListPages(series.title, series.code, episodes)) {
    const sent = await telegramApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: page.text,
      reply_markup: { inline_keyboard: page.keyboard },
    });
    navCleanup.track(chatId, sent.message_id);
  }
}

async function handleEpisodeNavigationCallback(
  callbackQuery: TelegramCallbackQuery,
  chatId: number,
): Promise<boolean> {
  const data = callbackQuery.data ?? "";
  const isList = data.startsWith("eps:");
  if (!isList && !data.startsWith("ep:")) {
    return false;
  }

  const episodeId = parseEpisodeId(data.slice(isList ? 4 : 3));
  const episode = episodeId === null ? null : findSeriesEpisodeById(episodeId);
  if (!episode) {
    await answerCallbackQuery(
      callbackQuery.id,
      "Bu qism topilmadi yoki o‘chirilgan.",
    );
    return true;
  }

  await answerCallbackQuery(callbackQuery.id);
  if (isList) {
    await sendEpisodeList(chatId, episode.seriesCode);
  } else {
    await deliverSeriesEpisode(
      chatId,
      episode.seriesCode,
      episode.seasonNumber,
      episode.episodeNumber,
    );
  }
  return true;
}

async function handleBroadcastCommand(
  message: TelegramMessage,
  userId: number,
  args: string,
): Promise<void> {
  const chatId = message.chat.id;
  if (chatId !== userId) {
    await sendText(chatId, "Xabar tarqatish faqat botning shaxsiy chatida ishlaydi.");
    return;
  }

  const source = message.reply_to_message;
  if (!source) {
    await sendText(
      chatId,
      [
        "Xabar tarqatish:",
        "1. Tarqatmoqchi bo‘lgan xabarni (matn, rasm, video) shu chatga yuboring.",
        "2. Shu xabarga reply qilib /broadcast yozing.",
        "",
        "Avval sinash: reply qilib /broadcast test (faqat o‘zingizga keladi).",
      ].join("\n"),
    );
    return;
  }

  if (args.trim().toLowerCase() === "test") {
    try {
      await telegramApi("copyMessage", {
        chat_id: chatId,
        from_chat_id: source.chat.id,
        message_id: source.message_id,
      });
    } catch (err: unknown) {
      logger.warn({ err }, "Broadcast test failed");
      await sendText(chatId, "Test xabarini yuborib bo‘lmadi.");
    }
    return;
  }

  if (broadcastRunning) {
    await sendText(chatId, "Oldingi tarqatish hali tugamagan. Tugashini kuting.");
    return;
  }

  const count = listBroadcastRecipients().length;
  if (count === 0) {
    await sendText(chatId, "Hozircha tarqatiladigan foydalanuvchi yo‘q.");
    return;
  }

  pendingBroadcasts.set(String(userId), {
    sourceChatId: source.chat.id,
    sourceMessageId: source.message_id,
    expiresAt: Date.now() + 10 * 60_000,
  });
  await sendText(chatId, `📣 Xabar ${count} ta foydalanuvchiga yuboriladi.\nDavom etasizmi?`, {
    inline_keyboard: [
      [
        { text: "✅ Yuborish", callback_data: "bc:go" },
        { text: "❌ Bekor qilish", callback_data: "bc:no" },
      ],
    ],
  });
}

async function handleBroadcastCallback(
  callbackQuery: TelegramCallbackQuery,
  message: TelegramMessage,
): Promise<void> {
  const userId = callbackQuery.from.id;
  if (!isAdmin(userId)) {
    await answerCallbackQuery(callbackQuery.id, "Bu amal faqat admin uchun.");
    return;
  }

  const pending = pendingBroadcasts.get(String(userId));
  pendingBroadcasts.delete(String(userId));
  try {
    await telegramApi("editMessageReplyMarkup", {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // tugmalarni olib tashlab bo'lmasa ham davom etamiz
  }

  if (callbackQuery.data === "bc:no") {
    await answerCallbackQuery(callbackQuery.id, "Bekor qilindi.");
    return;
  }
  if (!pending || pending.expiresAt < Date.now()) {
    await answerCallbackQuery(callbackQuery.id, "Muddati tugagan. /broadcast ni qayta yuboring.");
    return;
  }
  if (broadcastRunning) {
    await answerCallbackQuery(callbackQuery.id, "Oldingi tarqatish hali tugamagan.");
    return;
  }

  await answerCallbackQuery(callbackQuery.id, "Yuborish boshlandi.");
  void runBroadcastJob(message.chat.id, pending);
}

async function runBroadcastJob(
  adminChatId: number,
  pending: { sourceChatId: number; sourceMessageId: number },
): Promise<void> {
  broadcastRunning = true;
  try {
    const result = await runBroadcast({
      recipients: listBroadcastRecipients(),
      send: async (recipientId) => {
        await telegramApi("copyMessage", {
          chat_id: recipientId,
          from_chat_id: pending.sourceChatId,
          message_id: pending.sourceMessageId,
        });
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    markBotUserBlocked(result.blockedIds);
    logger.info({ ...result, blockedIds: undefined }, "Broadcast finished");
    await sendText(
      adminChatId,
      [
        "✅ Tarqatish tugadi",
        `• Yuborildi: ${result.sent}`,
        `• Botni bloklagan: ${result.blocked}`,
        `• Xato: ${result.failed}`,
        `• Jami: ${result.total}`,
      ].join("\n"),
    );
  } catch (err: unknown) {
    logger.error({ err }, "Broadcast failed");
    try {
      await sendText(adminChatId, "Tarqatish vaqtida xato yuz berdi. Loglarni tekshiring.");
    } catch {
      // admin bilan aloqa yo'q bo'lsa, log yetarli
    }
  } finally {
    broadcastRunning = false;
  }
}

async function sendDatabaseBackup(
  chatId: number,
  label = "🗄 Baza zaxira nusxasi",
): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "medflix-backup-"));
  try {
    const filePath = path.join(directory, "kino-bot.sqlite");
    createDatabaseBackup(filePath);
    const size = statSync(filePath).size;
    if (size > 49 * 1024 * 1024) {
      await sendText(chatId, "Baza 50 MB dan katta, Telegram orqali yuborib bo‘lmaydi.");
      return;
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", `${label} (${Math.ceil(size / 1024)} KB)`);
    form.append(
      "document",
      new Blob([readFileSync(filePath)]),
      `kino-bot-${stamp}.sqlite`,
    );

    const response = await fetch(apiUrl("sendDocument"), {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as TelegramResponse<unknown>;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description ?? `Telegram API error: ${response.status}`);
    }
  } catch (err: unknown) {
    logger.error({ err }, "Failed to send database backup");
    await sendText(chatId, "Zaxira nusxasini yuborib bo‘lmadi. Loglarni tekshiring.");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Har kuni (standart 21:00 UTC = 02:00 Toshkent) barcha adminlarga baza nusxasini yuboradi. */
function startAutoBackup(): void {
  if ((process.env.AUTO_BACKUP ?? "").toLowerCase() === "off") {
    logger.info("Auto backup is disabled (AUTO_BACKUP=off)");
    return;
  }
  const hourUtc = parseBackupHour(process.env.AUTO_BACKUP_HOUR_UTC);

  const tick = async (): Promise<void> => {
    try {
      const now = new Date();
      if (!shouldRunBackup(now, getSetting("last_auto_backup_date"), hourUtc)) {
        return;
      }
      setSetting("last_auto_backup_date", todayKey(now));
      for (const adminId of getAdminIds()) {
        const adminChatId = Number(adminId);
        if (Number.isSafeInteger(adminChatId)) {
          await sendDatabaseBackup(adminChatId, "🗄 Avto-zaxira");
        }
      }
      logger.info("Daily auto backup sent");
    } catch (err: unknown) {
      logger.error({ err }, "Auto backup failed");
    }
  };

  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), 30 * 60_000);
}

async function saveSeriesPosterFromAdmin(
  chatId: number,
  code: string,
  fileId: string,
  description?: string | null,
): Promise<void> {
  const series = findSeries(code);
  if (!series) {
    await sendText(
      chatId,
      findMovie(code)
        ? `${code} oddiy kino kodi, serial emas. Poster faqat seriallar uchun.`
        : `${code} seriali topilmadi.`,
    );
    return;
  }

  const desc = normalizeDescription(description);
  setSeriesPoster(code, fileId, desc);
  await sendText(
    chatId,
    [
      "✅ Poster muvaffaqiyatli saqlandi!",
      `📺 Serial: ${series.title}`,
      `🔢 Kod: ${series.code}`,
      desc
        ? `📝 Tavsif saqlandi (${desc.length} belgi)`
        : "📝 Tavsif: matn yo'q (kanal postini forward qilsangiz matn ham olinadi)",
    ].join("\n"),
  );
}

async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

async function handleCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const tapped = callbackQuery.message;
  if (!tapped || !shouldCleanup(callbackQuery.data ?? "")) {
    await handleCallbackQueryInner(callbackQuery);
    return;
  }
  await navCleanup.run(tapped.chat.id, tapped.message_id, () =>
    handleCallbackQueryInner(callbackQuery),
  );
}

async function handleCallbackQueryInner(
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const message = callbackQuery.message;
  if (!message) {
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data ?? "";

  if (data.startsWith("bc:")) {
    await handleBroadcastCallback(callbackQuery, message);
    return;
  }

  if (data === "subscription:check") {
    subscriptionCache.delete(userId);
    if (await isSubscribed(userId)) {
      await answerCallbackQuery(callbackQuery.id, "Obuna tasdiqlandi.");
      await sendText(
        chatId,
        "Rahmat. Endi kino kodi yoki nomini yuborishingiz mumkin.",
        getStartKeyboard(),
      );
    } else {
      await answerCallbackQuery(
        callbackQuery.id,
        "Hali barcha kanallarga obuna bo‘lmagansiz.",
      );
      await sendText(
        chatId,
        "Iltimos, barcha ko‘rsatilgan kanal va chatlarga obuna bo‘lib, qayta tekshiring.",
        getSubscriptionKeyboard(),
      );
    }
    return;
  }

  if (!(await requireSubscription(chatId, userId))) {
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (await handleEpisodeNavigationCallback(callbackQuery, chatId)) {
    return;
  }

  await answerCallbackQuery(callbackQuery.id);

  if (data === "catalog") {
    await sendContents(chatId);
    return;
  }

  if (data === "search:help") {
    await sendText(
      chatId,
      "Kino kodini yoki nomini yuboring. Masalan: 101 yoki Interstellar",
    );
    return;
  }

  if (data.startsWith("genre:")) {
    const genreName = decodeCallbackValue(data.slice("genre:".length));
    if (!genreName) {
      await sendText(chatId, "Janr ma’lumotini o‘qib bo‘lmadi.");
      return;
    }

    const movies = listMoviesByGenre(genreName);
    await sendMovieResults(
      chatId,
      movies,
      `${genreName} janridagi materiallar:`,
    );
    return;
  }

  if (data.startsWith("movie:")) {
    const code = decodeCallbackValue(data.slice("movie:".length));
    if (!code) {
      await sendText(chatId, "Kino kodi ma’lumotini o‘qib bo‘lmadi.");
      return;
    }
    await deliverMovie(chatId, findMovie(code));
    return;
  }

  if (data.startsWith("series:")) {
    const code = decodeCallbackValue(data.slice("series:".length));
    if (!code) {
      await sendText(chatId, "Serial kodi ma’lumotini o‘qib bo‘lmadi.");
      return;
    }
    await sendSeriesEpisodes(chatId, code);
    return;
  }

  if (data.startsWith("season:")) {
    const payload = data.slice("season:".length);
    const separatorIndex = payload.lastIndexOf(":");
    const code = decodeCallbackValue(
      separatorIndex >= 0 ? payload.slice(0, separatorIndex) : "",
    );
    const seasonNumber = Number(
      separatorIndex >= 0 ? payload.slice(separatorIndex + 1) : "",
    );
    if (
      !code ||
      !Number.isInteger(seasonNumber) ||
      seasonNumber <= 0
    ) {
      await sendText(chatId, "Serial fasli ma’lumotini o‘qib bo‘lmadi.");
      return;
    }
    await sendSeriesSeasonEpisodes(chatId, code, seasonNumber);
    return;
  }

  if (data.startsWith("episode:")) {
    const payload = data.slice("episode:".length);
    const episodeSeparatorIndex = payload.lastIndexOf(":");
    const seasonPayload = payload.slice(0, episodeSeparatorIndex);
    const seasonSeparatorIndex = seasonPayload.lastIndexOf(":");
    const code = decodeCallbackValue(
      seasonSeparatorIndex >= 0
        ? seasonPayload.slice(0, seasonSeparatorIndex)
        : "",
    );
    const seasonNumber = Number(
      seasonSeparatorIndex >= 0
        ? seasonPayload.slice(seasonSeparatorIndex + 1)
        : "",
    );
    const episodeNumber = Number(
      episodeSeparatorIndex >= 0
        ? payload.slice(episodeSeparatorIndex + 1)
        : "",
    );
    if (
      !code ||
      !Number.isInteger(seasonNumber) ||
      seasonNumber <= 0 ||
      !Number.isInteger(episodeNumber) ||
      episodeNumber <= 0
    ) {
      await sendText(chatId, "Serial qismi ma’lumotini o‘qib bo‘lmadi.");
      return;
    }
    await deliverSeriesEpisode(chatId, code, seasonNumber, episodeNumber);
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text ?? message.caption)?.trim() ?? "";

  if (!userId) {
    return;
  }

  const forwardedPost = getForwardedChannelPost(message);

  const pendingPoster = pendingPosterRequests.get(String(userId));
  if (pendingPoster && isAdmin(userId) && !text.startsWith("/")) {
    if (pendingPoster.expiresAt < Date.now()) {
      pendingPosterRequests.delete(String(userId));
    } else if (message.photo && message.photo.length > 0) {
      pendingPosterRequests.delete(String(userId));
      await saveSeriesPosterFromAdmin(
        chatId,
        pendingPoster.code,
        message.photo[message.photo.length - 1]!.file_id,
        message.caption,
      );
      return;
    } else if (!text && !forwardedPost) {
      await sendText(
        chatId,
        "Poster uchun rasm yuboring (fayl emas, rasm sifatida). Bekor qilish uchun boshqa buyruq yuboring.",
      );
      return;
    }
  }
  if (forwardedPost && isAdmin(userId) && !text.startsWith("/")) {
    pendingForwardedPosts.set(String(userId), forwardedPost);
    await sendText(
      chatId,
      [
        "Kanal posti qabul qilindi.",
        `Kanal ID: ${forwardedPost.channelChatId}`,
        `Post ID: ${forwardedPost.channelMessageId}`,
        "",
        "Endi shu chatga quyidagicha yuboring:",
        "/add KOD | Kino nomi",
        "/addpost KOD | 2 | Kino fayli",
        "/addpart SERIAL_KOD | FASL | QISM | Qism nomi",
        "yoki /setstart — shu postni start videosi qilish",
        "",
        "Masalan: /add 101 | Interstellar",
      ].join("\n"),
    );
    return;
  }

  if (!text) {
    return;
  }

  if (!isAdmin(userId) && !(await requireSubscription(chatId, userId))) {
    return;
  }

  if (text.startsWith("/")) {
    const { command, args } = commandParts(text);

    if (command === "/start" && args) {
      const payloadCode = normalizeCode(args);
      const payloadSeries = findSeries(payloadCode);
      if (payloadSeries) {
        await sendSeriesEpisodes(chatId, payloadSeries.code);
        return;
      }
      const payloadMovie = findMovie(payloadCode);
      if (payloadMovie) {
        await deliverMovie(chatId, payloadMovie);
        return;
      }
    }

    if (command === "/start" || command === "/help") {
      const welcomeLines = [
        "Kino botga xush kelibsiz.",
        "",
        "Kino ko‘rish uchun kino kodini yuboring.",
        "Masalan: 101",
      ];

      if (isAdmin(userId)) {
        welcomeLines.push(
          "",
          "Admin bo‘limi:",
          "1) Kanal postini botga forward qiling",
          "2) /add KOD | Kino nomi — 1-post",
          "3) /addpost KOD | 2 | Kino fayli — qo‘shimcha post",
          "4) /addseries KOD | Serial nomi",
          "5) Har bir serial posti uchun /addpart KOD | FASL | QISM | Nomi",
          "6) /setstart — start videosini o‘rnatish",
          "7) /setstructure POST_LINK — struktura postini sozlash",
          "/delete KOD",
          "/deleteseries KOD",
          "/list",
        );
      }

      const startVideo = getStartVideoReference();
      if (startVideo) {
        try {
          await telegramApi("copyMessage", {
            chat_id: chatId,
            from_chat_id: startVideo.channelChatId,
            message_id: startVideo.channelMessageId,
          });
        } catch (err: unknown) {
          logger.error(
            { err, chatId, ...startVideo },
            "Failed to copy start video",
          );
        }
      }

      await sendText(chatId, welcomeLines.join("\n"), getStartKeyboard());
      return;
    }

    if (command === "/id") {
      await sendText(
        chatId,
        [
          `Sizning Telegram ID raqamingiz: ${userId}`,
          `Admin holati: ${isAdmin(userId) ? "tasdiqlangan" : "tasdiqlanmagan"}`,
        ].join("\n"),
      );
      return;
    }

    if (command === "/catalog") {
      await sendContents(chatId);
      return;
    }

    if (command === "/search") {
      if (!args) {
        await sendText(
          chatId,
          "Qidirish uchun kino kodini yoki nomini yuboring. Masalan: /search Interstellar",
        );
        return;
      }

      const exactSeries = findSeries(normalizeCode(args));
      if (exactSeries) {
        await sendSeriesEpisodes(chatId, exactSeries.code);
        return;
      }

      const exactMovie = findMovie(normalizeCode(args));
      if (exactMovie) {
        await deliverMovie(chatId, exactMovie);
        return;
      }

      const seriesMatches = searchSeries(args);
      if (seriesMatches.length > 0) {
        await sendSeriesResults(
          chatId,
          seriesMatches,
          `«${args}» bo‘yicha seriallar:`,
        );
      }

      await sendMovieResults(
        chatId,
        searchMovies(args),
        `«${args}» bo‘yicha qidiruv natijalari:`,
      );
      return;
    }

    if (!userId || !isAdmin(userId)) {
      if (
        command === "/add" ||
        command === "/addpost" ||
        command === "/addseries" ||
        command === "/addpart" ||
        command === "/editpart" ||
        command === "/editparts" ||
        command === "/stats" ||
        command === "/broadcast" ||
        command === "/backup" ||
        command === "/version" ||
        command === "/setposter" ||
        command === "/delposter" ||
        command === "/getposter" ||
        command === "/genre" ||
        command === "/setstart" ||
        command === "/setstructure" ||
        command === "/setcontents" ||
        command === "/delete" ||
        command === "/deleteseries" ||
        command === "/deletepart" ||
        command === "/list"
      ) {
        await sendText(
          chatId,
          "Bu buyruq faqat admin uchun. Admin ID sozlanmagan bo‘lsa, TELEGRAM_ADMIN_IDS secretini kiriting.",
        );
      }
      return;
    }

    if (command === "/setstart") {
      const startVideo =
        getForwardedChannelPost(message.reply_to_message ?? message) ??
        pendingForwardedPosts.get(String(userId));

      if (!startVideo) {
        await sendText(
          chatId,
          [
            "Start videosini o‘rnatish uchun:",
            "1. Kanal video postini shu botga forward qiling.",
            "2. /setstart yuboring.",
          ].join("\n"),
        );
        return;
      }

      setSetting("start_channel_chat_id", startVideo.channelChatId);
      setSetting(
        "start_channel_message_id",
        String(startVideo.channelMessageId),
      );
      pendingForwardedPosts.delete(String(userId));
      await refreshStructurePost();
      await sendText(
        chatId,
        "Start videosi saqlandi. Endi foydalanuvchi /start yuborganda shu video chiqadi.",
      );
      return;
    }

    if (command === "/setstructure") {
      const reference = parseTelegramPostLink(args);
      if (!reference) {
        const currentReference = getStructurePostReference();
        await sendText(
          chatId,
          [
            "Format: /setstructure POST_LINK",
            `Joriy struktura posti: ${formatTelegramPostLink(currentReference)}`,
            "Masalan: /setstructure https://t.me/c/4418309907/17",
            "",
            "Bot target kanalda postlarni tahrirlash huquqiga ega bo‘lishi kerak.",
          ].join("\n"),
        );
        return;
      }

      setSetting("structure_post_chat_id", reference.chatId);
      setSetting("structure_post_message_id", String(reference.messageId));
      const updated = await refreshStructurePost();
      await sendText(
        chatId,
        updated
          ? `Struktura posti sozlandi va yangilandi: ${reference.chatId}/${reference.messageId}`
          : "Post manzili saqlandi, lekin hozircha tahrirlab bo‘lmadi. Botning kanal huquqlarini tekshiring.",
      );
      return;
    }

    if (command === "/setcontents") {
      const tokens = args.split(/[\s,]+/).filter(Boolean);
      const references = tokens.map((token) => parseTelegramPostLink(token));
      const valid =
        tokens.length > 0 && references.every((reference) => reference !== null);

      if (!valid) {
        await sendText(
          chatId,
          [
            "Format: /setcontents LINK1 LINK2 LINK3 ...",
            "Joriy mundarija postlari:",
            ...getContentsPostReferences().map(
              (reference, index) =>
                `${index + 1}. ${formatTelegramPostLink(reference)}`,
            ),
            "",
            "Masalan: /setcontents https://t.me/c/4418309907/22 https://t.me/c/4418309907/23",
            "Bot target kanalda postlarni tahrirlash huquqiga ega bo‘lishi kerak.",
          ].join("\n"),
        );
        return;
      }

      const list = references as TelegramPostReference[];
      setSetting("contents_posts", JSON.stringify(list));
      contentsCache.clear();
      await updateStructurePost();
      const updated = await refreshContentsPost();
      await sendText(
        chatId,
        updated
          ? `Mundarija postlari sozlandi (${list.length} ta) va yangilandi.`
          : "Postlar manzili saqlandi, lekin ba‘zilarini tahrirlab bo‘lmadi. Botning kanal huquqlarini tekshiring.",
      );
      return;
    }

    if (command === "/addseries") {
      const [rawCode, rawTitle] = args
        .split("|")
        .map((value) => value.trim());
      const code = normalizeCode(rawCode ?? "");
      const title = rawTitle ?? "";

      if (!code || !title) {
        await sendText(
          chatId,
          [
            "Format: /addseries KOD | Serial nomi",
            "Masalan: /addseries DH | Dr. House",
            "Bu format serial va bir nechta postli kinolar uchun ham ishlaydi.",
          ].join("\n"),
        );
        return;
      }

      if (findMovie(code)) {
        await sendText(
          chatId,
          `${code} kodi oddiy kino sifatida mavjud. Serial uchun boshqa kod tanlang.`,
        );
        return;
      }

      const series = upsertSeries({ code, title });
      await refreshStructurePost();
      await sendText(
        chatId,
        `${series.code} — ${series.title} seriali yaratildi. Endi postlarni forward qilib /addpart yuboring.`,
      );
      return;
    }

    if (command === "/addpart") {
      const partArgs = args.split("|").map((value) => value.trim());
      const [rawCode, rawSeasonOrEpisode, rawEpisodeOrTitle, rawPartTitle] =
        partArgs;
      const code = normalizeCode(rawCode ?? "");
      const hasSeason = partArgs.length >= 4;
      const seasonNumber = Number(hasSeason ? rawSeasonOrEpisode : 1);
      const episodeNumber = Number(
        hasSeason ? rawEpisodeOrTitle : rawSeasonOrEpisode,
      );
      const title = hasSeason ? rawPartTitle ?? "" : rawEpisodeOrTitle ?? "";
      const referencedForward =
        getForwardedChannelPost(message.reply_to_message ?? message) ??
        pendingForwardedPosts.get(String(userId));

      if (
        !code ||
        !Number.isInteger(seasonNumber) ||
        seasonNumber <= 0 ||
        !Number.isInteger(episodeNumber) ||
        episodeNumber <= 0 ||
        !referencedForward
      ) {
        await sendText(
          chatId,
          [
            "Yangi format: /addpart SERIAL_KOD | FASL | QISM | Qism nomi",
            "Eski format: /addpart SERIAL_KOD | QISM | Qism nomi (1-fasl)",
            "1. Serial yarating: /addseries DH | Dr. House",
            "2. Kanal postini botga forward qiling.",
            "3. /addpart DH | 1 | 1 | 1-qism",
          ].join("\n"),
        );
        return;
      }

      if (!findSeries(code)) {
        await sendText(
          chatId,
          `${code} seriali topilmadi. Avval /addseries ${code} | Serial nomi yuboring.`,
        );
        return;
      }

      const episode = upsertSeriesEpisode({
        seriesCode: code,
        seasonNumber,
        episodeNumber,
        title,
        channelChatId: referencedForward.channelChatId,
        channelMessageId: referencedForward.channelMessageId,
      });
      if (!episode) {
        await sendText(chatId, "Serial qismini saqlab bo‘lmadi.");
        return;
      }

      pendingForwardedPosts.delete(String(userId));
      await refreshStructurePost();
      await sendText(
        chatId,
        `${code} serialining ${seasonNumber}-fasl ${episodeNumber}-qismi bazaga saqlandi.`,
      );
      return;
    }

    if (command === "/setposter") {
      const code = normalizeCode(args);
      const photos = message.photo ?? message.reply_to_message?.photo;
      const fileId =
        photos && photos.length > 0 ? photos[photos.length - 1]!.file_id : null;

      if (!code) {
        await sendText(
          chatId,
          [
            "Format: /setposter SERIAL_KOD, so‘ng rasm yuboring.",
            "Yoki rasm captioniga /setposter SERIAL_KOD yozing (yoki rasmga reply qiling).",
            "Masalan: /setposter 101",
          ].join("\n"),
        );
        return;
      }

      if (fileId) {
        pendingPosterRequests.delete(String(userId));
        await saveSeriesPosterFromAdmin(
          chatId,
          code,
          fileId,
          message.photo ? undefined : message.reply_to_message?.caption,
        );
        return;
      }

      const series = findSeries(code);
      if (!series) {
        await sendText(
          chatId,
          findMovie(code)
            ? `${code} oddiy kino kodi, serial emas. Poster faqat seriallar uchun.`
            : `${code} seriali topilmadi.`,
        );
        return;
      }

      pendingPosterRequests.set(String(userId), {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      await sendText(
        chatId,
        `📸 ${code} uchun baza kanaldagi poster postini (rasm + matn) forward qiling yoki oddiy rasm yuboring.`,
      );
      return;
    }

    if (command === "/delposter" || command === "/getposter") {
      const code = normalizeCode(args);
      const series = code ? findSeries(code) : null;
      if (!series) {
        await sendText(
          chatId,
          code && findMovie(code)
            ? `${code} oddiy kino kodi, serial emas.`
            : `Format: ${command} SERIAL_KOD (serial topilmadi yoki kod yozilmagan).`,
        );
        return;
      }

      if (command === "/delposter") {
        const removed = clearSeriesPoster(series.code);
        await sendText(
          chatId,
          removed
            ? `🗑 Poster o‘chirildi.\n📺 Serial: ${series.title}\n🔢 Kod: ${series.code}`
            : `${series.title} (${series.code}) uchun poster biriktirilmagan.`,
        );
        return;
      }

      const poster = getSeriesPoster(series.code);
      if (!poster) {
        await sendText(
          chatId,
          `❌ ${series.title} (${series.code}) uchun poster biriktirilmagan.`,
        );
        return;
      }
      try {
        await telegramApi("sendPhoto", {
          chat_id: chatId,
          photo: poster,
          caption: `✅ Poster biriktirilgan\n📺 Serial: ${series.title}\n🔢 Kod: ${series.code}\n📝 Tavsif: ${getSeriesPosterCaption(series.code) ? "bor" : "yo'q"}`,
        });
      } catch (err: unknown) {
        logger.warn({ err, code: series.code }, "Failed to preview series poster");
        await sendText(
          chatId,
          `Poster biriktirilgan, lekin rasmni ko‘rsatib bo‘lmadi (file_id yaroqsiz bo‘lishi mumkin). /setposter ${series.code} bilan yangilang.`,
        );
      }
      return;
    }

    if (command === "/version") {
      const versionSeries = listSeries();
      await sendText(
        chatId,
        formatVersionMessage(versionInfo, {
          movies: listMovies().length,
          series: versionSeries.length,
          episodes: versionSeries.reduce((sum, item) => sum + item.episodeCount, 0),
        }),
      );
      return;
    }

    if (command === "/backup") {
      if (chatId !== userId) {
        await sendText(
          chatId,
          "Zaxira nusxasi faqat botning shaxsiy chatida yuboriladi.",
        );
        return;
      }
      await sendDatabaseBackup(chatId);
      return;
    }

    if (command === "/broadcast") {
      await handleBroadcastCommand(message, userId, args);
      return;
    }

    if (command === "/stats") {
      await sendText(chatId, formatStatsMessage(getBotStats()));
      return;
    }

    if (command === "/editparts") {
      const parsed = parseEditParts(text.replace(/^\/\S+\s*/, ""));
      if (!parsed.ok) {
        await sendText(
          chatId,
          [
            parsed.error,
            "",
            "Format (har qism yangi qatorda):",
            "/editparts 101 | 1",
            "1 | Birinchi nom",
            "2 | Ikkinchi nom",
          ].join("\n"),
        );
        return;
      }
      if (!findSeries(parsed.code)) {
        await sendText(chatId, `${parsed.code} seriali topilmadi.`);
        return;
      }
      if (parsed.items.length === 0) {
        await sendText(chatId, formatEditPartsResult({ ...parsed, updated: [], missing: [] }));
        return;
      }

      const result = updateSeriesEpisodeTitles(parsed.code, parsed.season, parsed.items);
      if (result.updated.length > 0) {
        await refreshStructurePost();
      }
      await sendText(chatId, formatEditPartsResult({ ...parsed, ...result }));
      return;
    }

    if (command === "/editpart") {
      const editArgs = args.split("|").map((value) => value.trim());
      const hasSeason = editArgs.length >= 4;
      const code = normalizeCode(editArgs[0] ?? "");
      const seasonNumber = Number(hasSeason ? editArgs[1] : 1);
      const episodeNumber = Number(hasSeason ? editArgs[2] : editArgs[1]);
      const title = (hasSeason ? editArgs.slice(3) : editArgs.slice(2))
        .join(" | ")
        .trim();

      if (
        !code ||
        !Number.isInteger(seasonNumber) ||
        seasonNumber <= 0 ||
        !Number.isInteger(episodeNumber) ||
        episodeNumber <= 0 ||
        !title ||
        title.length > 100
      ) {
        await sendText(
          chatId,
          [
            "Format: /editpart SERIAL_KOD | FASL | QISM | Yangi nom",
            "Qisqa format (1-fasl): /editpart SERIAL_KOD | QISM | Yangi nom",
            "Masalan: /editpart 101 | 1 | 3 | Uchinchi soat",
            "Nom bo‘sh bo‘lmasligi va 100 belgidan oshmasligi kerak.",
          ].join("\n"),
        );
        return;
      }

      const existing = findSeriesEpisode(code, seasonNumber, episodeNumber);
      if (!existing) {
        await sendText(
          chatId,
          `${code} seriali ${seasonNumber}-fasl ${episodeNumber}-qismi topilmadi.`,
        );
        return;
      }

      updateSeriesEpisodeTitle(code, seasonNumber, episodeNumber, title);
      await refreshStructurePost();
      await sendText(
        chatId,
        [
          `${code} seriali ${seasonNumber}-fasl ${episodeNumber}-qismi yangilandi.`,
          `Eski nom: ${existing.title || "—"}`,
          `Yangi nom: ${title}`,
        ].join("\n"),
      );
      return;
    }

    if (command === "/list") {
      await sendText(chatId, formatMovieList());
      return;
    }

    if (command === "/genre") {
      const [rawCode, rawGenres] = args
        .split("|")
        .map((value) => value.trim());
      const code = normalizeCode(rawCode ?? "");
      const genres = (rawGenres ?? "")
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean);

      if (!code || genres.length === 0) {
        await sendText(
          chatId,
          [
            "Format: /genre KOD | Janr 1, Janr 2",
            "Masalan: /genre 101 | Tibbiy drama, Serial",
          ].join("\n"),
        );
        return;
      }

      if (!setMovieGenres(code, genres)) {
        await sendText(chatId, `${code} kodi topilmadi.`);
        return;
      }

      await refreshStructurePost();
      await sendText(
        chatId,
        `${code} kodi uchun janrlar saqlandi: ${genres.join(", ")}`,
      );
      return;
    }

    if (command === "/delete") {
      const code = normalizeCode(args);
      if (!code) {
        await sendText(chatId, "Format: /delete KOD");
        return;
      }

      const deleted = deleteMovie(code);
      if (deleted) {
        await refreshStructurePost();
      }
      await sendText(
        chatId,
        deleted
          ? `${code} kodi o‘chirildi.`
          : `${code} kodi topilmadi.`,
      );
      return;
    }

    if (command === "/deletepart") {
      const [rawCode, rawSeason, rawEpisode] = args
        .split("|")
        .map((value) => value.trim());
      const code = normalizeCode(rawCode ?? "");
      const seasonNumber = Number(rawSeason);
      const episodeNumber = Number(rawEpisode);

      if (
        !code ||
        !Number.isInteger(seasonNumber) ||
        seasonNumber <= 0 ||
        !Number.isInteger(episodeNumber) ||
        episodeNumber <= 0
      ) {
        await sendText(
          chatId,
          [
            "Format: /deletepart SERIAL_KOD | FASL | QISM",
            "Masalan: /deletepart DH | 1 | 3",
          ].join("\n"),
        );
        return;
      }

      const deleted = deleteSeriesEpisode(code, seasonNumber, episodeNumber);
      if (deleted) {
        await refreshStructurePost();
      }
      await sendText(
        chatId,
        deleted
          ? `${code} seriali ${seasonNumber}-fasl ${episodeNumber}-qismi o‘chirildi.`
          : `${code} seriali ${seasonNumber}-fasl ${episodeNumber}-qismi topilmadi.`,
      );
      return;
    }

    if (command === "/deleteseries") {
      const code = normalizeCode(args);
      if (!code) {
        await sendText(chatId, "Format: /deleteseries SERIAL_KOD");
        return;
      }

      const deleted = deleteSeries(code);
      if (deleted) {
        await refreshStructurePost();
      }
      await sendText(
        chatId,
        deleted
          ? `${code} seriali va uning barcha qismlari o‘chirildi.`
          : `${code} seriali topilmadi.`,
      );
      return;
    }

    if (command === "/add") {
      const [rawCode, rawTitle, rawChatId, rawMessageId] = args
        .split("|")
        .map((value) => value.trim());
      const code = normalizeCode(rawCode ?? "");
      const title = rawTitle ?? "";

      if (code && findSeries(code)) {
        await sendText(
          chatId,
          `${code} kodi serial sifatida band. Avval /deleteseries ${code} yuboring yoki boshqa kod tanlang.`,
        );
        return;
      }
      const referencedForward =
        getForwardedChannelPost(message.reply_to_message ?? message) ??
        pendingForwardedPosts.get(String(userId));
      const channelChatId = rawChatId || referencedForward?.channelChatId || "";
      const channelMessageId =
        Number(rawMessageId) || referencedForward?.channelMessageId || 0;

      if (
        !code ||
        !title ||
        !channelChatId ||
        !Number.isInteger(channelMessageId) ||
        channelMessageId <= 0 ||
        (rawChatId && !rawMessageId)
      ) {
        await sendText(
          chatId,
          [
            "Format noto‘g‘ri.",
            "Tavsiya etilgan usul:",
            "1. Kanal postini botga forward qiling.",
            "2. /add 101 | Interstellar",
            "",
            "Eski usul:",
            "/add 101 | Interstellar | -1001234567890 | 42",
          ].join("\n"),
        );
        return;
      }

      const movie = upsertMovie({
        code,
        title,
        channelChatId,
        channelMessageId,
      });
      pendingForwardedPosts.delete(String(userId));
      await refreshStructurePost();
      await sendText(chatId, `${movie.code} — ${movie.title} bazaga saqlandi.`);
      return;
    }

    if (command === "/addpost") {
      const [rawCode, rawPostNumber, rawTitle] = args
        .split("|")
        .map((value) => value.trim());
      const code = normalizeCode(rawCode ?? "");
      const postNumber = Number(rawPostNumber);
      const title = rawTitle ?? "";
      const referencedForward =
        getForwardedChannelPost(message.reply_to_message ?? message) ??
        pendingForwardedPosts.get(String(userId));

      if (
        !code ||
        !Number.isInteger(postNumber) ||
        postNumber <= 1 ||
        !referencedForward
      ) {
        await sendText(
          chatId,
          [
            "Format: /addpost KOD | TARTIB | Izoh",
            "Avval 1-postni /add bilan saqlang.",
            "Keyin kanal postini forward qilib yuboring.",
            "Masalan: /addpost 101 | 2 | Kino fayli",
          ].join("\n"),
        );
        return;
      }

      if (!findMovie(code)) {
        await sendText(
          chatId,
          `${code} kodi topilmadi. Avval poster yoki birinchi postni /add orqali saqlang.`,
        );
        return;
      }

      const post = upsertMoviePost({
        movieCode: code,
        postNumber,
        title,
        channelChatId: referencedForward.channelChatId,
        channelMessageId: referencedForward.channelMessageId,
      });
      if (!post) {
        await sendText(chatId, "Kino postini saqlab bo‘lmadi.");
        return;
      }

      pendingForwardedPosts.delete(String(userId));
      await refreshStructurePost();
      await sendText(
        chatId,
        `${code} kodi uchun ${postNumber}-post saqlandi. Kod yuborilganda barcha postlar tartib bilan yuboriladi.`,
      );
      return;
    }

    return;
  }

  const code = normalizeCode(text);
  const series = findSeries(code);
  if (series) {
    await sendSeriesEpisodes(chatId, series.code);
    return;
  }

  const movie = findMovie(code);
  if (movie) {
    await deliverMovie(chatId, movie);
    return;
  }

  const seriesMatches = searchSeries(text);
  if (seriesMatches.length === 1) {
    await sendSeriesEpisodes(chatId, seriesMatches[0].code);
    return;
  }

  if (seriesMatches.length > 1) {
    await sendSeriesResults(
      chatId,
      seriesMatches,
      `«${text}» bo‘yicha seriallar:`,
    );
  }

  const matches = searchMovies(text);
  if (matches.length === 1) {
    await deliverMovie(chatId, matches[0]);
    return;
  }

  await sendMovieResults(
    chatId,
    matches,
    matches.length > 1
      ? `«${text}» bo‘yicha topilgan materiallar:`
      : "Bu kod yoki nom bo‘yicha kino topilmadi. Qayta tekshirib ko‘ring.",
  );
}

async function poll(): Promise<void> {
  let offset = Number(getSetting("telegram_update_offset") ?? "0");

  while (true) {
    try {
      const updates = await telegramApi<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        setSetting("telegram_update_offset", String(offset));
        const queueKey = String(
          update.message?.chat.id ??
            update.callback_query?.message?.chat.id ??
            update.callback_query?.from.id ??
            update.update_id,
        );
        void updateQueue.run(queueKey, async () => {
          if (update.message) {
            if (update.message.chat.id > 0) touchBotUser(update.message.chat.id);
            await handleMessage(update.message);
          }
          if (update.callback_query) {
            touchBotUser(update.callback_query.from.id);
            await handleCallbackQuery(update.callback_query);
          }
        });
      }
      await updateQueue.waitForCapacity(200);
    } catch (err: unknown) {
      logger.error({ err }, "Telegram polling error");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function startTelegramBot(): Promise<void> {
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN is not set; Telegram bot is disabled");
    return;
  }

  await telegramApi("deleteWebhook", { drop_pending_updates: false });
  const bot = await telegramApi<{ username?: string }>("getMe", {});
  botUsername = bot.username ?? "";
  await configureBotCommands();
  await refreshStructurePost();
  logger.info({ username: bot.username }, "Telegram bot connected");
  startAutoBackup();
  void poll();
}