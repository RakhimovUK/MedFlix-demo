import { parseEpisodeId } from "./series-navigation";
import {
  findMovie,
  findSeriesEpisodeById,
  listMoviesByGenre,
  toggleFavorite,
  toggleSeriesSubscription,
  currentLang,
} from "./database";
import { shouldCleanup } from "./nav-cleanup";
import { buildFavoriteRow, parseFavoriteData, replaceFavoriteRow } from "./favorites";
import { decodeCallbackValue, encodeCallbackValue } from "./keyboards";
import { logger } from "../lib/logger";
import { buildNotifyRow, parseNotifyData, replaceNotifyRow } from "./series-notify";
import { isAdmin } from "./config";
import { adminHelpText, parseAdminAction } from "./admin-panel";
import type {
  CommandContext,
  TelegramCallbackQuery,
  TelegramMessage,
} from "./telegram-types";
import {
  aliasLearner,
  answerCallbackQuery,
  navCleanup,
  requestFlow,
  sendText,
  telegramApi,
} from "./telegram-state";
import {
  deliverMovie,
  deliverSeriesEpisode,
  sendContents,
  sendEpisodeList,
  sendFavorites,
  sendMovieResults,
  sendNewContent,
  sendSeriesEpisodes,
  sendSeriesSeasonEpisodes,
  sendTopContent,
} from "./telegram-delivery";
import {
  handleBackupCommand,
  handleBroadcastCallback,
  handleStatsCommand,
  handleVersionCommand,
} from "./telegram-admin-ops";
import { handleAddLanguageCallback, handleListCommand } from "./telegram-admin-commands";
import {
  displayName,
  handleSetLanguageCallback,
  sendLanguagePicker,
} from "./telegram-user-commands";
import { t } from "./i18n";
import {
  getStartKeyboard,
  getSubscriptionKeyboard,
  isSubscribed,
  requireSubscription,
  subscriptionCache,
} from "./telegram-subscription";

export async function handleEpisodeNavigationCallback(
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
    await answerCallbackQuery(callbackQuery.id, t("episode.gone"));
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

export async function handleCallbackQuery(
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

export async function handleFavoriteToggleCallback(
  callbackQuery: TelegramCallbackQuery,
  message: TelegramMessage,
  chatId: number,
): Promise<void> {
  const parsed = parseFavoriteData(callbackQuery.data ?? "");
  const ref = parsed
    ? parsed.kind === "episode"
      ? parsed.encoded
      : decodeCallbackValue(parsed.encoded)
    : null;
  const state = parsed && ref ? toggleFavorite(chatId, parsed.kind, ref) : null;
  if (!parsed || !ref || state === null) {
    await answerCallbackQuery(callbackQuery.id, "Topilmadi.");
    return;
  }

  await answerCallbackQuery(
    callbackQuery.id,
    state ? t("fav.added") : t("fav.removed"),
  );

  const rows = message.reply_markup?.inline_keyboard;
  if (rows) {
    try {
      await telegramApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: {
          inline_keyboard: replaceFavoriteRow(
            rows,
            buildFavoriteRow(parsed.kind, parsed.encoded, state),
          ),
        },
      });
    } catch (err: unknown) {
      logger.warn({ err }, "Failed to refresh favorite button");
    }
  }
}

export async function handleNotifyToggleCallback(
  callbackQuery: TelegramCallbackQuery,
  message: TelegramMessage,
  chatId: number,
): Promise<void> {
  const encoded = parseNotifyData(callbackQuery.data ?? "");
  const code = encoded ? decodeCallbackValue(encoded) : null;
  const subscribed = code ? toggleSeriesSubscription(chatId, code) : null;
  if (!code || subscribed === null) {
    await answerCallbackQuery(callbackQuery.id, t("series.notFoundShort"));
    return;
  }

  await answerCallbackQuery(
    callbackQuery.id,
    subscribed ? t("notify.on") : t("notify.off"),
  );

  const rows = message.reply_markup?.inline_keyboard;
  if (rows) {
    try {
      await telegramApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: {
          inline_keyboard: replaceNotifyRow(
            rows,
            buildNotifyRow(encodeCallbackValue(code), subscribed),
          ),
        },
      });
    } catch (err: unknown) {
      logger.warn({ err }, "Failed to refresh notify button");
    }
  }
}

