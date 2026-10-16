import { execFileSync } from "node:child_process";

export type VersionInfo = {
  commit: string;
  subject: string | null;
  dirty: boolean | null;
  source: "env" | "git" | "noma'lum";
  startedAt: Date;
};

export function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Bot ishga tushganda bir marta chaqiriladi: qaysi commit bilan ishlayotganini aniqlaydi. */
export function resolveVersion(
  env: NodeJS.ProcessEnv,
  git: (args: string[]) => string | null,
  startedAt: Date = new Date(),
): VersionInfo {
  const fromEnv =
    env.RENDER_GIT_COMMIT ??
    env.RAILWAY_GIT_COMMIT_SHA ??
    env.SOURCE_COMMIT ??
    env.GIT_COMMIT;
  if (fromEnv && fromEnv.trim()) {
    return {
      commit: fromEnv.trim().slice(0, 7),
      subject: null,
      dirty: null,
      source: "env",
      startedAt,
    };
  }

  const commit = git(["rev-parse", "--short", "HEAD"]);
  if (!commit) {
    return { commit: "noma'lum", subject: null, dirty: null, source: "noma'lum", startedAt };
  }
  const status = git(["status", "--porcelain"]);
  return {
    commit,
    subject: git(["log", "-1", "--format=%s"]) || null,
    dirty: status === null ? null : status.length > 0,
    source: "git",
    startedAt,
  };
}

export function formatUptime(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} kun`);
  if (hours) parts.push(`${hours} soat`);
  parts.push(`${minutes} daqiqa`);
  return parts.join(" ");
}

export function formatVersionMessage(
  info: VersionInfo,
  counts: { movies: number; series: number; episodes: number },
  now: Date = new Date(),
  nodeVersion: string = process.version,
): string {
  const lines = [
    "🧩 MEDFLIX — VERSIYA",
    "",
    `• Commit: ${info.commit}${info.subject ? ` (${info.subject})` : ""}`,
  ];
  if (info.dirty === true) {
    lines.push("• ⚠️ Commit qilinmagan o‘zgarishlar bor (kod GitHub'dagidan farq qiladi)");
  } else if (info.dirty === false) {
    lines.push("• Kod holati: toza (commit bilan bir xil)");
  }
  lines.push(
    `• Ishga tushgan: ${info.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC (${formatUptime(now.getTime() - info.startedAt.getTime())} oldin)`,
    `• Node: ${nodeVersion}`,
    `• Baza: ${counts.movies} ta kino, ${counts.series} ta serial (${counts.episodes} ta qism)`,
  );
  return lines.join("\n");
}
