import type { Metadata } from "next";
import Image from "next/image";
import { LivingProtocolLineCta } from "@/components/living-protocol-line-cta";
import { BookmarkTrackingButton } from "@/components/retail-checkout/bookmark-tracking-button";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { formatCurrencyAmount } from "@/lib/currencies";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getTrackingOrderByReference } from "@/lib/retail-product-checkout";

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

const orderTrackingCopy = {
  en: {
    address: "Delivery address",
    bookmark: "Bookmark tracking page",
    bookmarkCopied: "Tracking link copied",
    carrier: "Carrier",
    customer: "Customer",
    eta: "Estimated arrival",
    footer:
      "MattaNutra x Delight Pharmacy - Your personalized nutrition, delivered with care.",
    invalidBody:
      "This tracking link is missing or no longer valid. Please use the link from your confirmation message, or contact Delight Pharmacy for help.",
    invalidTitle: "We could not open this tracking link",
    lastUpdated: "Last updated",
    order: "Order",
    paid: "Payment received",
    preparing: "Pharmacy preparing",
    questions:
      "This page is secure and unique to your order. Keep it bookmarked for updates.",
    retailer: "Pharmacy",
    shipped: "Out for delivery",
    shipment: "Shipment",
    shipmentPending:
      "Your order is on the way. Delight Pharmacy will update this page if courier tracking becomes available.",
    status: "Status",
    subtotal: "Paid total",
    subtitle:
      "Your order is confirmed. Bookmark this page for pharmacy updates and delivery progress.",
    timeline: "Order timeline",
    title: "Your Order",
    trackShipment: "Track shipment",
    trackingNumber: "Tracking number",
    yourItems: "Your Items",
    metadataTitle: "Track Your Order | MattaNutra"
  },
  th: {
    address: "ที่อยู่จัดส่ง",
    bookmark: "บันทึกหน้าติดตาม",
    bookmarkCopied: "คัดลอกลิงก์ติดตามแล้ว",
    carrier: "ผู้ให้บริการขนส่ง",
    customer: "ลูกค้า",
    eta: "เวลาถึงโดยประมาณ",
    footer:
      "MattaNutra x Delight Pharmacy - โภชนาการเฉพาะบุคคล ส่งถึงคุณอย่างใส่ใจ",
    invalidBody:
      "ลิงก์ติดตามนี้ไม่ครบถ้วนหรือไม่สามารถใช้งานได้แล้ว โปรดใช้ลิงก์จากข้อความยืนยัน หรือติดต่อ Delight Pharmacy เพื่อขอความช่วยเหลือ",
    invalidTitle: "ไม่สามารถเปิดลิงก์ติดตามนี้ได้",
    lastUpdated: "อัปเดตล่าสุด",
    order: "คำสั่งซื้อ",
    paid: "รับชำระเงินแล้ว",
    preparing: "ร้านขายยากำลังเตรียมสินค้า",
    questions:
      "หน้านี้ปลอดภัยและผูกกับคำสั่งซื้อของคุณโดยเฉพาะ โปรดบันทึกหน้านี้ไว้เพื่อติดตามอัปเดต",
    retailer: "ร้านขายยา",
    shipped: "กำลังจัดส่ง",
    shipment: "การจัดส่ง",
    shipmentPending:
      "คำสั่งซื้อของคุณกำลังจัดส่ง Delight Pharmacy จะอัปเดตหน้านี้หากมีลิงก์ติดตามพัสดุ",
    status: "สถานะ",
    subtotal: "ยอดชำระ",
    subtitle:
      "คำสั่งซื้อของคุณได้รับการยืนยันแล้ว โปรดบันทึกหน้านี้เพื่อติดตามอัปเดตจากร้านขายยาและการจัดส่ง",
    timeline: "ไทม์ไลน์คำสั่งซื้อ",
    title: "คำสั่งซื้อของคุณ",
    trackShipment: "ติดตามพัสดุ",
    trackingNumber: "หมายเลขติดตาม",
    yourItems: "รายการของคุณ",
    metadataTitle: "ติดตามคำสั่งซื้อ | MattaNutra"
  },
  "zh-CN": {
    address: "配送地址",
    bookmark: "收藏追踪页面",
    bookmarkCopied: "追踪链接已复制",
    carrier: "承运商",
    customer: "客户",
    eta: "预计送达",
    footer: "MattaNutra x Delight Pharmacy - 你的个性化营养方案，安心送达。",
    invalidBody:
      "这个追踪链接缺失或已失效。请使用确认消息中的链接，或联系 Delight Pharmacy 获取帮助。",
    invalidTitle: "无法打开此追踪链接",
    lastUpdated: "最后更新",
    order: "订单",
    paid: "已收到付款",
    preparing: "药房正在准备",
    questions: "此页面安全且仅对应你的订单。请收藏此页面以查看更新。",
    retailer: "药房",
    shipped: "你的订单正在配送中",
    shipment: "配送",
    shipmentPending:
      "你的订单正在配送中。如果有快递追踪信息，Delight Pharmacy 会更新此页面。",
    status: "状态",
    subtotal: "支付总额",
    subtitle: "你的订单已确认。请收藏此页面，查看药房更新和配送进度。",
    timeline: "订单时间线",
    title: "你的订单",
    trackShipment: "追踪配送",
    trackingNumber: "追踪号",
    yourItems: "你的商品",
    metadataTitle: "追踪你的订单 | MattaNutra"
  }
} satisfies Record<Locale, Record<string, string>>;

