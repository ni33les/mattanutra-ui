"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Image from "next/image";
import { CreditCard, Truck } from "lucide-react";
import { trackBpmEvent } from "@/lib/bpm-client";
import type { Locale } from "@/lib/i18n";

const CHECKOUT_SESSION_TIMEOUT_MS = 15_000;

type AddressState = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  customerEmail: string;
  customerName: string;
  notes: string;
  phone: string;
  postalCode: string;
  province: string;
};

type CheckoutState = {
  address: AddressState;
  addressLine2Visible: boolean;
  billingAddress: AddressState;
  billingAddressLine2Visible: boolean;
  billingSameAsShipping: boolean;
  touched: Record<string, boolean>;
};

type ProductBasketCheckoutPanelProps = Readonly<{
  locale: Locale;
  planId: string;
  publishableKey: string;
  removedItemIds: readonly string[];
  selectedItemIds: readonly string[];
  selectedProducts: readonly {
    id: string;
    imageUrl: string | null;
    name: string;
  }[];
}>;

type QuoteLine = Readonly<{
  availabilityStatus: string;
  currency: string | null;
  etaDate: string | null;
  payable: boolean;
  productId: string;
  quantityRequested: number;
  reason: string;
  selectedRetailerName: string | null;
  unitPriceAmount: number | null;
}>;

type QuotePreview = Readonly<{
  canCheckout: boolean;
  currency: string | null;
  etaDate: string | null;
  lines: QuoteLine[];
  selectedRetailer: {
    organisationName: string;
  } | null;
  subtotalAmount: number;
  unavailableLines: QuoteLine[];
}>;

type FieldConfig = Readonly<{
  autoComplete: string;
  field: keyof AddressState;
  inputMode?: "email" | "numeric" | "tel" | "text";
  optional?: boolean;
  type: "email" | "tel" | "text";
}>;

