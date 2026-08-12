import type { Metadata } from "next";
import { LivingProtocolLineCta } from "@/components/living-protocol-line-cta";
import { BookmarkTrackingButton } from "@/components/retail-checkout/bookmark-tracking-button";
import { SafeImage } from "@/components/safe-image";
import { SiteFooter } from "@/components/site-footer";
import { TitleBar } from "@/components/title-bar";
import { formatCurrencyAmount } from "@/lib/currencies";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { getTrackingOrderByReference } from "@/lib/retail-product-checkout";
import { localizedRouteMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

const orderTrackingCopy = {
  en: {
    address: "Delivery address",
    bookmark: "Bookmark tracking page",
    bookmarkCopied: "Tracking link copied",
    bookmarkCopyLink: "Copy tracking link",
    bookmarkHintDesktop:
      "Press {shortcut} to bookmark this page in your browser. You can also copy the link below.",
    bookmarkHintMobile:
      "Use your browser Share menu → Add Bookmark (or Add to Home Screen) to save this page. You can also copy the link below.",
    carrier: "Carrier",
    customer: "Customer",
    footer:
      "MattaNutra x your retail partner - Your personalized nutrition, delivered with care.",
    invalidBody:
      "This tracking link is missing or no longer valid. Please use the link from your confirmation message, or contact your retail partner for help.",
    invalidTitle: "We could not open this tracking link",
    lastUpdated: "Last updated",
    lineConnectedBody:
      "You are connected on LINE. Pharmacy and delivery updates for this order will be sent through your LINE chat when status changes.",
    lineConnectedTitle: "LINE updates on",
    order: "Order",
    paid: "Payment received",
    preparing: "Pharmacy preparing",
    questions:
      "This page is secure and unique to your order. Keep it bookmarked for updates.",
    retailer: "Pharmacy",
    shipped: "Out for delivery",
    shipment: "Shipment",
    shipmentPending:
      "Your order is on the way. Your retail partner will update this page if courier tracking becomes available.",
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
    bookmarkCopyLink: "คัดลอกลิงก์ติดตาม",
    bookmarkHintDesktop:
      "กด {shortcut} เพื่อบันทึกหน้านี้ในเบราว์เซอร์ หรือคัดลอกลิงก์ด้านล่าง",
    bookmarkHintMobile:
      "ใช้เมนูแชร์ของเบราว์เซอร์ → เพิ่มบุ๊กมาร์ก (หรือเพิ่มไปยังหน้าจอหลัก) เพื่อบันทึกหน้านี้ หรือคัดลอกลิงก์ด้านล่าง",
    carrier: "ผู้ให้บริการขนส่ง",
    customer: "ลูกค้า",
    footer:
      "MattaNutra x พาร์ทเนอร์ร้านค้าของคุณ - โภชนาการเฉพาะบุคคล ส่งถึงคุณอย่างใส่ใจ",
    invalidBody:
      "ลิงก์ติดตามนี้ไม่ครบถ้วนหรือไม่สามารถใช้งานได้แล้ว โปรดใช้ลิงก์จากข้อความยืนยัน หรือติดต่อพาร์ทเนอร์ร้านค้าของคุณเพื่อขอความช่วยเหลือ",
    invalidTitle: "ไม่สามารถเปิดลิงก์ติดตามนี้ได้",
    lastUpdated: "อัปเดตล่าสุด",
    lineConnectedBody:
      "คุณเชื่อมต่อ LINE แล้ว อัปเดตจากร้านขายยาและการจัดส่งของคำสั่งซื้อนี้จะถูกส่งผ่านแชท LINE เมื่อสถานะเปลี่ยน",
    lineConnectedTitle: "อัปเดตผ่าน LINE",
    order: "คำสั่งซื้อ",
    paid: "รับชำระเงินแล้ว",
    preparing: "ร้านขายยากำลังเตรียมสินค้า",
    questions:
      "หน้านี้ปลอดภัยและผูกกับคำสั่งซื้อของคุณโดยเฉพาะ โปรดบันทึกหน้านี้ไว้เพื่อติดตามอัปเดต",
    retailer: "ร้านขายยา",
    shipped: "กำลังจัดส่ง",
    shipment: "การจัดส่ง",
    shipmentPending:
      "คำสั่งซื้อของคุณกำลังจัดส่ง พาร์ทเนอร์ร้านค้าของคุณจะอัปเดตหน้านี้หากมีลิงก์ติดตามพัสดุ",
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
    bookmarkCopyLink: "复制追踪链接",
    bookmarkHintDesktop: "按 {shortcut} 将此页加入浏览器书签。你也可以复制下方链接。",
    bookmarkHintMobile:
      "使用浏览器的分享菜单 → 添加书签（或添加到主屏幕）保存此页。你也可以复制下方链接。",
    carrier: "承运商",
    customer: "客户",
    footer: "MattaNutra x 你的零售伙伴 - 你的个性化营养方案，安心送达。",
    invalidBody:
      "这个追踪链接缺失或已失效。请使用确认消息中的链接，或联系你的零售伙伴获取帮助。",
    invalidTitle: "无法打开此追踪链接",
    lastUpdated: "最后更新",
    lineConnectedBody:
      "你已连接 LINE。订单的药房与配送更新会在状态变化时通过 LINE 聊天发送。",
    lineConnectedTitle: "已开启 LINE 更新",
    order: "订单",
    paid: "已收到付款",
    preparing: "药房正在准备",
    questions: "此页面安全且仅对应你的订单。请收藏此页面以查看更新。",
    retailer: "药房",
    shipped: "配送中",
    shipment: "配送",
    shipmentPending:
      "你的订单正在配送中。如果有快递追踪信息，你的零售伙伴会更新此页面。",
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

/** Cumulative customer timeline milestones — dots only light when that stage is reached. */
function trackingTimelineActive(status: string) {
  if (status === "cancelled") {
    return { paid: true, preparing: false, shipped: false };
  }

  const preparingStatuses = new Set([
    "placed",
    "awaiting_stock",
    "allocated",
    "picking",
    "packed",
    "pickup_booked",
    "shipped",
    "delivered",
    "returned"
  ]);
  const shippedStatuses = new Set(["shipped", "delivered", "returned"]);

  return {
    paid: true,
    preparing: preparingStatuses.has(status),
    shipped: shippedStatuses.has(status)
  };
}

function buildOrderTrackingTimeline(input: Readonly<{
  copy: (typeof orderTrackingCopy)[Locale];
  displayStatus: string;
  locale: Locale;
  retailerName: string;
  totalAmount: number;
  currency: string;
}>) {
  const active = trackingTimelineActive(input.displayStatus);

  return [
    {
      active: active.paid,
      label: input.copy.paid,
      meta: formatAmount(input.locale, input.totalAmount, input.currency)
    },
    {
      active: active.preparing,
      label: input.copy.preparing,
      meta: input.retailerName
    },
    {
      active: active.shipped,
      label: input.copy.shipped,
      meta: statusLabel(input.locale, input.displayStatus)
    }
  ];
}

// Personal order tracking — never cache at the route layer.
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

  const displayStatus = displayOrderStatus(order);
  const retailerName = order.retailerName ?? copy.retailer.toLowerCase();
  const timeline = buildOrderTrackingTimeline({
    copy,
    currency: order.currency,
    displayStatus,
    locale,
    retailerName,
    totalAmount: order.totalAmount
  });

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
            copyLinkLabel={copy.bookmarkCopyLink}
            hintDesktop={copy.bookmarkHintDesktop}
            hintMobile={copy.bookmarkHintMobile}
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
              <ol className="mt-5 grid gap-3 sm:grid-cols-3">
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
                    <SafeImage
                      alt=""
                      className="size-14 rounded bg-[var(--mn-cream)] object-contain"
                      fallback={
                        <div className="grid size-14 place-items-center rounded bg-[var(--mn-cream)] font-serif text-lg text-[var(--mn-teal-deep)]">
                          MN
                        </div>
                      }
                      height={56}
                      src={line.imageUrl}
                      width={56}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--mn-ink)]">{line.productTitle}</p>
                      <p className="text-xs text-[var(--mn-ink-soft)]">
                        {formatAmount(locale, line.unitPriceAmount, line.currency)}
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
                    {retailerName}
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
                  showEyebrow={false}
                  source="order_tracking"
                />
              </section>
            ) : (
              <section className="rounded-xl bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-card)] ring-1 ring-[var(--mn-line)]">
                <p className={labelClass(locale)}>{copy.lineConnectedTitle}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {copy.lineConnectedBody}
                </p>
              </section>
            )}

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
