import assert from "node:assert/strict";
import {
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, it } from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const reactUiRoots = ["app", "components"].map((segment) =>
  path.join(repoRoot, segment)
);
const generatedOrScraperImageExceptions = [
  "scripts/manufacturer-scrape-html.ts",
  "scripts/scrape-levitaminsasia-products.ts"
] as const;
const qrUnoptimizedAllowlist = new Set([
  "components/chat-channel-cards.tsx",
  "components/living-protocol-line-cta.tsx",
  "components/admin/communications-view.tsx",
  "components/reveal-final-results.tsx"
]);

function collectFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") {
        continue;
      }

      files.push(...collectFiles(fullPath));
    } else if (/\.(tsx|ts)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

function relativePath(filePath: string) {
  return path.relative(repoRoot, filePath);
}

function jsxTagName(name: ts.JsxTagNameExpression) {
  return ts.isIdentifier(name) ? name.text : "";
}

function jsxAttributeNames(
  node: ts.JsxOpeningLikeElement
): ReadonlySet<string> {
  const names = new Set<string>();

  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
      names.add(property.name.text);
    }
  }

  return names;
}

function imageNodes(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const nodes: Array<{
    attrs: ReadonlySet<string>;
    line: number;
    tagName: string;
    text: string;
  }> = [];

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = jsxTagName(node.tagName);

      if (tagName === "Image" || tagName === "SafeImage") {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );

        nodes.push({
          attrs: jsxAttributeNames(node),
          line: position.line + 1,
          tagName,
          text: node.getText(sourceFile)
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return nodes;
}

describe("image hardening", () => {
  const uiFiles = reactUiRoots.flatMap(collectFiles);

  it("keeps React UI free of raw img elements", () => {
    const offenders = uiFiles
      .filter((filePath) => /<img\b/.test(readFileSync(filePath, "utf8")))
      .map(relativePath);

    assert.deepEqual(offenders, []);
    assert.deepEqual(
      generatedOrScraperImageExceptions,
      [
        "scripts/manufacturer-scrape-html.ts",
        "scripts/scrape-levitaminsasia-products.ts"
      ],
      "scraper/generated HTML image parsing is intentionally outside the React UI rule"
    );
  });

  it("requires alt text and stable sizing for rendered Image components", () => {
    const failures: string[] = [];

    for (const filePath of uiFiles) {
      if (relativePath(filePath) === "components/safe-image.tsx") {
        continue;
      }

      for (const node of imageNodes(filePath)) {
        const location = `${relativePath(filePath)}:${node.line}`;

        if (!node.attrs.has("alt")) {
          failures.push(`${location} ${node.tagName} is missing alt`);
        }

        if (node.attrs.has("fill")) {
          if (!node.attrs.has("sizes")) {
            failures.push(`${location} ${node.tagName} fill is missing sizes`);
          }
        } else if (!node.attrs.has("width") || !node.attrs.has("height")) {
          failures.push(
            `${location} ${node.tagName} needs width/height or fill`
          );
        }
      }
    }

    assert.deepEqual(failures, []);
  });

  it("enables Next image optimization with declared remote hosts", () => {
    const config = readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");

    assert.doesNotMatch(config, /images:\s*\{[\s\S]*?unoptimized:\s*true/);
    assert.match(config, /remotePatterns:\s*imageRemotePatterns/);

    for (const host of [
      "dev.mattanutra.com",
      "uat.mattanutra.com",
      "mattanutra.com",
      "www.mattanutra.com",
      "images.contentstack.io",
      "images.unsplash.com",
      "swisse.co.th",
      "www.blackmores.co.th",
      "www.dhc.co.jp",
      "www.megawecare.co.th",
      "www.vistra.co.th"
    ]) {
      assert.match(config, new RegExp(`hostname:\\s*"${host.replace(/\./g, "\\.")}"`));
    }
  });

  it("keeps per-image unoptimized usage limited to QR and local public assets", () => {
    const offenders: string[] = [];

    for (const filePath of uiFiles) {
      const rel = relativePath(filePath);

      if (rel === "components/safe-image.tsx") {
        continue;
      }

      for (const node of imageNodes(filePath)) {
        if (!node.attrs.has("unoptimized")) {
          continue;
        }

        const isQrSurface = qrUnoptimizedAllowlist.has(rel);
        const isLocalPublicAsset =
          /src=(?:"|')\//.test(node.text) ||
          /\.startsWith\("\/"\)/.test(node.text) ||
          (rel === "components/landing-page.tsx" &&
            /src=\{(?:assets\.[^}]+|card\.image|testimonial\.image|src)\}/.test(
              node.text
            ));

        if (!isQrSurface && !isLocalPublicAsset) {
          offenders.push(`${rel}:${node.line}`);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });
});
