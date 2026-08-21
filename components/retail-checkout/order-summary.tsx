import { SafeImage } from "@/components/safe-image";
import { formatCurrencyAmount } from "@/lib/currencies";
import type { Locale } from "@/lib/i18n";
import type {
  ProductBasketProduct,
  ProductBasketQuotePreview
} from "@/components/retail-checkout/product-basket-types";

type OrderSummaryLabels = Readonly<{
  free: string;
  included: string;
  orderSummary: string;
  quantity: string;
  shipping: string;
  subtotal: string;
  tax: string;
  total: string;
  unitPrice?: string;
}>;

export function OrderSummary({
  currency,
  labels,
  locale,
  productsById,
  quotePreview,
  removedItemCount,
  selectedProducts,
  selectedRetailerName,
  shippingAmount,
  subtotal,
  total
}: Readonly<{
  currency: string;
  labels: OrderSummaryLabels;
  locale: Locale;
  productsById: Map<string, ProductBasketProduct>;
  quotePreview: ProductBasketQuotePreview | null;
  removedItemCount: number;
  selectedProducts: readonly ProductBasketProduct[];
  selectedRetailerName: string | null;
  shippingAmount: number;
  subtotal: number;
  total: number;
}>) {
  const lines = quotePreview?.lines ?? [];

  return (
    <section className="sticky top-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[var(--mn-line)]">
      <div>
        <h3 className="font-serif text-2xl font-medium text-[var(--mn-ink)]">
          {labels.orderSummary}
        </h3>
        {selectedRetailerName ? (
          <span className="mt-3 inline-flex rounded-full bg-[var(--mn-mint)] px-3 py-1 text-xs font-bold text-[var(--mn-teal-deep)]">
            {selectedRetailerName}
          </span>
        ) : null}
      </div>
      <div className="mt-4 divide-y divide-[var(--mn-line)]">
        {(lines.length > 0 ? lines : selectedProducts.map((product) => ({
          currency: product.currency ?? currency,
          etaDate: null,
          payable: product.unitPriceAmount != null,
          productId: product.id,
          quantityRequested: 1,
          reason: "",
          selectedRetailerName: null,
          unitPriceAmount: product.unitPriceAmount
        }))).map((line) => {
          const product = productsById.get(line.productId);
          const unitPrice =
            line.unitPriceAmount ?? product?.unitPriceAmount ?? null;
          const quantity = line.quantityRequested || 1;
          const lineTotal =
            unitPrice != null ? unitPrice * quantity : null;
          const lineCurrency = line.currency ?? product?.currency ?? currency;
          const displayName = product?.name?.trim() || "";

          return (
            <div
              className="grid grid-cols-[auto_1fr_auto] gap-3 py-4"
              key={line.productId}
            >
              <SafeImage
                alt=""
                className="size-12 rounded-lg bg-[var(--mn-cream)] object-contain"
                fallback={
                  <div className="grid size-12 place-items-center rounded-lg bg-[var(--mn-cream)] font-serif text-base text-[var(--mn-teal-deep)]">
                    MN
                  </div>
                }
                height={48}
                src={product?.imageUrl}
                width={48}
              />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-[var(--mn-ink)]">
                  {displayName}
                </p>
                <p className="mt-1 text-xs text-[var(--mn-ink-soft)]">
                  {labels.quantity}: {quantity}
                  {unitPrice != null
                    ? ` · ${formatCurrencyAmount(locale, unitPrice, lineCurrency)}`
                    : ""}
                  {line.etaDate ? ` · ETA ${line.etaDate}` : ""}
                  {!line.payable ? ` · ${line.reason}` : ""}
                </p>
              </div>
              <div className="text-right text-sm font-bold text-[var(--mn-ink)]">
                {lineTotal != null
                  ? formatCurrencyAmount(locale, lineTotal, lineCurrency)
                  : ""}
              </div>
            </div>
          );
        })}
      </div>
      {removedItemCount > 0 ? (
        <p className="mt-3 rounded-lg bg-[var(--mn-cream)] p-3 text-xs font-semibold text-[var(--mn-ink-soft)]">
          {removedItemCount} removed recommendation item(s) are excluded from this order.
        </p>
      ) : null}
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.subtotal}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">
            {quotePreview ? formatCurrencyAmount(locale, subtotal, currency) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.shipping}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">
            {quotePreview
              ? shippingAmount > 0
                ? formatCurrencyAmount(locale, shippingAmount, currency)
                : labels.free
              : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.tax}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">{labels.included}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--mn-line)] pt-3 text-lg">
          <dt className="font-bold text-[var(--mn-ink)]">{labels.total}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">
            {quotePreview ? formatCurrencyAmount(locale, total, currency) : "-"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
