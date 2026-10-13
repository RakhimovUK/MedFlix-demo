import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const dir = mkdtempSync(path.join(tmpdir(), "medflix-bk-"));
process.env.DATABASE_PATH = path.join(dir, "live.sqlite");
const db = await import("../src/bot/database.ts");

test("zaxira nusxasi ochiladi va ma'lumotlarni saqlaydi", () => {
  db.upsertSeries({ code: "B1", title: "Zaxira serial" });
  const target = path.join(dir, "backup.sqlite");
  db.createDatabaseBackup(target);

  const copy = new DatabaseSync(target);
  const row = copy.prepare("SELECT title FROM series WHERE code = ?").get("B1") as
    | { title: string }
    | undefined;
  copy.close();
  assert.equal(row?.title, "Zaxira serial");
});
