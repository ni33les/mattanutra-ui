import type { Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { buildReassessmentUrl, buildUnsubscribeUrl } from "@/lib/site-url";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type ReassessmentEmailCopy = Readonly<{
  body: string;
  cta: string;
  eyebrow: string;
  plan: string;
  subject: string;
  title: string;
  unsubscribe: string;
}>;

export function buildReassessmentEmailHtml({
  locale,
  planId,
  unsubscribeToken
}: Readonly<{
  locale: Locale;
  planId: string;
  unsubscribeToken: string;
}>) {
  const labels = reassessmentEmailLabels(locale);
  const reassessmentUrl = buildReassessmentUrl(locale, planId);
  const unsubscribeUrl = buildUnsubscribeUrl(unsubscribeToken);
  const isChinese = locale === "zh-CN";
  const eyebrowStyle = isChinese
    ? "font-size:12px;letter-spacing:0;text-transform:none;color:#1FA77A;font-weight:700;"
    : "font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1FA77A;font-weight:700;";
  const ctaStyle = isChinese
    ? "display:inline-block;margin-top:20px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:13px;font-weight:800;letter-spacing:0;text-transform:none;"
    : "display:inline-block;margin-top:20px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;";

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(labels.subject)}</title>
  </head>
  <body style="margin:0;background:#f3f8ff;font-family:Arial,sans-serif;color:#20343A;">
    <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #d9e8f7;">
        <div style="${eyebrowStyle}">MattaNutra</div>
        <h1 style="margin:12px 0 10px;font-size:28px;line-height:1.15;color:#20343A;">${escapeHtml(labels.title)}</h1>
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(labels.body)}</p>
        <p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(labels.plan)}: ${escapeHtml(planId)}</p>
        <a href="${escapeHtml(reassessmentUrl)}" style="${ctaStyle}">${escapeHtml(labels.cta)}</a>
        <p style="margin:24px 0 0;color:#9aa4af;font-size:11px;line-height:1.5;">
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(labels.unsubscribe)}</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export function buildReassessmentEmailSubject(locale: Locale) {
  return reassessmentEmailLabels(locale).subject;
}

function reassessmentEmailLabels(locale: Locale) {
  return getNamespace<ReassessmentEmailCopy>(locale, "outbound.reassessmentEmail");
}
