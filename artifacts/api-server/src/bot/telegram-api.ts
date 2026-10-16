import type { ReplyMarkup } from "./keyboards";

export type TelegramResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const OUTGOING_METHODS = new Set([
  "sendMessage",
  "sendPhoto",
  "sendVideo",
  "copyMessage",
]);

export function createTelegramApi(options: {
  token: string | undefined;
  /** Foydalanuvchiga xabar ketganda chaqiriladi (chat tarixini tozalash uchun). */
  onOutgoing?: (chatId: number) => void;
  fetchImpl?: FetchLike;
}) {
  const doFetch: FetchLike = (url, init) =>
    (options.fetchImpl ?? fetch)(url, init);

  function apiUrl(method: string): string {
    return `https://api.telegram.org/bot${options.token}/${method}`;
  }

  async function telegramApi<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await doFetch(apiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as TelegramResponse<T>;
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.description ?? `Telegram API error: ${response.status}`,
      );
    }

    if (OUTGOING_METHODS.has(method) && typeof body.chat_id === "number") {
      options.onOutgoing?.(body.chat_id);
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

  async function answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<void> {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  return { apiUrl, telegramApi, sendText, answerCallbackQuery };
}