const customerOrderStatusLabels: Record<Locale, Partial<Record<string, string>>> = {
  en: {
    allocated: "Preparing",
    awaiting_stock: "Order processing",
    cancelled: "Cancelled",
    delivered: "Delivered",
    packed: "Ready to ship",
    picking: "Preparing",
    pickup_booked: "Pickup booked",
    placed: "Confirmed",
    returned: "Returned",
    shipped: "Out for delivery"
  },
  th: {
    allocated: "กำลังเตรียมสินค้า",
    awaiting_stock: "กำลังดำเนินการคำสั่งซื้อ",
    cancelled: "ยกเลิกแล้ว",
    delivered: "จัดส่งสำเร็จ",
    packed: "พร้อมจัดส่ง",
    picking: "กำลังเตรียมสินค้า",
    pickup_booked: "จองรับพัสดุแล้ว",
    placed: "ยืนยันแล้ว",
    returned: "คืนสินค้าแล้ว",
    shipped: "กำลังจัดส่ง"
  },
  "zh-CN": {
    allocated: "准备中",
    awaiting_stock: "订单处理中",
    cancelled: "已取消",
    delivered: "已送达",
    packed: "准备发货",
    picking: "准备中",
    pickup_booked: "已预约取件",
    placed: "已确认",
    returned: "已退回",
    shipped: "配送中"
  }
};

function labelClass(locale: Locale) {
  return locale === "zh-CN"
    ? "text-xs font-bold tracking-normal text-[var(--mn-ash)]"
    : "mn-mono-label text-xs font-bold uppercase tracking-[0.16em] text-[var(--mn-ash)]";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addressLines(address: Record<string, unknown>) {
  return [
    text(address.addressLine1),
    text(address.addressLine2),
    [text(address.city), text(address.province), text(address.postalCode)]
      .filter(Boolean)
      .join(", "),
    text(address.country)
  ].filter(Boolean);
}

function formatAmount(locale: Locale, amount: number, currency: string) {
  return formatCurrencyAmount(locale, amount, currency);
}

function statusLabel(locale: Locale, status: string) {
  return customerOrderStatusLabels[locale][status] ?? status.replace(/_/g, " ");
}

function displayOrderStatus(order: Awaited<ReturnType<typeof getTrackingOrderByReference>>) {
  if (!order) {
    return "";
  }

  if (
    order.shipment?.pickupBookedAt &&
    order.status !== "shipped" &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "returned"
  ) {
    return "pickup_booked";
  }

  return order.status;
}

function latestEta(lines: readonly { etaDate: string | null }[]) {
  return lines
    .map((line) => line.etaDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const copy = orderTrackingCopy[locale];

  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false }
  };
}

