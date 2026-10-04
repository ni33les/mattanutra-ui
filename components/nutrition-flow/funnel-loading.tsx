"use client";

import { LoaderCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";

const copy = {
  en: {
    payment: "Confirming your payment",
    formula: "Preparing your formula",
    opening: "Opening your formula",
    paymentBody: "We are checking your payment. Please keep this page open; you do not need to pay again.",
    formulaBody: "We are calculating your formula and matching products. Your results will open automatically when ready.",
    openingBody: "Loading your selected nutrients, doses and product guidance. Your results will appear shortly.",
    active: "Working on it…"
  },
  th: {
    payment: "กำลังยืนยันการชำระเงิน",
    formula: "กำลังเตรียมสูตรของคุณ",
    opening: "กำลังเปิดสูตรของคุณ",
    paymentBody: "เรากำลังตรวจสอบการชำระเงิน โปรดเปิดหน้านี้ไว้ ไม่ต้องชำระเงินซ้ำ",
    formulaBody: "เรากำลังคำนวณสูตรและจับคู่ผลิตภัณฑ์ ผลลัพธ์จะเปิดอัตโนมัติเมื่อพร้อม",
    openingBody: "กำลังโหลดสารอาหารที่เลือก ปริมาณ และคำแนะนำผลิตภัณฑ์ ผลลัพธ์จะแสดงในอีกสักครู่",
    active: "กำลังดำเนินการ…"
  },
  "zh-CN": {
    payment: "正在确认付款",
    formula: "正在制定你的配方",
    opening: "正在打开你的配方",
    paymentBody: "我们正在核实付款。请保持此页面打开，无需再次付款。",
    formulaBody: "我们正在计算你的配方并匹配产品。准备就绪后，结果将自动打开。",
    openingBody: "正在加载为你选择的营养素、剂量和产品建议。结果即将显示。",
    active: "正在处理中…"
  }
};

export function FunnelLoading({ locale, stage }: Readonly<{ locale?: Locale; stage: "payment" | "formula" | "opening" }>) {
  const params = useParams();
  const routeLocale = params?.locale;
  const labels = copy[locale ?? (isLocale(routeLocale) ? routeLocale : "en")];
  return (
    <section className="mx-auto flex min-h-[20rem] w-full max-w-xl flex-col items-center justify-center gap-5 px-6 py-12 text-center" role="status" aria-live="polite" data-testid="funnel-loading">
      <LoaderCircle aria-hidden className="size-10 animate-spin text-[var(--mn-teal-deep)] motion-reduce:animate-none" />
      <h1 className="font-serif text-3xl text-[var(--mn-ink)]">{labels[stage]}</h1>
      <p className="text-base leading-7 text-[var(--mn-ink-soft)]">{labels[`${stage}Body`]}</p>
      <p className="text-sm font-semibold text-[var(--mn-teal-deep)]">{labels.active}</p>
    </section>
  );
}
