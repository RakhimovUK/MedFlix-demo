// Testlar uchun: src ichidagi kengaytmasiz importlarni ("./i18n") .ts faylga yo'naltiradi.
// Ishlab chiqarishda esbuild buni o'zi qiladi.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      import path from "node:path";
      export async function resolve(spec, ctx, next) {
        if ((spec.startsWith("./") || spec.startsWith("../")) && !path.extname(spec) && ctx.parentURL?.startsWith("file:")) {
          const base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
          for (const candidate of [base + ".ts", path.join(base, "index.ts")]) {
            if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
          }
        }
        return next(spec, ctx);
      }
    `),
);
