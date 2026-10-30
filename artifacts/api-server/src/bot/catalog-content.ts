import { currentLang, t, type Lang } from "./i18n";

export type TelegramPostReference = {
  chatId: string;
  messageId: number;
};

type MovieEntry = {
  code: string;
  title: string;
};

type SeriesEntry = MovieEntry & {
  episodeCount: number;
};

const PAGE_VISIBLE_CHAR_LIMIT = 3700;
const PAGE_LINK_LIMIT = 90;

export function parseTelegramPostLink(
  value: string,
): TelegramPostReference | null {
  try {
    const url = new URL(value.trim());
    if (url.hostname !== "t.me" && url.hostname !== "telegram.me") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const messageId = Number(parts.at(-1));
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return null;
    }

    if (parts[0] === "c" && parts.length >= 3) {
      const internalChatId = parts[1];
      if (!/^\d+$/.test(internalChatId)) {
        return null;
      }
      return {
        chatId: `-100${internalChatId}`,
        messageId,
      };
    }

    if (!/^[A-Za-z0-9_]+$/.test(parts[0])) {
      return null;
    }

    return { chatId: `@${parts[0]}`, messageId };
  } catch {
    return null;
  }
}

export function formatTelegramPostLink(
  reference: TelegramPostReference,
): string {
  if (reference.chatId.startsWith("@")) {
    return `https://t.me/${reference.chatId.slice(1)}/${reference.messageId}`;
  }

  if (reference.chatId.startsWith("-100")) {
    return `https://t.me/c/${reference.chatId.slice(4)}/${reference.messageId}`;
  }

  return `${reference.chatId}/${reference.messageId}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Deep-link payload: uz — faqat kod ("101"), ru/en — til bilan ("ru_101"), shunda kod o'sha tilda ochiladi. */
export function buildStartPayload(code: string, lang: Lang = currentLang()): string {
  return lang === "uz" ? code : `${lang}_${code}`;
}

/** /start payload'ini o'qiydi: "ru_101" -> { lang: "ru", code: "101" }; tilsiz -> lang null. */
export function parseStartPayload(payload: string): { lang: Lang | null; code: string } {
  const match = /^(uz|ru|en)_(.+)$/i.exec(payload.trim());
  if (!match) {
    return { lang: null, code: payload.trim() };
  }
  return { lang: match[1].toLowerCase() as Lang, code: match[2] };
}

function buildBotLink(botUsername: string, code: string): string | null {
  const payload = buildStartPayload(code);
  if (!botUsername || !/^[A-Za-z0-9_-]{1,64}$/.test(payload)) {
    return null;
  }
  return `https://t.me/${botUsername}?start=${payload}`;
}

export function buildContentsPages(
  sourceMovies: readonly MovieEntry[],
  sourceSeries: readonly SeriesEntry[],
  botUsername: string,
): string[] {
  const byCode = (a: MovieEntry, b: MovieEntry) =>
    a.code.localeCompare(b.code, undefined, { numeric: true });
  const movies = [...sourceMovies].sort(byCode);
  const series = [...sourceSeries].sort(byCode);

  type Entry = { section: string; code: string; title: string; suffix: string };
  const entries: Entry[] = [
    ...movies.map((movie) => ({
      section: t("contents.movies"),
      code: movie.code,
      title: movie.title,
      suffix: "",
    })),
    ...series.map((item) => ({
      section: t("contents.series"),
      code: item.code,
      title: item.title,
      suffix: ` (${t("contents.episodes", { n: item.episodeCount })})`,
    })),
  ];

  const pages: string[][] = [];
  let body: string[] = [];
  let visible = 0;
  let links = 0;
  let section = "";
  let lastSection = "";

  const closePage = () => {
    if (body.length > 0) {
      pages.push(body);
    }
    body = [];
    visible = 0;
    links = 0;
    section = "";
  };

  for (const entry of entries) {
    const plain = `${entry.code} — ${entry.title}${entry.suffix}`;
    const headingCost = entry.section !== section ? entry.section.length + 20 : 0;
    if (
      visible + headingCost + plain.length + 1 > PAGE_VISIBLE_CHAR_LIMIT ||
      links >= PAGE_LINK_LIMIT
    ) {
      closePage();
    }

    if (entry.section !== section) {
      if (body.length > 0) {
        body.push("");
        visible += 1;
      }
      const heading =
        entry.section === lastSection && body.length === 0
          ? t("contents.continued", { section: entry.section })
          : entry.section;
      body.push(heading);
      visible += heading.length + 1;
      section = entry.section;
      lastSection = entry.section;
    }

    const link = buildBotLink(botUsername, entry.code);
    if (link) {
      links += 1;
    }
    const titleHtml = link
      ? `<a href="${link}">${escapeHtml(entry.title)}</a>`
      : escapeHtml(entry.title);
    body.push(
      `${escapeHtml(entry.code)} — ${titleHtml}${escapeHtml(entry.suffix)}`,
    );
    visible += plain.length + 1;
  }
  closePage();

  if (pages.length === 0) {
    pages.push([t("contents.empty")]);
  }

  return pages.map((lines, index) => {
    const counter = pages.length > 1 ? ` (${index + 1}/${pages.length})` : "";
    return [
      `${t("contents.header")}${counter}`,
      "",
      ...lines,
      "",
      t("contents.footer"),
    ].join("\n");
  });
}