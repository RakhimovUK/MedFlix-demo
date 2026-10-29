import { restrictionStore } from "./restriction-runtime";
import { parseRestrictArgs } from "./restrictions";
import {
  clearSeriesPoster,
  deleteMovie,
  deleteSeries,
  deleteSeriesEpisode,
  findMovie,
  findSeries,
  findSeriesEpisode,
  getSeriesPoster,
  getSeriesPosterCaption,
  getUserLang,
  listGenres,
  listMovies,
  listSeries,
  listSeriesEpisodes,
  setUserLang,
  setMovieGenres,
  setSetting,
  updateSeriesEpisodeTitle,
  updateSeriesEpisodeTitles,
  upsertMovie,
  upsertMoviePost,
  upsertSeries,
  upsertSeriesEpisode,
} from "./database";
import {
  formatTelegramPostLink,
  parseTelegramPostLink,
  type TelegramPostReference,
} from "./catalog-content";
import { isNewLatestEpisode } from "./series-notify";
import { logger } from "../lib/logger";
import { formatEditPartsResult, parseEditParts } from "./admin-tools";
import { looksLikeCode, normalizeText } from "./smart-search";
import { parsePostText } from "./post-parser";
import { decidePostLanguage, normalizeLangToken, type MovieLang } from "./post-language";
import {
  LANG_LABELS,
  buildLanguageChoiceKeyboard,
  createPendingAddStore,
  languageQuestionText,
  parseAddLangData,
  type PendingAdd,
} from "./add-language";
import type { TelegramCallbackQuery } from "./telegram-types";
import type { CommandContext } from "./telegram-types";
import {
  formatMovieList,
  getForwardedChannelPost,
  normalizeCode,
  notifyNewEpisode,
} from "./telegram-delivery";
import { isAdmin } from "./config";
import {
  answerCallbackQuery,
  pendingForwardedPosts,
  pendingPosterRequests,
  searchStore,
  sendText,
  telegramApi,
  token,
} from "./telegram-state";
import {
  contentsCache,
  getContentsPostReferences,
  getPublicContentsPostReferences,
  getStructurePostReference,
  refreshContentsPost,
  refreshStructurePost,
  updateStructurePost,
} from "./telegram-structure";
import { savePosterFromAdmin } from "./telegram-admin-ops";

