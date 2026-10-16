import type { ReplyMarkup } from "./keyboards";

export const ADMIN_CALLBACK_PREFIX = "adm:";

export type AdminAction =
  | "stats"
  | "list"
  | "version"
  | "backup"
  | "movie"
  | "series"
  | "poster"
  | "rename"
  | "broadcast"
  | "delete";

const ACTIONS: AdminAction[] = [
  "stats", "list", "version", "backup",
  "movie", "series", "poster", "rename", "broadcast", "delete",
];

export function parseAdminAction(data: string): AdminAction | null {
  if (!data.startsWith(ADMIN_CALLBACK_PREFIX)) {
    return null;
  }
  const action = data.slice(ADMIN_CALLBACK_PREFIX.length) as AdminAction;
  return ACTIONS.includes(action) ? action : null;
}

const button = (text: string, action: AdminAction) => ({
  text,
  callback_data: `${ADMIN_CALLBACK_PREFIX}${action}`,
});

export function buildAdminPanelKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [button("📊 Statistika", "stats"), button("📋 Ro‘yxat", "list")],
      [button("🧩 Versiya", "version"), button("💾 Zaxira", "backup")],
      [button("➕ Kino qo‘shish", "movie"), button("📺 Serial qo‘shish", "series")],
      [button("🖼 Poster", "poster"), button("✏️ Qism nomi", "rename")],
      [button("📢 Xabar yuborish", "broadcast"), button("🗑 O‘chirish", "delete")],
    ],
  };
}

const HELP: Partial<Record<AdminAction, string>> = {
  movie: [
    "🎬 Kino qo‘shish",
    "1) Kanal postini botga forward qiling",
    "2) /add KOD | Kino nomi",
    "Qo‘shimcha post: /addpost KOD | 2 | Fayl nomi",
    "Janr: /genre KOD | Janr 1, Janr 2",
  ].join("\n"),
  series: [
    "📺 Serial qo‘shish",
    "1) /addseries KOD | Serial nomi",
    "2) Qism postini botga forward qiling",
    "3) /addpart KOD | FASL | QISM | Nomi",
  ].join("\n"),
  poster: [
    "🖼 Poster",
    "/setposter KOD, so‘ng rasm yuboring",
    "/getposter KOD · /delposter KOD",
  ].join("\n"),
  rename: [
    "✏️ Qism nomini o‘zgartirish",
    "/editpart KOD | FASL | QISM | Yangi nom",
    "Ko‘p qism uchun: /editparts (format ko‘rsatiladi)",
  ].join("\n"),
  broadcast: [
    "📢 Xabar yuborish",
    "/broadcast buyrug‘ini yuboring, bot tasdiq so‘raydi.",
  ].join("\n"),
  delete: [
    "🗑 O‘chirish (xavfsizlik uchun faqat buyruq bilan)",
    "/delete KOD · /deleteseries KOD",
    "/deletepart KOD | FASL | QISM",
  ].join("\n"),
};

export function adminHelpText(action: AdminAction): string | null {
  return HELP[action] ?? null;
}
