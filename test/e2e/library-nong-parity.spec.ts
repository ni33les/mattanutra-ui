import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

type LibraryArticleSource = Readonly<{
  slug: string;
  sourceHtmlFile?: string;
  sourcePackage: string;
}>;

type LandmarkName =
  | "heroArt"
  | "heroNong"
  | "nongCard"
  | "avatar"
  | "quizImg"
  | "ctaNong"
  | "bubble"
  | "noteA"
  | "noteB"
  | "mug"
  | "priceBadge"
  | "sleepNote";

type LandmarkMeasure = Readonly<{
  afterContent: string;
  display: string;
  height: number;
  relativeBottom: number;
  relativeLeft: number;
  relativeRight: number;
  relativeTop: number;
  objectFit: string;
  objectPosition: string;
  src: string | null;
  visible: boolean;
  width: number;
  zIndex: string;
}>;

const visualKnowledge = JSON.parse(
  readFileSync(
    new URL("../../content/library/visual-knowledge.json", import.meta.url),
    "utf8"
  )
) as { articles: LibraryArticleSource[] };

const highRiskSlugs = [
  "blood-panel-personalise-supplements-cost",
  "is-creatine-just-for-bodybuilders",
  "joint-supplements-glucosamine-collagen-curcumin",
  "sleep-support-without-sleeping-pills",
  "expensive-health-check-leave-out"
];
const desktopViewport = { height: 900, width: 1280 };
const mobileViewport = { height: 844, width: 390 };
const landmarkSelectors: Record<LandmarkName, string> = {
  avatar: ".nong-card .av",
  bubble: ".hero-art .bubble",
  ctaNong: ".cta .nong",
  heroArt: ".hero-art",
  // Hand-off spicy article uses class="matta" instead of "nong".
  heroNong: ".hero-art .nong, .hero-art .nong-sleep, .hero-art .matta",
  mug: ".hero-art .mug",
  nongCard: ".nong-card",
  noteA: ".hero-art .note.a, .hero-art .n1",
  noteB: ".hero-art .note.b, .hero-art .n2",
  priceBadge: ".hero-art .price-badge",
  quizImg: ".quiz .qhd img, .mid .qhd img, .qhd img",
  sleepNote: ".hero-art .sleep-note"
};
const saveParityArtifacts = process.env.LIBRARY_NONG_PARITY_ARTIFACTS === "1";
const calloutLandmarks = new Set<LandmarkName>([
  "bubble",
  "mug",
  "noteA",
  "noteB",
  "priceBadge",
  "sleepNote"
]);

function targetUrl(path: string, baseURL?: string) {
  return new URL(path, baseURL).toString();
}

function orderedArticles() {
  const bySlug = new Map(visualKnowledge.articles.map((article) => [article.slug, article]));
  const highRisk = highRiskSlugs.map((slug) => {
    const article = bySlug.get(slug);

    if (!article) {
      throw new Error(`Missing high-risk Library article: ${slug}`);
    }

    return article;
  });
  const remaining = visualKnowledge.articles.filter(
    (article) => !highRiskSlugs.includes(article.slug)
  );

  return [...highRisk, ...remaining];
}

function listFilesRecursive(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(path));
      continue;
    }
    files.push(path);
  }

  return files;
}

function ensureSymlink(linkPath: string, targetPath: string) {
  mkdirSync(dirname(linkPath), { recursive: true });

  if (existsSync(linkPath) || existsSync(linkPath.replace(/\/$/, ""))) {
    try {
      if (lstatSync(linkPath).isSymbolicLink()) {
        return;
      }
    } catch {
      // fall through and recreate
    }
  }

  try {
    rmSync(linkPath, { recursive: true, force: true });
  } catch {
    // ignore
  }

  symlinkSync(targetPath, linkPath);
}

/**
 * Hand-off HTML references mattanutra_library_assets/* relative to each
 * library/{en,th} page, but the package stores media under top-level assets/.
 */
function wireHandoffLibraryAssets(destination: string) {
  for (const path of listFilesRecursive(destination)) {
    const asPosix = path.replaceAll("\\", "/");
    if (!asPosix.endsWith("/library-manifest.json") && !asPosix.endsWith("library-manifest.json")) {
      continue;
    }

    const handoffRoot = dirname(path);
    const assetsDir = join(handoffRoot, "assets");
    const libraryRoot = join(handoffRoot, "library");
    if (!existsSync(assetsDir) || !existsSync(libraryRoot)) {
      continue;
    }

    for (const locale of ["en", "th"]) {
      const localeDir = join(libraryRoot, locale);
      if (!existsSync(localeDir)) {
        continue;
      }

      ensureSymlink(
        join(localeDir, "mattanutra_library_assets"),
        relative(localeDir, assetsDir) || "."
      );
    }

    ensureSymlink(join(handoffRoot, "mattanutra_library_assets"), "assets");
  }
}

