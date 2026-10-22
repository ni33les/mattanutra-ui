"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ShieldCheck, Store } from "lucide-react";
import styles from "./order-summary.module.css";
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
  variant = "default",
  editHref,
  hideShipping = false,
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
  variant?: "default" | "web";
  editHref?: string;
  hideShipping?: boolean;
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

  if (variant === "web") {
    return <WebOrderSummary {...{ currency, editHref, hideShipping, labels, locale, productsById, quotePreview, removedItemCount, selectedProducts, selectedRetailerName, shippingAmount, subtotal, total }} />;
  }

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
        {!hideShipping && <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.shipping}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">
            {quotePreview
              ? shippingAmount > 0
                ? formatCurrencyAmount(locale, shippingAmount, currency)
                : labels.free
              : "-"}
          </dd>
        </div>}
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


const webSummaryCopy = {
  en: {
    title: "Your order",
    edit: "Edit order",
    caption: "{count} selected products · Delivery included in total",
    products: "Products",
    taxNote: "Delivery is included in the total shown before payment.",
    reassurance: "Your products come from {pharmacy}, your MattaNutra partner pharmacy.",
    removed: "{count} removed recommendation item(s) are excluded from this order."
  },
  th: {
    title: "รายการสั่งซื้อของคุณ",
    edit: "แก้ไขรายการ",
    caption: "สินค้าที่เลือก {count} รายการ · ยอดรวมค่าจัดส่ง",
    products: "ค่าสินค้า",
    taxNote: "ยอดรวมที่แสดงก่อนชำระเงินรวมค่าจัดส่งแล้ว",
    reassurance: "สินค้าของคุณจัดเตรียมโดย {pharmacy} ร้านยาพันธมิตร MattaNutra ที่พร้อมดูแลคุณ",
    removed: "ไม่นำสินค้าที่นำออกจากคำแนะนำ {count} รายการมารวมในคำสั่งซื้อนี้"
  },
  "zh-CN": {
    title: "您的订单",
    edit: "编辑订单",
    caption: "已选 {count} 件产品 · 总计含配送费",
    products: "产品金额",
    taxNote: "付款前显示的总计包含配送费。",
    reassurance: "您的产品由 MattaNutra 合作药房 {pharmacy} 提供。",
    removed: "已移除的 {count} 项推荐产品不包含在本订单中。"
  }
} satisfies Record<Locale, Record<string, string>>;

function WebOrderSummary({
  currency, editHref, hideShipping, labels, locale, productsById, quotePreview,
  removedItemCount, selectedProducts, selectedRetailerName, shippingAmount, subtotal, total
}: Parameters<typeof OrderSummary>[0]) {
  const [expanded, setExpanded] = useState(true);
  const [mobile, setMobile] = useState(false);
  const text = webSummaryCopy[locale];
  const lines = quotePreview?.lines.length ? quotePreview.lines : selectedProducts.map((product) => ({
    productId: product.id,
    quantityRequested: 1,
    unitPriceAmount: product.unitPriceAmount,
    currency: product.currency,
    payable: product.unitPriceAmount != null,
    etaDate: null,
    reason: ""
  }));
  const formattedTotal = quotePreview ? formatCurrencyAmount(locale, total, currency) : "—";

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => {
      setMobile(query.matches);
      setExpanded(!query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return <>
    <section className={styles.card} aria-labelledby="web-order-summary-title">
      <div className={styles.heading}>
        <h3 id="web-order-summary-title">{text.title}</h3>
        {editHref ? <Link className={styles.edit} href={editHref}>{text.edit}</Link> : null}
      </div>
      <details className={styles.details} open={expanded}>
        <summary
          aria-label={text.caption.replace("{count}", String(lines.length))}
          onClick={(event) => {
            event.preventDefault();
            if (mobile) setExpanded(!expanded);
          }}
          tabIndex={mobile ? 0 : -1}
        >
          <span className={styles.caption}>{text.caption.replace("{count}", String(lines.length))}</span>
          <strong className={styles.collapsedTotal}>{formattedTotal}</strong>
          <ChevronDown aria-hidden className={styles.chevron} />
        </summary>
        <div className={styles.body}>
          {selectedRetailerName ? <p className={styles.pharmacy}><Store aria-hidden />{selectedRetailerName}</p> : null}
          <ul className={styles.products}>
            {lines.map((line) => {
              const product = productsById.get(line.productId);
              const unitPrice = quotePreview ? line.unitPriceAmount : null;
              const quantity = line.quantityRequested || 1;
              const lineCurrency = line.currency ?? product?.currency ?? currency;
              return <li className={styles.product} key={line.productId}>
                <div>
                  <p className={styles.productName}>{product?.name?.trim() || ""}</p>
                  <p className={styles.quantity}>{labels.quantity}: {quantity}</p>
                  {!line.payable && line.reason ? <p className={styles.unavailable}>{line.reason}</p> : null}
                </div>
                <span className={styles.price}>{unitPrice != null ? formatCurrencyAmount(locale, unitPrice * quantity, lineCurrency) : "—"}</span>
              </li>;
            })}
          </ul>
          {removedItemCount > 0 ? <p className={styles.removed}>{text.removed.replace("{count}", String(removedItemCount))}</p> : null}
          <dl className={styles.totals}>
            <div><dt>{text.products}</dt><dd>{quotePreview ? formatCurrencyAmount(locale, subtotal, currency) : "—"}</dd></div>
            {!hideShipping ? <div><dt>{labels.shipping}</dt><dd>{quotePreview ? shippingAmount > 0 ? formatCurrencyAmount(locale, shippingAmount, currency) : labels.free : "—"}</dd></div> : null}
            <div className={styles.total}><dt>{labels.total}</dt><dd>{formattedTotal}</dd></div>
          </dl>
          <p className={styles.taxNote}>{text.taxNote}</p>
        </div>
      </details>
    </section>
    {selectedRetailerName ? <p className={styles.reassurance}><ShieldCheck aria-hidden /><span>{text.reassurance.replace("{pharmacy}", selectedRetailerName)}</span></p> : null}
  </>;
}
