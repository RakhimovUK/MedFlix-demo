import { aboutCallback, type SynopsisKind } from "./synopsis";
import { protectFor } from "./restriction-runtime";
import {
  findMovie,
  findSeries,
  findSeriesEpisode,
  getLastDeliveredEpisodeMessage,
  getMoviePoster,
  getMoviePosterCaption,
  getSeriesPoster,
  getSeriesPosterCaption,
  getSeriesProgress,
  getSetting,
  isFavorite,
  isSeriesSubscribed,
  listFavorites,
  listGenres,
  listMoviePosts,
  listMovies,
  listRecentEpisodes,
  listSeries,
  listSeriesEpisodes,
  listSeriesSeasons,
  listSeriesSubscribers,
  listTopContent,
  recordEpisodeView,
  recordMovieView,
  removeSeriesSubscriber,
  saveSeriesProgress,
  setLastDeliveredEpisodeMessage,
  upsertSeriesEpisode,
  currentLang,
} from "./database";
import {
  buildCatalogKeyboard,
  buildGenreKeyboard,
  encodeCallbackValue,
  movieKeyboard,
  seriesKeyboard,
  type InlineKeyboardButton,
  type ReplyMarkup,
} from "./keyboards";
import { buildContentsPages } from "./catalog-content";
import { copyContentsPosts } from "./contents-delivery";
import { logger } from "../lib/logger";
import { buildMovieCaption, buildSeriesCaption } from "./series-card";
import {
  buildEpisodeListPages,
  buildEpisodeNavigationRows,
  episodeCallback,
  episodeListCallback,
  getEpisodeNeighbors,
} from "./series-navigation";
import {
  buildNotifyRow,
  formatNewEpisodeMessage,
  notifySubscribers,
} from "./series-notify";
import {
  favoritesEmpty,
  favoritesHeader,
  buildFavoriteRow,
  buildFavoritesKeyboard,
} from "./favorites";
import { getDiscussionUrl, isAdmin } from "./config";
import { buildNewKeyboard, buildTopKeyboard, newHeader, topHeader } from "./discover";
import { t } from "./i18n";
import { botInfo, navCleanup, sendText, synopsisStore, telegramApi } from "./telegram-state";
import {
  getContentsPostReferences,
  getStructurePostReference,
} from "./telegram-structure";
import type { TelegramMessage } from "./telegram-types";

