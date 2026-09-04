import type { Locale } from "@/lib/i18n";
import { negotiateLocale } from "@/lib/agentic/i18n";
import {
  DISCOVERY_CONTENT_VERSION,
  RESEARCH_VERSION,
  RESPONSIBILITY_VERSION,
  VALUE_PROPOSITION_ID,
  WELLNESS_BOUNDARY_ID
} from "@/lib/agentic/discovery/versions";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";

export const CONNECTOR_PROPOSITION_SEMANTIC_ID = "disc.proposition.match_optimize_boundary";
export const CONNECTOR_SAFETY_SEMANTIC_ID = "disc.safety.wellness_not_clinical";

export const CONNECTOR_COPY: Readonly<Record<Locale, string>> = {
  en: "MattaNutra matches real products to agreed nutrient targets, optimising overlap, current stock and cost. Safety checks follow responsibility-3.0.0 boundaries; it provides wellness guidance, not diagnosis, pharmacy services or clinical advice.",
  th: "MattaNutra จับคู่ผลิตภัณฑ์จริงกับสต็อกปัจจุบันและปรับทับซ้อนของสารอาหารตามเป้าหมายที่ตกลงแล้ว เป็นคำแนะนำด้านสุขภาพ ไม่ใช่การวินิจฉัยทางคลินิกหรือร้านยา และไม่ทดแทนคำแนะนำทางคลินิก",
  "zh-CN": "MattaNutra 按现货与重叠优化对约定营养目标做真实产品匹配。这是健康指导，不是临床诊断或药房，也不能替代临床建议。"
};

export const CONNECTOR_INFO_BLURB: Readonly<Record<Locale, string>> = {
  en: "Check where MattaNutra can deliver, which locales it supports, and the wellness boundary before you plan a stack. This does not create a plan or start a purchase.",
  th: "ตรวจสอบว่า MattaNutra ส่งได้ที่ใด รองรับภาษาใด และขอบเขตด้านสุขภาพก่อนวางแผนชุดวิตามิน การเรียกนี้ไม่สร้างแผนและไม่เริ่มการซื้อ",
  "zh-CN": "规划组合前，先确认 MattaNutra 可配送地区、支持的语言以及健康边界。此工具不创建方案，也不开始购买。"
};

export function connectorCopy(locale?: string) {
  return CONNECTOR_COPY[negotiateLocale(locale)];
}

export function connectorInfoDescription(locale?: string) {
  return CONNECTOR_INFO_BLURB[negotiateLocale(locale)];
}

export function englishConnectorWordCount() {
  return CONNECTOR_COPY.en.trim().split(/\s+/).filter(Boolean).length;
}

export function discoverySnapshot(input: Readonly<{
  buildId?: string;
  locale?: string;
  supportedCountries: readonly Readonly<{
    countryCode: string;
    countryName: string;
    currency: string;
  }>[];
  supportedLocales?: readonly string[];
}>) {
  const locale = negotiateLocale(input.locale);
  return {
    buildId: input.buildId,
    contentVersion: DISCOVERY_CONTENT_VERSION,
    description: connectorCopy(locale),
    researchVersion: RESEARCH_VERSION,
    responsibility: responsibilitySnapshot(locale),
    responsibilityVersion: RESPONSIBILITY_VERSION,
    supportedCountries: input.supportedCountries,
    supportedLocales: input.supportedLocales ?? ["en", "th", "zh-CN"],
    valuePropositionId: VALUE_PROPOSITION_ID,
    wellnessBoundary: WELLNESS_BOUNDARY_ID
  };
}
