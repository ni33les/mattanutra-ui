import Image from "next/image";
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
          currency,
          etaDate: null,
          payable: true,
          productId: product.id,
          quantityRequested: 1,
          reason: "",
          selectedRetailerName: null,
          unitPriceAmount: null
        }))).map((line) => {
          const product = productsById.get(line.productId);
          const amount = (line.unitPriceAmount ?? 0) * line.quantityRequested;

          return (
            <div
              className="grid grid-cols-[auto_1fr_auto] gap-3 py-4"
              key={line.productId}
            >
              {product?.imageUrl ? (
                <Image
                  alt=""
                  className="size-12 rounded-lg bg-[var(--mn-cream)] object-contain"
                  height={48}
                  src={product.imageUrl}
                  width={48}
                />
              ) : (
                <div className="grid size-12 place-items-center rounded-lg bg-[var(--mn-cream)] font-serif text-base text-[var(--mn-teal-deep)]">
                  MN
                </div>
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-[var(--mn-ink)]">
                  {product?.name ?? "Product"}
                </p>
                <p className="mt-1 text-xs text-[var(--mn-ink-soft)]">
                  {labels.quantity}: {line.quantityRequested}
                  {line.etaDate ? ` · ETA ${line.etaDate}` : ""}
                  {!line.payable ? ` · ${line.reason}` : ""}
                </p>
              </div>
              <div className="text-right text-sm font-bold text-[var(--mn-ink)]">
                {line.unitPriceAmount !== null
                  ? formatCurrencyAmount(locale, amount, line.currency ?? currency)
                  : "-"}
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
