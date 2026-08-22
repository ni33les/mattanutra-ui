import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  XCircle
} from "lucide-react";
import { TitleBar } from "@/components/title-bar";
import {
  getStoredAssessmentPrefill,
  getStoredFormulationResult
} from "@/lib/assessment-store";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { formatCurrencyAmount } from "@/lib/currencies";
import type { FormulationResult } from "@/lib/formulation-types";
import { computeHealthScore, type HealthScoreResult } from "@/lib/health-score";
import { isLocale, locales, type Locale, type LocaleCode } from "@/lib/i18n";
import { visibleSupplementRecommendationCount } from "@/lib/nutrition-journey-status";
import {
  paymentCheckoutPath,
  paymentReturnPath
} from "@/lib/payment-paths";
import { AMOUNT_MICROS_PER_UNIT } from "@/lib/stripe-payment-config";
import {
  fulfillCheckoutSession,
  paymentReturnDestination
} from "@/lib/stripe-payments";
import { localizedRouteMetadata } from "@/lib/seo";

type PaymentReturnPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    session_id?: string;
  }>;
}>;

type ReturnStatus =
  | "error"
  | "expired"
  | "paid_reservation"
  | "paid_with_plan"
  | "processing";

type ConfirmationTone = "error" | "pending" | "success";

type FulfilledPayment = NonNullable<
  Awaited<ReturnType<typeof fulfillCheckoutSession>>["payment"]
>;

type ConfirmationStep = Readonly<{
  description: string;
  title: string;
}>;

type ConfirmationView = Readonly<{
  badge: string;
  catalogueFitLabel?: string;
  ctaLabel: string;
  destination: string;
  emailNote?: string;
  headline: string;
  message: string;
  receiptSummary?: string;
  receiptTitle?: string;
  status: ReturnStatus;
  steps: readonly ConfirmationStep[];
  tone: ConfirmationTone;
}>;

type HealthScoreConfirmationContext = Readonly<{
  evaluatedIngredientCount?: number;
  selectedIngredientCount?: number;
}>;

