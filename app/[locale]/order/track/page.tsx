import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { localizedRouteMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const trackIndexCopy = {
  en: {
    body:
      "You have not ordered yet. After payment, use the tracking link from your confirmation, or enter your order number.",
    eyebrow: "Order tracking",
    orderNumber: "Order number",
    title: "No order to track yet",
    track: "Track order"
  },
  th: {
    body:
      "คุณยังไม่มีคำสั่งซื้อ หลังชำระเงินแล้ว ให้ใช้ลิงก์ติดตามจากข้อความยืนยัน หรือกรอกหมายเลขคำสั่งซื้อ",
    eyebrow: "ติดตามคำสั่งซื้อ",
    orderNumber: "หมายเลขคำสั่งซื้อ",
    title: "ยังไม่มีคำสั่งซื้อให้ติดตาม",
    track: "ติดตามคำสั่งซื้อ"
  },
  "zh-CN": {
    body: "你还没有下单。付款后请使用确认信息中的追踪链接，或输入订单号。",
    eyebrow: "订单追踪",
    orderNumber: "订单号",
    title: "暂无订单可追踪",
    track: "追踪订单"
  }
} satisfies Record<Locale, Record<string, string>>;

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return typeof value === "string" ? value.trim() : "";
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";

  return localizedRouteMetadata({
    indexable: false,
    locale,
    routeKey: "orderTracking"
  });
}

export default async function OrderTrackIndexPage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const query = searchParams ? await searchParams : {};
  const lookup = firstQueryValue(query.order) || firstQueryValue(query.token);
  const copy = trackIndexCopy[locale];
  const dictionary = getDictionary(locale);
  const currentPath = `/${locale}/order/track`;

  if (lookup) {
    redirect(`/${locale}/order/track/${encodeURIComponent(lookup)}`);
  }

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-6 py-12">
        <div className="w-full rounded-xl bg-[var(--mn-paper)] p-8 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
          <p className="mn-mono-label text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--mn-ink)]">
            {copy.title}
          </h1>
          <p className="mt-3 text-[var(--mn-ink-soft)]">{copy.body}</p>
          <form action={currentPath} className="mt-6 grid gap-3" method="get">
            <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)]">
              {copy.orderNumber}
              <input
                autoComplete="off"
                className="rounded-lg border border-[var(--mn-line)] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[var(--mn-teal)]"
                name="order"
                type="text"
              />
            </label>
            <button className="mn-primary-button w-fit" type="submit">
              {copy.track}
            </button>
          </form>
        </div>
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
