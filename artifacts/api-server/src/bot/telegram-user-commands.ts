import { isAdmin } from "./config";
import {
  findCodeLangs,
  findMovie,
  findSeries,
  listUserSubscriptions,
  setUserLang,
} from "./database";
import {
  LANG_BUTTON,
  currentLang,
  langName,
  runWithLang,
  suggestLangFromTelegram,
  t,
  translate,
} from "./i18n";
import { buildLanguagePicker, parseSetLangData } from "./language-picker";
import { protectFor } from "./restriction-runtime";
import { getStartKeyboard } from "./telegram-subscription";
import { logger } from "../lib/logger";
import { checkRequestText, describeGuardReason } from "./request-guard";
import { groupHits, looksLikeCode, normalizeText, smartSearch } from "./smart-search";
import { encodeCallbackValue } from "./keyboards";
import type {
  CommandContext,
  TelegramCallbackQuery,
  TelegramUser,
} from "./telegram-types";
import {
  aliasLearner,
  answerCallbackQuery,
  notifyAdminsOfError,
  requestFlow,
  searchStore,
  sendText,
  telegramApi,
} from "./telegram-state";
import {
  deliverMovie,
  getStartVideoReference,
  normalizeCode,
  sendContents,
  sendMovieResults,
  sendSeriesEpisodes,
  sendSeriesResults,
} from "./telegram-delivery";

export async function handleIdCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  await sendText(
    chatId,
    [
      t("id.yours", { id: userId }),
      t("id.admin", { state: t(isAdmin(userId) ? "id.yes" : "id.no") }),
      ...(isAdmin(userId) && chatId < 0
        ? [`Chat ID: ${chatId}`, `Topic ID: ${message.message_thread_id ?? "yo‘q"}`]
        : []),
    ].join("\n"),
  );
  return;
}

export async function handleCatalogCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  await sendContents(chatId);
  return;
}

export async function handleSearchCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  if (!args) {
    await sendText(
      chatId,
      t("search.prompt"),
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

  await runSmartSearch(
    chatId,
    args,
    t("notFound.generic"),
    { id: userId, name: displayName(message.from) },
  );
  return;
}

/**
 * Hech narsa topilmaganda: haqiqiy kino nomiga o'xshasa, so'rov avtomatik adminlarga ketadi.
 * Kod ko'rinishidagi matn, salomlashuv, havola, juda qisqa/uzun matn so'rov bo'lmaydi —
 * ularga oddiy "topilmadi" xabari beriladi.
 */
export async function handleNothingFound(
  chatId: number,
  query: string,
  notFoundText: string,
  requester?: { id: number; name: string },
): Promise<void> {
  if (looksLikeCode(query)) {
    await sendCodeNotFound(chatId, normalizeCode(query));
    return;
  }
  if (!requester || !checkRequestText(query).ok) {
    await sendText(chatId, notFoundText, catalogButton());
    return;
  }
  await submitUserRequest(chatId, requester, query.trim(), normalizeText(query), true);
}

/** Ostida "📚 Katalog" tugmasi bo'lgan klaviatura. */
export function catalogButton(): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return { inline_keyboard: [[{ text: t("kb.contents"), callback_data: "catalog" }]] };
}

/** Kod foydalanuvchi tilida biriktirilmagan: qaysi tilda borligini aytadi va katalog tugmasini beradi. */
export async function sendCodeNotFound(chatId: number, code: string): Promise<void> {
  const lang = currentLang();
  const others = findCodeLangs(code).filter((item) => item !== lang);
  const lines = [t("notFound.code", { code, lang: langName(lang) })];
  if (others.length > 0) {
    lines.push("", t("notFound.otherLangs", { langs: others.map((item) => LANG_BUTTON[item]).join(", ") }));
  }
  await sendText(chatId, lines.join("\n"), catalogButton());
}

/**
 * Ko'p parametrli qidiruv: nom (to'liq/qisman) -> janr -> imlo xatosi bilan o'xshash nomlar.
 * Kodlar bo'yicha aniq moslik chaqiruvchida allaqachon tekshirilgan.
 */
