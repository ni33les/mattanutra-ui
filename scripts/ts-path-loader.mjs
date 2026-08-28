import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require("typescript");

async function firstExistingPath(basePath) {
  const candidates = extname(basePath)
    ? [basePath]
    : [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        resolvePath(basePath, "index.ts"),
        resolvePath(basePath, "index.tsx"),
        resolvePath(basePath, "index.js"),
        resolvePath(basePath, "index.mjs")
      ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".tsx") && context.parentURL) {
    return {
      format: "module",
      shortCircuit: true,
      url: new URL(specifier, context.parentURL).href
    };
  }

  if (specifier.startsWith("@/")) {
    const filePath = await firstExistingPath(
      resolvePath(root, specifier.slice(2))
    );

    if (filePath) {
      return {
        format: extname(filePath) === ".tsx" ? "module" : undefined,
        shortCircuit: true,
        url: pathToFileURL(filePath).href
      };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || extname(fileURLToPath(url)) !== ".tsx") {
    return nextLoad(url, context);
  }

  const source = await readFile(new URL(url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022
    },
    fileName: fileURLToPath(url)
  });

  return {
    format: "module",
    shortCircuit: true,
    source: result.outputText
  };
}
