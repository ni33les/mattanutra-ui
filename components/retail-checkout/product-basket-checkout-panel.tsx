"use client";
import { trackMetaEvent } from "@/lib/meta-client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowRight, Check, CreditCard, House, LockKeyhole, ShieldCheck, Truck, UserRound } from "lucide-react";
import { OrderSummary } from "@/components/retail-checkout/order-summary";
import { CheckoutTrustHero } from "@/components/retail-checkout/checkout-trust-hero";
import styles from "./product-basket-checkout-panel.module.css";
import type {
  ProductBasketProduct,
  ProductBasketQuotePreview
} from "@/components/retail-checkout/product-basket-types";
import type { RetailCheckoutFrozenLine } from "@/lib/retail-product-checkout";
import { trackBpmEvent } from "@/lib/bpm-client";
import { formatCurrencyAmount } from "@/lib/currencies";
import type { Locale } from "@/lib/i18n";
import { displayCountryName, productCountryOptions } from "@/lib/product-countries";
import { checkoutResponsibilityCopy } from "@/lib/agentic/responsibility/matrix";
import { nutritionRevealPath } from "@/lib/nutrition-paths";

const checkoutResponsibility = {
  en: checkoutResponsibilityCopy("en"),
  th: checkoutResponsibilityCopy("th"),
  "zh-CN": checkoutResponsibilityCopy("zh-CN")
} as const;

const CHECKOUT_SESSION_TIMEOUT_MS = 15_000;

export const RETAIL_MOCK_PAYMENT_SCENARIOS = [
  "success",
  "decline_insufficient_funds",
  "processing_then_success",
  "provider_unavailable",
  "three_ds_required",
  "three_ds_succeeded",
  "three_ds_failed",
  "three_ds_cancelled",
  "expire",
  "refund",
  "partial_refund"
] as const;

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
  agentAuthorized: boolean;
  billingAddress: AddressState;
  billingAddressLine2Visible: boolean;
  billingSameAsShipping: boolean;
  touched: Record<string, boolean>;
};

type ProductBasketCheckoutPanelProps = Readonly<{
  agenticOrderId?: string | null;
  destinationCountry?: string | null;
  frozenLines?: readonly RetailCheckoutFrozenLine[];
  initialQuotePreview?: ProductBasketQuotePreview | null;
  locale: Locale;
  mockPayment?: boolean;
  mode?: "web" | "agentic";
  orderReference?: string | null;
  planId: string;
  publishableKey: string;
  removedItemIds: readonly string[];
  selectedRetailerOrganisationId?: string | null;
  selectedItemIds: readonly string[];
  recommendationRunId?: string | null;
  candidateKey?: string | null;
  assessmentRevision?: number | null;
  selectionRevision?: number | null;
  selectedProducts: readonly ProductBasketProduct[];
  shippingAmount?: number | null;
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
    agentAuthorized: "I authorize this AI agent to place this order for me",
    agentAuthorizedRequired: "Tick AI-agent authorization to continue.",
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
    deliveryPromise: checkoutResponsibility.en.fulfilment,
    paymentNote: checkoutResponsibility.en.payment,
    email: "Email",
    error: "We could not open checkout at this time. Please check the basket.",
    free: "Free",
    included: "Included",
    invalidEmail: "Enter a valid email address.",
    mockCta: "Simulate payment",
    mockIntro:
      "DEV mock payment. No Stripe keys or card details are needed. Choose success, decline_insufficient_funds, scenario=expire, three_ds_cancelled, three_ds_failed, three_ds_succeeded, or scenario=refund.",
    mockScenario: "Test scenario",
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
    shippingMethodName: "Flat-rate pharmacy delivery",
    stripeLoading: "Loading secure payment...",
    subtotal: "Subtotal",
    tax: "Tax",
    testMode: "Stripe Test Mode — non-live checkout",
    title: "Checkout",
    total: "Total",
    unavailable: "Unavailable",
    unavailableBody:
      "This basket is not currently checkoutable with one pharmacy. Please adjust your basket before payment.",
    cannotDeliver: "We cannot deliver to {country} yet."
  },
  th: {
    addAddressLine2: "+ เพิ่มอพาร์ตเมนต์ ห้อง หรืออาคาร",
    agentAuthorized: "ฉันอนุญาตให้เอเจนต์ AI สั่งซื้อนี้แทนฉัน",
    agentAuthorizedRequired: "โปรดยืนยันการอนุญาตเอเจนต์ AI เพื่อดำเนินการต่อ",
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
    deliveryPromise: checkoutResponsibility.th.fulfilment,
    paymentNote: checkoutResponsibility.th.payment,
    email: "อีเมล",
    error: "ไม่สามารถเปิดหน้าชำระเงินได้ในขณะนี้ โปรดตรวจสอบตะกร้า",
    free: "ฟรี",
    included: "รวมแล้ว",
    invalidEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
    mockCta: "จำลองการชำระเงิน",
    mockIntro:
      "โหมดพัฒนาใช้การชำระเงินจำลอง ไม่ต้องใช้คีย์ Stripe หรือข้อมูลบัตร เลือก success, decline_insufficient_funds, expire, three_ds_cancelled หรือ refund",
    mockScenario: "สถานการณ์ทดสอบ",
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
    shippingMethodName: "จัดส่งแบบเหมาจ่ายโดยร้านขายยา",
    stripeLoading: "กำลังโหลดหน้าชำระเงินที่ปลอดภัย...",
    subtotal: "ยอดรวมสินค้า",
    tax: "ภาษี",
    testMode: "Stripe Test Mode — ไม่ใช่การชำระเงินจริง",
    title: "ชำระเงิน",
    total: "ยอดชำระ",
    unavailable: "ไม่พร้อมชำระเงิน",
    unavailableBody:
      "ตะกร้านี้ยังไม่สามารถชำระเงินกับร้านขายยาเดียวได้ โปรดปรับตะกร้าก่อนชำระเงิน",
    cannotDeliver: "เรายังจัดส่งไป{country}ไม่ได้"
  },
  "zh-CN": {
    addAddressLine2: "+ 添加公寓、套房或楼栋",
    agentAuthorized: "我授权此 AI 代理代我下单",
    agentAuthorizedRequired: "请勾选 AI 代理授权后再继续。",
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
    deliveryPromise: checkoutResponsibility["zh-CN"].fulfilment,
    paymentNote: checkoutResponsibility["zh-CN"].payment,
    email: "邮箱",
    error: "目前无法打开结账。请检查购物篮。",
    free: "免费",
    included: "已包含",
    invalidEmail: "请输入有效邮箱。",
    mockCta: "模拟支付",
    mockIntro:
      "开发模式使用模拟支付，无需 Stripe 密钥或银行卡。可选择 success、decline_insufficient_funds、expire、three_ds_cancelled 或 refund。",
    mockScenario: "测试场景",
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
    shippingMethodName: "药房固定运费配送",
    stripeLoading: "正在加载安全付款...",
    subtotal: "小计",
    tax: "税费",
    testMode: "Stripe Test Mode — 非正式付款",
    title: "结账",
    total: "总计",
    unavailable: "暂不能结账",
    unavailableBody: "此购物篮目前无法由单一药房完整履约。请先调整购物篮。",
    cannotDeliver: "我们暂时无法配送到{country}。"
  }
};

