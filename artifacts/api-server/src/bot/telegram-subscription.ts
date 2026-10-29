import { t } from "./i18n";
import {
  buildStartKeyboard,
  buildSubscriptionKeyboard,
  type ReplyMarkup,
} from "./keyboards";
import { getDiscussionUrl, getRequiredSubscriptions, isAdmin } from "./config";
import { logger } from "../lib/logger";
import { sendText, telegramApi } from "./telegram-state";

export const subscriptionCache = new Map<number, { subscribed: boolean; expiresAt: number }>();

export function getSubscriptionKeyboard(): ReplyMarkup {
  return buildSubscriptionKeyboard(getRequiredSubscriptions());
}

export async function isSubscribed(userId: number): Promise<boolean> {
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

export async function requireSubscription(
  chatId: number,
  userId: number,
): Promise<boolean> {
  if (await isSubscribed(userId)) {
    return true;
  }

  await sendText(
    chatId,
    t("sub.required"),
    getSubscriptionKeyboard(),
  );
  return false;
}

export function getStartKeyboard(): ReplyMarkup {
  return buildStartKeyboard(getDiscussionUrl());
}