export async function handleSetstartCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleSetstructureCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  const reference = parseTelegramPostLink(args);
  if (!reference) {
    const currentReference = getStructurePostReference();
    await sendText(
      chatId,
      [
        "Format: /setstructure POST_LINK",
        `Joriy struktura posti: ${formatTelegramPostLink(currentReference)}`,
        "Masalan: /setstructure https://t.me/c/KANAL_ID/17",
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

export async function handleSetpubcontentsCommand(ctx: CommandContext): Promise<void> {
  const { chatId, args } = ctx;
  if (args.trim().toLowerCase() === "off") {
    setSetting("public_contents_posts", "[]");
    contentsCache.clear();
    await sendText(chatId, "Ochiq kanal mundarijasi o‘chirildi.");
    return;
  }

  const tokens = args.split(/[\s,]+/).filter(Boolean);
  const references = tokens.map((token) => parseTelegramPostLink(token));
  if (tokens.length === 0 || !references.every((reference) => reference !== null)) {
    const current = getPublicContentsPostReferences();
    await sendText(
      chatId,
      [
        "Format: /setpubcontents LINK1 LINK2 ... (o‘chirish: /setpubcontents off)",
        "Joriy ochiq kanal postlari:",
        "Har kanal uchun postlarni sahifa tartibida yozing (masalan: A1 A2 A3 B1 B2 B3).",
        ...(current.length > 0
          ? current.map((r, i) => `${i + 1}. ${formatTelegramPostLink(r)}`)
          : ["yo‘q"]),
        "",
        "Masalan: /setpubcontents https://t.me/kanal_nomi/5 https://t.me/kanal_nomi/6",
        "Bot ochiq kanalda admin bo‘lib, postlarni tahrirlash huquqiga ega bo‘lishi kerak.",
      ].join("\n"),
    );
    return;
  }

  const list = references as TelegramPostReference[];
  setSetting("public_contents_posts", JSON.stringify(list));
  contentsCache.clear();
  const updated = await refreshContentsPost();
  await sendText(
    chatId,
    updated
      ? `Ochiq kanal mundarijasi sozlandi (${list.length} ta post) va yangilandi.`
      : "Manzillar saqlandi, lekin ba‘zi postlarni tahrirlab bo‘lmadi. Bot ochiq kanalda admin ekanini tekshiring.",
  );
}

export async function handleRestrictCommand(ctx: CommandContext): Promise<void> {
  const { chatId, args } = ctx;
  const parsed = parseRestrictArgs(args);
  if (!parsed) {
    await sendText(chatId, "Format: /restrict USER_ID [izoh]\nMasalan: /restrict 123456789 raqobatchi");
    return;
  }
  restrictionStore.restrict(parsed.userId, parsed.note);
  await sendText(
    chatId,
    `🔒 ${parsed.userId} cheklandi: kinolarni ko‘radi, lekin forward, nusxa olish va saqlash mumkin emas.\nCheklov faqat bundan keyin yuboriladigan kontentga ta’sir qiladi.`,
  );
}

export async function handleUnrestrictCommand(ctx: CommandContext): Promise<void> {
  const { chatId, args } = ctx;
  const parsed = parseRestrictArgs(args);
  if (!parsed) {
    await sendText(chatId, "Format: /unrestrict USER_ID");
    return;
  }
  const removed = restrictionStore.unrestrict(parsed.userId);
  await sendText(
    chatId,
    removed ? `🔓 ${parsed.userId} uchun cheklov olib tashlandi.` : `${parsed.userId} cheklanmagan.`,
  );
}

export async function handleRestrictedCommand(ctx: CommandContext): Promise<void> {
  const rows = restrictionStore.list();
  await sendText(
    ctx.chatId,
    rows.length === 0
      ? "Cheklangan foydalanuvchilar yo‘q."
      : ["Cheklanganlar:", ...rows.map((row) => `• ${row.user_id} — ${row.note || "izohsiz"} (${row.created_at})`)].join("\n"),
  );
}

export async function handleSetcontentsCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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
        "Masalan: /setcontents https://t.me/c/KANAL_ID/22 https://t.me/c/KANAL_ID/23",
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

export async function handleAddseriesCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleAddpartCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

  const existingEpisodes = listSeriesEpisodes(code);
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
  if (isNewLatestEpisode(existingEpisodes, { seasonNumber, episodeNumber })) {
    void notifyNewEpisode(chatId, code, episode).catch((err: unknown) =>
      logger.error({ err }, "New episode notification failed"),
    );
  }
  return;
}

export async function handleSetposterCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  const code = normalizeCode(args);
  const photos = message.photo ?? message.reply_to_message?.photo;
  const fileId =
    photos && photos.length > 0 ? photos[photos.length - 1]!.file_id : null;

  if (!code) {
    await sendText(
      chatId,
      [
        "Format: /setposter KOD, so‘ng rasm yuboring.",
        "Yoki rasm captioniga /setposter KOD yozing (yoki rasmga reply qiling).",
        "Kino yoki serial kodi bo‘lishi mumkin — bot o‘zi aniqlaydi.",
        "Masalan: /setposter 101",
      ].join("\n"),
    );
    return;
  }

  if (fileId) {
    pendingPosterRequests.delete(String(userId));
    await savePosterFromAdmin(
      chatId,
      code,
      fileId,
      message.photo ? undefined : message.reply_to_message?.caption,
    );
    return;
  }

  if (!findSeries(code) && !findMovie(code)) {
    await sendText(chatId, `${code} kod bo'yicha kino yoki serial topilmadi.`);
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

export async function handlePosterCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleEditpartsCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleEditpartCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleListCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  await sendText(chatId, formatMovieList());
  return;
}

export async function handleGenreCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

/** Kod bo'yicha kino yoki serialni topadi (alias uchun). */
export function resolveAliasTarget(
  rawCode: string,
): { kind: "movie" | "series"; code: string; title: string } | null {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const series = findSeries(code);
  if (series) return { kind: "series", code: series.code, title: series.title };
  const movie = findMovie(code);
  if (movie) return { kind: "movie", code: movie.code, title: movie.title };
  return null;
}

export async function handleAliasCommand(ctx: CommandContext): Promise<void> {
  const { chatId, args } = ctx;
  const [rawCode, rawWords] = args.split("|").map((value) => value.trim());
  if (!rawCode) {
    await sendText(
      chatId,
      [
        "Format: /alias KOD | so‘z",
        "Masalan: /alias 101 | garri poter, harry potter",
        "Ro‘yxat: /alias KOD",
      ].join("\n"),
    );
    return;
  }
  const target = resolveAliasTarget(rawCode);
  if (!target) {
    await sendText(chatId, `${rawCode} kodi topilmadi.`);
    return;
  }

  if (!rawWords) {
    const aliases = searchStore.listAliasesForCode(target.kind, target.code);
    await sendText(
      chatId,
      aliases.length === 0
        ? `${target.code} — ${target.title}: muqobil so‘zlar yo‘q.`
        : [
            `${target.code} — ${target.title}: muqobil so‘zlar:`,
            ...aliases.map(
              (alias) =>
                `• ${alias.aliasNorm}${alias.hits >= 100 ? "" : ` (avto, ${alias.hits} marta)`}`,
            ),
          ].join("\n"),
    );
    return;
  }

  const saved: string[] = [];
  const rejected: string[] = [];
  for (const word of rawWords.split(/[,;]+/u).map((value) => value.trim()).filter(Boolean)) {
    const aliasNorm = normalizeText(word);
    if (!aliasNorm || looksLikeCode(word)) {
      rejected.push(word);
      continue;
    }
    searchStore.setAlias(aliasNorm, target.kind, target.code);
    saved.push(aliasNorm);
  }
  await sendText(
    chatId,
    [
      saved.length > 0
        ? `✅ ${target.code} — ${target.title}: «${saved.join("», «")}» endi shu kinoni topadi.`
        : "Hech narsa saqlanmadi.",
      ...(rejected.length > 0
        ? [`Qabul qilinmadi (bo‘sh yoki kod ko‘rinishida): ${rejected.join(", ")}`]
        : []),
    ].join("\n"),
  );
}

export async function handleDelaliasCommand(ctx: CommandContext): Promise<void> {
  const { chatId, args } = ctx;
  const [rawCode, rawWord] = args.split("|").map((value) => value.trim());
  if (!rawCode || !rawWord) {
    await sendText(chatId, "Format: /delalias KOD | so‘z\nRo‘yxat: /alias KOD");
    return;
  }
  const target = resolveAliasTarget(rawCode);
  if (!target) {
    await sendText(chatId, `${rawCode} kodi topilmadi.`);
    return;
  }
  const aliasNorm = normalizeText(rawWord);
  const removed = searchStore.removeAlias(aliasNorm, target.kind, target.code);
  await sendText(
    chatId,
    removed
      ? `🗑 «${aliasNorm}» muqobil so‘zi ${target.code} dan o‘chirildi.`
      : `«${aliasNorm}» ${target.code} uchun topilmadi. Ro‘yxat: /alias ${target.code}`,
  );
}

export async function handleDeleteCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleDeletepartCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleDeleteseriesCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleAddCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  const [rawCode, rawTitle, rawChatId, rawMessageId] = args
    .split("|")
    .map((value) => value.trim());
  const code = normalizeCode(rawCode ?? "");

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
  // Post matnidan nom va janr avtomatik olinadi; /add KOD | Nom berilsa, nom foydalanuvchiniki.
  const postText =
    (referencedForward as { text?: string } | undefined)?.text ||
    message.reply_to_message?.caption ||
    message.reply_to_message?.text ||
    message.caption;
  const parsedPost = parsePostText(postText);
  const title = rawTitle || parsedPost.title || "";

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
        title || !code
          ? "Format noto‘g‘ri."
          : "Postdan kino nomini aniqlab bo‘lmadi. Nomini o‘zingiz yozing.",
        "Tavsiya etilgan usul:",
        "1. Kanal postini botga forward qiling.",
        "2. /add 101 (nom va janr postdan olinadi) yoki /add 101 | Interstellar",
        "",
        "Eski usul:",
        "/add 101 | Interstellar | -1001234567890 | 42",
      ].join("\n"),
    );
    return;
  }

  pendingForwardedPosts.delete(String(userId));
  const entry: PendingAdd = {
    code,
    title,
    channelChatId,
    channelMessageId,
    genres: parsedPost.genres,
    options: [],
  };

  // Til faqat postdagi "Til:/Язык:/Language:" belgisidan. Aks holda admin tanlaydi.
  const decision = decidePostLanguage(postText);
  if (decision.kind === "auto") {
    await saveAddedMovie(chatId, entry, decision.lang, true);
    return;
  }

  entry.options = decision.options;
  pendingAddLanguage.set(userId, entry);
  await sendText(
    chatId,
    languageQuestionText(entry, decision.reason),
    buildLanguageChoiceKeyboard(decision.options),
  );
}