const copy = {
  en: {
    actions: {
      checkAgain: "Check again",
      continueAssessment: "Continue assessment",
      returnCheckout: "Return to checkout",
      returnHome: "Return home",
      seeFormula: "See my formula"
    },
    catalogueFit: "{percent}% catalogue fit",
    catalogueMatching: "Catalogue matching",
    emailNote: "A copy was sent to your email",
    formulaReceiptTitle: "Your formula",
    genericReceiptTitle: "Your plan",
    healthScoreMissing:
      "Payment confirmed. We are using your completed assessment to prepare your Right Amount Formula.",
    missing: "We could not find a payment session on this return link.",
    nutrients: {
      one: "nutrient",
      other: "nutrients"
    },
    planLabels: {
      precision: "Right Amount Formula",
      pro: "Living Protocol"
    } satisfies Record<AssessmentPlan, string>,
    profileFallback: "Your profile",
    reservationSteps: [
      {
        description: "We have recorded the payment and will attach it to this assessment.",
        title: "Payment saved"
      },
      {
        description: "Complete the remaining questions so we can build the right formula.",
        title: "Finish the assessment"
      },
      {
        description: "We will attach this payment automatically when your plan is ready.",
        title: "Open your formula"
      }
    ],
    states: {
      error: {
        badge: "Payment needs attention",
        headline: "We could not confirm this payment",
        message:
          "The payment was not completed. You can return to checkout or contact support if money has left your account."
      },
      expired: {
        badge: "Payment expired",
        headline: "This checkout session has expired",
        message:
          "Your payment was not completed. You can safely return to checkout when you are ready."
      },
      fulfillmentFailed: {
        badge: "Payment received",
        headline: "Your payment needs a quick review",
        message:
          "Payment was received, but plan preparation needs a retry. We have logged this for review."
      },
      paid: {
        badge: "Payment confirmed",
        headline: "Your formula is being built",
        message:
          "In a moment you'll see exactly which nutrients were chosen for you — and why each one made the cut.",
        readyMessage:
          "Your formula is ready. We selected {count} nutrients for you, with dosing and product guidance matched to your assessment."
      },
      paidReservation: {
        badge: "Payment confirmed",
        headline: "Your payment is saved",
        message:
          "Continue your assessment and we will connect this payment to your plan automatically."
      },
      processing: {
        badge: "Payment processing",
        headline: "Your payment is still processing",
        message:
          "Stripe is still processing this payment. This can happen with some payment methods. Please check back shortly."
      }
    },
    steps: [
      {
        description:
          "{evaluated} ingredients narrowed to {selected}, scored for your exact profile.",
        fallbackDescription:
          "Your completed assessment is locked in and ready for formula generation.",
        title: "Your plan is ready now"
      },
      {
        description:
          "See each nutrient, its dose, the evidence, and where to buy it in Thailand.",
        fallbackDescription:
          "Your goals, symptoms, safety flags, medications, labs, and routine are checked together.",
        title: "Review your formula"
      },
      {
        description:
          "The right nutrients with precise dosing, timing, and product guidance.",
        title: "Start your Right Amount Formula"
      }
    ],
    stepsTitle: "What happens next",
    footerWisdom: "Mattaññutā · The wisdom of knowing the right amount"
  },
  th: {
    actions: {
      checkAgain: "ตรวจสอบอีกครั้ง",
      continueAssessment: "ทำแบบประเมินต่อ",
      returnCheckout: "กลับไปชำระเงิน",
      returnHome: "กลับหน้าแรก",
      seeFormula: "ดูสูตรของฉัน"
    },
    catalogueFit: "ตรงกับแคตตาล็อก {percent}%",
    catalogueMatching: "กำลังจับคู่แคตตาล็อก",
    emailNote: "ส่งสำเนาไปยังอีเมลของคุณแล้ว",
    formulaReceiptTitle: "สูตรของคุณ",
    genericReceiptTitle: "แผนของคุณ",
    healthScoreMissing:
      "ยืนยันการชำระเงินแล้ว เรากำลังใช้แบบประเมินที่คุณทำเสร็จเพื่อเตรียม Right Amount Formula",
    missing: "ไม่พบข้อมูลเซสชันการชำระเงินจากลิงก์นี้",
    nutrients: {
      one: "สารอาหาร",
      other: "สารอาหาร"
    },
    planLabels: {
      precision: "Right Amount Formula",
      pro: "Living Protocol"
    } satisfies Record<AssessmentPlan, string>,
    profileFallback: "โปรไฟล์ของคุณ",
    reservationSteps: [
      {
        description: "เราบันทึกการชำระเงินและจะเชื่อมเข้ากับแบบประเมินนี้",
        title: "บันทึกการชำระเงินแล้ว"
      },
      {
        description: "ตอบคำถามที่เหลือเพื่อให้เราสร้างสูตรที่เหมาะกับคุณ",
        title: "ทำแบบประเมินให้เสร็จ"
      },
      {
        description: "เราจะเชื่อมการชำระเงินนี้กับแผนของคุณโดยอัตโนมัติเมื่อพร้อม",
        title: "เปิดสูตรของคุณ"
      }
    ],
    states: {
      error: {
        badge: "ต้องตรวจสอบการชำระเงิน",
        headline: "เรายืนยันการชำระเงินนี้ไม่ได้",
        message:
          "การชำระเงินยังไม่สำเร็จ คุณสามารถกลับไปชำระเงินใหม่หรือติดต่อทีมงานหากมีการหักเงินแล้ว"
      },
      expired: {
        badge: "เซสชันชำระเงินหมดอายุ",
        headline: "ลิงก์ชำระเงินนี้หมดอายุแล้ว",
        message:
          "การชำระเงินยังไม่สำเร็จ คุณสามารถกลับไปชำระเงินใหม่ได้อย่างปลอดภัย"
      },
      fulfillmentFailed: {
        badge: "ได้รับการชำระเงินแล้ว",
        headline: "การชำระเงินของคุณต้องตรวจสอบเล็กน้อย",
        message:
          "เราได้รับการชำระเงินแล้ว แต่การเตรียมแผนต้องลองใหม่ ระบบได้บันทึกไว้เพื่อตรวจสอบ"
      },
      paid: {
        badge: "ยืนยันการชำระเงินแล้ว",
        headline: "กำลังสร้างสูตรของคุณ",
        message:
          "อีกสักครู่คุณจะเห็นว่าสารอาหารใดถูกเลือกให้คุณ และเหตุผลของแต่ละรายการ",
        readyMessage:
          "สูตรของคุณพร้อมแล้ว เราเลือกสารอาหาร {count} รายการให้คุณ พร้อมขนาดรับประทานและคำแนะนำผลิตภัณฑ์ที่ตรงกับแบบประเมิน"
      },
      paidReservation: {
        badge: "ยืนยันการชำระเงินแล้ว",
        headline: "บันทึกการชำระเงินของคุณแล้ว",
        message:
          "ทำแบบประเมินต่อ แล้วระบบจะเชื่อมการชำระเงินกับแผนของคุณอัตโนมัติ"
      },
      processing: {
        badge: "กำลังประมวลผลการชำระเงิน",
        headline: "การชำระเงินของคุณยังประมวลผลอยู่",
        message:
          "Stripe ยังประมวลผลการชำระเงินอยู่ ซึ่งอาจเกิดขึ้นได้กับบางวิธีชำระเงิน โปรดกลับมาตรวจสอบอีกครั้ง"
      }
    },
    steps: [
      {
        description:
          "ประเมินส่วนผสม {evaluated} รายการ เหลือ {selected} รายการที่เหมาะกับโปรไฟล์ของคุณ",
        fallbackDescription:
          "แบบประเมินที่คุณทำเสร็จถูกล็อกไว้แล้ว และพร้อมสำหรับการสร้างสูตร",
        title: "แผนของคุณพร้อมแล้ว"
      },
      {
        description:
          "ดูสารอาหารแต่ละรายการ ปริมาณ หลักฐาน และสถานที่ซื้อในประเทศไทย",
        fallbackDescription:
          "ระบบตรวจเป้าหมาย อาการ ข้อควรระวัง ยา แล็บ และกิจวัตรของคุณร่วมกัน",
        title: "ตรวจสูตรของคุณ"
      },
      {
        description:
          "สารอาหารที่เหมาะสม พร้อมปริมาณ เวลา และคำแนะนำผลิตภัณฑ์ที่พอดี",
        title: "เริ่ม Right Amount Formula"
      }
    ],
    stepsTitle: "ขั้นตอนถัดไป",
    footerWisdom: "Mattaññutā · ปัญญาแห่งการรู้ปริมาณที่พอดี"
  },
  "zh-CN": {
    actions: {
      checkAgain: "重新检查",
      continueAssessment: "继续评估",
      returnCheckout: "返回结账",
      returnHome: "返回首页",
      seeFormula: "查看我的配方"
    },
    catalogueFit: "目录匹配度 {percent}%",
    catalogueMatching: "正在匹配目录",
    emailNote: "副本已发送到你的邮箱",
    formulaReceiptTitle: "你的配方",
    genericReceiptTitle: "你的计划",
    healthScoreMissing:
      "付款已确认。我们正在根据你完成的评估准备 Right Amount Formula。",
    missing: "我们无法在这个返回链接中找到付款会话。",
    nutrients: {
      one: "种营养素",
      other: "种营养素"
    },
    planLabels: {
      precision: "Right Amount Formula",
      pro: "Living Protocol"
    } satisfies Record<AssessmentPlan, string>,
    profileFallback: "你的档案",
    reservationSteps: [
      {
        description: "我们已记录付款，并会把它关联到这次评估。",
        title: "付款已保存"
      },
      {
        description: "完成剩余问题后，我们就能建立合适的配方。",
        title: "完成评估"
      },
      {
        description: "计划准备好后，我们会自动关联这笔付款。",
        title: "打开你的配方"
      }
    ],
    states: {
      error: {
        badge: "付款需要处理",
        headline: "我们无法确认这笔付款",
        message:
          "付款未完成。如果账户已扣款，你可以返回结账页或联系支持团队。"
      },
      expired: {
        badge: "付款会话已过期",
        headline: "这个结账会话已过期",
        message: "你的付款未完成。准备好后可以安全返回结账页。"
      },
      fulfillmentFailed: {
        badge: "已收到付款",
        headline: "你的付款需要快速审核",
        message:
          "我们已收到付款，但计划准备需要重试。系统已记录此问题以便审核。"
      },
      paid: {
        badge: "付款已确认",
        headline: "正在生成你的配方",
        message: "稍后你会看到为你选择的营养素，以及每一种入选的原因。",
        readyMessage:
          "你的配方已准备好。我们为你选择了 {count} 种营养素，并根据评估匹配剂量和产品建议。"
      },
      paidReservation: {
        badge: "付款已确认",
        headline: "你的付款已保存",
        message: "请继续完成评估，我们会自动把这笔付款关联到你的计划。"
      },
      processing: {
        badge: "付款处理中",
        headline: "你的付款仍在处理中",
        message:
          "Stripe 仍在处理这笔付款。某些付款方式可能会出现这种情况，请稍后再查看。"
      }
    },
    steps: [
      {
        description:
          "从 {evaluated} 种成分筛选到 {selected} 种，并按你的个人档案评分。",
        fallbackDescription: "你完成的评估已锁定，可用于生成配方。",
        title: "你的计划已准备好"
      },
      {
        description: "查看每种营养素、剂量、证据，以及在泰国的购买方式。",
        fallbackDescription:
          "系统会综合检查你的目标、症状、安全提示、用药、化验数据和日常习惯。",
        title: "查看你的配方"
      },
      {
        description: "正确的营养素，配合精准剂量、时间安排和产品指导。",
        title: "开始 Right Amount Formula"
      }
    ],
    stepsTitle: "接下来会发生什么",
    footerWisdom: "Mattaññutā · 懂得正确份量的智慧"
  }
} as const;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: PaymentReturnPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    routeKey: "paymentReturn"
  });
}

