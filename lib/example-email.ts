import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FormulationBlueprint,
  LocalizedText,
  MarketingPoint
} from "@/lib/formulation-types";
import type {
  HealthScoreDomain,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { resolveLocalizedText, type Locale } from "@/lib/i18n";
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
  return resolveLocalizedText(value, locale);
}

function effectivenessRank(
  item: FormulationBlueprint["supplementBreakdown"][number],
  index: number
) {
  return Number.isFinite(item.effectivenessRank) && item.effectivenessRank > 0
    ? item.effectivenessRank
    : index + 1;
}

function foodEffectivenessRank(item: FoodGuidanceItem, index: number) {
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

  if (locale === "zh-CN") {
    return lowest
      ? `您的 HealthScore 是 ${healthScore.score}/100，最清晰的改善重点是 ${lowest.label}。下面是您生成计划中排名最高的 3 个项目，帮助您了解 MattaNutra 如何把评估结果转化为可执行的起点。`
      : `您的 HealthScore 是 ${healthScore.score}/100。下面是您生成计划中排名最高的 3 个项目，帮助您了解 MattaNutra 如何把评估结果转化为可执行的起点。`;
  }

  return lowest
    ? `Your HealthScore is ${healthScore.score}/100, with ${lowest.label.toLowerCase()} as the clearest area to improve. Below are the three highest-ranked items from your generated plan, so you can see how MattaNutra turns your result into a practical starting point.`
    : `Your HealthScore is ${healthScore.score}/100. Below are the three highest-ranked items from your generated plan, so you can see how MattaNutra turns your result into a practical starting point.`;
}

function fallbackMarketingPoints(
  healthScore: HealthScoreResult,
  lowest?: HealthScoreDomain
): MarketingPoint[] {
  const focus = lowest?.label.toLowerCase() ?? "your wellness priorities";

  return [
    {
      body: {
        en: `Your full plan is ordered around your ${healthScore.score}/100 HealthScore, starting with the items most likely to matter for ${focus}.`,
        th: `แผนฉบับเต็มจะเรียงลำดับจาก HealthScore ${healthScore.score}/100 ของคุณ โดยเริ่มจากรายการที่น่าจะเกี่ยวข้องกับจุดโฟกัสสำคัญที่สุด`,
        "zh-CN": `完整计划会围绕您的 ${healthScore.score}/100 HealthScore 排序，并从最可能影响${lowest?.label ?? "您的健康优先事项"}的项目开始。`
      },
      id: "personal-priority",
      title: {
        en: "Prioritized for you",
        th: "จัดลำดับเพื่อคุณ",
        "zh-CN": "为您优先排序"
      }
    },
    {
      body: {
        en: "The full plan brings foods and supplements together so the suggestions feel practical, not like a disconnected shopping list.",
        th: "แผนฉบับเต็มรวมทั้งอาหารและอาหารเสริมเข้าด้วยกัน เพื่อให้คำแนะนำใช้งานได้จริง ไม่ใช่แค่รายการแยกส่วน",
        "zh-CN": "完整计划会把食物和补充剂放在一起，让建议更容易执行，而不是一张割裂的购物清单。"
      },
      id: "food-supplement-fit",
      title: {
        en: "Foods plus supplements",
        th: "อาหารร่วมกับอาหารเสริม",
        "zh-CN": "食物加补充剂"
      }
    },
    {
      body: {
        en: "Safety checks help hide or flag items that need extra care before they appear in your full plan.",
        th: "ระบบตรวจความปลอดภัยช่วยซ่อนหรือแจ้งเตือนรายการที่ควรระวังก่อนแสดงในแผนฉบับเต็ม",
        "zh-CN": "安全检查会在完整计划显示前隐藏或标记需要额外谨慎的项目。"
      },
      id: "safety-screened",
      title: {
        en: "Safety checked",
        th: "ผ่านการตรวจความปลอดภัย",
        "zh-CN": "已做安全检查"
      }
    }
  ];
}

