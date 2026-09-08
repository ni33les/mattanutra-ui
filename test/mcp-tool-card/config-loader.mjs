import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL && specifier.startsWith(".") && !extname(specifier)) {
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
  }
  return nextResolve(specifier, context);
}