const copy = {
  en: {
    addAddressLine2: "+ Add apartment, suite, or building",
    addressLine1: "Address",
    addressLine2: "Apartment, suite, or building",
    billing: "Billing address",
    billingSame: "Billing address is the same as delivery address",
    city: "District / city",
    contact: "Contact information",
    continue: "Pay securely and place order",
    country: "Country",
    creating: "Securing your order...",
    delivery: "Delivery address",
    deliveryPromise: "Pharmacy confirmation pending",
    email: "Email",
    error: "We could not open checkout. Please check the basket and try again.",
    free: "Free",
    included: "Included",
    invalidEmail: "Enter a valid email address.",
    mockCta: "Simulate successful payment",
    name: "Full name",
    notes: "Delivery notes",
    optional: "optional",
    orderSummary: "Order summary",
    payment: "Payment",
    phone: "Phone",
    phoneHelp: "For delivery updates and order issues.",
    postalCode: "Postal code",
    province: "Province / state",
    quantity: "Qty",
    required: "required",
    requiredError: "This field is required.",
    retailer: "Pharmacy",
    selectedItems: "Selected products",
    shipping: "Shipping",
    shippingMethod: "Shipping method",
    shippingMethodName: "Free pharmacy delivery",
    stripeLoading: "Loading secure payment...",
    subtotal: "Subtotal",
    tax: "Tax",
    title: "Checkout",
    total: "Total",
    unavailable: "Unavailable",
    unavailableBody:
      "This basket is not currently checkoutable with one pharmacy. Please adjust your basket before payment."
  },
  th: {
    addAddressLine2: "+ เพิ่มอพาร์ตเมนต์ ห้อง หรืออาคาร",
    addressLine1: "ที่อยู่",
    addressLine2: "อพาร์ตเมนต์ ห้อง หรืออาคาร",
    billing: "ที่อยู่สำหรับออกบิล",
    billingSame: "ที่อยู่ออกบิลเหมือนที่อยู่จัดส่ง",
    city: "เขต / เมือง",
    contact: "ข้อมูลติดต่อ",
    continue: "ชำระเงินอย่างปลอดภัยและสั่งซื้อ",
    country: "ประเทศ",
    creating: "กำลังยืนยันคำสั่งซื้อ...",
    delivery: "ที่อยู่จัดส่ง",
    deliveryPromise: "รอร้านขายยายืนยัน",
    email: "อีเมล",
    error: "ไม่สามารถเปิดหน้าชำระเงินได้ โปรดตรวจสอบตะกร้าแล้วลองอีกครั้ง",
    free: "ฟรี",
    included: "รวมแล้ว",
    invalidEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
    mockCta: "จำลองการชำระเงินสำเร็จ",
    name: "ชื่อ-นามสกุล",
    notes: "หมายเหตุการจัดส่ง",
    optional: "ไม่บังคับ",
    orderSummary: "สรุปคำสั่งซื้อ",
    payment: "ชำระเงิน",
    phone: "โทรศัพท์",
    phoneHelp: "สำหรับแจ้งอัปเดตการจัดส่งและแก้ปัญหาคำสั่งซื้อ",
    postalCode: "รหัสไปรษณีย์",
    province: "จังหวัด / รัฐ",
    quantity: "จำนวน",
    required: "จำเป็น",
    requiredError: "กรุณากรอกข้อมูลนี้",
    retailer: "ร้านขายยา",
    selectedItems: "สินค้าที่เลือก",
    shipping: "ค่าจัดส่ง",
    shippingMethod: "วิธีจัดส่ง",
    shippingMethodName: "จัดส่งฟรีโดยร้านขายยา",
    stripeLoading: "กำลังโหลดหน้าชำระเงินที่ปลอดภัย...",
    subtotal: "ยอดรวมสินค้า",
    tax: "ภาษี",
    title: "ชำระเงิน",
    total: "ยอดชำระ",
    unavailable: "ไม่พร้อมชำระเงิน",
    unavailableBody:
      "ตะกร้านี้ยังไม่สามารถชำระเงินกับร้านขายยาเดียวได้ โปรดปรับตะกร้าก่อนชำระเงิน"
  },
  "zh-CN": {
    addAddressLine2: "+ 添加公寓、套房或楼栋",
    addressLine1: "地址",
    addressLine2: "公寓、套房或楼栋",
    billing: "账单地址",
    billingSame: "账单地址与配送地址相同",
    city: "区 / 市",
    contact: "联系信息",
    continue: "安全付款并下单",
    country: "国家",
    creating: "正在确认订单...",
    delivery: "配送地址",
    deliveryPromise: "等待药房确认",
    email: "邮箱",
    error: "无法打开结账。请检查购物篮后重试。",
    free: "免费",
    included: "已包含",
    invalidEmail: "请输入有效邮箱。",
    mockCta: "模拟支付成功",
    name: "姓名",
    notes: "配送备注",
    optional: "可选",
    orderSummary: "订单摘要",
    payment: "付款",
    phone: "电话",
    phoneHelp: "用于配送更新和订单问题联系。",
    postalCode: "邮政编码",
    province: "省 / 州",
    quantity: "数量",
    required: "必填",
    requiredError: "此字段为必填。",
    retailer: "药房",
    selectedItems: "已选产品",
    shipping: "配送费",
    shippingMethod: "配送方式",
    shippingMethodName: "免费药房配送",
    stripeLoading: "正在加载安全付款...",
    subtotal: "小计",
    tax: "税费",
    title: "结账",
    total: "总计",
    unavailable: "暂不能结账",
    unavailableBody: "此购物篮目前无法由单一药房完整履约。请先调整购物篮。"
  }
};

const countries = [
  { code: "TH", name: "Thailand" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" }
];

function countryFieldLabels(country: string, labels: (typeof copy)["en"]) {
  if (country === "US") {
    return { postalCode: "ZIP code", province: "State" };
  }

  if (country === "GB") {
    return { postalCode: "Postcode", province: "County" };
  }

  if (country === "AU") {
    return { postalCode: "Postcode", province: "State / territory" };
  }

  if (country === "TH") {
    return { postalCode: labels.postalCode, province: "Province" };
  }

  return { postalCode: labels.postalCode, province: labels.province };
}

function initialAddress(): AddressState {
  return {
    addressLine1: "",
    addressLine2: "",
    city: "",
    country: "TH",
    customerEmail: "",
    customerName: "",
    notes: "",
    phone: "",
    postalCode: "",
    province: ""
  };
}

function emptyBillingAddress(shipping: AddressState): AddressState {
  return {
    ...initialAddress(),
    country: shipping.country,
    customerEmail: shipping.customerEmail,
    customerName: shipping.customerName,
    phone: shipping.phone
  };
}

function fieldKey(scope: "billing" | "shipping", field: keyof AddressState) {
  return `${scope}.${field}`;
}

function requiredAddressFields(includeContact: boolean): Array<keyof AddressState> {
  return [
    ...(includeContact ? (["customerEmail", "phone"] as const) : []),
    "customerName",
    "addressLine1",
    "city",
    "province",
    "postalCode",
    "country"
  ];
}

function validateAddress(
  address: AddressState,
  labels: (typeof copy)["en"],
  options: Readonly<{ includeContact: boolean }>
) {
  const errors: Partial<Record<keyof AddressState, string>> = {};

  for (const field of requiredAddressFields(options.includeContact)) {
    if (!address[field].trim()) {
      errors[field] = labels.requiredError;
    }
  }

  if (
    options.includeContact &&
    address.customerEmail.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.customerEmail.trim())
  ) {
    errors.customerEmail = labels.invalidEmail;
  }

  return errors;
}