export function normalizeCode(value: string): string {
  return value.trim().replace(/^#/, "").toUpperCase();
}

export function commandParts(text: string): { command: string; args: string } {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  return {
    command: rawCommand.toLowerCase().split("@")[0],
    args: rest.join(" ").trim(),
  };
}

export function formatMovieList(): string {
  const movies = listMovies(currentLang());
  const series = listSeries(currentLang());
  if (movies.length === 0 && series.length === 0) {
    return t("catalog.noMovies");
  }

  return [
    t("catalog.base"),
    "",
    `${t("catalog.movies", { n: movies.length })}`,
    ...movies.map((movie) => `${movie.code} — ${movie.title}`),
    "",
    t("catalog.seriesSection"),
    ...series.map(
      (item) => `${item.code} — ${item.title} (${t("card.episodes", { n: item.episodeCount }).replace("🎬 ", "")})`,
    ),
  ].join("\n");
}

export function genreKeyboard(): ReplyMarkup | undefined {
  return buildGenreKeyboard(listGenres());
}

export function catalogKeyboard(
  movies: ReturnType<typeof listMovies>,
  series: ReturnType<typeof listSeries>,
): ReplyMarkup | undefined {
  return buildCatalogKeyboard(listGenres(), movies, series);
}

/** "Katalog" tugmasi: baza kanaldagi Mundarija postlarini (contents_posts) nusxalab yuboradi. */
export async function sendContents(chatId: number): Promise<void> {
  const movies = listMovies(currentLang());
  const series = listSeries(currentLang());
  if (movies.length === 0 && series.length === 0) {
    await sendText(chatId, t("catalog.empty"));
    return;
  }

  // Har til o'z mundarija postlaridan; ru/en postlari sozlanmagan bo'lsa — inline katalog.
  const refs = getContentsPostReferences(currentLang());
  if (refs.length === 0) {
    await sendCatalog(chatId);
    return;
  }

  const pageCount = buildContentsPages(movies, series, botInfo.username).length;
  const result = await copyContentsPosts({
    refs,
    pageCount,
    exclude: getStructurePostReference(),
    copy: async (ref) => {
      await telegramApi("copyMessage", {
        chat_id: chatId,
        ...protectFor(chatId),
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
      t("catalog.unavailable"),
    );
  }
}

export async function sendCatalog(chatId: number): Promise<void> {
  const movies = listMovies(currentLang());
  const series = listSeries(currentLang());
  const genres = listGenres();
  const lines = [
    t("catalog.title"),
    "",
    t("catalog.movies", { n: movies.length }),
    t("catalog.series", { n: series.length }),
  ];

  if (genres.length > 0 || series.length > 0 || movies.length > 0) {
    lines.push("", t("catalog.pick"));
  } else {
    lines.push("", t("catalog.empty"));
  }

  await sendText(
    chatId,
    lines.join("\n"),
    catalogKeyboard(movies, series),
  );
}

export async function sendMovieResults(
  chatId: number,
  movies: Array<{ code: string; title: string }>,
  heading: string,
): Promise<void> {
  if (movies.length === 0) {
    await sendText(chatId, t("notFound.generic"));
    return;
  }

  await sendText(chatId, heading, movieKeyboard(movies));
}

export async function sendSeriesEpisodes(
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
    await sendText(chatId, t("series.noEpisodes", { title: series.title }));
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
        text: t("series.continue", { s: progress.seasonNumber, e: progress.episodeNumber }),
        callback_data: episodeCallback(progress.id),
      },
    ]);
  }
  for (const seasonNumber of seasons) {
    const count = episodes.filter((e) => e.seasonNumber === seasonNumber).length;
    rows.push([
      {
        text: t("series.seasonButton", { s: seasonNumber, n: count }),
        callback_data: `season:${encodeCallbackValue(series.code)}:${seasonNumber}`,
      },
    ]);
  }
  rows.push([
    { text: t("episode.all"), callback_data: episodeListCallback(episodes[0]!.id) },
  ]);
  rows.push(
    buildNotifyRow(
      encodeCallbackValue(series.code),
      isSeriesSubscribed(chatId, series.code),
    ),
  );
  rows.push(...aboutRows("series", series.id));
  rows.push(
    buildFavoriteRow(
      "series",
      encodeCallbackValue(series.code),
      isFavorite(chatId, "series", series.code),
    ),
  );
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

export async function sendSeriesSeasonEpisodes(
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
      t("series.noEpisodesSeason", { title: series.title, s: seasonNumber }),
    );
    return;
  }

  await sendText(
    chatId,
    [
      `📺 ${series.title}`,
      t("series.code", { code: series.code }),
      t("series.seasonCount", { s: seasonNumber, n: episodes.length }),
      "",
      t("series.pickEpisode"),
    ].join("\n"),
    {
      inline_keyboard: episodes.slice(0, 50).map((episode) => [
        {
          text: `${t("episode.label", { e: episode.episodeNumber })}${episode.title ? ` — ${episode.title}` : ""}`.slice(
            0,
            64,
          ),
          callback_data: `episode:${encodeCallbackValue(series.code)}:${seasonNumber}:${episode.episodeNumber}`,
        },
      ]),
    },
  );
}

export async function sendSeriesResults(
  chatId: number,
  series: ReturnType<typeof listSeries>,
  heading: string,
): Promise<void> {
  if (series.length === 0) {
    return;
  }

  await sendText(chatId, heading, seriesKeyboard(series));
}