function extractZipTree(zipPath: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", destination]);

  // WS1 ships as files/ttf.zip with a nested localization hand-off zip.
  for (const path of listFilesRecursive(destination)) {
    if (!path.endsWith(".zip")) {
      continue;
    }
    if (!/Localization|Library|Hand-off|Handoff/i.test(path)) {
      continue;
    }
    execFileSync("unzip", ["-q", "-o", path, "-d", destination]);
  }

  wireHandoffLibraryAssets(destination);
}

function resolveSourceHtmlPath(extractRoot: string, sourceHtmlFile: string): string {
  const normalized = sourceHtmlFile.replaceAll("\\", "/");
  const direct = join(extractRoot, normalized);
  if (existsSync(direct)) {
    return direct;
  }

  const suffix = `/${normalized}`.replaceAll("//", "/");
  const match = listFilesRecursive(extractRoot).find((path) => {
    const asPosix = path.replaceAll("\\", "/");
    return asPosix.endsWith(suffix) || asPosix.endsWith(normalized);
  });

  return match ?? direct;
}

function normalizeImageName(src: string | null) {
  if (!src) {
    return "";
  }

  return basename(src.split(/[?#]/)[0]).replaceAll("_", "-").toLowerCase();
}

function tolerance(expected: number, extra = 0) {
  return Math.max(8, expected * 0.03, extra);
}

function dimensionProblem(
  label: string,
  actual: number,
  expected: number,
  extraTolerance = 0
) {
  const allowed = tolerance(expected, extraTolerance);

  return Math.abs(actual - expected) > allowed
    ? `${label}: expected ${expected.toFixed(1)}, got ${actual.toFixed(1)}`
    : null;
}

function compareLandmark(
  landmark: LandmarkName,
  zip: LandmarkMeasure | null,
  app: LandmarkMeasure | null
) {
  const problems: string[] = [];

  if (!zip || !app) {
    return zip === app ? problems : [`${landmark}: missing landmark`];
  }

  if (zip.visible !== app.visible) {
    problems.push(
      `${landmark}: visibility expected ${zip.visible ? "visible" : "hidden"}, got ${
        app.visible ? "visible" : "hidden"
      }`
    );
  }

  if (!zip.visible || !app.visible) {
    return problems;
  }

  if (landmark === "nongCard") {
    return problems;
  }

  if (calloutLandmarks.has(landmark)) {
    if (zip.zIndex !== app.zIndex) {
      problems.push(`${landmark}: z-index expected ${zip.zIndex}, got ${app.zIndex}`);
    }

    if (landmark === "bubble" && zip.afterContent !== app.afterContent) {
      problems.push(
        `${landmark}: tail expected ${zip.afterContent}, got ${app.afterContent}`
      );
    }

    const edgeChecks: Partial<Record<LandmarkName, Array<keyof LandmarkMeasure>>> = {
      bubble: ["relativeTop", "relativeRight"],
      mug: ["relativeRight", "relativeBottom"],
      noteA: ["relativeLeft", "relativeTop"],
      noteB: ["relativeLeft", "relativeTop"],
      priceBadge: ["relativeLeft", "relativeBottom"],
      sleepNote: ["relativeLeft", "relativeBottom"]
    };

    for (const edge of edgeChecks[landmark] ?? []) {
      const edgeProblem = dimensionProblem(
        `${landmark} ${edge}`,
        Number(app[edge]),
        Number(zip[edge]),
        10
      );

      if (edgeProblem) {
        problems.push(edgeProblem);
      }
    }

    return problems;
  }

  if (landmark !== "heroArt") {
    const zipImageName = normalizeImageName(zip.src);
    const appImageName = normalizeImageName(app.src);

    if (zipImageName && appImageName && zipImageName !== appImageName) {
      problems.push(`${landmark}: expected ${zipImageName}, got ${appImageName}`);
    }
  }

  const widthSlack = landmark === "heroArt" ? 24 : 0;
  const heightSlack = landmark === "heroArt" ? 24 : 0;
  const widthProblem = dimensionProblem(
    `${landmark} width`,
    app.width,
    zip.width,
    widthSlack
  );
  const heightProblem = dimensionProblem(
    `${landmark} height`,
    app.height,
    zip.height,
    heightSlack
  );

  if (widthProblem) {
    problems.push(widthProblem);
  }

  if (heightProblem) {
    problems.push(heightProblem);
  }

  return problems;
}

async function waitForPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page
    .evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.race([
        Promise.all(
          images.map((img) => {
            if (img.complete) {
              return undefined;
            }

            return new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            });
          })
        ),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 8_000);
        })
      ]);
    })
    .catch(() => undefined);
}

