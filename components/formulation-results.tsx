"use client";

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
  jobId: string;
  locale: Locale;
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

const copy = {
  en: {
    constraints: "Constraints",
    context: "Assessment summary",
    coveragePrefix: "Covers",
    coverageSuffix: "of the recommended supplements",
    emptyJob: "Demo formulation",
    error:
      "The formulation could not be loaded. Please refresh the page and try again.",
    formula: "Supplement breakdown",
    formulaHint:
      "Supplements follow the product order. Product numbers show which recommendations cover each supplement.",
    generated: "Generated",
    goals: "Goals",
    job: "Job",
    loading: "Loading your formulation",
    dailyDose: "Dose",
    plan: "Plan",
    products: "Recommended product searches",
    productsHint:
      "Product numbers map directly to the supplement rows on the left.",
    profile: "Profile",
    region: "Region",
    safety: "Safety notes",
    shopLazada: "Shop on Lazada",
    shopShopee: "Shop on Shopee"
  },
  th: {
    constraints: "ข้อจำกัด",
    context: "สรุปแบบประเมิน",
    coveragePrefix: "ครอบคลุม",
    coverageSuffix: "ของรายการอาหารเสริมที่แนะนำ",
    emptyJob: "สูตรตัวอย่าง",
    error: "ไม่สามารถโหลดสูตรได้ กรุณารีเฟรชหน้าและลองอีกครั้ง",
    formula: "รายการอาหารเสริม",
    formulaHint:
      "รายการอาหารเสริมเรียงตามลำดับผลิตภัณฑ์ หมายเลขผลิตภัณฑ์แสดงว่าคำแนะนำใดครอบคลุมอาหารเสริมแต่ละตัว",
    generated: "สร้างเมื่อ",
    goals: "เป้าหมาย",
    job: "งาน",
    loading: "กำลังโหลดสูตรของคุณ",
    dailyDose: "ขนาด",
    plan: "แผน",
    products: "การค้นหาผลิตภัณฑ์ที่แนะนำ",
    productsHint:
      "หมายเลขผลิตภัณฑ์เชื่อมกับรายการอาหารเสริมทางซ้ายโดยตรง",
    profile: "โปรไฟล์",
    region: "ภูมิภาค",
    safety: "หมายเหตุด้านความปลอดภัย",
    shopLazada: "ช้อปบน Lazada",
    shopShopee: "ช้อปบน Shopee"
  }
} satisfies Record<
  Locale,
  Record<
    | "constraints"
    | "context"
    | "coveragePrefix"
    | "coverageSuffix"
    | "emptyJob"
    | "error"
    | "formula"
    | "formulaHint"
    | "generated"
    | "goals"
    | "job"
    | "loading"
    | "dailyDose"
    | "plan"
    | "products"
    | "productsHint"
    | "profile"
    | "region"
    | "safety"
    | "shopLazada"
    | "shopShopee",
    string
  >
>;

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

export function FormulationResults({ jobId, locale }: FormulationResultsProps) {
  const labels = copy[locale];
  const effectiveJobId = jobId || "demo";
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<FormulationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    async function fetchFormulation() {
      try {
        const response = await fetch(
          `/api/assessment/${encodeURIComponent(effectiveJobId)}/formulation?locale=${locale}`,
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
  }, [effectiveJobId, locale]);

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
    result.formula.map((ingredient) => [ingredient.id, ingredient])
  );
  const coverageCount = (product: RecommendedProduct) =>
    product.covers.filter((ingredientId) => ingredientById.has(ingredientId))
      .length;
  const sortedProducts = [...result.products].sort((a, b) => {
    const coverageDifference = coverageCount(b) - coverageCount(a);

    if (coverageDifference !== 0) {
      return coverageDifference;
    }

    return a.priority - b.priority;
  });
  const totalRecommendedIngredients = Math.max(result.formula.length, 1);
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
  result.formula.forEach((ingredient) => {
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

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="rounded-lg bg-[#F3F8FF] p-6 ring-1 ring-[#3A7BD5]/10 sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[#3A7BD5]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#245f9f]">
              <SparklesIcon aria-hidden={true} className="size-4" />
              {labels.job}: {result.jobId || labels.emptyJob}
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-[#20343A] text-balance sm:text-5xl">
              {result.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {result.subtitle}
            </p>
          </div>

          <div className="rounded-lg bg-background p-5 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#20343A]">
              {labels.context}
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <ContextItem
                label={labels.plan}
                value={result.customerContext.plan}
              />
              <ContextItem
                label={labels.profile}
                value={`${result.customerContext.ageRange} / ${result.customerContext.sex}`}
              />
              <ContextItem
                label={labels.region}
                value={result.customerContext.region}
              />
              <ContextChips
                label={labels.goals}
                values={result.customerContext.goals}
              />
              <ContextChips
                label={labels.constraints}
                values={result.customerContext.constraints}
              />
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-foreground/10 pt-5 text-xs font-medium text-muted-foreground">
          <span>
            {labels.generated}: {formattedDate}
          </span>
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
              {result.safetyNotes.map((note) => (
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
        {products.map((product, index) => {
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
