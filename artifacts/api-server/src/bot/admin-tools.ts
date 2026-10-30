/* /editparts, avto-zaxira va /stats uchun sof (toza) yordamchi funksiyalar. */

export type EditPartItem = { episode: number; title: string };
export type EditPartsParsed =
  | { ok: true; code: string; season: number; items: EditPartItem[]; lineErrors: string[] }
  | { ok: false; error: string };

export const EDITPARTS_MAX_ITEMS = 100;

export function parseEditParts(raw: string): EditPartsParsed {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { ok: false, error: "Sarlavha va kamida bitta qism qatori kerak." };
  }

  const header = lines[0]!.split("|").map((part) => part.trim());
  const code = (header[0] ?? "").replace(/^#/, "").toUpperCase();
  const season = header.length >= 2 ? Number(header[1]) : 1;
  if (!code || header.length > 2 || !Number.isInteger(season) || season <= 0) {
    return { ok: false, error: "Sarlavha noto‘g‘ri. Format: /editparts KOD | FASL" };
  }

  const items: EditPartItem[] = [];
  const lineErrors: string[] = [];
  const seen = new Set<number>();

  for (const line of lines.slice(1)) {
    const separator = line.indexOf("|");
    const episode = Number(separator === -1 ? NaN : line.slice(0, separator).trim());
    const title = separator === -1 ? "" : line.slice(separator + 1).trim();

    if (!Number.isInteger(episode) || episode <= 0 || !title) {
      lineErrors.push(`“${line.slice(0, 40)}” — format: QISM | Yangi nom`);
    } else if (title.length > 100) {
      lineErrors.push(`${episode}-qism: nom 100 belgidan oshmasligi kerak`);
    } else if (seen.has(episode)) {
      lineErrors.push(`${episode}-qism ikki marta yozilgan`);
    } else {
      seen.add(episode);
      items.push({ episode, title });
    }
  }

  if (items.length > EDITPARTS_MAX_ITEMS) {
    return { ok: false, error: `Bir martada ko‘pi bilan ${EDITPARTS_MAX_ITEMS} ta qism.` };
  }
  return { ok: true, code, season, items, lineErrors };
}

export function formatEditPartsResult(input: {
  code: string;
  season: number;
  updated: number[];
  missing: number[];
  lineErrors: string[];
}): string {
  const lines = [`✅ ${input.code} serial, ${input.season}-fasl: ${input.updated.length} ta qism yangilandi`];
  if (input.updated.length > 0) lines.push(`Qismlar: ${input.updated.join(", ")}`);
  if (input.missing.length > 0) lines.push(`⚠️ Topilmadi: ${input.missing.join(", ")}`);
  if (input.lineErrors.length > 0) {
    lines.push("❌ O‘qib bo‘lmadi:", ...input.lineErrors.map((e) => `• ${e}`));
  }
  return lines.join("\n");
}

export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function parseBackupHour(raw: string | undefined): number {
  const value = Number(raw);
  return raw !== undefined && Number.isInteger(value) && value >= 0 && value <= 23 ? value : 21;
}

export function shouldRunBackup(now: Date, lastRunDate: string | null, hourUtc: number): boolean {
  return now.getUTCHours() >= hourUtc && lastRunDate !== todayKey(now);
}

export type BotStats = {
  users: number;
  activeDay: number;
  activeWeek: number;
  newDay: number;
  movies: number;
  moviePosts: number;
  series: number;
  episodes: number;
  moviesByLang?: Record<string, number>;
  seriesByLang?: Record<string, number>;
  usersByLang?: Record<string, number>;
};

/** Avto-zaxira holati (settings: last_auto_backup_ok_at / last_auto_backup_error). */
export type BackupStatus = {
  enabled: boolean;
  lastOkAt: string | null;
  lastError: string | null;
};

/** "uz 10 · ru 3 · en 0" ("-" = til tanlamagan). */
export function formatLangCounts(counts: Record<string, number> | undefined): string {
  const c = counts ?? {};
  const parts = ["uz", "ru", "en"].map((lang) => `${lang} ${c[lang] ?? 0}`);
  if (c["-"]) parts.push(`tanlamagan ${c["-"]}`);
  return parts.join(" · ");
}

export function formatBackupStatus(status: BackupStatus): string {
  if (!status.enabled) return "🗄 Avto-zaxira: o‘chirilgan (AUTO_BACKUP=off)";
  const ok = status.lastOkAt ? `oxirgi muvaffaqiyatli: ${status.lastOkAt.slice(0, 16).replace("T", " ")} UTC` : "hali yuborilmagan";
  return status.lastError ? `🗄 Avto-zaxira: ${ok}\n⚠️ Oxirgi xato: ${status.lastError}` : `🗄 Avto-zaxira: ${ok}`;
}

export function formatStatsMessage(
  stats: BotStats,
  extra: { backup?: BackupStatus; databasePath?: string } = {},
): string {
  const lines = [
    "📊 MEDFLIX — STATISTIKA",
    "",
    `👥 Foydalanuvchilar: ${stats.users}`,
    `• 24 soatda faol: ${stats.activeDay}`,
    `• 7 kunda faol: ${stats.activeWeek}`,
    `• 24 soatda yangi: ${stats.newDay}`,
    `• Til: ${formatLangCounts(stats.usersByLang)}`,
    "",
    `🎬 Kinolar: ${stats.movies} ta (${stats.moviePosts} ta post)`,
    `• ${formatLangCounts(stats.moviesByLang)}`,
    `📺 Seriallar: ${stats.series} ta (${stats.episodes} ta qism)`,
    `• ${formatLangCounts(stats.seriesByLang)}`,
  ];
  if (extra.backup || extra.databasePath) {
    lines.push("");
    if (extra.databasePath) lines.push(`💾 Baza fayli: ${extra.databasePath}`);
    if (extra.backup) lines.push(formatBackupStatus(extra.backup));
  }
  lines.push("", "ℹ️ Foydalanuvchilar hisobi shu funksiya qo‘shilgandan boshlab yuritiladi.");
  return lines.join("\n");
}