function replaceTokens(
  template: string,
  values: Readonly<Record<string, number | string>>
) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function nutrientLabel(locale: Locale, count: number) {
  const labels = copy[locale].nutrients;

  if (locale === "en") {
    return count === 1 ? labels.one : labels.other;
  }

  return labels.other;
}

function selectedNutrientCount(formula: FormulationResult | null) {
  return visibleSupplementRecommendationCount(formula);
}

function evaluatedIngredientCount(
  formula: FormulationResult | null,
  selectedCount: number,
  healthScoreContext?: HealthScoreConfirmationContext | null
) {
  if (formula) {
    return Math.max(
      selectedCount,
      formula.catalogueSupplementCount ||
        formula.totalSupplementCount ||
        formula.lockedSupplementCount ||
        0
    );
  }

  if (healthScoreContext?.evaluatedIngredientCount) {
    return Math.max(selectedCount, healthScoreContext.evaluatedIngredientCount);
  }

  return selectedCount;
}

function catalogueFitPercent(formula: FormulationResult | null) {
  const value = formula?.productRecommendations?.stackCoveragePercent;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(100, value)));
}

function healthScoreIngredientCounts(result: HealthScoreResult) {
  const locked = result.pageContent?.locked;

  return {
    evaluatedIngredientCount:
      locked?.nutrientsEvaluated ?? locked?.subtraction.evaluated ?? undefined,
    selectedIngredientCount:
      locked?.nutrientsChosen ?? locked?.subtraction.chosen ?? undefined
  };
}

