import { isAdmin } from "./config";
import { findMovie, findSeries, listUserSubscriptions } from "./database";
import { checkRequestText, describeGuardReason } from "./request-guard";
import { groupHits, looksLikeCode, normalizeText, smartSearch } from "./smart-search";
import { encodeCallbackValue } from "./keyboards";
import type { CommandContext, TelegramUser } from "./telegram-types";
import {
  aliasLearner,
  notifyAdminsOfError,
  requestFlow,
  searchStore,
  sendText,
} from "./telegram-state";
import {
  deliverMovie,
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
      `Sizning Telegram ID raqamingiz: ${userId}`,
      `Admin holati: ${isAdmin(userId) ? "tasdiqlangan" : "tasdiqlanmagan"}`,
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
      "Qidirish uchun kino kodini yoki nomini yuboring. Masalan: /search Interstellar",
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
    "Kino topilmadi. Kod yoki nomni tekshirib qayta yuboring.",
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
  if (!requester || !checkRequestText(query).ok) {
    await sendText(chatId, notFoundText);
    return;
  }
  await submitUserRequest(chatId, requester, query.trim(), normalizeText(query), true);
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
      `«${query}» bo‘yicha topilgan materiallar:`,
      `«${query}» bo‘yicha seriallar:`,
    );
  }
  if (genre.length > 0) {
    await sendGroup(
      genre,
      `🎭 «${query}» janridagi kinolar:`,
      `🎭 «${query}» janridagi seriallar:`,
    );
  }
  if (fuzzy.length > 0) {
    await sendGroup(fuzzy, "Shuni nazarda tutdingizmi?", "Shuni nazarda tutdingizmi?");
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
      `${auto ? "Bu kino hali topilmadi. " : ""}Bu so‘rovingiz adminlarga allaqachon yuborilgan. Javobni kuting — natija shu botga keladi.`,
    );
    return;
  }
  if (result.status === "limited") {
    await sendText(
      chatId,
      `${auto ? "Afsuski, bu kino topilmadi. " : ""}Bugungi so‘rovlar limitiga yetdingiz. Ertaga qayta urinib ko‘ring.`,
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
    auto
      ? "Afsuski, bu kino topilmadi, lekin so‘rovingiz adminlarga yuborildi. Admin javobi shu botga keladi."
      : `✅ So‘rovingiz adminlarga yuborildi: «${text}». Javob shu botga keladi.`,
  );
}

export async function handleRequestCommand(ctx: CommandContext): Promise<void> {
  const { chatId, userId, message, args } = ctx;
  if (!args) {
    await sendText(
      chatId,
      ["Format: /request Kino nomi", "Masalan: /request Oltin qo‘llar"].join("\n"),
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
      "Hozircha hech qaysi serialga obuna bo‘lmagansiz.\nSerial kartasidagi «🔔 Yangi qismlar haqida xabar ber» tugmasini bosing.",
    );
    return;
  }

  await sendText(ctx.chatId, "🔔 Xabar oladigan seriallaringiz:", {
    inline_keyboard: subscriptions.slice(0, 50).map((item) => [
      {
        text: `📺 ${item.title} (${item.code})`.slice(0, 64),
        callback_data: `series:${encodeCallbackValue(item.code)}`,
      },
    ]),
  });
}
