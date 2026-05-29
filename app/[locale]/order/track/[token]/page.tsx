import type { Metadata } from "next";
import { isLocale, type Locale } from "@/lib/i18n";
import { writeFulfillmentBpmEvent } from "@/lib/fulfillment-bpm";

/**
 * Public / semi-public customer order tracking page.
 *
 * Accessible via a secure token shared by Dream Pharmacy or MattaNutra.
 * Example URL: /en/order/track/eyJ...token... (signed or time-limited)
 *
 * This page must remain lightweight and trustworthy.
 */

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

const orderTrackingCopy = {
  en: {
    carrier: "Carrier",
    estimatedDelivery: "Estimated Delivery",
    footer:
      "MattaNutra x Dream Pharmacy - Your personalized nutrition, delivered with care.",
    invalidBody:
      "This tracking link is missing or no longer valid. Please use the link from your confirmation message, or contact Dream Pharmacy for help.",
    invalidTitle: "We could not open this tracking link",
    lastUpdated: "Last updated",
    questions:
      "This page is secure and unique to your order. For questions, reply to your original confirmation email or contact Dream Pharmacy directly.",
    shipmentDetails: "Shipment Details",
    statusLabel: "Shipped by Dream Pharmacy",
    subtitle:
      "Thank you for trusting MattaNutra and our partner pharmacist at Dream Pharmacy.",
    title: "Your Order is on the Way",
    trackingNumber: "Tracking Number",
    yourItems: "Your Items",
    order: "Order",
    metadataTitle: "Track Your Order | MattaNutra",
    items: ["Personalized Daily Multivitamin Pack", "Omega-3 Support"]
  },
  th: {
    carrier: "ผู้ให้บริการจัดส่ง",
    estimatedDelivery: "คาดว่าจะได้รับ",
    footer:
      "MattaNutra x Dream Pharmacy - โภชนาการเฉพาะบุคคล ส่งถึงคุณอย่างใส่ใจ",
    invalidBody:
      "ลิงก์ติดตามนี้ไม่ครบถ้วนหรือไม่สามารถใช้งานได้แล้ว โปรดใช้ลิงก์จากข้อความยืนยัน หรือติดต่อ Dream Pharmacy เพื่อขอความช่วยเหลือ",
    invalidTitle: "ไม่สามารถเปิดลิงก์ติดตามนี้ได้",
    lastUpdated: "อัปเดตล่าสุด",
    questions:
      "หน้านี้ปลอดภัยและผูกกับคำสั่งซื้อของคุณโดยเฉพาะ หากมีคำถาม โปรดตอบกลับอีเมลยืนยันเดิมหรือติดต่อ Dream Pharmacy โดยตรง",
    shipmentDetails: "รายละเอียดการจัดส่ง",
    statusLabel: "จัดส่งโดย Dream Pharmacy แล้ว",
    subtitle:
      "ขอบคุณที่ไว้วางใจ MattaNutra และเภสัชกรพาร์ทเนอร์ของเราที่ Dream Pharmacy",
    title: "คำสั่งซื้อของคุณกำลังจัดส่ง",
    trackingNumber: "หมายเลขติดตามพัสดุ",
    yourItems: "รายการของคุณ",
    order: "คำสั่งซื้อ",
    metadataTitle: "ติดตามคำสั่งซื้อ | MattaNutra",
    items: ["แพ็กวิตามินรวมประจำวันเฉพาะบุคคล", "Omega-3 Support"]
  },
  "zh-CN": {
    carrier: "承运商",
    estimatedDelivery: "预计送达",
    footer: "MattaNutra x Dream Pharmacy - 你的个性化营养方案，安心送达。",
    invalidBody:
      "这个追踪链接缺失或已失效。请使用确认消息中的链接，或联系 Dream Pharmacy 获取帮助。",
    invalidTitle: "无法打开此追踪链接",
    lastUpdated: "最后更新",
    questions:
      "此页面安全且仅对应你的订单。如有问题，请回复原始确认邮件，或直接联系 Dream Pharmacy。",
    shipmentDetails: "配送详情",
    statusLabel: "Dream Pharmacy 已发货",
    subtitle:
      "感谢你信任 MattaNutra 以及我们的合作药师 Dream Pharmacy。",
    title: "你的订单正在配送中",
    trackingNumber: "追踪编号",
    yourItems: "你的商品",
    order: "订单",
    metadataTitle: "追踪你的订单 | MattaNutra",
    items: ["个性化每日复合维生素包", "Omega-3 支持"]
  }
} satisfies Record<Locale, {
  carrier: string;
  estimatedDelivery: string;
  footer: string;
  invalidBody: string;
  invalidTitle: string;
  items: string[];
  lastUpdated: string;
  metadataTitle: string;
  order: string;
  questions: string;
  shipmentDetails: string;
  statusLabel: string;
  subtitle: string;
  title: string;
  trackingNumber: string;
  yourItems: string;
}>;

