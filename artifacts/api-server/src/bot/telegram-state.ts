import { createNavCleanup } from "./nav-cleanup";
import { createTelegramApi } from "./telegram-api";
import { createSearchStore } from "./search-store";
import { getDatabase } from "./database";
import { createAliasLearner } from "./alias-learning";
import { getAdminIds, getRequestsTopic, isAdmin } from "./config";
import { createRequestFlow } from "./request-flow";
import { createRequestsStore } from "./requests-store";
import { logger } from "../lib/logger";
import { createKeyedQueue } from "./keyed-queue";
import { resolveVersion, runGit } from "./version-info";
import {
  alertKey,
  createAlertThrottle,
  formatAlert,
  isIgnorableTelegramError,
} from "./alerts";
import { createRateLimiter, type RateDecision } from "./rate-limiter";
import type { TelegramUpdate } from "./telegram-types";

export const token = process.env.TELEGRAM_BOT_TOKEN;

export const pendingForwardedPosts = new Map<
  string,
  { channelChatId: string; channelMessageId: number; text?: string }
>();

export const pendingPosterRequests = new Map<string, { code: string; expiresAt: number }>();

// Chat tarixini qisqa saqlash: tugma bosilganda oldingi xabarlar o'chiriladi.
export const navCleanup = createNavCleanup(async (chatId, messageId) => {
  await telegramApi("deleteMessage", { chat_id: chatId, message_id: messageId });
});

export const { apiUrl, telegramApi, sendText, answerCallbackQuery } = createTelegramApi({
  token,
  onOutgoing: (chatId) => navCleanup.noteSent(chatId),
});

export const searchStore = createSearchStore(getDatabase());

export const aliasLearner = createAliasLearner({
  bump: (aliasNorm, kind, code) => searchStore.bumpAlias(aliasNorm, kind, code),
});

// So'rovlar: TELEGRAM_REQUESTS_TOPIC_LINK bo'lsa admin guruh topigiga, bo'lmasa adminlarga shaxsiy xabar.
export const requestsTopic = getRequestsTopic();

export const requestFlow = createRequestFlow({
  api: (method, body) => telegramApi(method, body),
  store: createRequestsStore(getDatabase()),
  target: requestsTopic
    ? { chatId: String(requestsTopic.chatId), threadId: requestsTopic.threadId }
    : null,
  adminIds: getAdminIds,
  isAdmin,
  log: (message, err) => logger.warn({ err }, message),
});

export const pendingBroadcasts = new Map<
  string,
  { sourceChatId: number; sourceMessageId: number; expiresAt: number }
>();

// Yangilanishlar: bir chat ketma-ket, turli chatlar parallel (ko'pi bilan 10 ta).
export const updateQueue = createKeyedQueue({
  maxConcurrent: 10,
  onError: (err) => {
    logger.error({ err }, "Failed to handle update");
    notifyAdminsOfError("Yangilanishni qayta ishlash", err);
  },
});

export const versionInfo = resolveVersion(process.env, runGit);

export const alertThrottle = createAlertThrottle();

export const rateLimiter = createRateLimiter();

export async function handleRateLimited(
  update: TelegramUpdate,
  decision: Exclude<RateDecision, "ok">,
): Promise<void> {
  try {
    if (update.callback_query) {
      await answerCallbackQuery(
        update.callback_query.id,
        "⏳ Juda tez. Bir necha soniya kuting.",
      );
    } else if (update.message && decision === "warn") {
      await sendText(
        update.message.chat.id,
        "⏳ Juda ko‘p so‘rov yubordingiz. 20 soniyadan keyin qayta urinib ko‘ring.",
      );
    }
  } catch (err: unknown) {
    logger.warn({ err }, "Rate-limit notice failed");
  }
}

export function notifyAdminsOfError(source: string, err: unknown): void {
  try {
    if (isIgnorableTelegramError(err) || !alertThrottle.allow(alertKey(source, err))) {
      return;
    }
    const text = formatAlert(source, err);
    for (const adminId of getAdminIds()) {
      const adminChatId = Number(adminId);
      if (!Number.isSafeInteger(adminChatId)) continue;
      sendText(adminChatId, text).catch((sendErr: unknown) =>
        logger.warn({ sendErr }, "Failed to send admin alert"),
      );
    }
  } catch (alertErr: unknown) {
    logger.warn({ alertErr }, "Admin alert failed");
  }
}

// Bot username (startTelegramBot ishga tushganda to'ldiriladi); modullar orasida bo'lishiladi.
export const botInfo = { username: "" };
