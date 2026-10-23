import { logger } from "../lib/logger";
import {
  createDatabaseBackup,
  findMovie,
  findSeries,
  getBotStats,
  getSetting,
  listBroadcastRecipients,
  listMovies,
  listSeries,
  markBotUserBlocked,
  setMoviePoster,
  setSeriesPoster,
  setSetting,
} from "./database";
import { getAdminIds, isAdmin } from "./config";
import { runBroadcast } from "./broadcast";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { type TelegramResponse } from "./telegram-api";
import {
  formatStatsMessage,
  parseBackupHour,
  shouldRunBackup,
  todayKey,
} from "./admin-tools";
import { normalizeDescription } from "./series-card";
import { formatVersionMessage } from "./version-info";
import type {
  CommandContext,
  TelegramCallbackQuery,
  TelegramMessage,
} from "./telegram-types";
import {
  answerCallbackQuery,
  apiUrl,
  pendingBroadcasts,
  sendText,
  telegramApi,
  versionInfo,
} from "./telegram-state";

export let broadcastRunning = false;

export async function handleBroadcastCommand(
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

export async function handleBroadcastCallback(
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

export async function runBroadcastJob(
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

export async function sendDatabaseBackup(
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
export function startAutoBackup(): void {
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

export async function savePosterFromAdmin(
  chatId: number,
  code: string,
  fileId: string,
  description?: string | null,
): Promise<void> {
  const series = findSeries(code);
  const movie = series ? null : findMovie(code);
  if (!series && !movie) {
    await sendText(chatId, `${code} kod bo'yicha kino yoki serial topilmadi.`);
    return;
  }

  const desc = normalizeDescription(description);
  const label = series ? "📺 Serial" : "🎬 Kino";
  const title = (series ?? movie)!.title;
  const resolvedCode = (series ?? movie)!.code;
  if (series) {
    setSeriesPoster(resolvedCode, fileId, desc);
  } else {
    setMoviePoster(resolvedCode, fileId, desc);
  }
  await sendText(
    chatId,
    [
      "✅ Poster muvaffaqiyatli saqlandi!",
      `${label}: ${title}`,
      `🔢 Kod: ${resolvedCode}`,
      desc
        ? `📝 Tavsif saqlandi (${desc.length} belgi)`
        : "📝 Tavsif: matn yo'q (kanal postini forward qilsangiz matn ham olinadi)",
    ].join("\n"),
  );
}

export async function handleVersionCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleBackupCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
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

export async function handleStatsCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, text, command, args } = ctx;
  await sendText(chatId, formatStatsMessage(getBotStats()));
  return;
}