async function measureLandmarks(page: Page) {
  return page.evaluate((selectors) => {
    const measured: Partial<Record<LandmarkName, LandmarkMeasure | null>> = {};
    const hero = document.querySelector(".hero-art") as HTMLElement | null;
    const heroRect = hero?.getBoundingClientRect() ?? null;

    for (const [name, selector] of Object.entries(selectors) as Array<
      [LandmarkName, string]
    >) {
      const element = document.querySelector(selector) as HTMLElement | null;

      if (!element) {
        measured[name] = null;
        continue;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const afterStyle = window.getComputedStyle(element, "::after");
      const image = element instanceof HTMLImageElement ? element : null;

      measured[name] = {
        afterContent: afterStyle.content,
        display: style.display,
        height: rect.height,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        relativeBottom: heroRect ? heroRect.bottom - rect.bottom : 0,
        relativeLeft: heroRect ? rect.left - heroRect.left : 0,
        relativeRight: heroRect ? heroRect.right - rect.right : 0,
        relativeTop: heroRect ? rect.top - heroRect.top : 0,
        src: image?.getAttribute("src") ?? null,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden",
        width: rect.width,
        zIndex: style.zIndex
      };
    }

    return measured as Record<LandmarkName, LandmarkMeasure | null>;
  }, landmarkSelectors);
}

async function safeLocatorScreenshot(locator: Locator, path: string) {
  if ((await locator.count()) === 0) {
    return;
  }

  await locator.first().screenshot({ path }).catch(() => undefined);
}

async function saveMismatchArtifacts(
  zipPage: Page,
  appPage: Page,
  slug: string,
  viewportName: string,
  landmark: LandmarkName
) {
  const artifactDir = join("test-results", "library-nong-parity");
  const base = `${slug}-${viewportName}-${landmark}`;

  mkdirSync(artifactDir, { recursive: true });
  await zipPage
    .locator(".hero")
    .first()
    .screenshot({ path: join(artifactDir, `${base}-zip-hero.png`) })
    .catch(() => undefined);
  await appPage
    .locator(".mn-library-visual .hero")
    .first()
    .screenshot({ path: join(artifactDir, `${base}-app-hero.png`) })
    .catch(() => undefined);
  await safeLocatorScreenshot(
    zipPage.locator(landmarkSelectors[landmark]),
    join(artifactDir, `${base}-zip-landmark.png`)
  );
  await safeLocatorScreenshot(
    appPage.locator(`.mn-library-visual ${landmarkSelectors[landmark]}`),
    join(artifactDir, `${base}-app-landmark.png`)
  );
}

test.describe("Library Nong Matta image parity", () => {
  test("matches the zip examples across desktop and mobile", async ({
    baseURL,
    browser
  }) => {
    test.setTimeout(900_000);

    const extractDir = mkdtempSync(join(tmpdir(), "library-nong-parity-"));
    const mismatches: string[] = [];

    try {
      for (const article of orderedArticles()) {
        // sourcePackage may be a path root ("files/ttf.zip") or a files/library basename.
        const zipPath = article.sourcePackage.includes("/")
          ? article.sourcePackage
          : join("files", "library", article.sourcePackage);

        expect(existsSync(zipPath), `${article.slug} source zip (${zipPath})`).toBe(true);
        expect(article.sourceHtmlFile, `${article.slug} source HTML`).toBeTruthy();

        const articleExtractDir = join(extractDir, article.slug);
        extractZipTree(zipPath, articleExtractDir);

        const sourceHtmlPath = resolveSourceHtmlPath(
          articleExtractDir,
          article.sourceHtmlFile ?? ""
        );

        expect(existsSync(sourceHtmlPath), `${article.slug} extracted HTML`).toBe(true);

        for (const [viewportName, viewport] of [
          ["desktop", desktopViewport],
          ["mobile", mobileViewport]
        ] as const) {
          const zipPage = await browser.newPage({ viewport });
          const appPage = await browser.newPage({ viewport });

          try {
            await zipPage.goto(pathToFileURL(sourceHtmlPath).toString());
            await waitForPage(zipPage);
            await appPage.goto(targetUrl(`/en/library/${article.slug}`, baseURL));
            await waitForPage(appPage);

            const zipMeasures = await measureLandmarks(zipPage);
            const appMeasures = await measureLandmarks(appPage);

            for (const landmark of Object.keys(landmarkSelectors) as LandmarkName[]) {
              const problems = compareLandmark(
                landmark,
                zipMeasures[landmark],
                appMeasures[landmark]
              );

              if (problems.length > 0) {
                if (saveParityArtifacts) {
                  await saveMismatchArtifacts(
                    zipPage,
                    appPage,
                    article.slug,
                    viewportName,
                    landmark
                  );
                }
                mismatches.push(
                  `${article.slug} ${viewportName} ${problems.join("; ")}`
                );
              }
            }
          } finally {
            await zipPage.close();
            await appPage.close();
          }
        }
      }
    } finally {
      rmSync(extractDir, { force: true, recursive: true });
    }

    expect(mismatches).toEqual([]);
  });
});