function formatAmount(locale: Locale, amount: number, currency: string | null) {
  return new Intl.NumberFormat(locale, {
    currency: currency || "THB",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(amount);
}

function formatEta(locale: Locale, value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long"
  }).format(date);
}

function inputClass(hasError: boolean) {
  return [
    "rounded-lg border bg-white px-3 py-2 text-sm font-normal outline-none",
    "focus:border-[var(--mn-teal)]",
    hasError ? "border-[var(--mn-error)]" : "border-[var(--mn-line)]"
  ].join(" ");
}

function labelForField(
  labels: (typeof copy)["en"],
  field: keyof AddressState,
  fieldLabels: { postalCode: string; province: string }
) {
  if (field === "customerName") {
    return labels.name;
  }

  if (field === "customerEmail") {
    return labels.email;
  }

  if (field === "province") {
    return fieldLabels.province;
  }

  if (field === "postalCode") {
    return fieldLabels.postalCode;
  }

  if (field === "phone") {
    return labels.phone;
  }

  if (field === "notes") {
    return labels.notes;
  }

  return labels[field];
}

export function ProductBasketCheckoutPanel({
  locale,
  planId,
  publishableKey,
  removedItemIds,
  selectedItemIds,
  selectedProducts
}: ProductBasketCheckoutPanelProps) {
  const labels = copy[locale];
  const [checkout, setCheckout] = useState<CheckoutState>(() => {
    const address = initialAddress();

    return {
      address,
      addressLine2Visible: false,
      billingAddress: emptyBillingAddress(address),
      billingAddressLine2Visible: false,
      billingSameAsShipping: true,
      touched: {}
    };
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [quotePreview, setQuotePreview] = useState<QuotePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCompletingMock, setIsCompletingMock] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [mockReady, setMockReady] = useState(false);
  const trimmedPublishableKey = publishableKey.trim();
  const hasValidStripePublishableKey = /^pk_(test|live)_/.test(
    trimmedPublishableKey
  );
  const stripePromise = useMemo(
    () =>
      hasValidStripePublishableKey
        ? loadStripe(trimmedPublishableKey)
        : Promise.resolve(null),
    [hasValidStripePublishableKey, trimmedPublishableKey]
  );
  const productsById = useMemo(
    () => new Map(selectedProducts.map((product) => [product.id, product])),
    [selectedProducts]
  );
  const shippingLabels = countryFieldLabels(checkout.address.country, labels);
  const billingLabels = countryFieldLabels(checkout.billingAddress.country, labels);
  const shippingErrors = validateAddress(checkout.address, labels, {
    includeContact: true
  });
  const billingErrors = checkout.billingSameAsShipping
    ? {}
    : validateAddress(checkout.billingAddress, labels, { includeContact: false });
  const formIsValid =
    Object.keys(shippingErrors).length === 0 &&
    Object.keys(billingErrors).length === 0 &&
    selectedItemIds.length > 0;
  const subtotal = quotePreview?.subtotalAmount ?? 0;
  const currency = quotePreview?.currency || "THB";
  const total = subtotal;
  const selectedRetailerName =
    quotePreview?.selectedRetailer?.organisationName ??
    quotePreview?.lines.find((line) => line.selectedRetailerName)
      ?.selectedRetailerName ??
    null;
  const deliveryPromise = quotePreview?.etaDate
    ? `Arrives by ${formatEta(locale, quotePreview.etaDate)}`
    : labels.deliveryPromise;
  const canPay = Boolean(formIsValid && (quotePreview ? quotePreview.canCheckout : true));

  useEffect(() => {
    trackBpmEvent("retail_product_checkout_viewed", {
      eventType: "funnel",
      locale,
      planId,
      properties: {
        removedItemCount: removedItemIds.length,
        selectedItemCount: selectedItemIds.length
      }
    });
  }, [locale, planId, removedItemIds.length, selectedItemIds.length]);

  const markTouched = (scope: "billing" | "shipping", field: keyof AddressState) => {
    setCheckout((current) => ({
      ...current,
      touched: { ...current.touched, [fieldKey(scope, field)]: true }
    }));
  };

  const resetQuoteState = () => {
    setQuotePreview(null);
    setMockReady(false);
    setPaymentId(null);
    setClientSecret(null);
  };

  const updateAddress = (
    scope: "billing" | "shipping",
    field: keyof AddressState,
    value: string
  ) => {
    setCheckout((current) => {
      const key = scope === "shipping" ? "address" : "billingAddress";
      const nextAddress = { ...current[key], [field]: value };
      const next: CheckoutState = {
        ...current,
        [key]: nextAddress
      };

      if (
        scope === "shipping" &&
        current.billingSameAsShipping &&
        (field === "customerEmail" ||
          field === "customerName" ||
          field === "phone" ||
          field === "country")
      ) {
        next.billingAddress = {
          ...current.billingAddress,
          [field]: value
        };
      }

      return next;
    });

    if (scope === "shipping" && field === "country") {
      resetQuoteState();
    }
  };

  const visibleError = (
    scope: "billing" | "shipping",
    field: keyof AddressState,
    errors: Partial<Record<keyof AddressState, string>>
  ) => (checkout.touched[fieldKey(scope, field)] ? errors[field] : "");

  const touchInvalidFields = () => {
    setCheckout((current) => {
      const touched = { ...current.touched };

      for (const field of Object.keys(shippingErrors) as Array<keyof AddressState>) {
        touched[fieldKey("shipping", field)] = true;
      }

      for (const field of Object.keys(billingErrors) as Array<keyof AddressState>) {
        touched[fieldKey("billing", field)] = true;
      }

      return { ...current, touched };
    });
  };

  const loadQuotePreview = useCallback(async (options?: {
    confirmDelivery?: boolean;
  }): Promise<QuotePreview | null> => {
    setError("");
    setIsPreviewing(true);

    try {
      const response = await fetch("/api/retail/basket/availability", {
        body: JSON.stringify({
          lines: selectedItemIds.map((productId) => ({
            productId,
            quantity: 1
          })),
          locale,
          planId,
          previewOnly: !options?.confirmDelivery,
          routingPreference: "cheapest_price",
          shippingCountry: checkout.address.country
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as {
        availability?: QuotePreview;
        error?: string;
      };

      if (!response.ok || !body.availability) {
        throw new Error(body.error || labels.error);
      }

      setQuotePreview(body.availability);
      if (options?.confirmDelivery) {
        trackBpmEvent("retail_shipping_method_selected", {
          eventType: "funnel",
          locale,
          planId,
          properties: {
            method: "free_pharmacy_delivery",
            selectedRetailerOrganisationId:
              body.availability.selectedRetailer?.organisationName ?? null
          }
        });
      }
      return body.availability;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
      return null;
    } finally {
      setIsPreviewing(false);
    }
  }, [
    checkout.address.country,
    labels.error,
    locale,
    planId,
    selectedItemIds
  ]);

  useEffect(() => {
    if (selectedItemIds.length < 1) {
      return;
    }

    void loadQuotePreview();
  }, [checkout.address.country, loadQuotePreview, selectedItemIds.length]);

  const previewQuote = useCallback(async (): Promise<QuotePreview | null> => {
    if (!formIsValid) {
      touchInvalidFields();
      setError("Please complete the required checkout details.");
      return null;
    }

    return loadQuotePreview({ confirmDelivery: true });
  }, [formIsValid, loadQuotePreview]);

  const createSession = useCallback(async () => {
    setError("");

    if (!formIsValid) {
      touchInvalidFields();
      setError("Please complete the required checkout details.");
      return;
    }

    const activeQuotePreview = quotePreview ?? (await previewQuote());

    if (!activeQuotePreview?.canCheckout) {
      setError(labels.unavailableBody);
      return;
    }

    setIsLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      CHECKOUT_SESSION_TIMEOUT_MS
    );

    try {
      const response = await fetch("/api/retail/checkout/session", {
        body: JSON.stringify({
          address: checkout.address,
          billingAddress: checkout.billingSameAsShipping
            ? checkout.address
            : checkout.billingAddress,
          billingSameAsShipping: checkout.billingSameAsShipping,
          locale,
          planId,
          removedItemIds,
          selectedItemIds
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal
      });
      const body = (await response.json().catch(() => ({}))) as {
        clientSecret?: string;
        mock?: boolean;
        paymentId?: string;
      };

      if (!response.ok || !body.paymentId || (!body.clientSecret && !body.mock)) {
        throw new Error((body as { message?: string }).message || labels.error);
      }

      setPaymentId(body.paymentId);

      void fetch(`/api/retail/checkout/${encodeURIComponent(body.paymentId)}`, {
        cache: "no-store",
        method: "POST"
      });

      if (body.mock) {
        setMockReady(true);
        return;
      }

      setClientSecret(body.clientSecret ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }, [
    checkout.address,
    checkout.billingAddress,
    checkout.billingSameAsShipping,
    labels.error,
    labels.unavailableBody,
    formIsValid,
    locale,
    planId,
    previewQuote,
    quotePreview,
    removedItemIds,
    selectedItemIds
  ]);

  const completeMock = useCallback(async () => {
    if (!paymentId) {
      return;
    }

    setIsCompletingMock(true);
    setError("");

    try {
      const response = await fetch(
        `/api/retail/checkout/${encodeURIComponent(paymentId)}/mock-complete`,
        {
          cache: "no-store",
          method: "POST"
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        destination?: string;
        message?: string;
      };

      if (!response.ok || !body.destination) {
        throw new Error(body.message || labels.error);
      }

      window.location.assign(body.destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
      setIsCompletingMock(false);
    }
  }, [labels.error, paymentId]);

  const renderInput = (
    scope: "billing" | "shipping",
    config: FieldConfig,
    fieldLabels: { postalCode: string; province: string },
    errors: Partial<Record<keyof AddressState, string>>
  ) => {
    const address = scope === "shipping" ? checkout.address : checkout.billingAddress;
    const label = labelForField(labels, config.field, fieldLabels);
    const errorMessage = visibleError(scope, config.field, errors);

    return (
      <label
        className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)]"
        key={`${scope}:${config.field}`}
      >
        <span className="flex items-center justify-between gap-3">
          {label}
          <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
            {config.optional ? labels.optional : labels.required}
          </span>
        </span>
        <input
          autoComplete={config.autoComplete}
          className={inputClass(Boolean(errorMessage))}
          inputMode={config.inputMode}
          onBlur={() => markTouched(scope, config.field)}
          onChange={(event) => updateAddress(scope, config.field, event.target.value)}
          required={!config.optional}
          type={config.type}
          value={address[config.field]}
        />
        {errorMessage ? (
          <span className="text-xs font-semibold text-[var(--mn-error)]">
            {errorMessage}
          </span>
        ) : null}
        {scope === "shipping" && config.field === "phone" ? (
          <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
            {labels.phoneHelp}
          </span>
        ) : null}
      </label>
    );
  };
  const contactFields: FieldConfig[] = [
    {
      autoComplete: "email",
      field: "customerEmail",
      inputMode: "email",
      type: "email"
    },
    { autoComplete: "tel", field: "phone", inputMode: "tel", type: "tel" }
  ];
  const shippingFields: FieldConfig[] = [
    { autoComplete: "name", field: "customerName", type: "text" },
    { autoComplete: "shipping address-line1", field: "addressLine1", type: "text" },
    { autoComplete: "shipping address-level2", field: "city", type: "text" },
    { autoComplete: "shipping address-level1", field: "province", type: "text" },
    {
      autoComplete: "shipping postal-code",
      field: "postalCode",
      inputMode: "numeric",
      type: "text"
    }
  ];
  const billingFields: FieldConfig[] = [
    { autoComplete: "billing name", field: "customerName", type: "text" },
    { autoComplete: "billing address-line1", field: "addressLine1", type: "text" },
    { autoComplete: "billing address-level2", field: "city", type: "text" },
    { autoComplete: "billing address-level1", field: "province", type: "text" },
    {
      autoComplete: "billing postal-code",
      field: "postalCode",
      inputMode: "numeric",
      type: "text"
    }
  ];

  return (
    <div className="pb-32 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-5">
          <section className="mn-v11-card">
            <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
              {labels.title}
            </h2>
          </section>

          <section className="mn-v11-card" aria-labelledby="checkout-contact">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-contact"
            >
              {labels.contact}
            </h3>
            <div className="mt-5 grid gap-4">
              {contactFields.map((field) =>
                renderInput("shipping", field, shippingLabels, shippingErrors)
              )}
            </div>
          </section>

          <section className="mn-v11-card" aria-labelledby="checkout-delivery">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-delivery"
            >
              {labels.delivery}
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                <span className="flex items-center justify-between gap-3">
                  {labels.country}
                  <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                    {labels.required}
                  </span>
                </span>
                <select
                  autoComplete="shipping country"
                  className={inputClass(Boolean(visibleError("shipping", "country", shippingErrors)))}
                  onBlur={() => markTouched("shipping", "country")}
                  onChange={(event) => updateAddress("shipping", "country", event.target.value)}
                  value={checkout.address.country}
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              {shippingFields.map((field) =>
                renderInput("shipping", field, shippingLabels, shippingErrors)
              )}
              {checkout.addressLine2Visible ? (
                <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                  <span className="flex items-center justify-between gap-3">
                    {labels.addressLine2}
                    <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                      {labels.optional}
                    </span>
                  </span>
                  <input
                    autoComplete="shipping address-line2"
                    className={inputClass(false)}
                    onChange={(event) => updateAddress("shipping", "addressLine2", event.target.value)}
                    type="text"
                    value={checkout.address.addressLine2}
                  />
                </label>
              ) : (
                <button
                  className="w-fit text-left text-sm font-bold text-[var(--mn-teal-deep)]"
                  onClick={() =>
                    setCheckout((current) => ({
                      ...current,
                      addressLine2Visible: true
                    }))
                  }
                  type="button"
                >
                  {labels.addAddressLine2}
                </button>
              )}
              <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                <span className="flex items-center justify-between gap-3">
                  {labels.notes}
                  <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                    {labels.optional}
                  </span>
                </span>
                <textarea
                  autoComplete="off"
                  className="min-h-24 rounded-lg border border-[var(--mn-line)] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[var(--mn-teal)]"
                  onChange={(event) => updateAddress("shipping", "notes", event.target.value)}
                  value={checkout.address.notes}
                />
              </label>
            </div>
          </section>

          <section className="mn-v11-card" aria-labelledby="checkout-shipping">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-shipping"
            >
              {labels.shippingMethod}
            </h3>
            <div className="mt-4 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <Truck aria-hidden className="mt-0.5 size-5 text-[var(--mn-teal-deep)]" />
                  <div>
                    <p className="font-bold text-[var(--mn-ink)]">
                      {labels.shippingMethodName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--mn-ink-soft)]">
                      {deliveryPromise}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-[var(--mn-ink)]">{labels.free}</span>
              </div>
              {!quotePreview?.canCheckout && quotePreview ? (
                <div className="mt-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm text-[var(--mn-error)]">
                  <p className="font-bold">{labels.unavailable}</p>
                  <p className="mt-1">{labels.unavailableBody}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mn-v11-card" aria-labelledby="checkout-payment">
            <h3
              className="font-serif text-2xl font-medium text-[var(--mn-ink)]"
              id="checkout-payment"
            >
              {labels.payment}
            </h3>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-[var(--mn-ink)] ring-1 ring-[var(--mn-line)]">
              <input
                checked={checkout.billingSameAsShipping}
                className="mt-1 size-4 accent-[var(--mn-teal-deep)]"
                onChange={(event) =>
                  setCheckout((current) => ({
                    ...current,
                    billingAddress: event.target.checked
                      ? { ...current.billingAddress, ...current.address }
                      : current.billingAddress,
                    billingSameAsShipping: event.target.checked
                  }))
                }
                type="checkbox"
              />
              {labels.billingSame}
            </label>
            {!checkout.billingSameAsShipping ? (
              <div className="mt-4 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                <h4 className="font-serif text-xl font-medium text-[var(--mn-ink)]">
                  {labels.billing}
                </h4>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                    <span className="flex items-center justify-between gap-3">
                      {labels.country}
                      <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                        {labels.required}
                      </span>
                    </span>
                    <select
                      autoComplete="billing country"
                      className={inputClass(Boolean(visibleError("billing", "country", billingErrors)))}
                      onBlur={() => markTouched("billing", "country")}
                      onChange={(event) => updateAddress("billing", "country", event.target.value)}
                      value={checkout.billingAddress.country}
                    >
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {billingFields.map((field) =>
                    renderInput("billing", field, billingLabels, billingErrors)
                  )}
                  {checkout.billingAddressLine2Visible ? (
                    <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2">
                      <span className="flex items-center justify-between gap-3">
                        {labels.addressLine2}
                        <span className="text-xs font-medium text-[var(--mn-ink-soft)]">
                          {labels.optional}
                        </span>
                      </span>
                      <input
                        autoComplete="billing address-line2"
                        className={inputClass(false)}
                        onChange={(event) => updateAddress("billing", "addressLine2", event.target.value)}
                        type="text"
                        value={checkout.billingAddress.addressLine2}
                      />
                    </label>
                  ) : (
                    <button
                      className="w-fit text-left text-sm font-bold text-[var(--mn-teal-deep)]"
                      onClick={() =>
                        setCheckout((current) => ({
                          ...current,
                          billingAddressLine2Visible: true
                        }))
                      }
                      type="button"
                    >
                      {labels.addAddressLine2}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]">
                {error}
              </p>
            ) : null}

            {clientSecret ? (
              <div className="mt-5">
                <p className="mb-4 text-sm font-bold text-[var(--mn-teal-deep)]">
                  {labels.stripeLoading}
                </p>
                <EmbeddedCheckoutProvider
                  key={clientSecret}
                  options={{ clientSecret }}
                  stripe={stripePromise}
                >
                  <EmbeddedCheckout className="min-h-[32rem]" />
                </EmbeddedCheckoutProvider>
              </div>
            ) : (
              <button
                className="mn-primary-button mt-5 w-full justify-center"
                disabled={isLoading || isCompletingMock || !canPay}
                onClick={() => {
                  if (mockReady) {
                    void completeMock();
                    return;
                  }

                  void createSession();
                }}
                type="button"
              >
                <CreditCard aria-hidden className="size-4" />
                {mockReady
                  ? isCompletingMock
                    ? labels.stripeLoading
                    : labels.mockCta
                  : isLoading
                    ? labels.creating
                    : labels.continue}
              </button>
            )}
          </section>
        </div>

        <aside className="hidden lg:block">
          <OrderSummary
            currency={currency}
            labels={labels}
            locale={locale}
            productsById={productsById}
            quotePreview={quotePreview}
            removedItemCount={removedItemIds.length}
            selectedProducts={selectedProducts}
            selectedRetailerName={selectedRetailerName}
            subtotal={subtotal}
            total={total}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--mn-line)] bg-white/95 px-4 py-3 shadow-2xl backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--mn-ink-soft)]">
              {selectedProducts.length} {labels.selectedItems}
            </p>
            <p className="text-lg font-bold text-[var(--mn-ink)]">
              {quotePreview
                ? formatAmount(locale, total, currency)
                : labels.deliveryPromise}
            </p>
          </div>
          <button
            className="mn-primary-button w-fit"
            disabled={isLoading || isCompletingMock || !canPay || Boolean(clientSecret)}
            onClick={() => {
              if (mockReady) {
                void completeMock();
                return;
              }

              void createSession();
            }}
            type="button"
          >
            <CreditCard aria-hidden className="size-4" />
            {mockReady ? labels.mockCta : labels.continue}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderSummary({
  currency,
  labels,
  locale,
  productsById,
  quotePreview,
  removedItemCount,
  selectedProducts,
  selectedRetailerName,
  subtotal,
  total
}: Readonly<{
  currency: string;
  labels: (typeof copy)["en"];
  locale: Locale;
  productsById: Map<string, { id: string; imageUrl: string | null; name: string }>;
  quotePreview: QuotePreview | null;
  removedItemCount: number;
  selectedProducts: readonly { id: string; imageUrl: string | null; name: string }[];
  selectedRetailerName: string | null;
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
                  unoptimized={true}
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
                  ? formatAmount(locale, amount, line.currency ?? currency)
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
            {quotePreview ? formatAmount(locale, subtotal, currency) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.shipping}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">{labels.free}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--mn-ink-soft)]">{labels.tax}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">{labels.included}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--mn-line)] pt-3 text-lg">
          <dt className="font-bold text-[var(--mn-ink)]">{labels.total}</dt>
          <dd className="font-bold text-[var(--mn-ink)]">
            {quotePreview ? formatAmount(locale, total, currency) : "-"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
