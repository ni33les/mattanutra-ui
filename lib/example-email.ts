import type { FormulationBlueprint, LocalizedText } from "@/lib/formulation-types";
import type {
  HealthScoreDomain,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
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

function localize(
  value: LocalizedHealthScoreText | LocalizedText | undefined,
  locale: Locale
) {
  if (!value) {
    return "";
  }

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

function lowestDomain(healthScore: HealthScoreResult) {
  return healthScore.domains
    .slice()
    .sort((first, second) => first.score - second.score)[0];
}

function personalisedIntro({
  healthScore,
  locale,
  lowest
}: Readonly<{
  healthScore: HealthScoreResult;
  locale: Locale;
  lowest?: HealthScoreDomain;
}>) {
  if (locale === "th") {
    return lowest
      ? `HealthScore ของคุณคือ ${healthScore.score}/100 และจุดที่ควรโฟกัสที่สุดคือ ${lowest.label} ตัวอย่างด้านล่างคือ 3 รายการที่ถูกจัดอันดับสูงสุดจากสูตรของคุณ เพื่อให้เห็นว่า MattaNutra แปลงผลประเมินเป็นแผนเริ่มต้นที่ใช้งานได้อย่างไร`
      : `HealthScore ของคุณคือ ${healthScore.score}/100 ตัวอย่างด้านล่างคือ 3 รายการที่ถูกจัดอันดับสูงสุดจากสูตรของคุณ เพื่อให้เห็นว่า MattaNutra แปลงผลประเมินเป็นแผนเริ่มต้นที่ใช้งานได้อย่างไร`;
  }

  return lowest
    ? `Your HealthScore is ${healthScore.score}/100, with ${lowest.label.toLowerCase()} as the clearest area to improve. Below are the three highest-ranked items from your generated plan, so you can see how MattaNutra turns your result into a practical starting point.`
    : `Your HealthScore is ${healthScore.score}/100. Below are the three highest-ranked items from your generated plan, so you can see how MattaNutra turns your result into a practical starting point.`;
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
    .filter((item) => item.safety?.visibility !== "hidden")
    .map((item, index) => ({
      item,
      rank: effectivenessRank(item, index)
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)
    .slice(0, 3);
  const focusDomain = lowestDomain(healthScore);
  const overview =
    localize(healthScore.advice?.overview, locale) || healthScore.summary;
  const intro = personalisedIntro({
    healthScore,
    locale,
    lowest: focusDomain
  });
  const labels =
    locale === "th"
      ? {
          cta: "ดูแผนฉบับเต็ม",
          plan: "แผน",
          preview: "3 รายการเริ่มต้นจากแผนของคุณ",
          previewUnavailable:
            "คำแนะนำอาหารเสริมต้องผ่านการตรวจสอบด้านความปลอดภัยก่อนแสดง ทีมงานได้รับรายการแล้ว",
          score: "HealthScore ของคุณ",
          subject: buildExampleEmailSubject(locale, healthScore),
          unsubscribe: "ยกเลิกอีเมลการประเมินซ้ำ"
        }
      : {
          cta: "View the full plan",
          plan: "Plan",
          preview: "3 starting points from your plan",
          previewUnavailable:
            "Your supplement suggestions need a safety review before we show them. The review queue has been notified.",
          score: "Your HealthScore",
          subject: buildExampleEmailSubject(locale, healthScore),
          unsubscribe: "Unsubscribe from reassessment emails"
        };
  const planUrl = buildAssessmentResultsUrl(locale, planId);
  const unsubscribeUrl = unsubscribeToken
    ? buildUnsubscribeUrl(unsubscribeToken)
    : "";

  const itemHtml =
    previewItems.length > 0
      ? previewItems
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
          .join("")
      : `
        <li style="margin:0 0 14px;padding:14px 16px;border:1px solid #d8e7df;border-radius:10px;background:#ffffff;color:#5c6670;font-size:13px;line-height:1.5;">
          ${escapeHtml(labels.previewUnavailable)}
        </li>
      `;

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
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(intro)}</p>

        <div style="margin:22px 0;padding:18px;border-radius:12px;background:#eef7ff;border:1px solid #d9e8f7;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#3A7BD5;font-weight:700;">${escapeHtml(labels.score)}</div>
          <div style="margin-top:6px;font-size:44px;font-weight:800;line-height:1;color:#20343A;">${healthScore.score}<span style="font-size:18px;color:#6b7280;">/100</span></div>
          <div style="margin-top:8px;color:#1FA77A;font-weight:700;">${escapeHtml(healthScore.band)}</div>
          <p style="margin:10px 0 0;color:#5c6670;line-height:1.5;font-size:13px;">${escapeHtml(overview)}</p>
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

export function buildExampleEmailSubject(
  locale: Locale,
  healthScore?: HealthScoreResult
) {
  const score =
    typeof healthScore?.score === "number" ? healthScore.score : null;

  if (locale === "th") {
    return score
      ? `ตัวอย่างแผน MattaNutra จาก HealthScore ${score}/100`
      : "ตัวอย่างแผน MattaNutra ของคุณ";
  }

  return score
    ? `Your ${score}/100 HealthScore preview`
    : "Your MattaNutra plan preview";
}