export async function handleAdminPanelCallback(
  callbackQuery: TelegramCallbackQuery,
  message: TelegramMessage,
): Promise<void> {
  const userId = callbackQuery.from.id;
  if (!isAdmin(userId)) {
    await answerCallbackQuery(callbackQuery.id, "Bu bo‘lim faqat admin uchun.");
    return;
  }

  const action = parseAdminAction(callbackQuery.data ?? "");
  if (!action) {
    await answerCallbackQuery(callbackQuery.id, "Noma’lum tugma.");
    return;
  }

  await answerCallbackQuery(callbackQuery.id);
  const ctx: CommandContext = {
    chatId: message.chat.id,
    userId,
    message,
    text: "",
    command: "",
    args: "",
  };

  if (action === "stats") return handleStatsCommand({ ...ctx, command: "/stats" });
  if (action === "list") return handleListCommand({ ...ctx, command: "/list" });
  if (action === "version") return handleVersionCommand({ ...ctx, command: "/version" });
  if (action === "backup") return handleBackupCommand({ ...ctx, command: "/backup" });

  const help = adminHelpText(action);
  if (help) {
    await sendText(ctx.chatId, help);
  }
}

export async function handleCallbackQueryInner(
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

  if (data.startsWith("rq:")) {
    await requestFlow.handleCallback({
      id: callbackQuery.id,
      fromId: userId,
      fromName: displayName(callbackQuery.from),
      data,
      chatId,
      messageId: message.message_id,
      threadId: message.message_thread_id ?? null,
    });
    return;
  }

  if (data.startsWith("addlang:")) {
    await handleAddLanguageCallback(callbackQuery, chatId, message.message_id);
    return;
  }

  if (data.startsWith("bc:")) {
    await handleBroadcastCallback(callbackQuery, message);
    return;
  }

  if (data.startsWith("adm:")) {
    await handleAdminPanelCallback(callbackQuery, message);
    return;
  }

  if (data === "subscription:check") {
    subscriptionCache.delete(userId);
    if (await isSubscribed(userId)) {
      await answerCallbackQuery(callbackQuery.id, t("sub.confirmed"));
      await sendText(
        chatId,
        t("sub.thanks"),
        getStartKeyboard(),
      );
    } else {
      await answerCallbackQuery(
        callbackQuery.id,
        t("sub.notYet"),
      );
      await sendText(
        chatId,
        t("sub.pleaseAll"),
        getSubscriptionKeyboard(),
      );
    }
    return;
  }

  if (data === "lang:menu") {
    await answerCallbackQuery(callbackQuery.id);
    await sendLanguagePicker(chatId, callbackQuery.from.language_code);
    return;
  }

  if (data.startsWith("setlang:")) {
    await handleSetLanguageCallback(callbackQuery, chatId, message.message_id);
    return;
  }

  if (!(await requireSubscription(chatId, userId))) {
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (data === "fav:list") {
    await answerCallbackQuery(callbackQuery.id);
    await sendFavorites(chatId);
    return;
  }

  if (data.startsWith("fav:")) {
    await handleFavoriteToggleCallback(callbackQuery, message, chatId);
    return;
  }

  if (data === "discover:new" || data === "discover:top") {
    await answerCallbackQuery(callbackQuery.id);
    await (data === "discover:new" ? sendNewContent(chatId) : sendTopContent(chatId));
    return;
  }

  if (data.startsWith("ntf:")) {
    await handleNotifyToggleCallback(callbackQuery, message, chatId);
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
      t("search.help"),
    );
    return;
  }

  if (data.startsWith("genre:")) {
    const genreName = decodeCallbackValue(data.slice("genre:".length));
    if (!genreName) {
      await sendText(chatId, t("error.badButton"));
      return;
    }

    const movies = listMoviesByGenre(genreName, currentLang());
    await sendMovieResults(
      chatId,
      movies,
      t("genre.header", { g: genreName }),
    );
    return;
  }

  if (data.startsWith("movie:")) {
    const code = decodeCallbackValue(data.slice("movie:".length));
    if (!code) {
      await sendText(chatId, t("error.badButton"));
      return;
    }
    aliasLearner.onSelect(chatId, "movie", code);
    await deliverMovie(chatId, findMovie(code));
    return;
  }

  if (data.startsWith("series:")) {
    const code = decodeCallbackValue(data.slice("series:".length));
    if (!code) {
      await sendText(chatId, t("error.badButton"));
      return;
    }
    aliasLearner.onSelect(chatId, "series", code);
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
      await sendText(chatId, t("error.badButton"));
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
      await sendText(chatId, t("error.badButton"));
      return;
    }
    await deliverSeriesEpisode(chatId, code, seasonNumber, episodeNumber);
  }
}