function labelClass(locale: Locale) {
  return locale === "zh-CN"
    ? "text-sm font-semibold tracking-normal text-muted-foreground"
    : "text-sm font-semibold uppercase tracking-widest text-muted-foreground";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const copy = orderTrackingCopy[locale];

  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false }, // Do not index tracking pages
  };
}

export default async function CustomerOrderTrackingPage({ params }: Props) {
  const { locale: rawLocale, token } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const copy = orderTrackingCopy[locale];

  // In a real implementation:
  // 1. Validate + decode the token (signed JWT or DB-backed one-time token)
  // 2. Load fulfillment_order + latest status + key events
  // 3. Emit a BPM view event (non-sensitive)
  //
  // For now this is a skeleton that demonstrates the shape.

  if (!token || token.length < 20) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className={labelClass(locale)}>{copy.order}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            {copy.invalidTitle}
          </h1>
          <p className="mt-3 text-muted-foreground">{copy.invalidBody}</p>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {copy.footer}
        </p>
      </main>
    );
  }

  // Placeholder: In production this would come from DB via a secure lookup
  const mockOrder = {
    id: "demo-order-123",
    status: "shipped" as const,
    statusLabel: copy.statusLabel,
    shippedAt: new Date().toISOString(),
    trackingNumber: "TH1234567890",
    carrier: "Thailand Post",
    estimatedDelivery: "2026-06-18",
    items: copy.items,
    lastUpdated: new Date().toISOString(),
  };

  // Record that a customer viewed their tracking page (great observability signal)
  await writeFulfillmentBpmEvent({
    fulfillmentOrderId: mockOrder.id,
    eventName: "order_tracking_viewed",
    eventStatus: mockOrder.status,
    properties: {
      tokenPrefix: token.slice(0, 8),
      hasTracking: !!mockOrder.trackingNumber,
    },
    locale,
  }).catch(() => {
    /* non-fatal */
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {copy.subtitle}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center justify-between border-b pb-6">
          <div>
            <div className={labelClass(locale)}>
              {copy.order}
            </div>
            <div className="font-mono text-lg">{mockOrder.id}</div>
          </div>
          <div className="rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            {mockOrder.statusLabel}
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className={`mb-3 ${labelClass(locale)}`}>
              {copy.shipmentDetails}
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{copy.carrier}</dt>
                <dd className="font-medium">{mockOrder.carrier}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{copy.trackingNumber}</dt>
                <dd className="font-mono font-medium">{mockOrder.trackingNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{copy.estimatedDelivery}</dt>
                <dd className="font-medium">{mockOrder.estimatedDelivery}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className={`mb-3 ${labelClass(locale)}`}>
              {copy.yourItems}
            </h2>
            <ul className="space-y-2 text-sm">
              {mockOrder.items.map((item, i) => (
                <li key={i} className="rounded border px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          {copy.lastUpdated}: {new Date(mockOrder.lastUpdated).toLocaleString(locale)}
          <br />
          {copy.questions}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        {copy.footer}
      </p>
    </main>
  );
}
