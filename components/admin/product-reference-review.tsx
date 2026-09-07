import type { Locale } from "@/lib/i18n";

const copy = {
  en: {
    action: "Review reference evidence",
    hint: "Review reference limits against source evidence in Supplements. A product's labelled dose cannot establish or raise a global reference limit."
  },
  th: {
    action: "ตรวจสอบหลักฐานอ้างอิง",
    hint: "ตรวจสอบค่าอ้างอิงกับหลักฐานต้นทางในหน้าอาหารเสริม ปริมาณบนฉลากผลิตภัณฑ์ไม่สามารถใช้กำหนดหรือเพิ่มค่าอ้างอิงที่ใช้ร่วมกันได้"
  },
  "zh-CN": {
    action: "审查参考证据",
    hint: "请在补充剂页面依据原始证据审查参考限值。产品标注剂量不能用于设定或提高通用参考限值。"
  }
} as const;

export function ProductReferenceReview({ locale }: Readonly<{ locale: Locale }>) {
  const labels = copy[locale];
  return <p className="mt-3 text-xs text-gray-600">
    {labels.hint}{" "}
    <a className="font-semibold text-[#126B4F] hover:underline" href={`/${locale}/admin/dashboard?view=supplements`}>
      {labels.action}
    </a>
  </p>;
}