export async function runSmartSearch(
  chatId: number,
  query: string,
  notFoundText: string,
  requester?: { id: number; name: string },
): Promise<void> {
  const grouped = groupHits(
    smartSearch(query, searchStore.listSearchCatalog(), searchStore.listAliases()),
  );
  const { primary, genre, fuzzy } = grouped;

  // Imlo xatosi bilan topilgan bo'lsa, foydalanuvchi tanlovini alias sifatida o'rganamiz.
  if (fuzzy.length > 0 && !looksLikeCode(query)) {
    aliasLearner.remember(
      chatId,
      normalizeText(query),
      fuzzy.map((hit) => `${hit.kind}:${hit.code}`),
    );
  } else {
    aliasLearner.forget(chatId);
  }

  if (primary.length === 0 && genre.length === 0 && fuzzy.length === 0) {
    await handleNothingFound(chatId, query, notFoundText, requester);
    return;
  }

  // Bitta aniq natija bo'lsa, to'g'ridan-to'g'ri yuboramiz.
  if (primary.length === 1 && genre.length === 0) {
    const only = primary[0]!;
    if (only.kind === "series") {
      await sendSeriesEpisodes(chatId, only.code);
    } else {
      const movie = findMovie(only.code);
      if (movie) await deliverMovie(chatId, movie);
    }
    return;
  }

  const sendGroup = async (
    hits: typeof primary,
    movieHeading: string,
    seriesHeading: string,
  ) => {
    const seriesList = hits
      .filter((hit) => hit.kind === "series")
      .map((hit) => findSeries(hit.code))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (seriesList.length > 0) {
      await sendSeriesResults(chatId, seriesList, seriesHeading);
    }
    const movieList = hits.filter((hit) => hit.kind === "movie");
    if (movieList.length > 0) {
      await sendMovieResults(chatId, movieList, movieHeading);
    }
  };

  if (primary.length > 0) {
    await sendGroup(
      primary,
      t("search.found", { q: query }),
      t("search.foundSeries", { q: query }),
    );
  }
  if (genre.length > 0) {
    await sendGroup(
      genre,
      t("search.genreMovies", { q: query }),
      t("search.genreSeries", { q: query }),
    );
  }
  if (fuzzy.length > 0) {
    await sendGroup(fuzzy, t("search.didYouMean"), t("search.didYouMean"));
  }
}

export function displayName(user: TelegramUser | undefined): string {
  if (!user) return "";
  const parts = [user.first_name ?? "", user.username ? `(@${user.username})` : ""];
  return parts.filter(Boolean).join(" ");
}

/** Foydalanuvchi so'rovini tekshiradi (spam), adminlarga yuboradi va foydalanuvchiga javob beradi. */
export async function submitUserRequest(
  chatId: number,
  user: { id: number; name: string },
  text: string,
  queryNorm: string,
  auto: boolean,
): Promise<void> {
  const guard = checkRequestText(text);
  if (!guard.ok) {
    await sendText(chatId, describeGuardReason(guard.reason));
    return;
  }

  const result = await requestFlow.submit({
    userId: user.id,
    userName: user.name,
    query: text,
    queryNorm,
  });

  if (result.status === "duplicate") {
    await sendText(
      chatId,
      `${auto ? t("request.notFoundPrefix") : ""}${t("request.duplicate")}`,
      catalogButton(),
    );
    return;
  }
  if (result.status === "limited") {
    await sendText(
      chatId,
      `${auto ? t("request.notFoundPrefix") : ""}${t("request.limited")}`,
      catalogButton(),
    );
    return;
  }
  if (!result.delivered) {
    notifyAdminsOfError(
      "So‘rovni adminlarga yuborish",
      new Error(`So‘rov #${result.id} saqlandi, lekin guruh/adminlarga yetmadi`),
    );
  }
  await sendText(
    chatId,
    auto ? t("request.sentAuto") : t("request.sent", { q: text }),
    catalogButton(),
  );
}

