"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon
} from "@heroicons/react/20/solid";
import type {
  FormulationIngredient,
  FormulationResult,
  RecommendedProduct
} from "@/lib/mock-formulation";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FormulationResultsProps = Readonly<{
  locale: Locale;
  planId: string;
}>;

type LoadState = "loading" | "ready" | "error";

type ProductTone = {
  number: string;
};

type ProductReference = {
  displayNumber: number;
  product: RecommendedProduct;
  tone: ProductTone;
};

function getConfiguredUrl(value: string | undefined) {
  return value?.trim() || "";
}

function getLineUrl() {
  const directUrl = getConfiguredUrl(process.env.NEXT_PUBLIC_LINE_CHAT_URL);

  if (directUrl) {
    return directUrl;
  }

  const officialId =
    getConfiguredUrl(process.env.NEXT_PUBLIC_LINE_OFFICIAL_ID) || "@healthspan";
  const normalizedId = officialId.startsWith("@")
    ? officialId
    : `@${officialId}`;

  return `https://line.me/R/ti/p/${encodeURIComponent(normalizedId)}`;
}

const chatChannels = [
  {
    buttonClasses: "bg-[#06C755] text-white hover:bg-[#05B34D]",
    iconUrl: "/logos/line.svg",
    id: "line",
    name: "LINE",
    qrPanelClasses: "bg-[#06C755]/5 ring-[#06C755]/15",
    url: getLineUrl()
  },
  {
    buttonClasses: "bg-[#229ED9] text-white hover:bg-[#1D8EC4]",
    iconUrl: "/logos/telegram.svg",
    id: "telegram",
    name: "Telegram",
    qrPanelClasses: "bg-[#229ED9]/5 ring-[#229ED9]/15",
    url: "https://t.me/healthspan"
  },
  {
    buttonClasses: "bg-[#25D366] text-white hover:bg-[#1FB85A]",
    iconUrl: "/logos/whatsapp.svg",
    id: "whatsapp",
    name: "WhatsApp",
    qrPanelClasses: "bg-[#25D366]/5 ring-[#25D366]/15",
    url: "https://wa.me/660000000000"
  }
] as const;

const formulationHeroBackgroundImage = "/formulation-couple.jpg";

type CopyLabels = Record<
  | "connectChatBody"
  | "connectChatButton"
  | "connectChatEyebrow"
  | "connectChatPlanId"
  | "connectChatQrAlt"
  | "connectChatTitle"
  | "constraints"
  | "context"
  | "coveragePrefix"
  | "coverageSuffix"
  | "emptyPlan"
  | "error"
  | "formula"
  | "formulaHint"
  | "generated"
  | "goals"
  | "heroSubtitle"
  | "heroTitle"
  | "loading"
  | "dailyDose"
  | "plan"
  | "products"
  | "productsEmptyBody"
  | "productsEmptyTitle"
  | "productsHint"
  | "profile"
  | "region"
  | "safety"
  | "shopLazada"
  | "shopShopee",
  string
> & {
  safetyNotes: string[];
};

