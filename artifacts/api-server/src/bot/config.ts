export type RequiredSubscription = {
  chatId: string;
  label: string;
  url?: string;
};

type Env = Record<string, string | undefined>;

// Eski standart kanal. TELEGRAM_POSTS_CHANNEL_ID env o'rnatilsa, shu ishlatiladi.
const LEGACY_POSTS_CHANNEL_ID = "-1004418309907";

export function getCsvEnv(name: string, env: Env = process.env): string[] {
  return (env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAdminIds(env: Env = process.env): string[] {
  return getCsvEnv("TELEGRAM_ADMIN_IDS", env);
}

export function isAdmin(userId: number, env: Env = process.env): boolean {
  return getAdminIds(env).includes(String(userId));
}

export function getRequiredSubscriptions(
  env: Env = process.env,
): RequiredSubscription[] {
  const channelIds = getCsvEnv("TELEGRAM_REQUIRED_CHANNEL_IDS", env);
  const channelUrls = getCsvEnv("TELEGRAM_REQUIRED_CHANNEL_URLS", env);
  const chatIds = getCsvEnv("TELEGRAM_REQUIRED_CHAT_IDS", env);
  const chatUrls = getCsvEnv("TELEGRAM_REQUIRED_CHAT_URLS", env);

  return [
    ...channelIds.map((chatId, index) => ({
      chatId,
      label: "Asosiy kanalga obuna bo‘lish",
      url: channelUrls[index],
    })),
    ...chatIds.map((chatId, index) => ({
      chatId,
      label: "Muhokama chatiga qo‘shilish",
      url: chatUrls[index],
    })),
  ];
}

export function getDiscussionUrl(env: Env = process.env): string | undefined {
  const value = env.TELEGRAM_DISCUSSION_URL?.trim();
  return value || undefined;
}

export function getPostsChannelId(env: Env = process.env): string {
  const value = env.TELEGRAM_POSTS_CHANNEL_ID?.trim();
  return value || LEGACY_POSTS_CHANNEL_ID;
}

/** Yopiq guruh topigi havolasi: https://t.me/c/<guruh>/<topic>[/<xabar>] -> chat ID va topic (thread) ID. */
export function parseTopicLink(
  link: string,
): { chatId: number; threadId: number } | null {
  const match = /^https?:\/\/t\.me\/c\/(\d{5,15})\/(\d{1,10})(?:\/\d{1,10})?\/?$/.exec(link.trim());
  if (!match) {
    return null;
  }
  const chatId = Number(`-100${match[1]}`);
  const threadId = Number(match[2]);
  return Number.isSafeInteger(chatId) && threadId > 0 ? { chatId, threadId } : null;
}

export function getRequestsTopic(
  env: Env = process.env,
): { chatId: number; threadId: number } | null {
  const link = env.TELEGRAM_REQUESTS_TOPIC_LINK?.trim();
  return link ? parseTopicLink(link) : null;
}