/** Admin kutilayotgan /add uchun til tugmasini bosdi. */
export const pendingAddLanguage = createPendingAddStore();

export async function handleAddLanguageCallback(
  callbackQuery: TelegramCallbackQuery,
  chatId: number,
  messageId: number,
): Promise<void> {
  const userId = callbackQuery.from.id;
  const choice = parseAddLangData(callbackQuery.data ?? "");
  if (!isAdmin(userId) || !choice) {
    await answerCallbackQuery(callbackQuery.id, "Bu tugma faqat admin uchun.");
    return;
  }

  const entry = pendingAddLanguage.take(userId);
  const closeQuestion = async (text: string) => {
    try {
      await telegramApi("editMessageText", { chat_id: chatId, message_id: messageId, text });
    } catch (err: unknown) {
      logger.warn({ err, chatId }, "Failed to close language question");
    }
  };

  if (!entry) {
    await answerCallbackQuery(callbackQuery.id, "Muddati o‘tgan. /add ni qayta yuboring.");
    await closeQuestion("⌛ Muddati o‘tgan. Postni qayta forward qilib, /add yuboring.");
    return;
  }
  if (choice === "cancel") {
    await answerCallbackQuery(callbackQuery.id, "Bekor qilindi.");
    await closeQuestion(`❌ ${entry.code} — ${entry.title}: qo‘shish bekor qilindi.`);
    return;
  }
  if (entry.options.length > 0 && !entry.options.includes(choice)) {
    pendingAddLanguage.set(userId, entry);
    await answerCallbackQuery(callbackQuery.id, "Bu til taklif qilinmagan.");
    return;
  }

  await answerCallbackQuery(callbackQuery.id, LANG_LABELS[choice]);
  await closeQuestion(`${entry.code} — ${entry.title}\n🌐 Til tanlandi: ${LANG_LABELS[choice]}`);
  await saveAddedMovie(chatId, entry, choice, false);
}