export const retailCheckoutCopy = copy;

const webCopy = {
  en: {
    contactHelp: "For your order confirmation and delivery updates.",
    contactStep: "Contact",
    deliveryStep: "Delivery",
    delivery: "Where shall we deliver?",
    shipping: "Home delivery",
    deliveryFrom: "Delivery from {pharmacy}",
    deliveryPending: "Delivery timing will be confirmed before payment.",
    arrivesBy: "Arrives by {date}",
    payment: "Secure payment",
    paymentNote: "Complete your payment securely with Stripe.",
    continue: "Continue to secure payment",
    assurance: "Secure payment with Stripe",
    optionalFields: "Add apartment, building or delivery notes",
    phonePlaceholder: "Your contact number",
    addressPlaceholder: "House number and street",
    notesPlaceholder: "Anything that will help the courier find you",
    steps: "Checkout steps",
    totalWithDelivery: "Total, including delivery",
    paybar: "Order total and secure payment",
    requiredDetails: "Please complete the required checkout details.",
    province: "Province"
  },
  th: {
    contactHelp: "สำหรับยืนยันคำสั่งซื้อและแจ้งสถานะการจัดส่ง",
    contactStep: "ข้อมูลติดต่อ",
    deliveryStep: "ที่อยู่จัดส่ง",
    delivery: "ที่อยู่จัดส่ง",
    shipping: "จัดส่งถึงบ้าน",
    deliveryFrom: "จัดส่งโดย {pharmacy}",
    deliveryPending: "แจ้งกำหนดจัดส่งให้ทราบก่อนชำระเงิน",
    arrivesBy: "จัดส่งถึงภายใน {date}",
    payment: "ชำระเงิน",
    paymentNote: "ชำระเงินอย่างปลอดภัยผ่าน Stripe",
    continue: "ไปชำระเงินอย่างปลอดภัย",
    assurance: "ชำระเงินอย่างปลอดภัยผ่าน Stripe",
    optionalFields: "เพิ่มชื่ออาคาร ห้องพัก หรือหมายเหตุการจัดส่ง",
    phonePlaceholder: "เบอร์โทรศัพท์ที่ติดต่อได้",
    addressPlaceholder: "บ้านเลขที่ ถนน ตำบล / แขวง",
    notesPlaceholder: "เช่น จุดสังเกต หรือคำแนะนำสำหรับผู้จัดส่ง",
    steps: "ขั้นตอนการสั่งซื้อ",
    totalWithDelivery: "ยอดรวมค่าจัดส่ง",
    paybar: "ยอดรวมและการชำระเงินอย่างปลอดภัย",
    requiredDetails: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน",
    province: "จังหวัด"
  },
  "zh-CN": {
    contactHelp: "用于订单确认和配送状态通知。",
    contactStep: "联系信息",
    deliveryStep: "配送地址",
    delivery: "配送地址",
    shipping: "送货上门",
    deliveryFrom: "由 {pharmacy} 配送",
    deliveryPending: "配送时间将在付款前确认。",
    arrivesBy: "预计 {date} 前送达",
    payment: "安全付款",
    paymentNote: "通过 Stripe 安全完成付款。",
    continue: "继续安全付款",
    assurance: "通过 Stripe 安全付款",
    optionalFields: "添加公寓、楼栋或配送备注",
    phonePlaceholder: "您的联系电话",
    addressPlaceholder: "门牌号和街道",
    notesPlaceholder: "帮助配送员找到您的信息",
    steps: "结账步骤",
    totalWithDelivery: "含配送费总计",
    paybar: "订单总计和安全付款",
    requiredDetails: "请填写完整的必填结账信息。",
    province: "府 / 省"
  }
} satisfies Record<Locale, Record<string, string>>;

