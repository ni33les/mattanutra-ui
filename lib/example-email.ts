import type { FormulationBlueprint, LocalizedText } from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";
import { buildAssessmentResultsUrl, buildUnsubscribeUrl } from "@/lib/site-url";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localize(value: LocalizedText, locale: Locale) {
  if (typeof value === "string") {
    return value;
  }

  return value[locale] || value.en || value.th || "";
}

function effectivenessRank(
  item: FormulationBlueprint["supplementBreakdown"][number],
  index: number
) {
  return Number.isFinite(item.effectivenessRank) && item.effectivenessRank > 0
    ? item.effectivenessRank
    : index + 1;
}

export function buildExampleEmailHtml({
  formulation,
  healthScore,
  locale,
  planId,
  unsubscribeToken
}: Readonly<{
  formulation: FormulationBlueprint;
  healthScore: HealthScoreResult;
  locale: Locale;
  planId: string;
  unsubscribeToken?: string | null;
}>) {
  const previewItems = formulation.supplementBreakdown
    .map((item, index) => ({
      item,
      rank: effectivenessRank(item, index)
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)
    .slice(0, 3);
  const labels =
    locale === "th"
      ? {
          cta: "ดูแผนฉบับเต็ม",
          intro:
            "นี่คือตัวอย่างสั้นจากสูตรโภชนาการส่วนบุคคลของคุณ สูตรฉบับเต็มถูกจัดเตรียมแล้วเมื่อคุณเลือกแผน",
          plan: "แผน",
          preview: "ตัวอย่างสูตร",
          score: "HealthScore ของคุณ",
          subject: "ตัวอย่างแผน MattaNutra ของคุณ",
          unsubscribe: "ยกเลิกอีเมลการประเมินซ้ำ"
        }
      : {
          cta: "View the full plan",
          intro:
            "Here is a short example from your personalised nutritional formulation. The full formulation is prepared when you choose a plan.",
          plan: "Plan",
          preview: "Formula preview",
          score: "Your HealthScore",
          subject: "Your MattaNutra plan preview",
          unsubscribe: "Unsubscribe from reassessment emails"
        };
  const planUrl = buildAssessmentResultsUrl(locale, planId);
  const unsubscribeUrl = unsubscribeToken
    ? buildUnsubscribeUrl(unsubscribeToken)
    : "";

  const itemHtml = previewItems
    .map((item) => {
      const name = escapeHtml(localize(item.supplement, locale));
      const dose = escapeHtml(localize(item.dailyDose, locale));
      const rationale = escapeHtml(localize(item.rationale, locale));

      return `
        <li style="margin:0 0 14px;padding:14px 16px;border:1px solid #d8e7df;border-radius:10px;background:#ffffff;">
          <strong style="display:block;color:#20343A;font-size:15px;">${name}</strong>
          <span style="display:block;margin-top:4px;color:#1FA77A;font-size:13px;font-weight:700;">${dose}</span>
          <span style="display:block;margin-top:8px;color:#5c6670;font-size:13px;line-height:1.5;">${rationale}</span>
        </li>
      `;
    })
    .join("");

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
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#3A7BD5;font-weight:700;">MattaNutra</div>
        <h1 style="margin:12px 0 10px;font-size:28px;line-height:1.15;color:#20343A;">${escapeHtml(labels.subject)}</h1>
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(labels.intro)}</p>

        <div style="margin:22px 0;padding:18px;border-radius:12px;background:#eef7ff;border:1px solid #d9e8f7;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#3A7BD5;font-weight:700;">${escapeHtml(labels.score)}</div>
          <div style="margin-top:6px;font-size:44px;font-weight:800;line-height:1;color:#20343A;">${healthScore.score}<span style="font-size:18px;color:#6b7280;">/100</span></div>
          <div style="margin-top:8px;color:#1FA77A;font-weight:700;">${escapeHtml(healthScore.band)}</div>
          <p style="margin:10px 0 0;color:#5c6670;line-height:1.5;font-size:13px;">${escapeHtml(healthScore.summary)}</p>
        </div>

        <h2 style="margin:0 0 12px;color:#20343A;font-size:18px;">${escapeHtml(labels.preview)}</h2>
        <ul style="list-style:none;margin:0;padding:0;">${itemHtml}</ul>

        <p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(labels.plan)}: ${escapeHtml(planId)}</p>
        <a href="${escapeHtml(planUrl)}" style="display:inline-block;margin-top:18px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(labels.cta)}</a>
        ${
          unsubscribeUrl
            ? `<p style="margin:24px 0 0;color:#9aa4af;font-size:11px;line-height:1.5;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(labels.unsubscribe)}</a></p>`
            : ""
        }
      </div>
    </div>
  </body>
</html>`;
}

export function buildExampleEmailSubject(locale: Locale) {
  return locale === "th"
    ? "ตัวอย่างแผน MattaNutra ของคุณ"
    : "Your MattaNutra plan preview";
}
