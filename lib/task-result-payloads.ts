import {
  normalizeGuidanceAdjustments
} from "@/lib/plan-guidance-adjustments";
import { normalizePlanFeedbackItems } from "@/lib/plan-feedback";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint,
  NutritionReport
} from "@/lib/formulation-types";

export function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function payloadText(payload: unknown, key: string) {
  return textValue(objectValue(payload)[key]);
}

export function modelVersion(analysis: Record<string, unknown>, suffix = "") {
  const model = textValue(analysis.model) || "unknown";
  const reasoningEffort = textValue(analysis.reasoningEffort) || "unknown";
  const promptVersion = textValue(analysis.promptVersion) || "unknown";

  return `xai:${model}:${reasoningEffort}:${promptVersion}${suffix}`;
}

export function analysisPayload(resultPayload: unknown) {
  const analysis = objectValue(objectValue(resultPayload).analysis);
  const formulation = objectValue(analysis.formulation);

  if (!Array.isArray(formulation.supplementBreakdown)) {
    throw new Error("Task completion result is missing formulation analysis");
  }

  return analysis as Record<string, unknown> & {
    formulation: FormulationBlueprint;
  };
}

export function foodGuidanceAnalysisPayload(resultPayload: unknown) {
  const analysis = objectValue(objectValue(resultPayload).analysis);
  const foodGuidance = objectValue(analysis.foodGuidance);

  if (!Array.isArray(foodGuidance.foodGuidance)) {
    throw new Error("Task completion result is missing food guidance analysis");
  }

  return analysis as Record<string, unknown> & {
    foodGuidance: FoodGuidanceBlueprint;
  };
}

export function nutritionChatAnalysisPayload(resultPayload: unknown) {
  const analysis = objectValue(objectValue(resultPayload).analysis);
  const reply = textValue(analysis.reply).trim();

  if (!reply) {
    throw new Error("Task completion result is missing chat reply analysis");
  }

  return {
    ...analysis,
    adjustments: normalizeGuidanceAdjustments(analysis.adjustments),
    feedback: normalizePlanFeedbackItems(analysis.feedback),
    reply
  } as Record<string, unknown> & {
    adjustments: ReturnType<typeof normalizeGuidanceAdjustments>;
    feedback: ReturnType<typeof normalizePlanFeedbackItems>;
    reply: string;
  };
}

export function refinementQueuedReply(userMessage: string, locale?: string) {
  if (locale === "zh-CN" || /[\u3400-\u9FFF]/u.test(userMessage)) {
    return "好的。我会根据这段对话重新生成您的计划。食物建议、补充剂建议和最终计划会在完成后依次更新。";
  }

  if (/[ก-๙]/u.test(userMessage)) {
    return "รับทราบครับ ผมจะปรับแผนใหม่โดยใช้บทสนทนานี้เป็นบริบท แล้วจะแสดงคำแนะนำอาหาร อาหารเสริม และแผนสรุปฉบับใหม่เมื่อเสร็จ";
  }

  return "Got it. I’ll regenerate your plan now using this conversation as context. The food guidance, supplement guidance, and final plan will update here as each step finishes.";
}

export function nutritionReportAnalysisPayload(resultPayload: unknown) {
  const analysis = objectValue(objectValue(resultPayload).analysis);
  const report = objectValue(analysis.report) as NutritionReport;

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Task completion result is missing nutrition report analysis");
  }

  return {
    ...analysis,
    report
  } as Record<string, unknown> & { report: NutritionReport };
}
