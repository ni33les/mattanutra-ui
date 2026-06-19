import type { Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { siteBaseUrl } from "@/lib/site-url";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type AssessmentResumeEmailCopy = Readonly<{
  body: string;
  cta: string;
  subject: string;
  title: string;
}>;

function labels(locale: Locale) {
  return getNamespace<AssessmentResumeEmailCopy>(
    locale,
    "outbound.assessmentResumeEmail"
  );
}

export function buildAssessmentResumeUrl(locale: Locale, token: string) {
  return `${siteBaseUrl()}/${locale}/nutrition/quiz?resume=${encodeURIComponent(token)}`;
}

export function buildAssessmentResumeEmailSubject(locale: Locale) {
  return labels(locale).subject;
}

export function buildAssessmentResumeEmailHtml(input: Readonly<{
  locale: Locale;
  resumeUrl: string;
}>) {
  const copy = labels(input.locale);

  return `<!doctype html>
<html lang="${input.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;background:#f7f4ea;font-family:Arial,sans-serif;color:#20343A;">
    <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
      <div style="background:#fffef8;border-radius:18px;padding:28px;border:1px solid #ded6bd;">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1FA77A;font-weight:700;">MattaNutra</div>
        <h1 style="margin:12px 0 10px;font-size:28px;line-height:1.15;color:#20343A;">${escapeHtml(copy.title)}</h1>
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(copy.body)}</p>
        <a href="${escapeHtml(input.resumeUrl)}" style="display:inline-block;margin-top:22px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 18px;font-size:13px;font-weight:800;">${escapeHtml(copy.cta)}</a>
      </div>
    </div>
  </body>
</html>`;
}
