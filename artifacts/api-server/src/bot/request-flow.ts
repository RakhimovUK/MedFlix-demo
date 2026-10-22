import type { ReplyMarkup } from "./keyboards";
import type { MovieRequest, RequestsStore } from "./requests-store";

export type Api = <T = unknown>(
  method: string,
  body: Record<string, unknown>,
) => Promise<T>;

export type RequestTarget = { chatId: string; threadId?: number };

export type RequestDeps = {
  api: Api;
  store: Pick<
    RequestsStore,
    | "createRequest"
    | "getRequest"
    | "getRequestByGroupMessage"
    | "setRequestMessage"
    | "resolveRequest"
    | "saveRequestNote"
    | "countRecentRequests"
  >;
  /** Yopiq guruh topigi. null bo'lsa so'rovlar adminlarga shaxsiy xabar bilan boradi. */
  target: RequestTarget | null;
  adminIds: () => string[];
  isAdmin: (userId: number) => boolean;
  log?: (message: string, err?: unknown) => void;
  dailyLimit?: number;
  now?: () => number;
};

export type SubmitResult =
  | { status: "created"; id: number; delivered: boolean }
  | { status: "duplicate"; id: number }
  | { status: "limited" };

export type RequestAction = "ok" | "no" | "cm";

const COMMENT_TTL_MS = 10 * 60 * 1000;
const MAX_NOTE = 1000;

export function buildRequestKeyboard(id: number): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Qo‘shildi", callback_data: `rq:ok:${id}` },
        { text: "❌ Rad etish", callback_data: `rq:no:${id}` },
      ],
      [{ text: "💬 Izoh", callback_data: `rq:cm:${id}` }],
    ],
  };
}

export function parseRequestCallback(
  data: string,
): { action: RequestAction; id: number } | null {
  const match = /^rq:(ok|no|cm):(\d{1,12})$/u.exec(data);
  if (!match) return null;
  return { action: match[1] as RequestAction, id: Number(match[2]) };
}

function formatLocalTime(createdAt: string): string {
  const parsed = Date.parse(`${createdAt.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed)) return createdAt;
  return new Date(parsed + 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

export function buildRequestText(
  request: MovieRequest,
  resolvedByName?: string,
): string {
  const lines = [
    `📥 Yangi so‘rov #${request.id}`,
    `🔎 «${request.query}»`,
    `👤 ${request.userName || "Noma’lum"} · ID ${request.userId}`,
    `🕒 ${formatLocalTime(request.createdAt)}`,
  ];
  if (request.status === "approved") {
    lines.push("", `✅ Qo‘shildi${resolvedByName ? ` — ${resolvedByName}` : ""}`);
  } else if (request.status === "rejected") {
    lines.push("", `❌ Rad etildi${resolvedByName ? ` — ${resolvedByName}` : ""}`);
  }
  if (request.adminNote) {
    lines.push("", `💬 Izoh: ${request.adminNote}`);
  }
  return lines.join("\n");
}