const copy = {
  en: {
    connectChatBody:
      "Choose your preferred chat app for support tailored to your diet, routine, travel, training, and daily life. Send your plan and the advisor can continue from this recommendation.",
    connectChatButton: "Open chat",
    connectChatEyebrow: "Continue in chat",
    connectChatPlanId: "Plan",
    connectChatQrAlt: "QR code to connect with the MATTANUTRA AI advisor",
    connectChatTitle:
      "Connect with our specialist AI supplement advisor for ongoing support and refinement.",
    constraints: "Constraints",
    context: "Assessment summary",
    coveragePrefix: "Covers",
    coverageSuffix: "of the recommended supplements",
    emptyPlan: "Demo plan",
    error:
      "The formulation could not be loaded. Please refresh the page and try again.",
    formula: "Supplement breakdown",
    formulaHint:
      "Your suggested supplement stack, grouped by role, with practical daily dose guidance.",
    generated: "Generated",
    goals: "Goals",
    heroSubtitle:
      "A concise wellness formulation and marketplace search guide based on the completed assessment.",
    heroTitle: "Your personalised nutritional formulation",
    loading: "Loading your formulation",
    dailyDose: "Dose",
    plan: "Plan",
    products: "Recommended products for you",
    productsEmptyBody:
      "Your formulation is ready. Product matching is still being prepared, so there are no marketplace recommendations attached to this plan yet.",
    productsEmptyTitle: "No product matches yet",
    productsHint:
      "When available, product numbers map directly to the supplement rows on the left.",
    profile: "Profile",
    region: "Region",
    safety: "Safety notes",
    safetyNotes: [
      "These are optional wellness product suggestions, not medical advice.",
      "Review all labels for allergens, ingredients, and daily use instructions before purchase.",
      "Ask a qualified clinician or pharmacist to review the plan if you are pregnant, breastfeeding, taking medication, or managing a medical condition."
    ],
    shopLazada: "Shop on Lazada",
    shopShopee: "Shop on Shopee"
  },
  th: {
    connectChatBody:
      "เลือกแอปแชตที่คุณสะดวก เพื่อรับการดูแลต่อเนื่องที่ปรับตามอาหาร กิจวัตร การเดินทาง การฝึก และชีวิตประจำวัน ส่งแผนของคุณแล้ว advisor จะคุยต่อจากคำแนะนำนี้ได้",
    connectChatButton: "เปิดแชต",
    connectChatEyebrow: "คุยต่อในแชต",
    connectChatPlanId: "แผน",
    connectChatQrAlt: "QR code สำหรับเชื่อมต่อ MATTANUTRA AI advisor",
    connectChatTitle:
      "เชื่อมต่อกับ AI advisor เฉพาะทางด้านอาหารเสริมเพื่อการดูแลและปรับแผนต่อเนื่อง",
    constraints: "ข้อจำกัด",
    context: "สรุปแบบประเมิน",
    coveragePrefix: "ครอบคลุม",
    coverageSuffix: "ของรายการอาหารเสริมที่แนะนำ",
    emptyPlan: "แผนตัวอย่าง",
    error: "ไม่สามารถโหลดสูตรได้ กรุณารีเฟรชหน้าและลองอีกครั้ง",
    formula: "รายการอาหารเสริม",
    formulaHint:
      "รายการอาหารเสริมที่แนะนำ จัดกลุ่มตามบทบาท พร้อมขนาดรับประทานต่อวันที่ใช้งานได้จริง",
    generated: "สร้างเมื่อ",
    goals: "เป้าหมาย",
    heroSubtitle:
      "บรีฟสูตรเพื่อสุขภาพและคู่มือค้นหาผลิตภัณฑ์จากคำตอบในแบบประเมินของคุณ",
    heroTitle: "สูตรโภชนาการเฉพาะบุคคลของคุณ",
    loading: "กำลังโหลดสูตรของคุณ",
    dailyDose: "ขนาด",
    plan: "แผน",
    products: "ผลิตภัณฑ์ที่แนะนำสำหรับคุณ",
    productsEmptyBody:
      "สูตรของคุณพร้อมแล้ว แต่ระบบจับคู่ผลิตภัณฑ์ยังอยู่ระหว่างเตรียม จึงยังไม่มีคำแนะนำจาก marketplace สำหรับแผนนี้",
    productsEmptyTitle: "ยังไม่มีผลิตภัณฑ์ที่จับคู่ได้",
    productsHint:
      "เมื่อมีคำแนะนำ หมายเลขผลิตภัณฑ์จะเชื่อมกับรายการอาหารเสริมทางซ้ายโดยตรง",
    profile: "โปรไฟล์",
    region: "ภูมิภาค",
    safety: "หมายเหตุด้านความปลอดภัย",
    safetyNotes: [
      "คำแนะนำเหล่านี้เป็นตัวเลือกผลิตภัณฑ์เพื่อสุขภาพ ไม่ใช่คำแนะนำทางการแพทย์",
      "ตรวจฉลากทั้งหมดเพื่อดูสารก่อแพ้ ส่วนผสม และวิธีใช้ต่อวันก่อนซื้อ",
      "ปรึกษาแพทย์หรือเภสัชกรหากคุณตั้งครรภ์ ให้นมบุตร ใช้ยา หรือมีโรคประจำตัว"
    ],
    shopLazada: "ช้อปบน Lazada",
    shopShopee: "ช้อปบน Shopee"
  }
} satisfies Record<Locale, CopyLabels>;