async function loadHealthScoreContext(
  payment: FulfilledPayment | null,
  locale: Locale
): Promise<HealthScoreConfirmationContext | null> {
  if (!payment?.planId) {
    return null;
  }

  try {
    const prefill = await getStoredAssessmentPrefill(payment.planId);

    if (!prefill?.healthScore) {
      return null;
    }

    const healthScore = computeHealthScore(prefill.answers ?? null, locale);
    const counts = healthScoreIngredientCounts(healthScore);

    return counts;
  } catch {
    return null;
  }
}

function formatPayment(payment: FulfilledPayment | null, locale: Locale) {
  if (!payment) {
    return null;
  }

  return formatCurrencyAmount(
    locale,
    payment.amount / AMOUNT_MICROS_PER_UNIT,
    payment.currency,
    {
      maximumFractionDigits: 0
    }
  );
}

function fallbackCheckoutDestination(
  locale: Locale,
  payment: FulfilledPayment | null
) {
  if (!payment) {
    return `/${locale}`;
  }

  return paymentCheckoutPath(locale, {
    plan: payment.selectedPlan,
    planId: payment.planId,
    sourceSurface: payment.sourceSurface
  });
}

async function loadFormulaResult(payment: FulfilledPayment | null, locale: Locale) {
  if (!payment?.planId) {
    return null;
  }

  try {
    return await getStoredFormulationResult(payment.planId, {
      locale,
      mode: "full"
    });
  } catch {
    return null;
  }
}

