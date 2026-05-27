import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  XCircle
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import {
  fulfillCheckoutSession,
  paymentReturnDestination
} from "@/lib/stripe-payments";

type PaymentReturnPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    session_id?: string;
  }>;
}>;

const copy = {
  en: {
    action: "Continue",
    failed:
      "The payment was not completed. You can return to checkout or contact support if money has left your account.",
    fulfillmentFailed:
      "Payment was received, but plan preparation needs a retry. We have logged this for review.",
    missing: "We could not find a payment session on this return link.",
    paid:
      "Payment received. Your plan is now being prepared and this page will point you to the next step.",
    paidReservation:
      "Payment received. Continue your assessment and we will connect this payment to your plan automatically.",
    processing:
      "Stripe is still processing this payment. This can happen with some payment methods. Please check back shortly.",
    title: "Payment status"
  },
  th: {
    action: "ดำเนินการต่อ",
    failed:
      "การชำระเงินยังไม่สำเร็จ คุณสามารถกลับไปชำระเงินใหม่หรือติดต่อทีมงานหากมีการหักเงินแล้ว",
    fulfillmentFailed:
      "เราได้รับการชำระเงินแล้ว แต่การเตรียมแผนต้องลองใหม่ ระบบได้บันทึกไว้เพื่อตรวจสอบ",
    missing: "ไม่พบข้อมูลเซสชันการชำระเงินจากลิงก์นี้",
    paid:
      "ได้รับการชำระเงินแล้ว แผนของคุณกำลังเตรียมอยู่ และหน้านี้จะพาคุณไปขั้นตอนถัดไป",
    paidReservation:
      "ได้รับการชำระเงินแล้ว ทำแบบประเมินต่อ แล้วระบบจะเชื่อมการชำระเงินกับแผนของคุณอัตโนมัติ",
    processing:
      "Stripe ยังประมวลผลการชำระเงินอยู่ ซึ่งอาจเกิดขึ้นได้กับบางวิธีชำระเงิน โปรดกลับมาตรวจสอบอีกครั้ง",
    title: "สถานะการชำระเงิน"
  }
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

function statusView(
  status: "error" | "expired" | "paid_reservation" | "paid_with_plan" | "processing",
  locale: Locale,
  messageOverride?: string
) {
  const labels = copy[locale];

  if (status === "paid_with_plan") {
    return {
      icon: CheckCircle2,
      message: messageOverride ?? labels.paid,
      tone: "success"
    };
  }

  if (status === "paid_reservation") {
    return {
      icon: CheckCircle2,
      message: messageOverride ?? labels.paidReservation,
      tone: "success"
    };
  }

  if (status === "processing") {
    return {
      icon: Clock3,
      message: messageOverride ?? labels.processing,
      tone: "pending"
    };
  }

  if (status === "expired") {
    return {
      icon: XCircle,
      message: messageOverride ?? labels.failed,
      tone: "error"
    };
  }

  return {
    icon: AlertTriangle,
    message: messageOverride ?? labels.fulfillmentFailed,
    tone: "error"
  };
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
  const dictionary = getDictionary(locale);
  const labels = copy[locale];
  const query = await searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  let result: Awaited<ReturnType<typeof fulfillCheckoutSession>> | null = null;
  let failureMessage = "";

  if (sessionId) {
    try {
      result = await fulfillCheckoutSession(sessionId, {
        source: "return_page"
      });
    } catch (error) {
      failureMessage =
        error instanceof Error ? error.message : labels.fulfillmentFailed;
    }
  } else {
    failureMessage = labels.missing;
  }

  const view = statusView(
    result?.status ?? "error",
    locale,
    failureMessage || undefined
  );
  const Icon = view.icon;
  const destination = paymentReturnDestination(locale, result?.payment ?? null);

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/nutrition/payment/return`}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16 sm:px-8">
        <article className="mn-v11-card w-full text-center">
          <div
            className={
              view.tone === "success"
                ? "mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
                : view.tone === "pending"
                  ? "mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--mn-gold-tint)] text-[var(--mn-gold)]"
                  : "mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--mn-error-soft)] text-[var(--mn-error)]"
            }
          >
            <Icon aria-hidden className="size-8" />
          </div>
          <h1 className="mn-hero-title mt-6 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)]">
            {labels.title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[var(--mn-ink-soft)]">
            {view.message}
          </p>
          <Link className="mn-primary-button mx-auto mt-8 w-fit" href={destination}>
            {labels.action}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </article>
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