const productTones: ProductTone[] = [
  {
    number: "bg-[#3A7BD5]"
  },
  {
    number: "bg-[#1FA77A]"
  },
  {
    number: "bg-cyan-600"
  },
  {
    number: "bg-amber-500"
  },
  {
    number: "bg-slate-600"
  },
  {
    number: "bg-emerald-600"
  },
  {
    number: "bg-sky-600"
  },
  {
    number: "bg-lime-600"
  }
];

function getShopLabel(product: RecommendedProduct, labels: (typeof copy)["en"]) {
  return product.marketplace === "Shopee Thailand"
    ? labels.shopShopee
    : labels.shopLazada;
}

function getShopButtonClasses(product: RecommendedProduct) {
  const base =
    "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2";

  return product.marketplace === "Shopee Thailand"
    ? cn(base, "bg-[#EE4D2D] hover:bg-[#D93F21] focus:ring-[#EE4D2D]/40")
    : cn(base, "bg-[#0F146D] hover:bg-[#1B238E] focus:ring-[#F57224]/40");
}

export function FormulationResults({ locale, planId }: FormulationResultsProps) {
  const labels = copy[locale];
  const effectivePlanId = planId || "demo";
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<FormulationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    async function fetchFormulation() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(effectivePlanId)}/formulation?locale=${locale}`,
          { cache: "no-store" }
        );

        if (response.status === 202) {
          retryTimer = window.setTimeout(fetchFormulation, 1000);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load formulation");
        }

        const payload = (await response.json()) as FormulationResult;

        if (!cancelled) {
          setResult(payload);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }

    fetchFormulation();

    return () => {
      cancelled = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [effectivePlanId, locale]);

  if (loadState === "loading") {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8">
        <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-foreground/10">
          <ArrowPathIcon
            aria-hidden={true}
            className="mx-auto size-8 animate-spin text-[#3A7BD5]"
          />
          <h1 className="mt-6 text-3xl font-semibold tracking-normal text-[#20343A]">
            {labels.loading}
          </h1>
        </div>
      </section>
    );
  }

  if (loadState === "error" || !result) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8">
        <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-foreground/10">
          <ExclamationTriangleIcon
            aria-hidden={true}
            className="mx-auto size-10 text-amber-500"
          />
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            {labels.error}
          </p>
        </div>
      </section>
    );
  }

  const ingredientById = new Map(
    result.supplementBreakdown.map((ingredient) => [ingredient.id, ingredient])
  );
  const coverageCount = (product: RecommendedProduct) =>
    product.covers.filter((ingredientId) => ingredientById.has(ingredientId))
      .length;
  const sortedProducts = [...result.recommendations].sort((a, b) => {
    const coverageDifference = coverageCount(b) - coverageCount(a);

    if (coverageDifference !== 0) {
      return coverageDifference;
    }

    return a.priority - b.priority;
  });
  const totalRecommendedIngredients = Math.max(
    result.supplementBreakdown.length,
    1
  );
  const productCoveragePercentById = new Map(
    sortedProducts.map((product) => [
      product.id,
      Math.round((coverageCount(product) / totalRecommendedIngredients) * 100)
    ])
  );
  const productToneById = new Map(
    sortedProducts.map((product, index) => [
      product.id,
      productTones[index % productTones.length]
    ])
  );
  const productReferencesByIngredientId = new Map<
    string,
    ProductReference[]
  >();
  const orderedIngredientIds: string[] = [];
  const seenIngredientIds = new Set<string>();

  sortedProducts.forEach((product, productIndex) => {
    product.covers.forEach((ingredientId) => {
      if (!ingredientById.has(ingredientId)) {
        return;
      }

      const references = productReferencesByIngredientId.get(ingredientId) ?? [];

      productReferencesByIngredientId.set(ingredientId, [
        ...references,
        {
          displayNumber: productIndex + 1,
          product,
          tone: productToneById.get(product.id) ?? productTones[0]
        }
      ]);

      if (!seenIngredientIds.has(ingredientId)) {
        seenIngredientIds.add(ingredientId);
        orderedIngredientIds.push(ingredientId);
      }
    });
  });
  result.supplementBreakdown.forEach((ingredient) => {
    if (!seenIngredientIds.has(ingredient.id)) {
      orderedIngredientIds.push(ingredient.id);
    }
  });
  const orderedIngredients = orderedIngredientIds
    .map((ingredientId) => ingredientById.get(ingredientId))
    .filter((ingredient): ingredient is FormulationIngredient =>
      Boolean(ingredient)
    );
  const formattedDate = new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(result.generatedAt));
  const effectiveResultPlanId = result.planId || effectivePlanId;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="relative overflow-hidden rounded-lg bg-[#F3F8FF] p-6 ring-1 ring-[#3A7BD5]/10 sm:p-8 lg:p-10">
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-cover opacity-36"
          style={{
            backgroundImage: `url("${formulationHeroBackgroundImage}")`,
            backgroundPosition: "left 52%"
          }}
        />
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-gradient-to-r from-[#F3F8FF]/92 via-[#F3F8FF]/76 to-[#F3F8FF]/50"
        />
        <div
          aria-hidden={true}
          className="absolute inset-0 bg-gradient-to-b from-[#F3F8FF]/20 via-transparent to-[#F3F8FF]/72"
        />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-center">
          <div>
            <SparklesIcon
              aria-hidden={true}
              className="size-12 text-[#3A7BD5]"
            />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
              {labels.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {labels.heroSubtitle}
            </p>
          </div>

          <div className="rounded-lg bg-background/90 p-5 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#20343A]">
              {labels.context}
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <ContextItem
                label={labels.plan}
                value={result.assessmentSummary.plan}
              />
              <ContextItem
                label={labels.profile}
                value={result.assessmentSummary.profile}
              />
              <ContextItem
                label={labels.region}
                value={result.assessmentSummary.region}
              />
              <ContextChips
                label={labels.goals}
                values={result.assessmentSummary.goals}
              />
              <ContextChips
                label={labels.constraints}
                values={result.assessmentSummary.constraints}
              />
            </dl>
          </div>
        </div>

        <div className="relative mt-8 border-t border-foreground/10 pt-5 text-xs font-normal leading-5 text-muted-foreground">
          <p>
            {labels.generated}: {formattedDate}
          </p>
          <p className="mt-1">
            {labels.plan}: {effectiveResultPlanId || labels.emptyPlan}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <FormulaPanel
          ingredients={orderedIngredients}
          labels={labels}
          productReferencesByIngredientId={productReferencesByIngredientId}
        />

        <ProductsPanel
          coveragePercentByProductId={productCoveragePercentById}
          labels={labels}
          productToneById={productToneById}
          products={sortedProducts}
        />
      </div>

      <ChatConnectPanel labels={labels} planId={effectiveResultPlanId} />

      <div className="mt-8 rounded-lg bg-[#20343A] p-6 text-sm leading-6 text-white/75">
        <div className="flex gap-3">
          <InformationCircleIcon
            aria-hidden={true}
            className="mt-0.5 size-5 flex-none text-white"
          />
          <div>
            <p className="font-semibold uppercase tracking-[0.12em] text-white">
              {labels.safety}
            </p>
            <ul className="mt-3 space-y-2">
              {labels.safetyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

type PanelLabels = (typeof copy)["en"];

function ContextItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-[#20343A]">{value}</dd>
    </div>
  );
}

function ContextChips({
  label,
  values
}: Readonly<{ label: string; values: string[] }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-[#20343A] ring-1 ring-foreground/10"
          >
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}

function ChatConnectPanel({
  labels,
  planId
}: Readonly<{ labels: PanelLabels; planId: string }>) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10">
      <div className="p-6 sm:p-8">
        <div className="inline-flex w-fit items-center gap-3 rounded-md bg-[#06C755]/10 px-3 py-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-[#06C755] text-xs font-black tracking-tight text-white">
            AI
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#058B3F]">
            {labels.connectChatEyebrow}
          </span>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <h2 className="max-w-2xl text-2xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-3xl">
              {labels.connectChatTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {labels.connectChatBody}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 text-xs lg:justify-end">
            <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {labels.connectChatPlanId}
            </span>
            <code className="max-w-full truncate rounded-md bg-background px-2.5 py-1.5 font-mono text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/10">
              {planId}
            </code>
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {chatChannels.map((channel) => {
            const qrUrl = `/api/qr?data=${encodeURIComponent(channel.url)}`;

            return (
              <article
                key={channel.id}
                className="rounded-lg border border-foreground/10 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <img
                    alt={`${channel.name} logo`}
                    className="size-8"
                    height={32}
                    src={channel.iconUrl}
                    width={32}
                  />
                  <h3 className="text-base font-semibold text-[#20343A]">
                    {channel.name}
                  </h3>
                </div>
                <div
                  className={cn(
                    "mt-4 flex justify-center rounded-md p-4 ring-1",
                    channel.qrPanelClasses
                  )}
                >
                  <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-foreground/10">
                    <img
                      alt={`${labels.connectChatQrAlt}: ${channel.name}`}
                      className="size-36"
                      height={144}
                      src={qrUrl}
                      width={144}
                    />
                  </div>
                </div>
                <a
                  className={cn(
                    "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] transition focus:outline-none focus:ring-2 focus:ring-offset-2",
                    channel.buttonClasses
                  )}
                  href={channel.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {labels.connectChatButton}
                  <ArrowTopRightOnSquareIcon
                    aria-hidden={true}
                    className="size-4"
                  />
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FormulaPanel({
  ingredients,
  labels,
  productReferencesByIngredientId
}: Readonly<{
  ingredients: FormulationIngredient[];
  labels: PanelLabels;
  productReferencesByIngredientId: Map<string, ProductReference[]>;
}>) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-[#20343A]">
            {labels.formula}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {labels.formulaHint}
          </p>
        </div>
        <BeakerIcon
          aria-hidden={true}
          className="size-6 flex-none text-[#3A7BD5]"
        />
      </div>

      <div className="mt-6 space-y-3">
        {ingredients.map((ingredient) => {
          const productReferences =
            productReferencesByIngredientId.get(ingredient.id) ?? [];

          return (
            <article
              key={ingredient.id}
              className="rounded-lg border border-foreground/10 bg-white p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-[#20343A]">
                    {ingredient.supplement}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {ingredient.rationale}
                  </p>
                  {productReferences.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {productReferences.map(
                        ({ displayNumber, product, tone }) => (
                          <span
                            key={product.id}
                            className={cn(
                              "flex size-5 flex-none items-center justify-center rounded text-[10px] font-semibold leading-none text-white",
                              tone.number
                            )}
                          >
                            {displayNumber}
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 sm:w-44">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {labels.dailyDose}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#20343A]">
                    {ingredient.dailyDose}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProductsPanel({
  coveragePercentByProductId,
  labels,
  productToneById,
  products
}: Readonly<{
  coveragePercentByProductId: Map<string, number>;
  labels: PanelLabels;
  productToneById: Map<string, ProductTone>;
  products: RecommendedProduct[];
}>) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-foreground/10 sm:p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-normal text-[#20343A]">
          {labels.products}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {labels.productsHint}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 bg-background/60 p-6 text-center">
            <BeakerIcon
              aria-hidden={true}
              className="mx-auto size-7 text-[#3A7BD5]"
            />
            <h3 className="mt-4 text-base font-semibold text-[#20343A]">
              {labels.productsEmptyTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {labels.productsEmptyBody}
            </p>
          </div>
        ) : products.map((product, index) => {
          const coveragePercent = coveragePercentByProductId.get(product.id) ?? 0;
          const tone = productToneById.get(product.id) ?? productTones[0];

          return (
            <article
              key={product.id}
              className="rounded-lg border border-foreground/10 bg-white p-4"
            >
              <div className="flex gap-4">
                <div className={cn(
                  "flex size-10 flex-none items-center justify-center rounded-md text-sm font-semibold text-white",
                  tone.number
                )}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#1FA77A]/10 px-2 py-1 text-xs font-semibold text-[#126b4f] ring-1 ring-[#1FA77A]/20">
                      {product.tag}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {product.marketplace}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-[#20343A]">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {product.description}
                  </p>
                  <p className="mt-3 rounded-md bg-background px-3 py-2 text-xs font-semibold text-[#20343A]">
                    {labels.coveragePrefix} {coveragePercent}%{" "}
                    {labels.coverageSuffix}
                  </p>
                </div>
              </div>

              <a
                className={getShopButtonClasses(product)}
                href={product.url}
                rel="noreferrer"
                target="_blank"
              >
                {getShopLabel(product, labels)}
                <ArrowTopRightOnSquareIcon
                  aria-hidden={true}
                  className="size-4"
                />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
