import { isAdmin } from "./config";
import { parsePostText } from "./post-parser";
import { findMovie, findSeries, getSetting, setSetting, touchBotUser } from "./database";
import { logger } from "../lib/logger";
import { buildAdminPanelKeyboard } from "./admin-panel";
import type { CommandContext, TelegramMessage, TelegramUpdate } from "./telegram-types";
import {
  botInfo,
  handleRateLimited,
  notifyAdminsOfError,
  pendingForwardedPosts,
  pendingPosterRequests,
  rateLimiter,
  requestFlow,
  sendText,
  telegramApi,
  token,
  updateQueue,
} from "./telegram-state";
import {
  commandParts,
  deliverMovie,
  getForwardedChannelPost,
  getStartVideoReference,
  normalizeCode,
  sendFavorites,
  sendNewContent,
  sendSeriesEpisodes,
  sendTopContent,
} from "./telegram-delivery";
import {
  handleBackupCommand,
  handleBroadcastCommand,
  handleStatsCommand,
  handleVersionCommand,
  savePosterFromAdmin,
  startAutoBackup,
} from "./telegram-admin-ops";
import { getStartKeyboard, requireSubscription } from "./telegram-subscription";
import {
  displayName,
  handleCatalogCommand,
  handleIdCommand,
  handleMysubsCommand,
  handleRequestCommand,
  handleSearchCommand,
  runSmartSearch,
} from "./telegram-user-commands";
import {
  handleAddCommand,
  handleAddpartCommand,
  handleAddpostCommand,
  handleAddseriesCommand,
  handleAliasCommand,
  handleDelaliasCommand,
  handleDeleteCommand,
  handleDeletepartCommand,
  handleDeleteseriesCommand,
  handleEditpartCommand,
  handleEditpartsCommand,
  handleGenreCommand,
  handleListCommand,
  handlePosterCommand,
  handleSetcontentsCommand,
  handleSetposterCommand,
  handleSetstartCommand,
  handleSetstructureCommand,
} from "./telegram-admin-commands";
import { handleCallbackQuery } from "./telegram-callbacks";
import { configureBotCommands } from "./telegram-menu";
import { refreshStructurePost } from "./telegram-structure";

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text ?? message.caption)?.trim() ?? "";

  if (!userId) {
    return;
  }

  // So'rovlar guruhi/topici: admin izohlari. Guruhdagi oddiy suhbat qidiruvga tushmasin.
  if (
    text &&
    (requestFlow.isTargetChat(chatId) || requestFlow.hasPendingComment(userId))
  ) {
    const consumed = await requestFlow.handleMessage({
      chatId,
      fromId: userId,
      text,
      messageId: message.message_id,
      replyToMessageId: message.reply_to_message?.message_id,
      threadId: message.message_thread_id ?? null,
    });
    if (consumed) {
      return;
    }
  }
  if (requestFlow.isTargetChat(chatId) && !text.startsWith("/")) {
    return;
  }

  const forwardedPost = getForwardedChannelPost(message);

  const pendingPoster = pendingPosterRequests.get(String(userId));
  if (pendingPoster && isAdmin(userId) && !text.startsWith("/")) {
    if (pendingPoster.expiresAt < Date.now()) {
      pendingPosterRequests.delete(String(userId));
    } else if (message.photo && message.photo.length > 0) {
      pendingPosterRequests.delete(String(userId));
      await savePosterFromAdmin(
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
    const postText = message.caption ?? message.text ?? "";
    const detected = parsePostText(postText);
    pendingForwardedPosts.set(String(userId), { ...forwardedPost, text: postText });
    await sendText(
      chatId,
      [
        "Kanal posti qabul qilindi.",
        `Kanal ID: ${forwardedPost.channelChatId}`,
        `Post ID: ${forwardedPost.channelMessageId}`,
        detected.title
          ? `Aniqlandi: ${[detected.title, ...(detected.genres.length > 0 ? [detected.genres.join(", ")] : [])].join(", ")}`
          : "Nom aniqlanmadi — /add KOD | Kino nomi deb yozing.",
        "",
        "Endi shu chatga quyidagicha yuboring:",
        "/add KOD  (nom va janr postdan olinadi)",
        "/add KOD | Kino nomi",
        "/addpost KOD | 2 | Kino fayli",
        "/addpart SERIAL_KOD | FASL | QISM | Qism nomi",
        "yoki /setstart — shu postni start videosi qilish",
        "",
        "Masalan: /add 101",
        "Xato aniqlangan bo‘lsa: /genre KOD | Janr 1, Janr 2",
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
    const ctx: CommandContext = { chatId, userId, message, text, command, args };

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

    if (command === "/fav") {
      await sendFavorites(chatId);
      return;
    }

    if (command === "/new") {
      await sendNewContent(chatId);
      return;
    }

    if (command === "/top") {
      await sendTopContent(chatId);
      return;
    }

    if (command === "/mysubs") {
      await handleMysubsCommand(ctx);
      return;
    }

    if (command === "/id") {
      await handleIdCommand(ctx);
      return;
    }

    if (command === "/catalog") {
      await handleCatalogCommand(ctx);
      return;
    }

    if (command === "/request") {
      await handleRequestCommand(ctx);
      return;
    }

    if (command === "/search") {
      await handleSearchCommand(ctx);
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
        command === "/admin" ||
        command === "/setposter" ||
        command === "/delposter" ||
        command === "/getposter" ||
        command === "/genre" ||
        command === "/alias" ||
        command === "/delalias" ||
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

    if (command === "/admin") {
      await sendText(chatId, "🛠 Admin panel\nKerakli bo‘limni tanlang:", buildAdminPanelKeyboard());
      return;
    }

    if (command === "/setstart") {
      await handleSetstartCommand(ctx);
      return;
    }

    if (command === "/setstructure") {
      await handleSetstructureCommand(ctx);
      return;
    }

    if (command === "/setcontents") {
      await handleSetcontentsCommand(ctx);
      return;
    }

    if (command === "/addseries") {
      await handleAddseriesCommand(ctx);
      return;
    }

    if (command === "/addpart") {
      await handleAddpartCommand(ctx);
      return;
    }

    if (command === "/setposter") {
      await handleSetposterCommand(ctx);
      return;
    }

    if (command === "/delposter" || command === "/getposter") {
      await handlePosterCommand(ctx);
      return;
    }

    if (command === "/version") {
      await handleVersionCommand(ctx);
      return;
    }

    if (command === "/backup") {
      await handleBackupCommand(ctx);
      return;
    }

    if (command === "/broadcast") {
      await handleBroadcastCommand(message, userId, args);
      return;
    }

    if (command === "/stats") {
      await handleStatsCommand(ctx);
      return;
    }

    if (command === "/editparts") {
      await handleEditpartsCommand(ctx);
      return;
    }

    if (command === "/editpart") {
      await handleEditpartCommand(ctx);
      return;
    }

    if (command === "/list") {
      await handleListCommand(ctx);
      return;
    }

    if (command === "/genre") {
      await handleGenreCommand(ctx);
      return;
    }

    if (command === "/alias") {
      await handleAliasCommand(ctx);
      return;
    }

    if (command === "/delalias") {
      await handleDelaliasCommand(ctx);
      return;
    }

    if (command === "/delete") {
      await handleDeleteCommand(ctx);
      return;
    }

    if (command === "/deletepart") {
      await handleDeletepartCommand(ctx);
      return;
    }

    if (command === "/deleteseries") {
      await handleDeleteseriesCommand(ctx);
      return;
    }

    if (command === "/add") {
      await handleAddCommand(ctx);
      return;
    }

    if (command === "/addpost") {
      await handleAddpostCommand(ctx);
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

  await runSmartSearch(
    chatId,
    text,
    "Bu kod yoki nom bo‘yicha kino topilmadi. Qayta tekshirib ko‘ring.",
    { id: userId, name: displayName(message.from) },
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
        const senderId =
          update.message?.from?.id ?? update.callback_query?.from.id;
        if (senderId !== undefined && !isAdmin(senderId)) {
          const decision = rateLimiter.check(String(senderId));
          if (decision !== "ok") {
            void handleRateLimited(update, decision);
            continue;
          }
        }
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
      notifyAdminsOfError("Telegram polling", err);
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
  botInfo.username = bot.username ?? "";
  await configureBotCommands();
  await refreshStructurePost();
  logger.info({ username: bot.username }, "Telegram bot connected");
  startAutoBackup();
  void poll();
}