function marketingPointsForEmail(
  formulation: FormulationBlueprint,
  healthScore: HealthScoreResult,
  locale: Locale,
  lowest?: HealthScoreDomain
) {
  const points = Array.isArray(formulation.marketingPoints)
    ? formulation.marketingPoints
    : [];
  const usablePoints = points.filter(
    (point) =>
      hasLocalizedValue(point.title, locale) &&
      hasLocalizedValue(point.body, locale)
  );

  return (usablePoints.length > 0 ? usablePoints : fallbackMarketingPoints(healthScore, lowest))
    .filter((point) => localize(point.title, "en") && localize(point.body, "en"))
    .slice(0, 3);
}

function hasLocalizedValue(value: LocalizedText | undefined, locale: Locale) {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }

  return Boolean(value?.[locale]?.trim());
}

export function buildExampleEmailHtml({
  formulation,
  healthScore,
  locale,
  planId,
  unsubscribeToken
}: Readonly<{
  formulation: FormulationBlueprint & Partial<FoodGuidanceBlueprint>;
  healthScore: HealthScoreResult;
  locale: Locale;
  planId: string;
  unsubscribeToken?: string | null;
}>) {
  type NutritionPreview = FormulationBlueprint & Partial<FoodGuidanceBlueprint>;
  const nutritionPreview = formulation as NutritionPreview;
  const previewItems = formulation.supplementBreakdown
    .filter((item) => item.safety?.visibility !== "hidden")
    .map((item, index) => ({
      item,
      rank: effectivenessRank(item, index)
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)
    .slice(0, 3);
  const previewFoods = (nutritionPreview.foodGuidance ?? [])
    .filter((item) => item.safety?.visibility !== "hidden")
    .map((item, index) => ({
      item,
      rank: foodEffectivenessRank(item, index)
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
  const marketingPoints = marketingPointsForEmail(
    formulation,
    healthScore,
    locale,
    focusDomain
  );
  const labels = exampleEmailLabels(locale, healthScore);
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
  const foodHtml =
    previewFoods.length > 0
      ? previewFoods
          .map((item) => {
            const name = escapeHtml(localize(item.food, locale));
            const serving = escapeHtml(localize(item.serving, locale));
            const frequency = escapeHtml(localize(item.frequency, locale));
            const rationale = escapeHtml(localize(item.rationale, locale));

            return `
        <li style="margin:0 0 14px;padding:14px 16px;border:1px solid #d9e8f7;border-radius:10px;background:#ffffff;">
          <strong style="display:block;color:#20343A;font-size:15px;">${name}</strong>
          <span style="display:block;margin-top:4px;color:#3A7BD5;font-size:13px;font-weight:700;">${serving} · ${frequency}</span>
          <span style="display:block;margin-top:8px;color:#5c6670;font-size:13px;line-height:1.5;">${rationale}</span>
        </li>
      `;
          })
          .join("")
      : "";
  const marketingHtml = marketingPoints
    .map((point) => {
      const title = escapeHtml(localize(point.title, locale));
      const body = escapeHtml(localize(point.body, locale));

      return `
        <li style="margin:0 0 10px;padding:13px 14px;border:1px solid #d9e8f7;border-radius:10px;background:#fbfdff;">
          <strong style="display:block;color:#20343A;font-size:14px;">${title}</strong>
          <span style="display:block;margin-top:6px;color:#5c6670;font-size:13px;line-height:1.5;">${body}</span>
        </li>
      `;
    })
    .join("");
  const isChinese = locale === "zh-CN";
  const eyebrowStyle = isChinese
    ? "font-size:12px;letter-spacing:0;text-transform:none;color:#3A7BD5;font-weight:700;"
    : "font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#3A7BD5;font-weight:700;";
  const scoreLabelStyle = isChinese
    ? "font-size:12px;text-transform:none;letter-spacing:0;color:#3A7BD5;font-weight:700;"
    : "font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#3A7BD5;font-weight:700;";
  const ctaStyle = isChinese
    ? "display:inline-block;margin-top:18px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:13px;font-weight:800;letter-spacing:0;text-transform:none;"
    : "display:inline-block;margin-top:18px;background:#1FA77A;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;";

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
        <h1 style="margin:12px 0 10px;font-size:28px;line-height:1.15;color:#20343A;">${escapeHtml(labels.subject)}</h1>
        <p style="margin:0;color:#5c6670;line-height:1.6;font-size:15px;">${escapeHtml(intro)}</p>

        <div style="margin:22px 0;padding:18px;border-radius:12px;background:#eef7ff;border:1px solid #d9e8f7;">
          <div style="${scoreLabelStyle}">${escapeHtml(labels.score)}</div>
          <div style="margin-top:6px;font-size:44px;font-weight:800;line-height:1;color:#20343A;">${healthScore.score}<span style="font-size:18px;color:#6b7280;">/100</span></div>
          <div style="margin-top:8px;color:#1FA77A;font-weight:700;">${escapeHtml(healthScore.band)}</div>
          <p style="margin:10px 0 0;color:#5c6670;line-height:1.5;font-size:13px;">${escapeHtml(overview)}</p>
        </div>

        ${
          marketingHtml
            ? `<h2 style="margin:0 0 12px;color:#20343A;font-size:18px;">${escapeHtml(labels.marketingHeading)}</h2><ul style="list-style:none;margin:0 0 22px;padding:0;">${marketingHtml}</ul>`
            : ""
        }
        <h2 style="margin:0 0 12px;color:#20343A;font-size:18px;">${escapeHtml(labels.preview)}</h2>
        <ul style="list-style:none;margin:0;padding:0;">${itemHtml}</ul>
        ${
          foodHtml
            ? `<h2 style="margin:22px 0 12px;color:#20343A;font-size:18px;">${escapeHtml(labels.foodPreview)}</h2><ul style="list-style:none;margin:0;padding:0;">${foodHtml}</ul>`
            : ""
        }

        <p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(labels.plan)}: ${escapeHtml(planId)}</p>
        <a href="${escapeHtml(planUrl)}" style="${ctaStyle}">${escapeHtml(labels.cta)}</a>
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

  if (locale === "zh-CN") {
    return score
      ? `您的 ${score}/100 HealthScore 预览`
      : "您的 MattaNutra 计划预览";
  }

  return score
    ? `Your ${score}/100 HealthScore preview`
    : "Your MattaNutra plan preview";
}

function exampleEmailLabels(locale: Locale, healthScore: HealthScoreResult) {
  if (locale === "th") {
    return {
      cta: "ดูแผนฉบับเต็ม",
      plan: "แผน",
      foodPreview: "3 อาหารเริ่มต้นจากแผนของคุณ",
      marketingHeading: "เหตุผลที่ควรเปิดแผนฉบับเต็ม",
      preview: "3 รายการเริ่มต้นจากแผนของคุณ",
      previewUnavailable:
        "คำแนะนำอาหารเสริมต้องผ่านการตรวจสอบด้านความปลอดภัยก่อนแสดง ทีมงานได้รับรายการแล้ว",
      score: "HealthScore ของคุณ",
      subject: buildExampleEmailSubject(locale, healthScore),
      unsubscribe: "ยกเลิกอีเมลการประเมินซ้ำ"
    };
  }

  if (locale === "zh-CN") {
    return {
      cta: "查看完整计划",
      plan: "计划",
      foodPreview: "计划中的 3 个食物起点",
      marketingHeading: "为什么打开完整计划",
      preview: "计划中的 3 个起点",
      previewUnavailable:
        "您的补充剂建议需要先完成安全审核才能显示。审核队列已收到通知。",
      score: "您的 HealthScore",
      subject: buildExampleEmailSubject(locale, healthScore),
      unsubscribe: "取消订阅复评邮件"
    };
  }

  return {
    cta: "View the full plan",
    plan: "Plan",
    foodPreview: "3 food starting points from your plan",
    marketingHeading: "Why open the full plan",
    preview: "3 starting points from your plan",
    previewUnavailable:
      "Your supplement suggestions need a safety review before we show them. The review queue has been notified.",
    score: "Your HealthScore",
    subject: buildExampleEmailSubject(locale, healthScore),
    unsubscribe: "Unsubscribe from reassessment emails"
  };
}
