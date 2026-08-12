import type {
  AdminRetailCustomerOrder,
  AdminRetailCustomerOrderAddress,
  AdminRetailCustomerOrderLine
} from "@/lib/admin-retail-stock";
import type { Locale } from "@/lib/i18n";
import { productCountryLabel } from "@/lib/product-countries";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { formatPrice } from "@/components/admin/retail-stock-formatters";
import { customerOrderRetailValue } from "@/components/admin/retail-stock/customer-order-display-model";

export type RetailOrderDocumentKind =
  | "invoice"
  | "order"
  | "order-pack"
  | "packing-sheet"
  | "shipping-label";

export const emptyRetailField = "";

function presentText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function readableToken(value: string) {
  if (value === "completed") {
    return "Succeeded";
  }

  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function addressHasValue(address: AdminRetailCustomerOrderAddress | null) {
  return Boolean(address && Object.values(address).some((value) => Boolean(value)));
}

function fallbackDeliveryAddressForOrder(
  order: AdminRetailCustomerOrder
): AdminRetailCustomerOrderAddress | null {
  const address: AdminRetailCustomerOrderAddress = {
    addressLine1: null,
    addressLine2: null,
    city: null,
    country: order.routingSnapshot?.shippingCountry ?? null,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    notes: order.notes,
    phone: null,
    postalCode: null,
    province: null
  };

  return addressHasValue(address) ? address : null;
}

export function deliveryAddressForOrder(order: AdminRetailCustomerOrder) {
  return (
    order.deliveryDetails?.shippingAddress ??
    fallbackDeliveryAddressForOrder(order)
  );
}

export function addressDisplayLines(address: AdminRetailCustomerOrderAddress | null) {
  if (!address) {
    return [];
  }

  const cityLine = [
    address.city,
    address.province,
    address.postalCode
  ].filter(presentText).join(", ");
  const countryLine = address.country
    ? productCountryLabel(address.country)
    : null;

  return [
    address.customerName,
    address.addressLine1,
    address.addressLine2,
    cityLine,
    countryLine
  ].filter(presentText);
}

function addressContactLines(
  labels: AdminContent,
  address: AdminRetailCustomerOrderAddress | null
) {
  if (!address) {
    return [];
  }

  return [
    address.phone ? `${labels.stock.phone}: ${address.phone}` : null,
    address.customerEmail ? `${labels.stock.email}: ${address.customerEmail}` : null,
    address.notes ? `${labels.stock.deliveryNotes}: ${address.notes}` : null
  ].filter(presentText);
}

export function addressNoteLines(
  labels: AdminContent,
  address: AdminRetailCustomerOrderAddress | null
) {
  return address?.notes ? [`${labels.stock.deliveryNotes}: ${address.notes}`] : [];
}

function addressBlockHtml(
  title: string,
  lines: readonly string[],
  contactLines: readonly string[],
  fallback: string
) {
  const body = [...lines, ...contactLines]
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="address">${body || `<div class="muted">${escapeHtml(fallback)}</div>`}</div>
    </section>
  `;
}

function retailOrderDocumentTitle(
  labels: AdminContent,
  kind: RetailOrderDocumentKind
) {
  const titles: Record<RetailOrderDocumentKind, string> = {
    invoice: labels.stock.invoice,
    order: labels.stock.printOrder,
    "order-pack": labels.stock.downloadPdf,
    "packing-sheet": labels.stock.packingSheet,
    "shipping-label": labels.stock.shippingLabel
  };

  return titles[kind];
}

export function orderLineIdentifierParts(line: AdminRetailCustomerOrderLine) {
  return [
    `SKU: ${line.productId}`,
    line.manufacturerSku ? `Manufacturer SKU: ${line.manufacturerSku}` : null,
    line.ean13 ? `EAN-13: ${line.ean13}` : null
  ].filter((value): value is string => Boolean(value));
}

export function orderLineAwaitingStockUnits(line: AdminRetailCustomerOrderLine) {
  return Math.max(0, line.pipeline?.unorderedNeedUnits ?? 0);
}

export function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value: string | null, locale: Locale) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function printShipmentLabel(input: Readonly<{
  labels: AdminContent;
  lines: readonly AdminRetailCustomerOrderLine[];
  locale: Locale;
  order: AdminRetailCustomerOrder;
}>) {
  if (typeof window === "undefined") {
    return;
  }

  if (input.order.shipment?.labelUrl) {
    window.open(input.order.shipment.labelUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (input.order.shipment?.labelContentBase64) {
    const contentType =
      input.order.shipment.labelContentType || "application/pdf";
    window.open(
      `data:${contentType};base64,${input.order.shipment.labelContentBase64}`,
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  printRetailOrderDocument({
    kind: "shipping-label",
    labels: input.labels,
    lines: input.lines,
    locale: input.locale,
    order: input.order
  });
}

export function retailPlanInsertHref(
  order: AdminRetailCustomerOrder,
  locale: Locale
) {
  const params = new URLSearchParams({ locale });

  return `/api/admin/retail-stock/customer-orders/${encodeURIComponent(
    order.id
  )}/plan-insert?${params.toString()}`;
}

export function openRetailPlanInsert(
  order: AdminRetailCustomerOrder,
  locale: Locale
) {
  if (typeof window === "undefined" || !order.planInsertAvailable) {
    return;
  }

  window.open(retailPlanInsertHref(order, locale), "_blank", "noopener,noreferrer");
}

export function printRetailOrderDocument({
  kind,
  labels,
  lines,
  locale,
  order
}: Readonly<{
  kind: RetailOrderDocumentKind;
  labels: AdminContent;
  lines: readonly AdminRetailCustomerOrderLine[];
  locale: Locale;
  order: AdminRetailCustomerOrder;
}>) {
  if (typeof window === "undefined") {
    return;
  }

  if (kind === "order-pack") {
    openRetailPlanInsert(order, locale);
  }

  const documentTitle = retailOrderDocumentTitle(labels, kind);
  const includePrices = kind === "invoice" || kind === "order";
  const shippingAddress = deliveryAddressForOrder(order);
  const shippingLines = addressDisplayLines(shippingAddress);
  const shippingContactLines = addressContactLines(labels, shippingAddress);
  const expectedDate =
    formatDate(
      order.fulfillmentPromise?.etaDate ??
        order.routingSnapshot?.etaDate ??
        order.dueAt,
      locale
    ) ?? emptyRetailField;
  const placedAt = formatDateTime(order.placedAt, locale) ?? emptyRetailField;
  const generatedAt =
    formatDateTime(new Date().toISOString(), locale) ?? new Date().toISOString();
  const orderTotal =
    formatPrice(locale, order.currency, customerOrderRetailValue(order)) ??
    emptyRetailField;
  const deliverySection = addressBlockHtml(
    labels.stock.deliveryAddress,
    shippingLines,
    shippingContactLines,
    emptyRetailField
  );
  const summarySection = `
    <section class="panel">
      <h2>${escapeHtml(labels.stock.customerOrderDetails)}</h2>
      <dl>
        <dt>${escapeHtml(labels.stock.customerOrders)}</dt>
        <dd>${escapeHtml(order.orderNumber)}</dd>
        <dt>${escapeHtml(labels.stock.organisation)}</dt>
        <dd>${escapeHtml(order.organisationName)}</dd>
        <dt>${escapeHtml(labels.stock.status)}</dt>
        <dd>${escapeHtml(readableToken(order.status))}</dd>
        <dt>${escapeHtml(labels.stock.expectedAt)}</dt>
        <dd>${escapeHtml(expectedDate)}</dd>
        <dt>${escapeHtml(labels.stock.placedAt)}</dt>
        <dd>${escapeHtml(placedAt)}</dd>
        <dt>${escapeHtml(labels.stock.retailValue)}</dt>
        <dd>${escapeHtml(orderTotal)}</dd>
      </dl>
    </section>
  `;

  const itemTableHtml = (showPrices: boolean) => {
    const priceHeadings = showPrices
      ? `<th>${escapeHtml(labels.stock.retailPrice)}</th><th>${escapeHtml(labels.stock.lineTotal)}</th>`
      : "";
    const itemRows = lines
      .map((line) => {
        const identifiers = orderLineIdentifierParts(line);
        const unitPrice =
          line.retailPriceAmount === null
            ? emptyRetailField
            : (formatPrice(locale, order.currency, line.retailPriceAmount) ??
              emptyRetailField);
        const lineTotal =
          line.retailPriceAmount === null
            ? emptyRetailField
            : (formatPrice(
                locale,
                order.currency,
                line.retailPriceAmount * line.quantityOrdered
              ) ?? emptyRetailField);

        return `
          <tr>
            <td>
              <div class="product-title">${escapeHtml(line.productTitle)}</div>
              ${
                identifiers.length
                  ? `<div class="identifiers">${identifiers.map(escapeHtml).join(" · ")}</div>`
                  : ""
              }
            </td>
            <td>${escapeHtml(line.quantityOrdered)}</td>
            ${showPrices ? `<td>${escapeHtml(unitPrice)}</td><td>${escapeHtml(lineTotal)}</td>` : ""}
          </tr>
        `;
      })
      .join("");

    return `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(labels.stock.product)}</th>
            <th>${escapeHtml(labels.stock.quantity)}</th>
            ${priceHeadings}
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="${showPrices ? 4 : 2}">${escapeHtml(labels.stock.noItemsSelected)}</td></tr>`}
        </tbody>
      </table>
    `;
  };

  const shippingLabelSheetHtml = () => {
    const carrierName = order.shipment?.carrierName ?? "";
    const isKexCarrier = /(?:\bkex\b|kerry)/i.test(carrierName);

    return `
    <main class="label ${isKexCarrier ? "label-kex" : ""}">
      <div class="muted">${escapeHtml(labels.stock.shippingLabel)}</div>
      <h1>${escapeHtml(labels.stock.deliveryAddress)}</h1>
      <div class="label-address">
        ${[...shippingLines, ...shippingContactLines]
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join("") || `<div>${escapeHtml(emptyRetailField)}</div>`}
      </div>
      <div class="label-footer">
        <div><strong>${escapeHtml(labels.stock.customerOrders)}:</strong> ${escapeHtml(order.orderNumber)}</div>
        <div><strong>${escapeHtml(labels.stock.organisation)}:</strong> ${escapeHtml(order.organisationName)}</div>
        ${
          carrierName
            ? `<div><strong>Carrier:</strong> ${escapeHtml(carrierName)}</div>`
            : ""
        }
        ${
          order.shipment?.trackingNumber
            ? `<div><strong>Tracking:</strong> ${escapeHtml(order.shipment.trackingNumber)}</div>`
            : ""
        }
        <div><strong>${escapeHtml(labels.stock.expectedAt)}:</strong> ${escapeHtml(expectedDate)}</div>
      </div>
      ${
        isKexCarrier
          ? `<section class="kex-note">
              <strong>KEX QR/AWB:</strong> print the official KEX label or scan the KEX QR from the carrier system before handover. This sheet is not a carrier-issued AWB.
            </section>`
          : ""
      }
    </main>
    `;
  };

  const standardSheetHtml = (sheetTitle: string, showPrices: boolean) => `
    <main class="sheet">
      <header>
        <div>
          <div class="eyebrow">${escapeHtml(sheetTitle)}</div>
          <h1>${escapeHtml(order.orderNumber)}</h1>
        </div>
        <div class="generated">${escapeHtml(generatedAt)}</div>
      </header>
      <div class="grid">
        ${summarySection}
        ${deliverySection}
      </div>
      <section class="panel">
        <h2>${escapeHtml(labels.stock.orderItems)}</h2>
        ${itemTableHtml(showPrices)}
      </section>
      ${
        showPrices
          ? `<section class="totals"><span>${escapeHtml(labels.stock.total)}</span><strong>${escapeHtml(orderTotal)}</strong></section>`
          : ""
      }
    </main>
  `;
  const standardBody =
    kind === "order-pack"
      ? [
          standardSheetHtml(labels.stock.printOrder, true),
          standardSheetHtml(labels.stock.packingSheet, false),
          shippingLabelSheetHtml(),
          standardSheetHtml(labels.stock.invoice, true)
        ].join("")
      : kind === "shipping-label"
        ? shippingLabelSheetHtml()
        : standardSheetHtml(documentTitle, includePrices);
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(documentTitle)} ${escapeHtml(order.orderNumber)}</title>
        <style>
          @page { margin: 18mm; }
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; }
          main { padding: 24px; }
          header { align-items: flex-start; border-bottom: 1px solid #d1d5db; display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; }
          h1 { font-size: 28px; margin: 4px 0 0; }
          h2 { font-size: 14px; margin: 0 0 10px; text-transform: uppercase; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; text-align: left; vertical-align: top; }
          th { color: #4b5563; font-size: 11px; text-transform: uppercase; }
          dl { display: grid; grid-template-columns: 150px 1fr; margin: 0; row-gap: 6px; }
          dt { color: #6b7280; font-weight: 700; }
          dd { margin: 0; }
          .address { line-height: 1.45; }
          .identifiers { color: #6b7280; font-size: 11px; margin-top: 4px; }
          .product-title { font-weight: 700; }
          .eyebrow, .generated, .muted { color: #6b7280; font-size: 12px; }
          .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 12px; }
          .panel { border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 12px; padding: 14px; }
          .sheet + .sheet, .sheet + .label, .label + .sheet { border-top: 1px dashed #d1d5db; }
          .totals { align-items: center; display: flex; font-size: 18px; gap: 16px; justify-content: flex-end; margin-top: 16px; }
          .label { min-height: 70vh; padding: 32px; position: relative; }
          .label h1 { border-bottom: 2px solid #111827; font-size: 22px; padding-bottom: 10px; }
          .label-address { font-size: 28px; font-weight: 700; line-height: 1.35; margin-top: 28px; }
          .label-footer { border-top: 1px solid #d1d5db; bottom: 32px; display: grid; gap: 8px; left: 32px; position: absolute; right: 32px; padding-top: 16px; }
          .kex-note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 10px; color: #92400e; font-size: 14px; line-height: 1.45; margin-top: 28px; padding: 12px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            main { padding: 0; }
            .panel { break-inside: avoid; }
            .sheet, .label { break-after: page; page-break-after: always; }
            .sheet:last-child, .label:last-child { break-after: auto; page-break-after: auto; }
            .sheet + .sheet, .sheet + .label, .label + .sheet { border-top: 0; }
          }
        </style>
      </head>
      <body>${standardBody}</body>
    </html>
  `;
  const popup = window.open(
    "",
    "_blank",
    "width=900,height=1200"
  );

  if (!popup) {
    window.print();
    return;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
  }, 150);
}
