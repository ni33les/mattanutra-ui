/**
 * Serve the approved Questionnaire v14 HTML as an immutable frontend.
 * Only mechanical injects: MN_CONFIG endpoints + logo path.
 * Do not rewrite copy, keys, branching, or Thai strings.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "@/lib/i18n";

export const V14_HTML_FILENAME = "V14_Questionnaire_v3_EN_TH_Final_v1.html";
export const V14_HTML_RELATIVE_PATH = join(
  "content",
  "questionnaire",
  "v14",
  V14_HTML_FILENAME
);

/** Production logo path already on the site (mechanical inject only). */
export const V14_LOGO_SRC = "/v15/logo.png";

const PLACEHOLDER_LOGO = "[image content will be provided separately]";

let cachedRawHtml: string | null = null;
let cachedSha256: string | null = null;

export function v14HtmlAbsolutePath() {
  return join(process.cwd(), V14_HTML_RELATIVE_PATH);
}

export function readV14HtmlSource() {
  if (cachedRawHtml !== null) {
    return cachedRawHtml;
  }

  cachedRawHtml = readFileSync(v14HtmlAbsolutePath(), "utf8");
  return cachedRawHtml;
}

export function v14HtmlSha256() {
  if (cachedSha256) {
    return cachedSha256;
  }

  cachedSha256 = createHash("sha256")
    .update(readV14HtmlSource(), "utf8")
    .digest("hex");
  return cachedSha256;
}

export function expectedV14HtmlSha256FromFile() {
  try {
    const line = readFileSync(
      `${v14HtmlAbsolutePath()}.sha256`,
      "utf8"
    ).trim();
    return line.split(/\s+/)[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Build HTML for a locale with endpoints configured.
 * Mutates only MN_CONFIG values and logo placeholder — never questionnaire body.
 */
export function buildV14HtmlDocument(input: Readonly<{
  locale: Locale;
  origin: string;
  submitPath?: string;
  trackPath?: string;
}>) {
  const origin = input.origin.replace(/\/+$/, "");
  const submitPath = input.submitPath ?? "/api/questionnaire/v14/submit";
  const trackPath = input.trackPath ?? "/api/questionnaire/v14/track";
  const endpoint = `${origin}${submitPath.startsWith("/") ? submitPath : `/${submitPath}`}`;
  const trackEndpoint = `${origin}${trackPath.startsWith("/") ? trackPath : `/${trackPath}`}`;

  let html = readV14HtmlSource();

  // Mechanical logo inject only if the package still has the placeholder string.
  // The approved zip may already embed a data: URL — leave that untouched.
  if (html.includes(PLACEHOLDER_LOGO)) {
    html = html.replaceAll(PLACEHOLDER_LOGO, V14_LOGO_SRC);
  }

  // Configure IT integration points only (object property assignment is intentional).
  const configLiteral =
    "const MN_CONFIG = { endpoint: '', trackEndpoint: '', version: 'v6-conversational' };";
  if (!html.includes(configLiteral)) {
    throw new Error("v14 HTML MN_CONFIG literal not found — refusing to serve unknown asset");
  }

  const escapedEndpoint = endpoint.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedTrack = trackEndpoint.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  html = html.replace(
    configLiteral,
    `const MN_CONFIG = { endpoint: '${escapedEndpoint}', trackEndpoint: '${escapedTrack}', version: 'v6-conversational' };`
  );

  // Prefer URL locale on first paint (HTML still owns EN/TH switch + localStorage).
  if (input.locale === "th") {
    html = html.replace(
      /try\{mnApplyQuizLanguage\(localStorage\.getItem\('mattanutra-language'\)\|\|'en'\)\}catch\(_\)\{mnApplyQuizLanguage\('en'\)\}/,
      "try{mnApplyQuizLanguage(localStorage.getItem('mattanutra-language')||'th')}catch(_){mnApplyQuizLanguage('th')}"
    );
  }

  return html;
}

export function v14HtmlResponse(input: Readonly<{
  locale: Locale;
  origin: string;
}>) {
  const html = buildV14HtmlDocument(input);

  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-MattaNutra-Questionnaire": "v14-html"
    }
  });
}

export function isV14HtmlLocale(locale: string): locale is "en" | "th" {
  return locale === "en" || locale === "th";
}