function buildConfirmationView(
  input: Readonly<{
    failureMessage?: string;
    formula: FormulationResult | null;
    healthScore: HealthScoreConfirmationContext | null;
    locale: Locale;
    payment: FulfilledPayment | null;
    sessionId: string;
    status: ReturnStatus;
  }>
): ConfirmationView {
  const labels = copy[input.locale];
  const paymentAmount = formatPayment(input.payment, input.locale);

  if (input.status === "paid_with_plan") {
    const formulaSelectedCount = selectedNutrientCount(input.formula);
    const displaySelectedCount = input.formula ? formulaSelectedCount : 0;
    const evaluatedCount = evaluatedIngredientCount(
      input.formula,
      displaySelectedCount,
      input.healthScore
    );
    const fitPercent = catalogueFitPercent(input.formula);
    const profileLabel =
      input.formula?.firstName?.trim() ||
      input.formula?.assessmentSummary.profile?.trim() ||
      labels.profileFallback;
    const selectedSummary =
      displaySelectedCount > 0
        ? `${displaySelectedCount} ${nutrientLabel(input.locale, displaySelectedCount)}`
        : labels.planLabels[input.payment?.selectedPlan ?? "precision"];
    const receiptParts = [
      profileLabel,
      selectedSummary,
      paymentAmount
    ].filter(Boolean);

    return {
      badge: labels.states.paid.badge,
      catalogueFitLabel:
        fitPercent === null
          ? labels.catalogueMatching
          : replaceTokens(labels.catalogueFit, { percent: fitPercent }),
      ctaLabel: labels.actions.seeFormula,
      destination: paymentReturnDestination(input.locale, input.payment),
      emailNote: input.payment?.customerEmail ? labels.emailNote : undefined,
      headline: labels.states.paid.headline,
      message:
        displaySelectedCount > 0
          ? replaceTokens(labels.states.paid.readyMessage, {
              count: displaySelectedCount
            })
          : labels.states.paid.message,
      receiptSummary: receiptParts.join(" · "),
      receiptTitle: labels.formulaReceiptTitle,
      status: input.status,
      steps: [
        {
          description:
            evaluatedCount > 0 && displaySelectedCount > 0
              ? replaceTokens(labels.steps[0].description, {
                  evaluated: evaluatedCount,
                  selected: displaySelectedCount
                })
              : labels.steps[0].fallbackDescription,
          title: labels.steps[0].title
        },
        labels.steps[1],
        labels.steps[2]
      ],
      tone: "success"
    };
  }

  if (input.status === "paid_reservation") {
    return {
      badge: labels.states.paidReservation.badge,
      ctaLabel: labels.actions.continueAssessment,
      destination: paymentReturnDestination(input.locale, input.payment),
      emailNote: input.payment?.customerEmail ? labels.emailNote : undefined,
      headline: labels.states.paidReservation.headline,
      message: labels.states.paidReservation.message,
      receiptSummary: paymentAmount
        ? `${labels.planLabels[input.payment?.selectedPlan ?? "precision"]} · ${paymentAmount}`
        : labels.planLabels[input.payment?.selectedPlan ?? "precision"],
      receiptTitle: labels.genericReceiptTitle,
      status: input.status,
      steps: labels.reservationSteps,
      tone: "success"
    };
  }

  if (input.status === "processing") {
    return {
      badge: labels.states.processing.badge,
      ctaLabel: labels.actions.checkAgain,
      destination: paymentReturnPath(input.locale, input.sessionId),
      headline: labels.states.processing.headline,
      message: labels.states.processing.message,
      status: input.status,
      steps: [],
      tone: "pending"
    };
  }

  if (input.status === "expired") {
    return {
      badge: labels.states.expired.badge,
      ctaLabel: input.payment
        ? labels.actions.returnCheckout
        : labels.actions.returnHome,
      destination: fallbackCheckoutDestination(input.locale, input.payment),
      headline: labels.states.expired.headline,
      message: input.failureMessage || labels.states.expired.message,
      status: input.status,
      steps: [],
      tone: "error"
    };
  }

  const errorState = input.failureMessage
    ? labels.states.error
    : labels.states.fulfillmentFailed;

  return {
    badge: errorState.badge,
    ctaLabel: input.payment ? labels.actions.returnCheckout : labels.actions.returnHome,
    destination: input.payment
      ? fallbackCheckoutDestination(input.locale, input.payment)
      : `/${input.locale}`,
    headline: errorState.headline,
    message: input.failureMessage || errorState.message,
    status: "error",
    steps: [],
    tone: "error"
  };
}