export async function handleRequestCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, args } = ctx;
  if (!args) {
    await sendText(
      chatId,
      t("request.format"),
    );
    return;
  }
  const queryNorm = normalizeText(args);
  await submitUserRequest(chatId, { id: userId, name: displayName(message.from) }, args, queryNorm, false);
}

export async function handleMysubsCommand(ctx: CommandContext): Promise<void> {
  const subscriptions = listUserSubscriptions(ctx.chatId);
  if (subscriptions.length === 0) {
    await sendText(
      ctx.chatId,
      t("mysubs.empty"),
    );
    return;
  }

  await sendText(ctx.chatId, t("mysubs.header"), {
    inline_keyboard: subscriptions.slice(0, 50).map((item) => [
      {
        text: `📺 ${item.title} (${item.code})`.slice(0, 64),
        callback_data: `series:${encodeCallbackValue(item.code)}`,
      },
    ]),
  });
}

/** Kod bo'yicha serial yoki kinoni yuboradi (joriy tilda). Topilsa true. */
export async function deliverByCode(chatId: number, code: string): Promise<boolean> {
  if (!code) return false;
  const series = findSeries(code);
  if (series) {
    await sendSeriesEpisodes(chatId, series.code);
    return true;
  }
  const movie = findMovie(code);
  if (movie) {
    await deliverMovie(chatId, movie);
    return true;
  }
  return false;
}

/** Start ekrani: start video (bo'lsa), salom matni va asosiy tugmalar. */
export async function sendWelcome(chatId: number, userId: number): Promise<void> {
  const lines = [t("start.welcome")];
  if (isAdmin(userId)) {
    lines.push(
      "",
      "Admin bo‘limi:",
      "1) Kanal postini botga forward qiling",
      "2) /add KOD | Kino nomi — 1-post",
      "3) /addpost KOD | 2 | Kino fayli — qo‘shimcha post",
      "4) /addseries KOD | Serial nomi",
      "5) Har bir serial posti uchun /addpart KOD | FASL | QISM | Nomi",
      "6) /setstart — start videosini o‘rnatish",
      "7) /setstructure POST_LINK — struktura postini sozlash",
      "8) /lang — ish tili (uz/ru/en)",
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
        ...protectFor(chatId),
        from_chat_id: startVideo.channelChatId,
        message_id: startVideo.channelMessageId,
      });
    } catch (err: unknown) {
      logger.error({ err, chatId, ...startVideo }, "Failed to copy start video");
    }
  }

  await sendText(chatId, lines.join("\n"), getStartKeyboard());
}

/** Til tanlash tugmalari (Telegram tili birinchi taklif qilinadi). */
export async function sendLanguagePicker(
  chatId: number,
  telegramLanguageCode?: string,
  payload?: string,
): Promise<void> {
  await sendText(
    chatId,
    t("lang.choose"),
    buildLanguagePicker(suggestLangFromTelegram(telegramLanguageCode), payload),
  );
}

/** "setlang:..." tugmasi: tilni saqlaydi, so'ng start ekrani yoki deep-link kodini yuboradi. */
export async function handleSetLanguageCallback(
  callbackQuery: TelegramCallbackQuery,
  chatId: number,
  messageId: number,
): Promise<void> {
  const parsed = parseSetLangData(callbackQuery.data ?? "");
  if (!parsed) {
    await answerCallbackQuery(callbackQuery.id, t("error.unknownButton"));
    return;
  }
  const userId = callbackQuery.from.id;
  setUserLang(userId, parsed.lang);
  await answerCallbackQuery(callbackQuery.id, LANG_BUTTON[parsed.lang]);
  try {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: translate(parsed.lang, "lang.set", { lang: LANG_BUTTON[parsed.lang] }),
    });
  } catch (err: unknown) {
    logger.warn({ err, chatId }, "Failed to edit language picker");
  }

  // Qolgan ish yangi tanlangan tilda.
  await runWithLang(parsed.lang, async () => {
    if (parsed.payload && (await deliverByCode(chatId, parsed.payload))) {
      return;
    }
    if (parsed.payload) {
      await sendCodeNotFound(chatId, parsed.payload);
      return;
    }
    await sendWelcome(chatId, userId);
  });
}