const countries = productCountryOptions.map((item) => ({
  code: item.code,
  name: item.label
}));

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
  agenticOrderId = null,
  destinationCountry = null,
  frozenLines = [],
  initialQuotePreview = null,
  locale,
  mockPayment = false,
  mode = "web",
  orderReference = null,
  planId,
  publishableKey,
  removedItemIds,
  selectedRetailerOrganisationId = null,
  selectedItemIds,
  recommendationRunId, candidateKey, assessmentRevision, selectionRevision,
  selectedProducts,
  shippingAmount: shippingAmountFrozen = null
}: ProductBasketCheckoutPanelProps) {
  const labels = copy[locale];
  const checkoutMode = mode === "agentic" ? "agentic" : "web";
  const isWeb = checkoutMode === "web";
  const webLabels = webCopy[locale];
  const FormContainer = isWeb ? "form" : "div";
  const [checkout, setCheckout] = useState<CheckoutState>(() => {
    const address = initialAddress();
    if (destinationCountry) {
      address.country = destinationCountry;
    }

    return {
      address,
      addressLine2Visible: false,
      agentAuthorized: checkoutMode === "agentic",
      billingAddress: emptyBillingAddress(address),
      billingAddressLine2Visible: false,
      billingSameAsShipping: true,
      touched: {}
    };
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [quotePreview, setQuotePreview] =
    useState<ProductBasketQuotePreview | null>(initialQuotePreview);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompletingMock, setIsCompletingMock] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [mockReady, setMockReady] = useState(false);
  const quoteRequest = useRef(0);
  const webSubmissionPending = useRef(false);
  const [mockScenario, setMockScenario] = useState<(typeof RETAIL_MOCK_PAYMENT_SCENARIOS)[number]>(
    "success"
  );
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
  if (isWeb && checkout.address.country === "TH") shippingLabels.province = webLabels.province;
  if (isWeb && checkout.billingAddress.country === "TH") billingLabels.province = webLabels.province;
  const shippingErrors = useMemo(
    () =>
      validateAddress(checkout.address, labels, {
        includeContact: true
      }),
    [checkout.address, labels]
  );
  const billingErrors = useMemo(
    () =>
      checkout.billingSameAsShipping
        ? {}
        : validateAddress(checkout.billingAddress, labels, {
            includeContact: false
          }),
    [checkout.billingAddress, checkout.billingSameAsShipping, labels]
  );
  const formIsValid =
    Object.keys(shippingErrors).length === 0 &&
    Object.keys(billingErrors).length === 0 &&
    selectedItemIds.length > 0;
  const subtotal = quotePreview?.subtotalAmount ?? 0;
  const shippingAmount = quotePreview?.shippingAmount ?? 0;
  const currency = quotePreview?.currency || "THB";
  const total = quotePreview?.totalAmount ?? subtotal + shippingAmount;
  const selectedRetailerName =
    quotePreview?.selectedRetailer?.organisationName ??
    quotePreview?.lines.find((line) => line.selectedRetailerName)
      ?.selectedRetailerName ??
    null;
  const deliveryPromise = quotePreview?.etaDate
    ? isWeb
      ? webLabels.arrivesBy.replace("{date}", formatEta(locale, quotePreview.etaDate))
      : `Arrives by ${formatEta(locale, quotePreview.etaDate)}`
    : isWeb ? webLabels.deliveryPending : labels.deliveryPromise;
  const canPay = Boolean(formIsValid && (quotePreview ? quotePreview.canCheckout : true));
  const paymentDisabled = isLoading || isCompletingMock || (isWeb
    ? selectedItemIds.length === 0 || Boolean(quotePreview && !quotePreview.canCheckout)
    : !canPay);
  const paymentLabel = mockPayment || mockReady
    ? isCompletingMock || isLoading ? labels.stripeLoading : labels.mockCta
    : isLoading ? labels.creating : isWeb ? webLabels.continue : labels.continue;

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
    quoteRequest.current += 1;
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

  const touchInvalidFields = useCallback(() => {
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
    if (isWeb) {
      const shippingField = Object.keys(shippingErrors)[0];
      const billingField = Object.keys(billingErrors)[0];
      const firstInvalidId = shippingField ? `shipping-${shippingField}` : billingField ? `billing-${billingField}` : null;
      if (firstInvalidId) requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus());
    }
  }, [billingErrors, isWeb, shippingErrors]);

  const loadQuotePreview = useCallback(async (options?: {
    confirmDelivery?: boolean;
  }): Promise<ProductBasketQuotePreview | null> => {
    setError("");

    if (checkoutMode === "agentic") {
      if (initialQuotePreview) {
        setQuotePreview(initialQuotePreview);
      }
      return initialQuotePreview;
    }

    const request = ++quoteRequest.current;
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
          selectedRetailerOrganisationId,
          shippingCountry: checkout.address.country
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as {
        availability?: ProductBasketQuotePreview;
        error?: string;
      };

      if (!response.ok || !body.availability) {
        throw new Error(body.error || labels.error);
      }

      // A response for a previous delivery country must not replace its new quote.
      if (request !== quoteRequest.current) return null;
      setQuotePreview(body.availability);
      if (options?.confirmDelivery) {
        trackBpmEvent("retail_shipping_method_selected", {
          eventType: "funnel",
          locale,
          planId,
          properties: {
            method: "flat_rate_pharmacy_delivery",
            shippingAmount: body.availability.shippingAmount ?? null,
            selectedRetailerOrganisationId:
              body.availability.selectedRetailer?.organisationId ?? null
          }
        });
      }
      return body.availability;
    } catch (caught) {
      if (request !== quoteRequest.current) return null;
      setError(caught instanceof Error ? caught.message : labels.error);
      return null;
    }
  }, [
    checkout.address.country,
    checkoutMode,
    initialQuotePreview,
    labels.error,
    locale,
    planId,
    selectedRetailerOrganisationId,
    selectedItemIds
  ]);

  useEffect(() => {
    if (selectedItemIds.length < 1) {
      return;
    }

    queueMicrotask(() => {
      void loadQuotePreview();
    });
  }, [checkout.address.country, loadQuotePreview, selectedItemIds.length]);

  const previewQuote = useCallback(async (): Promise<ProductBasketQuotePreview | null> => {
    if (!formIsValid) {
      touchInvalidFields();
      setError(isWeb ? webLabels.requiredDetails : "Please complete the required checkout details.");
      return null;
    }

    return loadQuotePreview({ confirmDelivery: true });
  }, [formIsValid, isWeb, loadQuotePreview, touchInvalidFields, webLabels.requiredDetails]);

  const createSession = useCallback(async (): Promise<string | null> => {
    setError("");

    if (!formIsValid) {
      touchInvalidFields();
      setError(isWeb ? webLabels.requiredDetails : "Please complete the required checkout details.");
      return null;
    }

    const activeQuotePreview = quotePreview ?? (await previewQuote());

    if (!activeQuotePreview?.canCheckout) {
      setError(
        activeQuotePreview?.cannotDeliver
          ? labels.cannotDeliver.replace(
              "{country}",
              displayCountryName(checkout.address.country, locale)
            )
          : labels.unavailableBody
      );
      return null;
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
          agentAuthorized: checkoutMode === "agentic" ? true : checkout.agentAuthorized,
          agenticOrderId,
          billingAddress: checkout.billingSameAsShipping
            ? checkout.address
            : checkout.billingAddress,
          billingSameAsShipping: checkout.billingSameAsShipping,
          frozenLines,
          locale,
          mode: checkoutMode,
          planId,
          removedItemIds,
          selectedRetailerOrganisationId,
          selectedItemIds,
          recommendationRunId, candidateKey, assessmentRevision, selectionRevision,
          shippingAmount:
            shippingAmountFrozen ?? activeQuotePreview.shippingAmount ?? null
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
        recovery?: boolean;
        returnUrl?: string;
      };

      if (response.ok && body.paymentId && body.recovery && body.returnUrl) {
        window.location.assign(body.returnUrl);
        return null;
      }

      if (!response.ok || !body.paymentId || (!body.clientSecret && !body.mock)) {
        throw new Error((body as { message?: string }).message || labels.error);
      }

      void trackMetaEvent("InitiateCheckout", { planId, locale, purchase_type: "products", stage: "checkout", channel: checkoutMode === "agentic" ? "mcp" : "web", attemptId: body.paymentId }, `checkout:${body.paymentId}`);
      setPaymentId(body.paymentId);

      if (body.mock) {
        setMockReady(true);
        return body.paymentId;
      }

      void fetch(`/api/retail/checkout/${encodeURIComponent(body.paymentId)}`, {
        cache: "no-store",
        method: "POST"
      });

      setClientSecret(body.clientSecret ?? null);
      return body.paymentId;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
      return null;
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }, [
    agenticOrderId,
    checkout.address,
    checkout.agentAuthorized,
    checkout.billingAddress,
    checkout.billingSameAsShipping,
    checkoutMode,
    frozenLines,
    labels.cannotDeliver,
    labels.error,
    labels.unavailableBody,
    isWeb,
    webLabels.requiredDetails,
    formIsValid,
    locale,
    planId,
    previewQuote,
    quotePreview,
    removedItemIds,
    selectedRetailerOrganisationId,
    selectedItemIds,
    recommendationRunId, candidateKey, assessmentRevision, selectionRevision,
    shippingAmountFrozen,
    touchInvalidFields
  ]);

  const completeMock = useCallback(async (overridePaymentId?: string | null) => {
    const id = overridePaymentId || paymentId;
    if (!id) {
      return;
    }

    setIsCompletingMock(true);
    setError("");

    try {
      const response = await fetch(
        `/api/retail/checkout/${encodeURIComponent(id)}/mock-complete`,
        {
          body: JSON.stringify({ scenario: mockScenario }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST"
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        destination?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message || labels.error);
      }

      if (body.destination) {
        window.location.assign(body.destination);
        return;
      }

      throw new Error(body.message || labels.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
      setIsCompletingMock(false);
    }
  }, [labels.error, mockScenario, paymentId]);

  const runMockPayment = useCallback(async () => {
    const id = paymentId ?? (await createSession());
    if (!id) {
      return;
    }

    await completeMock(id);
  }, [completeMock, createSession, paymentId]);

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
        className={isWeb ? `${styles.field} ${config.field === "customerName" || config.field === "addressLine1" || config.field === "addressLine2" ? styles.full : ""}` : "grid gap-1 text-sm font-semibold text-[var(--mn-ink)]"}
        key={`${scope}:${config.field}`}
      >
        <span className={isWeb ? styles.fieldLabel : "flex items-center justify-between gap-3"}>
          {label}
          <span className={isWeb ? styles.fieldRequirement : "text-xs font-medium text-[var(--mn-ink-soft)]"}>
            {config.optional ? isWeb ? `(${labels.optional})` : labels.optional : isWeb ? <span aria-label={labels.required}>*</span> : labels.required}
          </span>
        </span>
        <input
          autoComplete={config.autoComplete}
          aria-describedby={errorMessage ? `${scope}-${config.field}-error` : undefined}
          aria-invalid={Boolean(errorMessage) || undefined}
          className={isWeb ? styles.input : inputClass(Boolean(errorMessage))}
          id={`${scope}-${config.field}`}
          inputMode={config.inputMode}
          name={config.field}
          onBlur={() => markTouched(scope, config.field)}
          onChange={(event) => updateAddress(scope, config.field, event.target.value)}
          placeholder={isWeb ? config.field === "customerEmail" ? "you@example.com" : config.field === "phone" ? webLabels.phonePlaceholder : config.field === "addressLine1" ? webLabels.addressPlaceholder : undefined : undefined}
          required={!config.optional}
          type={config.type}
          value={address[config.field]}
        />
        {errorMessage ? (
          <span className="text-xs font-semibold text-[var(--mn-error)]" id={`${scope}-${config.field}-error`}>
            {errorMessage}
          </span>
        ) : null}
        {!isWeb && scope === "shipping" && config.field === "phone" ? (
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
    <div className={isWeb ? styles.checkout : "pb-32 lg:pb-0"}>
      {isWeb ? <CheckoutTrustHero locale={locale} retailerName={selectedRetailerName} /> : null}
      <div className={isWeb ? styles.layout : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"}>
        <FormContainer
          className={isWeb ? styles.formColumn : "space-y-5"}
          id={isWeb ? "retail-checkout-form" : undefined}
          onSubmit={isWeb ? async (event) => {
            event.preventDefault();
            if (webSubmissionPending.current || isLoading || isCompletingMock || clientSecret) return;
            webSubmissionPending.current = true;
            setIsLoading(true);
            try {
              if (mockPayment || mockReady) await runMockPayment();
              else await createSession();
            } finally {
              webSubmissionPending.current = false;
              setIsLoading(false);
            }
          } : undefined}
        >
          {isWeb ? (
            <ol className={styles.steps} aria-label={webLabels.steps}>
              {[webLabels.contactStep, webLabels.deliveryStep, webLabels.payment].map((step, index) => (
                <li key={step}><b>{index + 1}</b><span>{step}</span></li>
              ))}
            </ol>
          ) : null}
          {!isWeb || mockPayment || mockReady || orderReference ? <section className={isWeb ? styles.notice : "mn-commerce-card"}>
            {checkoutMode === "agentic" || mockPayment || mockReady ? (
              <p className="mb-4 rounded-lg bg-[var(--mn-cream)] px-4 py-3 text-sm font-semibold text-[var(--mn-teal-deep)]">
                {labels.testMode}
              </p>
            ) : null}
            {orderReference ? (
              <p className="text-sm font-semibold text-[var(--mn-ink-soft)]">
                {orderReference}
              </p>
            ) : null}
            {!isWeb ? <h2 className="font-serif text-3xl font-medium text-[var(--mn-ink)]">
              {labels.title}
            </h2> : null}
          </section> : null}

          <section className={isWeb ? styles.panel : "mn-commerce-card"} aria-labelledby="checkout-contact">
            <h3
              className={isWeb ? styles.panelTitle : "font-serif text-2xl font-medium text-[var(--mn-ink)]"}
              id="checkout-contact"
            >
              {isWeb ? <UserRound aria-hidden /> : null}{labels.contact}
            </h3>
            {isWeb ? <p className={styles.sectionHelp}>{webLabels.contactHelp} <span aria-hidden>*</span> {labels.required}</p> : null}
            <div className={isWeb ? styles.fields : "mt-5 grid gap-4"}>
              {contactFields.map((field) =>
                renderInput("shipping", field, shippingLabels, shippingErrors)
              )}
            </div>
          </section>

          <section className={isWeb ? styles.panel : "mn-commerce-card"} aria-labelledby="checkout-delivery">
            <h3
              className={isWeb ? styles.panelTitle : "font-serif text-2xl font-medium text-[var(--mn-ink)]"}
              id="checkout-delivery"
            >
              {isWeb ? <House aria-hidden /> : null}{isWeb ? webLabels.delivery : labels.delivery}
            </h3>
            {isWeb ? <>
              <div className={styles.fields}>
                {shippingFields.map((field) => renderInput("shipping", field, shippingLabels, shippingErrors))}
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{labels.country} <span className={styles.fieldRequirement} aria-label={labels.required}>*</span></span>
                  <select
                    autoComplete="shipping country"
                    className={styles.input}
                    disabled={Boolean(destinationCountry)}
                    id="shipping-country"
                    name="country"
                    onBlur={() => markTouched("shipping", "country")}
                    onChange={(event) => updateAddress("shipping", "country", event.target.value)}
                    required
                    value={checkout.address.country}
                  >
                    {countries.map((country) => <option key={country.code} value={country.code}>{displayCountryName(country.code, locale)}</option>)}
                  </select>
                </label>
              </div>
              <details className={styles.optionalFields}>
                <summary>{webLabels.optionalFields}</summary>
                <div className={styles.fields}>
                  {renderInput("shipping", { autoComplete: "shipping address-line2", field: "addressLine2", optional: true, type: "text" }, shippingLabels, shippingErrors)}
                  <label className={`${styles.field} ${styles.full}`}>
                    <span className={styles.fieldLabel}>{labels.notes} <span className={styles.fieldRequirement}>({labels.optional})</span></span>
                    <textarea
                      autoComplete="off"
                      className={styles.input}
                      name="notes"
                      onChange={(event) => updateAddress("shipping", "notes", event.target.value)}
                      placeholder={webLabels.notesPlaceholder}
                      rows={2}
                      value={checkout.address.notes}
                    />
                  </label>
                </div>
              </details>
            </> : (
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
                  disabled={Boolean(destinationCountry)}
                  name="country"
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
            )}
          </section>

          <section className={isWeb ? styles.panel : "mn-commerce-card"} aria-labelledby="checkout-shipping">
            <h3
              className={isWeb ? styles.panelTitle : "font-serif text-2xl font-medium text-[var(--mn-ink)]"}
              id="checkout-shipping"
            >
              {isWeb ? <Truck aria-hidden /> : null}{isWeb ? webLabels.shipping : labels.shippingMethod}
            </h3>
            <div className={isWeb ? styles.deliveryOption : "mt-4 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]"}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  {isWeb ? <Check aria-hidden className={styles.deliveryCheck} /> : <Truck aria-hidden className="mt-0.5 size-5 text-[var(--mn-teal-deep)]" />}
                  <div>
                    <p className={isWeb ? styles.deliveryName : "font-bold text-[var(--mn-ink)]"}>
                      {isWeb && selectedRetailerName ? webLabels.deliveryFrom.replace("{pharmacy}", selectedRetailerName) : labels.shippingMethodName}
                    </p>
                    <p className={isWeb ? styles.deliveryHelp : "mt-1 text-sm text-[var(--mn-ink-soft)]"}>
                      {deliveryPromise}
                    </p>
                  </div>
                </div>
                <span className={isWeb ? styles.deliveryAmount : "font-bold text-[var(--mn-ink)]"}>
                  {quotePreview
                    ? shippingAmount > 0
                      ? formatCurrencyAmount(locale, shippingAmount, currency)
                      : labels.free
                    : "-"}
                </span>
              </div>
              {!quotePreview?.canCheckout && quotePreview ? (
                <div className="mt-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm text-[var(--mn-error)]">
                  <p className="font-bold">{labels.unavailable}</p>
                  <p className="mt-1">
                    {quotePreview.cannotDeliver
                      ? labels.cannotDeliver.replace(
                          "{country}",
                          displayCountryName(checkout.address.country, locale)
                        )
                      : labels.unavailableBody}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className={isWeb ? styles.panel : "mn-commerce-card"} aria-labelledby="checkout-payment">
            <h3
              className={isWeb ? styles.panelTitle : "font-serif text-2xl font-medium text-[var(--mn-ink)]"}
              id="checkout-payment"
            >
              {isWeb ? <LockKeyhole aria-hidden /> : null}{isWeb ? webLabels.payment : labels.payment}
            </h3>
            <p className={isWeb ? styles.paymentCopy : "mt-2 text-sm text-[var(--mn-ink-soft)]"}>{isWeb ? webLabels.paymentNote : labels.paymentNote}</p>
            <label className={isWeb ? styles.billingSame : "mt-4 flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-[var(--mn-ink)] ring-1 ring-[var(--mn-line)]"}>
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
              <div className={isWeb ? styles.billingFields : "mt-4 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]"}>
                <h4 className="font-serif text-xl font-medium text-[var(--mn-ink)]">
                  {labels.billing}
                </h4>
                <div className={isWeb ? styles.fields : "mt-4 grid gap-4 sm:grid-cols-2"}>
                  <label className={isWeb ? styles.field : "grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2"}>
                    <span className={isWeb ? styles.fieldLabel : "flex items-center justify-between gap-3"}>
                      {labels.country}
                      <span className={isWeb ? styles.fieldRequirement : "text-xs font-medium text-[var(--mn-ink-soft)]"}>
                        {isWeb ? <span aria-label={labels.required}>*</span> : labels.required}
                      </span>
                    </span>
                    <select
                      autoComplete="billing country"
                      id="billing-country"
                      className={isWeb ? styles.input : inputClass(Boolean(visibleError("billing", "country", billingErrors)))}
                      onBlur={() => markTouched("billing", "country")}
                      onChange={(event) => updateAddress("billing", "country", event.target.value)}
                      value={checkout.billingAddress.country}
                    >
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {isWeb ? displayCountryName(country.code, locale) : country.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {billingFields.map((field) =>
                    renderInput("billing", field, billingLabels, billingErrors)
                  )}
                  {checkout.billingAddressLine2Visible ? (
                    <label className={isWeb ? `${styles.field} ${styles.full} ${styles.billingOptional}` : "grid gap-1 text-sm font-semibold text-[var(--mn-ink)] sm:col-span-2"}>
                      <span className={isWeb ? styles.fieldLabel : "flex items-center justify-between gap-3"}>
                        {labels.addressLine2}
                        <span className={isWeb ? styles.fieldRequirement : "text-xs font-medium text-[var(--mn-ink-soft)]"}>
                          {labels.optional}
                        </span>
                      </span>
                      <input
                        autoComplete="billing address-line2"
                        className={isWeb ? styles.input : inputClass(false)}
                        onChange={(event) => updateAddress("billing", "addressLine2", event.target.value)}
                        type="text"
                        value={checkout.billingAddress.addressLine2}
                      />
                    </label>
                  ) : (
                    <button
                      className={isWeb ? styles.billingOptional : "w-fit text-left text-sm font-bold text-[var(--mn-teal-deep)]"}
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

            {checkoutMode === "agentic" ? (
              <input name="agentAuthorized" type="hidden" value="true" />
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg bg-[var(--mn-error-soft)] p-3 text-sm font-semibold text-[var(--mn-error)]" role="alert">
                {error}
              </p>
            ) : null}

            {mockPayment || mockReady ? (
              <div className="mt-4 space-y-3 rounded-xl bg-[var(--mn-cream)] p-4 ring-1 ring-[var(--mn-line)]">
                <p className="text-sm leading-6 text-[var(--mn-ink-soft)]">
                  {labels.mockIntro}
                </p>
                <label className="grid gap-1 text-sm font-semibold text-[var(--mn-ink)]" htmlFor="scenario">
                  <span>{labels.mockScenario}</span>
                  <select
                    className={inputClass(false)}
                    id="scenario"
                    name="scenario"
                    onChange={(event) =>
                      setMockScenario(
                        event.target.value as (typeof RETAIL_MOCK_PAYMENT_SCENARIOS)[number]
                      )
                    }
                    value={mockScenario}
                  >
                    {RETAIL_MOCK_PAYMENT_SCENARIOS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
                className={isWeb ? `${styles.button} ${styles.paymentButton}` : "mn-primary-button mt-5 w-full justify-center"}
                disabled={paymentDisabled}
                aria-busy={isLoading || isCompletingMock}
                onClick={isWeb ? undefined : () => {
                  if (mockPayment || mockReady) {
                    void runMockPayment();
                    return;
                  }

                  void createSession();
                }}
                type={isWeb ? "submit" : "button"}
              >
                {isWeb ? <LockKeyhole aria-hidden /> : <CreditCard aria-hidden className="size-4" />}
                {paymentLabel}
                {isWeb ? <ArrowRight aria-hidden /> : null}
              </button>
            )}
            {isWeb && !mockPayment && !mockReady ? <p className={styles.assurance}><ShieldCheck aria-hidden />{webLabels.assurance}</p> : null}
          </section>
        </FormContainer>

        <aside className={isWeb ? styles.summaryColumn : "hidden lg:block"}>
          <OrderSummary
            variant={isWeb ? "web" : "default"}
            editHref={isWeb ? nutritionRevealPath(locale, planId) : undefined}
            currency={currency}
            labels={labels}
            locale={locale}
            productsById={productsById}
            quotePreview={quotePreview}
            removedItemCount={removedItemIds.length}
            selectedProducts={selectedProducts}
            selectedRetailerName={selectedRetailerName}
            shippingAmount={shippingAmount}
            subtotal={subtotal}
            total={total}
          />
        </aside>
      </div>

      {!isWeb || !clientSecret ? <div className={isWeb ? styles.mobilePaybar : "fixed inset-x-0 bottom-0 z-30 border-t border-[var(--mn-line)] bg-white/95 px-4 py-3 shadow-2xl backdrop-blur lg:hidden"} aria-label={isWeb ? webLabels.paybar : undefined}>
        <div className={isWeb ? styles.mobilePaybarInner : "mx-auto flex max-w-5xl items-center justify-between gap-4"}>
          <div className={isWeb ? styles.mobileTotal : undefined}>
            <p className={isWeb ? styles.mobileTotalLabel : "text-xs font-semibold text-[var(--mn-ink-soft)]"}>
              {isWeb ? webLabels.totalWithDelivery : `${selectedProducts.length} ${labels.selectedItems}`}
            </p>
            <p className={isWeb ? styles.mobileTotalAmount : "text-lg font-bold text-[var(--mn-ink)]"}>
              {quotePreview
                ? formatCurrencyAmount(locale, total, currency)
                : isWeb ? "—" : labels.deliveryPromise}
            </p>
          </div>
          <button
            className={isWeb ? styles.button : "mn-primary-button w-fit"}
            disabled={paymentDisabled || Boolean(clientSecret)}
            aria-busy={isLoading || isCompletingMock}
            form={isWeb ? "retail-checkout-form" : undefined}
            onClick={isWeb ? undefined : () => {
              if (mockPayment || mockReady) {
                void runMockPayment();
                return;
              }

              void createSession();
            }}
            type={isWeb ? "submit" : "button"}
          >
            {isWeb ? <LockKeyhole aria-hidden /> : <CreditCard aria-hidden className="size-4" />}
            {isWeb ? paymentLabel : mockPayment || mockReady ? labels.mockCta : labels.continue}
            {isWeb ? <ArrowRight aria-hidden /> : null}
          </button>
        </div>
      </div> : null}
    </div>
  );
}