async function saveAddedMovie(
  chatId: number,
  entry: PendingAdd,
  lang: MovieLang,
  detected: boolean,
): Promise<void> {
  const existed = Boolean(findMovie(entry.code, lang));
  const movie = upsertMovie({
    code: entry.code,
    lang,
    title: entry.title,
    channelChatId: entry.channelChatId,
    channelMessageId: entry.channelMessageId,
  });

  // Janr postdan avtomatik saqlanadi (mavjud janr nomining yozilishi saqlanadi).
  let savedGenres: string[] = [];
  if (entry.genres.length > 0) {
    const known = new Map(
      listGenres().map((genre) => [genre.name.toLocaleLowerCase("uz"), genre.name]),
    );
    savedGenres = entry.genres.map(
      (genre) => known.get(genre.toLocaleLowerCase("uz")) ?? genre,
    );
    setMovieGenres(movie.code, savedGenres, lang);
  }

  await refreshStructurePost();
  await sendText(
    chatId,
    [
      `${movie.code} — ${movie.title} bazaga ${existed ? "qayta saqlandi (yangilandi)" : "saqlandi"}.`,
      `🌐 Til: ${LANG_LABELS[lang]}${detected ? " (postdan aniqlandi)" : ""}`,
      savedGenres.length > 0
        ? `🎭 Janr: ${savedGenres.join(", ")}`
        : `Janr aniqlanmadi. Kerak bo‘lsa: /genre ${movie.code} | Janr 1, Janr 2`,
      ...(lang !== "uz"
        ? ["", "ℹ️ Bu tildagi kinolar foydalanuvchilarga til tanlash qo‘shilgach ko‘rinadi."]
        : []),
    ].join("\n"),
  );
}

export async function handleAddpostCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

/** /lang [uz|ru|en] — admin qaysi til bazasi bilan ishlashini tanlaydi. */
export async function handleLangCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, args } = ctx;
  const current = getUserLang(userId);
  const counts = (["uz", "ru", "en"] as MovieLang[])
    .map((lang) => `${LANG_LABELS[lang]}: ${listMovies(lang).length} kino, ${listSeries(lang).length} serial`)
    .join("\n");

  if (!args.trim()) {
    await sendText(
      chatId,
      [
        `🌐 Joriy ish tili: ${LANG_LABELS[current]}`,
        "",
        counts,
        "",
        "O‘zgartirish: /lang uz | /lang ru | /lang en",
        "Tanlangan tilda ishlaydi: /addpost, /addseries, /addpart, /genre, /setposter, /delete, qidiruv va katalog.",
        "/add esa tilni postdagi «Til:» belgisidan oladi (yoki tugma bilan so‘raydi).",
      ].join("\n"),
    );
    return;
  }

  const lang = normalizeLangToken(args);
  if (!lang) {
    await sendText(chatId, "Til noma’lum. Masalan: /lang en (uz, ru, en).");
    return;
  }
  setUserLang(userId, lang);
  await sendText(
    chatId,
    `✅ Ish tili: ${LANG_LABELS[lang]}\nEndi admin buyruqlari, qidiruv va katalog shu til bazasida ishlaydi.`,
  );
}
