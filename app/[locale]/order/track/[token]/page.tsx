import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const dict = getDictionary(locale);

  return {
    title: `Track Your Order | ${dict.meta?.title ?? "MattaNutra"}`,
    robots: { index: false, follow: false }, // Do not index tracking pages
  };
}

export default async function CustomerOrderTrackingPage({ params }: Props) {
  const { locale: rawLocale, token } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  // In a real implementation:
  // 1. Validate + decode the token (signed JWT or DB-backed one-time token)
  // 2. Load fulfillment_order + latest status + key events
  // 3. Emit a BPM view event (non-sensitive)
  //
  // For now this is a skeleton that demonstrates the shape.

  if (!token || token.length < 20) {
    notFound();
  }

  // Placeholder: In production this would come from DB via a secure lookup
  const mockOrder = {
    id: "demo-order-123",
    status: "shipped" as const,
    statusLabel: "Shipped by Dream Pharmacy",
    shippedAt: new Date().toISOString(),
    trackingNumber: "TH1234567890",
    carrier: "Thailand Post",
    estimatedDelivery: "2026-06-18",
    items: ["Personalized Daily Multivitamin Pack", "Omega-3 Support"],
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
        <h1 className="text-3xl font-semibold tracking-tight">Your Order is on the Way</h1>
        <p className="mt-2 text-muted-foreground">
          Thank you for trusting MattaNutra and our partner pharmacist at Dream Pharmacy.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center justify-between border-b pb-6">
          <div>
            <div className="text-sm uppercase tracking-widest text-muted-foreground">Order</div>
            <div className="font-mono text-lg">{mockOrder.id}</div>
          </div>
          <div className="rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            {mockOrder.statusLabel}
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Shipment Details
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Carrier</dt>
                <dd className="font-medium">{mockOrder.carrier}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tracking Number</dt>
                <dd className="font-mono font-medium">{mockOrder.trackingNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estimated Delivery</dt>
                <dd className="font-medium">{mockOrder.estimatedDelivery}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Your Items
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
          Last updated: {new Date(mockOrder.lastUpdated).toLocaleString(locale)}
          <br />
          This page is secure and unique to your order. For questions, reply to your original confirmation email
          or contact Dream Pharmacy directly.
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        MattaNutra × Dream Pharmacy — Your personalized nutrition, delivered with care.
      </p>
    </main>
  );
}