export function createRequestFlow(deps: RequestDeps) {
  const { api, store, target } = deps;
  const now = deps.now ?? Date.now;
  const limit = deps.dailyLimit ?? 3;
  const pendingComments = new Map<
    number,
    { requestId: number; chatId: string; threadId: number | null; expiresAt: number }
  >();

  const log = (message: string, err?: unknown) => deps.log?.(message, err);

  async function trySend(
    chatId: string | number,
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<number | null> {
    try {
      const result = await api<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text,
        ...extra,
      });
      return result.message_id;
    } catch (err: unknown) {
      log(`sendMessage failed (chat ${chatId})`, err);
      return null;
    }
  }

  async function tryEdit(
    chatId: string | number,
    messageId: number,
    text: string,
    keepKeyboard: MovieRequest | null,
  ): Promise<void> {
    try {
      await api("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: keepKeyboard
          ? buildRequestKeyboard(keepKeyboard.id)
          : { inline_keyboard: [] },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("message is not modified")) {
        log(`editMessageText failed (chat ${chatId})`, err);
      }
    }
  }

  async function answer(id: string, text: string, alert = false): Promise<void> {
    try {
      await api("answerCallbackQuery", {
        callback_query_id: id,
        text,
        ...(alert ? { show_alert: true } : {}),
      });
    } catch (err: unknown) {
      log("answerCallbackQuery failed", err);
    }
  }

  /** Foydalanuvchining so'rovini saqlaydi va admin guruh topiciga yuboradi. */
  async function submit(input: {
    userId: number;
    userName: string;
    query: string;
    queryNorm: string;
  }): Promise<SubmitResult> {
    if (store.countRecentRequests(input.userId, 24) >= limit) {
      return { status: "limited" };
    }
    const { request, duplicate } = store.createRequest(input);
    if (duplicate) {
      return { status: "duplicate", id: request.id };
    }

    const text = buildRequestText(request);
    const reply_markup = buildRequestKeyboard(request.id);
    if (target) {
      const messageId = await trySend(target.chatId, text, {
        reply_markup,
        ...(target.threadId ? { message_thread_id: target.threadId } : {}),
      });
      if (messageId !== null) {
        store.setRequestMessage(request.id, target.chatId, messageId, target.threadId ?? null);
        return { status: "created", id: request.id, delivered: true };
      }
    }

    // Guruh sozlanmagan yoki yuborib bo'lmadi: har bir adminga shaxsiy chatda yuboramiz.
    let delivered = false;
    for (const adminId of deps.adminIds()) {
      const sent = await trySend(adminId, text, { reply_markup });
      if (sent !== null) delivered = true;
    }
    return { status: "created", id: request.id, delivered };
  }

  async function handleCallback(query: {
    id: string;
    fromId: number;
    fromName: string;
    data: string;
    chatId: number | string;
    messageId: number;
    threadId?: number | null;
  }): Promise<boolean> {
    const parsed = parseRequestCallback(query.data);
    if (!parsed) return false;

    if (!deps.isAdmin(query.fromId)) {
      await answer(query.id, "Bu tugmalar faqat adminlar uchun.", true);
      return true;
    }

    const request = store.getRequest(parsed.id);
    if (!request) {
      await answer(query.id, "So‘rov topilmadi.", true);
      return true;
    }

    if (parsed.action === "cm") {
      if (request.status !== "pending") {
        await answer(query.id, "Bu so‘rov allaqachon ko‘rib chiqilgan.", true);
        return true;
      }
      pendingComments.set(query.fromId, {
        requestId: request.id,
        chatId: String(query.chatId),
        threadId: query.threadId ?? request.threadId ?? null,
        expiresAt: now() + COMMENT_TTL_MS,
      });
      await answer(query.id, "Izohni yozing (10 daqiqa ichida).");
      const threadId = query.threadId ?? request.threadId ?? null;
      await trySend(
        query.chatId,
        `✍️ #${request.id} uchun izohingizni shu xabarga reply qilib yozing. Foydalanuvchiga “admindan xabar” sifatida yuboriladi.\nBekor qilish: /cancel`,
        {
          reply_to_message_id: query.messageId,
          ...(threadId ? { message_thread_id: threadId } : {}),
        },
      );
      return true;
    }

    const status = parsed.action === "ok" ? "approved" : "rejected";
    if (!store.resolveRequest(request.id, status, query.fromId)) {
      await answer(query.id, "Bu so‘rov allaqachon ko‘rib chiqilgan.", true);
      return true;
    }
    pendingComments.delete(query.fromId);

    const userText =
      status === "approved"
        ? `✅ So‘ragan kinongiz qo‘shildi: «${request.query}»\nNomi yoki kodi bilan botdan qidirib ko‘ring.`
        : `❌ Afsuski, «${request.query}» so‘rovi hozircha rad etildi.`;
    const sent = await trySend(request.userId, userText);

    const updated = store.getRequest(request.id) ?? request;
    await tryEdit(query.chatId, query.messageId, buildRequestText(updated, query.fromName), null);
    await answer(
      query.id,
      sent !== null
        ? status === "approved"
          ? "✅ Qo‘shildi deb belgilandi, foydalanuvchiga xabar yuborildi."
          : "❌ Rad etildi, foydalanuvchiga xabar yuborildi."
        : "Holat saqlandi, lekin foydalanuvchiga xabar yetmadi (botni bloklagan bo‘lishi mumkin).",
      sent === null,
    );
    return true;
  }

  async function deliverComment(
    admin: { id: number; chatId: string; messageId: number; threadId: number | null },
    request: MovieRequest,
    note: string,
  ): Promise<void> {
    const cleanNote = note.trim().slice(0, MAX_NOTE);
    const sent = await trySend(
      request.userId,
      `📩 Admindan xabar (so‘rov: «${request.query}»):\n\n${cleanNote}`,
    );
    store.saveRequestNote(request.id, cleanNote);
    pendingComments.delete(admin.id);

    await trySend(
      admin.chatId,
      sent !== null
        ? `✅ Izoh #${request.id} foydalanuvchiga yuborildi.`
        : `⚠️ Izoh saqlandi, lekin #${request.id} foydalanuvchisiga yetmadi (botni bloklagan bo‘lishi mumkin).`,
      {
        reply_to_message_id: admin.messageId,
        ...(admin.threadId ? { message_thread_id: admin.threadId } : {}),
      },
    );

    const updated = store.getRequest(request.id);
    if (updated?.groupChatId && updated.groupMessageId) {
      await tryEdit(
        updated.groupChatId,
        updated.groupMessageId,
        buildRequestText(updated),
        updated.status === "pending" ? updated : null,
      );
    }
  }

  /**
   * Admin yozgan xabar izoh bo'lsa (kutilayotgan izoh yoki so'rov xabariga reply),
   * uni foydalanuvchiga yuboradi. Ishlatilgan bo'lsa true.
   */
  async function handleMessage(message: {
    chatId: number | string;
    fromId: number;
    text: string;
    messageId: number;
    replyToMessageId?: number;
    threadId?: number | null;
  }): Promise<boolean> {
    if (!deps.isAdmin(message.fromId)) return false;
    const chatId = String(message.chatId);
    const pending = pendingComments.get(message.fromId);
    const text = message.text.trim();

    if (pending && pending.expiresAt < now()) {
      pendingComments.delete(message.fromId);
    }
    const active = pendingComments.get(message.fromId);

    if (active && active.chatId === chatId && /^\/cancel(?:@\w+)?$/iu.test(text)) {
      pendingComments.delete(message.fromId);
      await trySend(chatId, "Izoh bekor qilindi.", {
        reply_to_message_id: message.messageId,
        ...(message.threadId ? { message_thread_id: message.threadId } : {}),
      });
      return true;
    }

    if (!text || text.startsWith("/")) return false;

    const admin = {
      id: message.fromId,
      chatId,
      messageId: message.messageId,
      threadId: message.threadId ?? null,
    };

    if (active && active.chatId === chatId) {
      const request = store.getRequest(active.requestId);
      if (request) {
        await deliverComment(admin, request, text);
        return true;
      }
    }

    if (message.replyToMessageId && target && chatId === target.chatId) {
      const request = store.getRequestByGroupMessage(chatId, message.replyToMessageId);
      if (request) {
        await deliverComment(admin, request, text);
        return true;
      }
    }
    return false;
  }

  return {
    submit,
    handleCallback,
    handleMessage,
    isTargetChat: (chatId: number | string) =>
      target !== null && String(chatId) === target.chatId,
    hasPendingComment: (adminId: number) => {
      const pending = pendingComments.get(adminId);
      return !!pending && pending.expiresAt >= now();
    },
  };
}

export type RequestFlow = ReturnType<typeof createRequestFlow>;