export default async function CustomerOrderTrackingPage({ params }: Props) {
  const { locale: rawLocale, token } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const copy = orderTrackingCopy[locale];
  const dictionary = getDictionary(locale);
  const order = await getTrackingOrderByReference(token, locale);
  const currentPath = `/${locale}/order/track/${encodeURIComponent(token)}`;

  if (!order) {
    return (
      <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
        <TitleBar
          currentLocale={locale}
          currentPath={currentPath}
          title={dictionary.hero.eyebrow}
        />
        <section className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-6 py-12">
          <div className="rounded-xl bg-[var(--mn-paper)] p-8 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
            <p className={labelClass(locale)}>{copy.order}</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[var(--mn-ink)]">
              {copy.invalidTitle}
            </h1>
            <p className="mt-3 text-[var(--mn-ink-soft)]">{copy.invalidBody}</p>
          </div>
        </section>
        <SiteFooter content={dictionary.footer} locale={locale} />
      </main>
    );
  }

  const eta = latestEta(order.lines);
  const displayStatus = displayOrderStatus(order);
  const timeline = [
    { active: true, label: copy.paid, meta: formatAmount(locale, order.totalAmount, order.currency) },
    { active: true, label: copy.preparing, meta: order.retailerName ?? "Delight Pharmacy" },
    { active: true, label: copy.status, meta: statusLabel(locale, displayStatus) },
    { active: Boolean(eta), label: copy.eta, meta: eta ?? "-" }
  ];

  return (
    <main className="mn-customer-shell flex min-h-screen flex-col bg-background text-foreground">
      <TitleBar
        currentLocale={locale}
        currentPath={currentPath}
        title={dictionary.hero.eyebrow}
      />
      <section className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-8 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className={labelClass(locale)}>{copy.status}</p>
            <h1 className="mt-3 font-serif text-5xl font-medium leading-tight text-[var(--mn-ink)]">
              {copy.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--mn-ink-soft)]">
              {copy.subtitle}
            </p>
          </div>
          <BookmarkTrackingButton
            copiedLabel={copy.bookmarkCopied}
            label={copy.bookmark}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-xl bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--mn-line)] pb-6">
              <div>
                <div className={labelClass(locale)}>{copy.order}</div>
                <div className="mt-1 font-mono text-lg text-[var(--mn-ink)]">
                  {order.orderNumber ?? order.orderId ?? "-"}
                </div>
              </div>
              <div className="rounded-full bg-[var(--mn-mint)] px-4 py-1 text-sm font-bold capitalize text-[var(--mn-teal-deep)]">
                {statusLabel(locale, displayStatus)}
              </div>
            </div>

            <div className="mt-8">
              <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
                {copy.timeline}
              </h2>
              <ol className="mt-5 grid gap-3 sm:grid-cols-4">
                {timeline.map((item, index) => (
                  <li
                    className="rounded-lg bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]"
                    key={`${item.label}:${index}`}
                  >
                    <div
                      className={`mb-3 size-3 rounded-full ${
                        item.active ? "bg-[var(--mn-teal)]" : "bg-[var(--mn-line)]"
                      }`}
                    />
                    <p className="text-sm font-bold text-[var(--mn-ink)]">{item.label}</p>
                    <p className="mt-1 text-xs text-[var(--mn-ink-soft)]">{item.meta}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-8">
              <h2 className={`mb-3 ${labelClass(locale)}`}>{copy.yourItems}</h2>
              <ul className="space-y-3 text-sm">
                {order.lines.map((line) => (
                  <li
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg bg-white px-3 py-3 ring-1 ring-[var(--mn-line)]"
                    key={`${line.productId}:${line.retailSellableProductId ?? "line"}`}
                  >
                    {line.imageUrl ? (
                      <Image
                        alt=""
                        className="size-14 rounded bg-[var(--mn-cream)] object-contain"
                        height={56}
                        src={line.imageUrl}
                        unoptimized={true}
                        width={56}
                      />
                    ) : (
                      <div className="grid size-14 place-items-center rounded bg-[var(--mn-cream)] font-serif text-lg text-[var(--mn-teal-deep)]">
                        MN
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--mn-ink)]">{line.productTitle}</p>
                      <p className="text-xs text-[var(--mn-ink-soft)]">
                        {formatAmount(locale, line.unitPriceAmount, line.currency)}
                        {line.etaDate ? ` · ${copy.eta} ${line.etaDate}` : ""}
                      </p>
                    </div>
                    <div className="font-mono text-sm text-[var(--mn-ink)]">x{line.quantity}</div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
              <dl className="grid gap-4 text-sm">
                <div>
                  <dt className={labelClass(locale)}>{copy.retailer}</dt>
                  <dd className="mt-1 font-semibold text-[var(--mn-ink)]">
                    {order.retailerName ?? "Delight Pharmacy"}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass(locale)}>{copy.customer}</dt>
                  <dd className="mt-1 font-semibold text-[var(--mn-ink)]">
                    {order.customerName ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass(locale)}>{copy.address}</dt>
                  <dd className="mt-1 space-y-1 font-medium text-[var(--mn-ink-soft)]">
                    {addressLines(order.address).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </dd>
                </div>
                <div className="border-t border-[var(--mn-line)] pt-4">
                  <dt className={labelClass(locale)}>{copy.subtotal}</dt>
                  <dd className="mt-1 font-serif text-3xl font-medium text-[var(--mn-ink)]">
                    {formatAmount(locale, order.totalAmount, order.currency)}
                  </dd>
                </div>
              </dl>
            </section>

            {!order.hasActiveLineChannel ? (
              <section className="rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
                <LivingProtocolLineCta
                  locale={locale}
                  planId={order.planId}
                  presentation="inline_qr"
                  retailCustomerOrderId={order.orderId}
                  source="order_tracking"
                />
              </section>
            ) : null}

            {order.shipment || order.status === "shipped" ? (
              <section className="rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
                <h2 className={labelClass(locale)}>{copy.shipment}</h2>
                {order.shipment ? (
                  <div className="mt-3 space-y-3 text-sm">
                    {order.shipment.carrierName ? (
                      <div>
                        <div className="text-xs font-bold text-[var(--mn-ash)]">
                          {copy.carrier}
                        </div>
                        <div className="mt-1 font-semibold text-[var(--mn-ink)]">
                          {order.shipment.carrierName}
                        </div>
                      </div>
                    ) : null}
                    {order.shipment.trackingNumber ? (
                      <div>
                        <div className="text-xs font-bold text-[var(--mn-ash)]">
                          {copy.trackingNumber}
                        </div>
                        <div className="mt-1 font-mono text-sm text-[var(--mn-ink)]">
                          {order.shipment.trackingNumber}
                        </div>
                      </div>
                    ) : null}
                    {order.shipment.trackingUrl ? (
                      <a
                        className="inline-flex rounded-full bg-[var(--mn-teal)] px-4 py-2 text-sm font-bold text-white"
                        href={order.shipment.trackingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {copy.trackShipment}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-[var(--mn-ink-soft)]">
                    {copy.shipmentPending}
                  </p>
                )}
              </section>
            ) : null}

            <section className="rounded-xl bg-[var(--mn-mint)] p-5 ring-1 ring-[var(--mn-line)]">
              <p className="text-sm leading-6 text-[var(--mn-teal-deep)]">
                {copy.questions}
              </p>
              <p className="mt-5 text-xs text-[var(--mn-ink-soft)]">
                {copy.lastUpdated}: {new Date().toLocaleString(locale)}
              </p>
            </section>
          </aside>
        </div>
      </section>
      <SiteFooter content={dictionary.footer} locale={locale} />
    </main>
  );
}
