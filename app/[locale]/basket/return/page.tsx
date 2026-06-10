import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3
} from "lucide-react";
import { LivingProtocolLineCta } from "@/components/living-protocol-line-cta";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { fulfillRetailCheckoutSession } from "@/lib/retail-product-checkout";

type BasketReturnPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    payment?: string;
    session_id?: string;
  }>;
}>;

const copy = {
  en: {
    action: "View order tracking",
    failed:
      "Payment was not completed, or we could not create the customer order yet.",
    missing: "We could not find a product checkout session on this return link.",
    paid: "Payment received. Your pharmacy order has been created.",
    processing:
      "Payment is still processing. Please check this page again shortly.",
    title: "Product payment status"
  },
  th: {
    action: "ดูการติดตามคำสั่งซื้อ",
    failed:
      "การชำระเงินยังไม่สำเร็จ หรือระบบยังไม่สามารถสร้างคำสั่งซื้อได้",
    missing: "ไม่พบเซสชันชำระเงินสินค้าจากลิงก์นี้",
    paid: "ได้รับการชำระเงินแล้ว และสร้างคำสั่งซื้อร้านขายยาเรียบร้อย",
    processing: "การชำระเงินยังประมวลผลอยู่ โปรดกลับมาตรวจสอบอีกครั้ง",
    title: "สถานะการชำระเงินสินค้า"
  },
  "zh-CN": {
    action: "查看订单追踪",
    failed: "付款未完成，或系统尚未创建客户订单。",
    missing: "无法在此返回链接中找到产品结账会话。",
    paid: "已收到付款，你的药房订单已创建。",
    processing: "付款仍在处理中，请稍后再查看此页面。",
    title: "产品付款状态"
  }
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export default async function BasketReturnPage({
  params,
  searchParams
}: BasketReturnPageProps) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  const labels = copy[locale];
  const dictionary = getDictionary(locale);
  const query = await searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  const paymentId = typeof query.payment === "string" ? query.payment : "";
  let result: Awaited<ReturnType<typeof fulfillRetailCheckoutSession>> | null =
    null;
  let message = "";

  if (sessionId || paymentId) {
    try {
      result = await fulfillRetailCheckoutSession({
        paymentId: paymentId || undefined,
        sessionId: sessionId || undefined
      });
    } catch (error) {
      message = error instanceof Error ? error.message : labels.failed;
    }
  } else {
    message = labels.missing;
  }

  const success = result?.status === "fulfilled";
  const processing = result?.status === "processing";
  const Icon = success ? CheckCircle2 : processing ? Clock3 : AlertTriangle;
  const tone = success
    ? "bg-[var(--mn-mint)] text-[var(--mn-teal-deep)]"
    : processing
      ? "bg-[var(--mn-gold-tint)] text-[var(--mn-gold)]"
      : "bg-[var(--mn-error-soft)] text-[var(--mn-error)]";

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={`/${locale}/basket/return`}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16 sm:px-8">
        <article className="mn-v11-card w-full text-center">
          <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${tone}`}>
            <Icon aria-hidden className="size-8" />
          </div>
          <h1 className="mn-hero-title mt-6 font-serif text-4xl font-medium leading-tight text-[var(--mn-ink)]">
            {labels.title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[var(--mn-ink-soft)]">
            {message || (success ? labels.paid : processing ? labels.processing : labels.failed)}
          </p>
          {result?.destination ? (
            <Link className="mn-primary-button mx-auto mt-8 w-fit" href={result.destination}>
              {labels.action}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : null}
          {result?.planId ? (
            <LivingProtocolLineCta
              className="mx-auto mt-8 max-w-xl"
              locale={locale}
              planId={result.planId}
              retailCustomerOrderId={result.orderId}
              source="basket_return"
            />
          ) : null}
        </article>
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