export async function deliverChannelPost(
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
        ? [[{ text: t("discuss.button"), url: discussionUrl }]]
        : []),
    ];
    const result = await telegramApi<{ message_id: number }>("copyMessage", {
      chat_id: chatId,
      ...protectFor(chatId),
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

export async function deliverMovie(
  chatId: number,
  movie: ReturnType<typeof findMovie>,
): Promise<void> {
  if (!movie) {
    await sendText(chatId, t("movie.notFound"));
    return;
  }

  const poster = getMoviePoster(movie.code);
  if (poster) {
    const caption = buildMovieCaption({
      title: movie.title,
      code: movie.code,
      description: getMoviePosterCaption(movie.code),
    });
    try {
      await telegramApi("sendPhoto", {
        chat_id: chatId,
        photo: poster,
        caption,
      });
    } catch (err: unknown) {
      logger.warn(
        { err, movieCode: movie.code },
        "Failed to send movie poster; continuing without it",
      );
    }
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

  const favoriteRows = [
    ...aboutRows("movie", movie.id),
    buildFavoriteRow(
      "movie",
      encodeCallbackValue(movie.code),
      isFavorite(chatId, "movie", movie.code),
    ),
  ];
  let delivered = false;
  for (const [index, post] of references.entries()) {
    const messageId = await deliverChannelPost(
      chatId,
      {
        code: movie.code,
        channelChatId: post.channelChatId,
        channelMessageId: post.channelMessageId,
      },
      "Kino",
      index === 0 ? favoriteRows : [],
    );
    if (messageId !== null) {
      delivered = true;
    }
  }
  if (delivered) {
    trackView("movie", movie.id, chatId);
  }
}

/** Ko'rishni hisoblaydi (adminlarning sinovlari reytingni buzmasligi uchun hisobga olinmaydi). */
export function trackView(kind: "movie" | "episode", id: number, chatId: number): void {
  if (isAdmin(chatId)) {
    return;
  }
  try {
    if (kind === "movie") {
      recordMovieView(chatId, id);
    } else {
      recordEpisodeView(chatId, id);
    }
  } catch (err: unknown) {
    logger.warn({ err }, "Failed to record view");
  }
}

export async function sendNewContent(chatId: number): Promise<void> {
  const keyboard = buildNewKeyboard(
    listMovies(currentLang()).slice(0, 5),
    listRecentEpisodes(5),
    encodeCallbackValue,
  );
  if (!keyboard) {
    await sendText(chatId, t("new.empty"));
    return;
  }
  await sendText(chatId, newHeader(), keyboard);
}

export async function sendTopContent(chatId: number): Promise<void> {
  const keyboard = buildTopKeyboard(listTopContent(10, 30), encodeCallbackValue);
  if (!keyboard) {
    await sendText(
      chatId,
      t("top.empty"),
    );
    return;
  }
  await sendText(chatId, topHeader(), keyboard);
}

export async function deliverSeriesEpisode(
  chatId: number,
  seriesCode: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<void> {
  const episode = findSeriesEpisode(seriesCode, seasonNumber, episodeNumber);
  if (!episode) {
    await sendText(chatId, t("episode.notFound"));
    return;
  }

  const previousMessageId = getLastDeliveredEpisodeMessage(chatId, seriesCode);

  const neighbors = getEpisodeNeighbors(
    listSeriesEpisodes(seriesCode),
    episode.id,
  );
  const navigationRows = [
    ...(neighbors ? buildEpisodeNavigationRows(neighbors, episode.id) : []),
    buildFavoriteRow(
      "episode",
      String(episode.id),
      isFavorite(chatId, "episode", String(episode.id)),
    ),
  ];

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
  trackView("episode", episode.id, chatId);

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

export function getStartVideoReference(): {
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

export function getForwardedChannelPost(
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

export async function sendEpisodeList(
  chatId: number,
  seriesCode: string,
): Promise<void> {
  const series = findSeries(seriesCode);
  const episodes = series ? listSeriesEpisodes(seriesCode) : [];
  if (!series || episodes.length === 0) {
    await sendText(chatId, t("series.noEpisodesAtAll"));
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

export async function sendFavorites(chatId: number): Promise<void> {
  const keyboard = buildFavoritesKeyboard(listFavorites(chatId), encodeCallbackValue);
  if (!keyboard) {
    await sendText(chatId, favoritesEmpty());
    return;
  }
  await sendText(chatId, favoritesHeader(), keyboard);
}

export async function notifyNewEpisode(
  adminChatId: number,
  seriesCode: string,
  episode: NonNullable<ReturnType<typeof upsertSeriesEpisode>>,
): Promise<void> {
  const series = findSeries(seriesCode);
  const subscribers = listSeriesSubscribers(seriesCode);
  if (!series || subscribers.length === 0) {
    return;
  }

  const message = formatNewEpisodeMessage({
    seriesTitle: series.title,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.title,
  });
  const keyboard = {
    inline_keyboard: [[{ text: t("episode.watch"), callback_data: episodeCallback(episode.id) }]],
  };

  const result = await notifySubscribers({
    subscribers,
    send: (subscriberChatId) => sendText(subscriberChatId, message, keyboard),
    onUnreachable: (subscriberChatId) =>
      removeSeriesSubscriber(subscriberChatId, seriesCode),
  });

  await sendText(
    adminChatId,
    [
      `🔔 Yangi qism xabari: ${result.sent} ta yuborildi.`,
      result.removed > 0 ? `Botni bloklaganlar obunadan olindi: ${result.removed}` : "",
      result.failed > 0 ? `Yuborilmadi (xato): ${result.failed}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

/** Tasdiqlangan mini post bo'lsa "ℹ️ Haqida" tugmasi. */
export function aboutRows(kind: SynopsisKind, contentId: number): InlineKeyboardButton[][] {
  return synopsisStore.getApproved(kind, contentId)
    ? [[{ text: t("about.button"), callback_data: aboutCallback(kind, contentId) }]]
    : [];
}
