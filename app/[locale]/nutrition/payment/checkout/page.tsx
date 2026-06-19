import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StripeCheckoutPanel } from "@/components/nutrition-flow/stripe-checkout-panel";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import { isUuid } from "@/lib/assessment-store";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { getNamespace } from "@/lib/i18n-messages";
import { nutritionQuizPath } from "@/lib/nutrition-paths";
import { localizedRouteMetadata } from "@/lib/seo";
import {
  normalizePaymentPlan,
  normalizePaymentSourceSurface,
  paymentPlan,
  stripePublishableKey
} from "@/lib/stripe-payments";

type CheckoutPageProps = Readonly<{
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    plan?: string;
    planId?: string;
    source?: string;
  }>;
}>;

type PaymentCheckoutCopy = Readonly<{
  back: string;
  body: string;
  eyebrow: string;
  title: string;
}>;

function formatPaymentAmount(locale: Locale, amount: number) {
  return new Intl.NumberFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en-US",
    {
      currency: "THB",
      maximumFractionDigits: 0,
      style: "currency"
    }
  ).format(amount);
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: CheckoutPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    routeKey: "paymentCheckout"
  });
}

export default async function PaymentCheckoutPage({
  params,
  searchParams
}: CheckoutPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const query = await searchParams;
  const selectedPlan = normalizePaymentPlan(query.plan);
  const planId =
    typeof query.planId === "string" && isUuid(query.planId)
      ? query.planId
      : null;
  const sourceSurface = normalizePaymentSourceSurface(query.source);

  if (!selectedPlan) {
    redirect(nutritionQuizPath(locale));
  }

  const dictionary = getDictionary(locale);
  const labels = getNamespace<PaymentCheckoutCopy>(locale, "customer.paymentCheckout");
  const plan = paymentPlan(selectedPlan as AssessmentPlan);
  const currentPath = `/${locale}/nutrition/payment/checkout`;

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--mn-teal-deep)]"
          href={nutritionQuizPath(locale, planId ?? undefined)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <div className="mb-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-teal-deep)]">
              {labels.eyebrow}
            </p>
            <h1 className="mn-hero-title mt-4 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)] sm:text-5xl">
              {labels.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--mn-ink-soft)]">
              {labels.body}
            </p>
          </div>
          <div className="rounded-[var(--mn-radius-lg)] border border-[var(--mn-line)] bg-[var(--mn-paper)] p-5">
            <p className="text-sm font-semibold text-[var(--mn-ash)]">
              {plan.name[locale]}
            </p>
            <p className="mt-2 font-serif text-4xl font-medium text-[var(--mn-ink)]">
              {formatPaymentAmount(locale, plan.amountMicros / 1_000_000)}
            </p>
          </div>
        </div>
        <StripeCheckoutPanel
          locale={locale}
          plan={selectedPlan}
          planId={planId}
          publishableKey={stripePublishableKey()}
          sourceSurface={sourceSurface}
        />
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