function toneClasses(tone: ConfirmationTone) {
  if (tone === "success") {
    return {
      badge: "text-[#1a6b4a]",
      icon: "bg-[#e6f5ee] text-[#1a6b4a]"
    };
  }

  if (tone === "pending") {
    return {
      badge: "text-[#8a6d23]",
      icon: "bg-[#fff8e6] text-[#8a6d23]"
    };
  }

  return {
    badge: "text-[#b42318]",
    icon: "bg-[#fee4e2] text-[#b42318]"
  };
}

function StatusIcon({ status }: Readonly<{ status: ReturnStatus }>) {
  if (status === "paid_with_plan" || status === "paid_reservation") {
    return <Check aria-hidden className="size-[26px]" strokeWidth={3} />;
  }

  if (status === "processing") {
    return <Clock3 aria-hidden className="size-[26px]" />;
  }

  if (status === "expired") {
    return <XCircle aria-hidden className="size-[26px]" />;
  }

  return <AlertTriangle aria-hidden className="size-[26px]" />;
}

function PaymentConfirmationFooter({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <footer className="bg-[#1a3c34] px-8 py-5 text-center text-[11px] tracking-[0.3px] text-[#a7c4bb]">
      {copy[locale].footerWisdom}
    </footer>
  );
}

export default async function PaymentReturnPage({
  params,
  searchParams
}: PaymentReturnPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const query = await searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  let result: Awaited<ReturnType<typeof fulfillCheckoutSession>> | null = null;
  let failureMessage = "";

  if (sessionId) {
    try {
      result = await fulfillCheckoutSession(sessionId, {
        source: "return_page"
      });
    } catch {
      failureMessage = "";
    }
  } else {
    failureMessage = copy[locale].missing;
  }

  const payment = result?.payment ?? null;
  const status = result?.status ?? "error";
  const [formula, healthScore] = await Promise.race([
    Promise.all([
      loadFormulaResult(payment, locale),
      loadHealthScoreContext(payment, locale)
    ]),
    new Promise<
      [Awaited<ReturnType<typeof loadFormulaResult>>, Awaited<ReturnType<typeof loadHealthScoreContext>>]
    >((resolve) => {
      setTimeout(() => resolve([null, null]), 1_500);
    })
  ]);
  const view = buildConfirmationView({
    failureMessage,
    formula,
    healthScore,
    locale,
    payment,
    sessionId,
    status
  });
  const classes = toneClasses(view.tone);
  const currentPath = paymentReturnPath(locale, sessionId || undefined);
  const localizedPaths = Object.fromEntries(
    locales.map((item) => [item, paymentReturnPath(item, sessionId || undefined)])
  ) as Partial<Record<LocaleCode, string>>;

  return (
    <div className="mn-customer-shell flex min-h-screen flex-col bg-[#f0ede4] text-[#1a3c34]">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        localizedPaths={localizedPaths}
        title="MattaNutra"
        variant="landing"
      />
      <main className="flex flex-1 items-center justify-center px-6 py-[60px]">
        <div className="w-full max-w-[520px] mn-font-body">
          <article
            className="mb-3.5 overflow-hidden rounded-[18px] bg-white px-8 py-10 text-center"
          >
            <div
              className={`mx-auto flex size-[60px] items-center justify-center rounded-full ${classes.icon}`}
            >
              <StatusIcon status={view.status} />
            </div>
            <p
              className={`mt-5 text-[11px] font-semibold uppercase leading-none tracking-[1.2px] ${classes.badge}`}
            >
              {view.badge}
            </p>
            <h1 className="mt-2 font-serif text-[30px] font-semibold leading-[1.2] tracking-normal text-[#1a3c34]">
              {view.headline}
            </h1>
            <p className="mx-auto mt-3 max-w-[340px] text-[14px] leading-[1.7] text-[#52525b]">
              {view.message}
            </p>
          </article>

          {view.steps.length > 0 ? (
            <article className="mb-3.5 overflow-hidden rounded-[18px] bg-white px-7 py-6">
              <p className="mb-[18px] text-[10px] font-semibold uppercase leading-none tracking-[1.2px] text-[#71717a]">
                {copy[locale].stepsTitle}
              </p>
              <ol className="space-y-0">
                {view.steps.map((step, index) => (
                  <li className="grid grid-cols-[30px_1fr] gap-4" key={step.title}>
                    <div className="flex w-[30px] flex-col items-center">
                      <span
                        className={`flex size-[30px] items-center justify-center rounded-full text-[12px] font-semibold ${
                          index === 0
                            ? "bg-[#1a6b4a] text-white"
                            : "bg-[#e6f5ee] text-[#1a6b4a]"
                        }`}
                      >
                        {index + 1}
                      </span>
                      {index < view.steps.length - 1 ? (
                        <span className="mt-1 h-full min-h-[22px] w-[1.5px] bg-[#d1fae5]" />
                      ) : null}
                    </div>
                    <div className={index === view.steps.length - 1 ? "pt-[5px]" : "pb-5 pt-[5px]"}>
                      <p className="text-[14px] font-medium leading-tight text-[#1a3c34]">
                        {step.title}
                      </p>
                      <p className="mt-[3px] text-[13px] leading-[1.55] text-[#71717a]">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ) : null}

          {view.receiptSummary ? (
            <article className="mb-3.5 flex flex-col gap-3 overflow-hidden rounded-[18px] bg-white px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase leading-none tracking-[1.2px] text-[#71717a]">
                  {view.receiptTitle}
                </p>
                <p className="text-[14px] font-medium leading-snug text-[#1a3c34]">
                  {view.receiptSummary}
                </p>
              </div>
              {view.catalogueFitLabel ? (
                <span className="w-fit shrink-0 rounded-lg bg-[#f0f9f4] px-3.5 py-[7px] text-[11px] font-semibold leading-none text-[#1a6b4a]">
                  {view.catalogueFitLabel}
                </span>
              ) : null}
            </article>
          ) : null}

          <Link
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#1a3c34] px-7 py-4 text-center text-[15px] font-medium normal-case tracking-[0.2px] text-white transition hover:bg-[#15302b]"
            data-bpm-event="payment_confirmation_cta_clicked"
            data-bpm-status={view.status}
            data-bpm-target={view.destination}
            href={view.destination}
          >
            {view.ctaLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>

          {view.emailNote ? (
            <p className="text-center text-[12px] text-[#a1a1aa]">
              {view.emailNote}
            </p>
          ) : null}
        </div>
      </main>
      <PaymentConfirmationFooter locale={locale} />
    </div>
  );
}
