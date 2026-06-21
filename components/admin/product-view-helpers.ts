import type { AdminProductRow } from "@/lib/admin-products";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
  type ProductCountryCode,
} from "@/lib/product-countries";
import {
  doseAmountInLimitUnit,
  doseExceedsLimit,
  normalizeDoseUnit,
  parseDoseLimit,
} from "@/lib/dose-conversion";
import { siteLocaleRegistry, type Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n-messages";
import { productFactObservableIssueMessages } from "@/lib/product-validation";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
import {
  businessMetricColors,
  readableToken,
  type BusinessMetric,
} from "@/components/admin/dashboard-shared";
import { safetyMetric } from "@/components/admin/safety-view-helpers";

export const productKinds = ["supplement", "multi", "food", "other"] as const;
export const productAudiences = ["both", "female", "male"] as const;
export const productBusinessStates = [
  "pending_review",
  "approved",
  "ignored",
] as const;

export type ProductBusinessState = (typeof productBusinessStates)[number];
export type ProductMetricFilter =
  | "productsApproved"
  | "productsRegulatoryApproved"
  | "productsIgnored"
  | "productsMissingFacts"
  | "productsMissingImages"
  | "productsPendingReview"
  | "productsTotal";

export function productMetricForBusinessState(
  state: ProductBusinessState | "",
): ProductMetricFilter {
  if (state === "approved") {
    return "productsApproved";
  }

  if (state === "ignored") {
    return "productsIgnored";
  }

  if (state === "pending_review") {
    return "productsPendingReview";
  }

  return "productsTotal";
}

export function productBusinessStateForMetric(
  metric: ProductMetricFilter,
): ProductBusinessState | "" {
  if (metric === "productsApproved") {
    return "approved";
  }

  if (metric === "productsIgnored") {
    return "ignored";
  }

  if (metric === "productsPendingReview") {
    return "pending_review";
  }

  return "";
}

export const productViewLabels = {
  en: {
    allBrands: "All brands",
    allStates: "All states",
    approved: "Approved",
    both: "Both",
    complete: "Complete",
    draft: "Draft",
    duplicateProduct: "Duplicate of existing product",
    female: "Female only",
    ignored: "Ignored",
    male: "Male only",
    markets: "Markets",
    missing: "Missing",
    missingFacts: "Missing facts",
    missingImages: "Missing images",
    pendingReview: "Pending Review",
    products: "Products",
    search: "Search products",
    searchPlaceholder: "Search products, brands, ingredients, aliases",
    sourceTitle: "Source title",
    status: "Status",
    translationStatus: "Translation status",
    noParsedFacts: "No parsed label facts yet.",
    averageClientFit: "avg client fit",
    backToProducts: "Back to products",
    backorderPolicy: "Backorder",
    add: "Add",
    addCountry: "Add country",
    addFact: "Add fact",
    addManufacturerCountryFirst: "Add a manufacturer country first.",
    aiNotes: "AI notes",
    amount: "Amount",
    approve: "Approve",
    audience: "Audience",
    brand: "Brand",
    chosen: "Chosen",
    close: "Close",
    confidenceHigh: "High",
    confidenceLow: "Low",
    confidenceModerate: "Moderate",
    country: "Country",
    correctFactsWithAi: "Correct facts with AI",
    currency: "Currency",
    description: "Description",
    approvalNumber: "Approval number",
    addApproval: "Add approval",
    agency: "Agency",
    associateApproval: "Associate approval number",
    authority: "Authority",
    evidenceUrl: "Evidence URL",
    fdaApprovalNumber: "FDA approval number",
    regulatoryApproval: "Regulatory approval",
    regulatoryApprovals: "Regulatory approvals",
    regulatoryApprovalsHint:
      "Country and regional product registration numbers used for catalogue governance.",
    regulatoryApproved: "Regulatory approvals",
    noRegulatoryApprovals: "No regulatory approvals recorded yet.",
    notAvailable: "Not available",
    ean13: "EAN-13 barcode",
    exportJson: "Export JSON",
    hygeiaExport: "Hygeia export",
    ignoredAction: "Ignore",
    identifierCandidates: "identifier candidates",
    identifierType: "Type",
    identifierValue: "Value",
    inheritedApproval: "Inherited",
    importReview: "Import review",
    importReviewHint:
      "This draft has an open review task. Use these actions to finish the review and update the catalogue.",
    increaseLimit: "Increase limit",
    ingredient: "Ingredient",
    mattaNutraSku: "MattaNutra SKU",
    imageUrl: "Image URL",
    manufacturerCountries: "Manufacturer countries",
    manufacturerSku: "Manufacturer SKU",
    markDuplicate: "Mark duplicate",
    nearMisses: "Near misses",
    translations: "Translations",
    noShopAvailability: "No retail shop currently sells this product.",
    parsedFacts: "Parsed facts",
    priceUpdated: "Updated",
    productCountries: "Product countries",
    productName: "Product name",
    productIdentifiers: "Product identifiers",
    productIdentifiersHint:
      "Approved identifiers are used for Hygeia files, barcode matching, and retail shopping lists.",
    productType: "Product type",
    productUrl: "Product URL",
    recommendationDecisions: "Recommendation decisions",
    rejected: "Rejected",
    remove: "Remove",
    reviewerNote: "Reviewer note",
    retailPrice: "Retail price",
    rrp: "RRP",
    save: "Save",
    saveAssociation: "Save association",
    saving: "Saving",
    scope: "Scope",
    source: "Source",
    staleValidation: "Validation stale",
    staleValidationHint:
      "Saved validation cache differs from current facts and limits.",
    shopAvailability: "Shop availability",
    stock: "Stock",
    title: "Title",
    unit: "Unit",
    useCandidate: "Use",
    validationBlockers: "Validation blockers",
    updateError: "Unable to update product review",
  },
  th: {
    allBrands: "ทุกแบรนด์",
    allStates: "ทุกสถานะ",
    approved: "อนุมัติแล้ว",
    both: "ทั้งหมด",
    complete: "ครบถ้วน",
    draft: "ฉบับร่าง",
    duplicateProduct: "ซ้ำกับสินค้าที่มีอยู่",
    female: "ผู้หญิงเท่านั้น",
    ignored: "ไม่ใช้",
    male: "ผู้ชายเท่านั้น",
    markets: "ตลาด",
    missing: "ขาด",
    missingFacts: "ขาดข้อมูล",
    missingImages: "ขาดรูปภาพ",
    pendingReview: "รอตรวจสอบ",
    products: "สินค้า",
    search: "ค้นหาสินค้า",
    searchPlaceholder: "ค้นหาสินค้า แบรนด์ ส่วนผสม หรือชื่ออื่น",
    sourceTitle: "ชื่อต้นทาง",
    status: "สถานะ",
    translationStatus: "สถานะคำแปล",
    noParsedFacts: "ยังไม่มีข้อมูลฉลากที่อ่านได้",
    averageClientFit: "ความเหมาะสมเฉลี่ย",
    backToProducts: "กลับไปที่สินค้า",
    backorderPolicy: "สั่งย้อนหลัง",
    add: "เพิ่ม",
    addCountry: "เพิ่มประเทศ",
    addFact: "เพิ่มข้อมูล",
    addManufacturerCountryFirst: "เพิ่มประเทศผู้ผลิตก่อน",
    aiNotes: "หมายเหตุ AI",
    amount: "ปริมาณ",
    approve: "อนุมัติ",
    audience: "กลุ่มผู้ใช้",
    brand: "แบรนด์",
    chosen: "ถูกเลือก",
    close: "ปิด",
    confidenceHigh: "สูง",
    confidenceLow: "ต่ำ",
    confidenceModerate: "ปานกลาง",
    country: "ประเทศ",
    correctFactsWithAi: "แก้ข้อมูลด้วย AI",
    currency: "สกุลเงิน",
    description: "คำอธิบาย",
    approvalNumber: "เลขอนุมัติ",
    addApproval: "เพิ่มการอนุมัติ",
    agency: "หน่วยงาน",
    associateApproval: "เชื่อมเลขอนุมัติ",
    authority: "หน่วยงาน",
    evidenceUrl: "URL หลักฐาน",
    fdaApprovalNumber: "เลข อย.",
    regulatoryApproval: "การอนุมัติตามประเทศ",
    regulatoryApprovals: "การอนุมัติตามประเทศ/ภูมิภาค",
    regulatoryApprovalsHint:
      "เลขทะเบียนสินค้าแยกตามประเทศหรือภูมิภาคสำหรับการกำกับดูแลแคตตาล็อก",
    regulatoryApproved: "มีข้อมูลอนุมัติ",
    noRegulatoryApprovals: "ยังไม่มีข้อมูลการอนุมัติ",
    notAvailable: "ไม่มีข้อมูล",
    ean13: "บาร์โค้ด EAN-13",
    exportJson: "ส่งออก JSON",
    hygeiaExport: "ส่งออก Hygeia",
    ignoredAction: "ไม่ใช้",
    identifierCandidates: "รายการรอตรวจสอบ",
    identifierType: "ประเภท",
    identifierValue: "ค่า",
    inheritedApproval: "สืบทอด",
    importReview: "รีวิวนำเข้า",
    importReviewHint:
      "ร่างนี้มีงานรีวิวที่เปิดอยู่ ใช้ปุ่มเหล่านี้เพื่อจบการรีวิวและอัปเดตแคตตาล็อก",
    increaseLimit: "เพิ่มขีดจำกัด",
    ingredient: "ส่วนผสม",
    mattaNutraSku: "MattaNutra SKU",
    imageUrl: "URL รูปภาพ",
    manufacturerCountries: "ประเทศผู้ผลิต",
    manufacturerSku: "SKU ผู้ผลิต",
    markDuplicate: "ทำเครื่องหมายว่าซ้ำ",
    nearMisses: "เกือบถูกเลือก",
    translations: "คำแปล",
    noShopAvailability: "ยังไม่มีร้านค้าปลีกขายสินค้านี้",
    parsedFacts: "ข้อมูลที่อ่านจากฉลาก",
    priceUpdated: "อัปเดต",
    productCountries: "ประเทศที่ขายสินค้า",
    productName: "ชื่อสินค้า",
    productIdentifiers: "รหัสสินค้า",
    productIdentifiersHint:
      "รหัสที่อนุมัติใช้กับไฟล์ Hygeia การจับคู่บาร์โค้ด และรายการซื้อของร้านค้า",
    productType: "ประเภทสินค้า",
    productUrl: "URL สินค้า",
    recommendationDecisions: "ข้อมูลการเลือกสินค้า",
    rejected: "ไม่ผ่าน",
    remove: "ลบ",
    reviewerNote: "หมายเหตุผู้รีวิว",
    retailPrice: "ราคาขายปลีก",
    rrp: "RRP",
    save: "บันทึก",
    saveAssociation: "บันทึกการเชื่อมโยง",
    saving: "กำลังบันทึก",
    scope: "ขอบเขต",
    source: "แหล่งข้อมูล",
    staleValidation: "ข้อมูลตรวจสอบเก่า",
    staleValidationHint:
      "แคชการตรวจสอบที่บันทึกไว้ต่างจากข้อมูลและขีดจำกัดปัจจุบัน",
    shopAvailability: "สถานะร้านค้า",
    stock: "สต็อก",
    title: "ชื่อ",
    unit: "หน่วย",
    useCandidate: "ใช้",
    validationBlockers: "สิ่งที่ขวางการตรวจสอบ",
    updateError: "ไม่สามารถอัปเดตรีวิวสินค้าได้",
  },
  "zh-CN": {
    allBrands: "所有品牌",
    allStates: "所有状态",
    approved: "已批准",
    both: "全部",
    complete: "已完成",
    draft: "草稿",
    duplicateProduct: "与现有产品重复",
    female: "仅女性",
    ignored: "已忽略",
    male: "仅男性",
    markets: "市场",
    missing: "缺失",
    missingFacts: "缺少资料",
    missingImages: "缺少图片",
    pendingReview: "待审核",
    products: "产品",
    search: "搜索产品",
    searchPlaceholder: "搜索产品、品牌、成分或别名",
    sourceTitle: "来源标题",
    status: "状态",
    translationStatus: "翻译状态",
    noParsedFacts: "尚无已解析标签资料。",
    averageClientFit: "平均客户匹配度",
    backToProducts: "返回产品列表",
    backorderPolicy: "缺货预订",
    add: "添加",
    addCountry: "添加国家",
    addFact: "添加资料",
    addManufacturerCountryFirst: "请先添加制造商国家。",
    aiNotes: "AI 备注",
    amount: "数量",
    approve: "批准",
    audience: "适用人群",
    brand: "品牌",
    chosen: "已选择",
    close: "关闭",
    confidenceHigh: "高",
    confidenceLow: "低",
    confidenceModerate: "中",
    country: "国家",
    correctFactsWithAi: "使用 AI 修正资料",
    currency: "货币",
    description: "描述",
    approvalNumber: "批准编号",
    addApproval: "添加批准",
    agency: "机构",
    associateApproval: "关联批准编号",
    authority: "监管机构",
    evidenceUrl: "证据 URL",
    fdaApprovalNumber: "FDA 批准编号",
    regulatoryApproval: "监管批准",
    regulatoryApprovals: "国家/地区监管批准",
    regulatoryApprovalsHint: "按国家或区域记录的产品注册编号，用于目录治理。",
    regulatoryApproved: "监管批准",
    noRegulatoryApprovals: "尚未记录监管批准。",
    notAvailable: "不可用",
    ean13: "EAN-13 条码",
    exportJson: "导出 JSON",
    hygeiaExport: "Hygeia 导出",
    ignoredAction: "忽略",
    identifierCandidates: "待审核标识",
    identifierType: "类型",
    identifierValue: "值",
    inheritedApproval: "继承",
    importReview: "导入审核",
    importReviewHint:
      "此草稿有待处理审核任务。使用这些操作完成审核并更新目录。",
    increaseLimit: "提高上限",
    ingredient: "成分",
    mattaNutraSku: "MattaNutra SKU",
    imageUrl: "图片 URL",
    manufacturerCountries: "制造商国家",
    manufacturerSku: "制造商 SKU",
    markDuplicate: "标记为重复",
    nearMisses: "接近入选",
    translations: "翻译",
    noShopAvailability: "暂无零售店销售此产品。",
    parsedFacts: "已解析资料",
    priceUpdated: "已更新",
    productCountries: "产品销售国家",
    productName: "产品名称",
    productIdentifiers: "产品标识",
    productIdentifiersHint:
      "已批准的标识用于 Hygeia 文件、条码匹配和零售采购清单。",
    productType: "产品类型",
    productUrl: "产品 URL",
    recommendationDecisions: "推荐决策",
    rejected: "已排除",
    remove: "移除",
    reviewerNote: "审核备注",
    retailPrice: "零售价",
    rrp: "RRP",
    save: "保存",
    saveAssociation: "保存关联",
    saving: "保存中",
    scope: "范围",
    source: "来源",
    staleValidation: "验证已过期",
    staleValidationHint: "已保存的验证缓存与当前资料和限制不同。",
    shopAvailability: "门店可售状态",
    stock: "库存",
    title: "标题",
    unit: "单位",
    useCandidate: "使用",
    validationBlockers: "验证阻塞项",
    updateError: "无法更新产品审核",
  },
} satisfies Record<Locale, Record<string, string>>;

export function productStatusLabel(status: string, locale: Locale) {
  const labels = productViewLabels[locale];

  if (status === "approved") {
    return labels.approved;
  }

  if (status === "pending_review") {
    return labels.pendingReview;
  }

  if (status === "ignored") {
    return labels.ignored;
  }

  if (status === "both") {
    return labels.both;
  }

  if (status === "female") {
    return labels.female;
  }

  if (status === "male") {
    return labels.male;
  }

  return readableToken(status);
}

export function productBusinessState(
  productOrStatus: AdminProductRow | AdminProductRow["status"],
): ProductBusinessState {
  if (typeof productOrStatus !== "string") {
    if (productOrStatus.importReviewTaskId) {
      return "pending_review";
    }

    return productBusinessState(productOrStatus.status);
  }

  if (productOrStatus === "approved") {
    return "approved";
  }

  if (productOrStatus === "ignored") {
    return "ignored";
  }

  return "pending_review";
}

export function productBusinessStateLabel(
  state: ProductBusinessState,
  locale: Locale,
) {
  const labels = productViewLabels[locale];

  if (state === "approved") {
    return labels.approved;
  }

  if (state === "ignored") {
    return labels.ignored;
  }

  return labels.pendingReview;
}

export function productBusinessStateClass(state: ProductBusinessState) {
  if (state === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "ignored") {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function productDecisionSummary(row: AdminProductRow, locale: Locale) {
  const formatter = new Intl.NumberFormat(
    locale === "th" ? "th-TH" : locale === "zh-CN" ? "zh-CN" : "en",
  );
  const chosen =
    row.decisionStats?.chosenPlanCount ?? row.recommendationHistory.chosenCount;
  const nearMisses = row.decisionStats?.nearMissCount ?? 0;

  const formattedChosen = formatter.format(chosen);
  const formattedNearMisses = formatter.format(nearMisses);

  return nearMisses > 0
    ? t(locale, "admin.productDecisionSummary.chosenNearMisses", {
        chosen: formattedChosen,
        nearMisses: formattedNearMisses
      })
    : t(locale, "admin.productDecisionSummary.chosen", {
        chosen: formattedChosen
      });
}

export function productMatchesMetricFilter(
  row: AdminProductRow,
  metric: ProductMetricFilter,
) {
  if (metric === "productsApproved") {
    return productBusinessState(row) === "approved";
  }

  if (metric === "productsPendingReview") {
    return productBusinessState(row) === "pending_review";
  }

  if (metric === "productsIgnored") {
    return productBusinessState(row) === "ignored";
  }

  if (metric === "productsMissingFacts") {
    return row.validationLabel === "Missing Facts";
  }

  if (metric === "productsMissingImages") {
    return row.validationLabel === "Missing Image";
  }

  if (metric === "productsRegulatoryApproved") {
    return hasEffectiveRegulatoryApproval(row);
  }

  return true;
}

const unknownProductManufacturerKey = "__unknown_manufacturer__";
const unknownProductManufacturerLabel = "Unknown manufacturer";
const productManufacturerMetricPrefix = "productsManufacturer:";

type ProductManufacturerStat = {
  approved: number;
  ignored: number;
  key: string;
  label: string;
  pendingReview: number;
  total: number;
};

type ProductSummaryCounts = {
  approved: number;
  dirtyData: number;
  ignored: number;
  missingFacts: number;
  missingImage: number;
  pendingReview: number;
  regulatoryApproved: number;
  total: number;
};

function hasEffectiveRegulatoryApproval(row: AdminProductRow) {
  return (row.regulatoryApprovals ?? []).some((approval) =>
    approval.status === "verified" || approval.status === "sourced"
  );
}

export function productManufacturerLabel(row: AdminProductRow) {
  return row.brandName?.trim() || unknownProductManufacturerLabel;
}

export function productManufacturerKey(row: AdminProductRow) {
  const label = productManufacturerLabel(row);

  return label === unknownProductManufacturerLabel
    ? unknownProductManufacturerKey
    : label.toLowerCase();
}

export function productManufacturerMetricId(key: string) {
  return `${productManufacturerMetricPrefix}${encodeURIComponent(key)}`;
}

export function productManufacturerKeyFromMetricId(id: string) {
  if (!id.startsWith(productManufacturerMetricPrefix)) {
    return null;
  }

  try {
    return decodeURIComponent(id.slice(productManufacturerMetricPrefix.length));
  } catch {
    return id.slice(productManufacturerMetricPrefix.length);
  }
}

export function productManufacturerStats(rows: readonly AdminProductRow[]) {
  const stats = new Map<string, ProductManufacturerStat>();

  for (const row of rows) {
    const key = productManufacturerKey(row);
    const current = stats.get(key) ?? {
      approved: 0,
      ignored: 0,
      key,
      label: productManufacturerLabel(row),
      pendingReview: 0,
      total: 0,
    };
    const state = productBusinessState(row);

    current.total += 1;
    current.approved += state === "approved" ? 1 : 0;
    current.ignored += state === "ignored" ? 1 : 0;
    current.pendingReview += state === "pending_review" ? 1 : 0;
    stats.set(key, current);
  }

  return [...stats.values()].sort(
    (first, second) =>
      second.total - first.total || first.label.localeCompare(second.label),
  );
}

export function productSummaryCounts(
  rows: readonly AdminProductRow[],
): ProductSummaryCounts {
  return rows.reduce(
    (counts, row) => {
      const state = productBusinessState(row);

      counts.total += 1;
      counts.dirtyData += row.validationLabel === "Dirty Data" ? 1 : 0;
      counts.missingFacts += row.validationLabel === "Missing Facts" ? 1 : 0;
      counts.missingImage += row.validationLabel === "Missing Image" ? 1 : 0;
      counts.approved += state === "approved" ? 1 : 0;
      counts.ignored += state === "ignored" ? 1 : 0;
      counts.pendingReview += state === "pending_review" ? 1 : 0;
      counts.regulatoryApproved += hasEffectiveRegulatoryApproval(row) ? 1 : 0;

      return counts;
    },
    {
      approved: 0,
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      regulatoryApproved: 0,
      total: 0,
    },
  );
}

export function productMetricCards({
  locale,
  rows,
  viewLabels,
}: Readonly<{
  locale: Locale;
  rows: readonly AdminProductRow[];
  viewLabels: (typeof productViewLabels)[Locale];
}>): BusinessMetric[] {
  const summary = productSummaryCounts(rows);

  return [
    safetyMetric({
      color: businessMetricColors.total,
      id: "productsTotal",
      label: viewLabels.products,
      locale,
      value: summary.total,
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "productsApproved",
      label: viewLabels.approved,
      locale,
      value: summary.approved,
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "productsPendingReview",
      label: viewLabels.pendingReview,
      locale,
      value: summary.pendingReview,
    }),
    safetyMetric({
      color: businessMetricColors.offline,
      id: "productsIgnored",
      label: viewLabels.ignored,
      locale,
      value: summary.ignored,
    }),
    safetyMetric({
      color: businessMetricColors.failed,
      id: "productsMissingFacts",
      label: viewLabels.missingFacts,
      locale,
      value: summary.missingFacts,
    }),
    safetyMetric({
      color: businessMetricColors.medium,
      id: "productsMissingImages",
      label: viewLabels.missingImages,
      locale,
      value: summary.missingImage,
    }),
    safetyMetric({
      color: businessMetricColors.active,
      id: "productsRegulatoryApproved",
      label: viewLabels.regulatoryApproved,
      locale,
      value: summary.regulatoryApproved,
    }),
  ];
}

export function productFactPayloads(row: AdminProductRow) {
  return row.facts.map((fact) => ({
    amount: fact.amount,
    confidence: fact.confidence,
    itemType: fact.itemType,
    name: fact.name,
    servingLabel: fact.servingLabel ?? null,
    sourceText: fact.sourceText ?? null,
    sourceUrl: fact.sourceUrl ?? null,
    supplementId: fact.supplementId ?? null,
    unit: fact.unit,
  }));
}

export async function adminResponseErrorMessage(
  response: Response,
  fallback: string,
) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return payload?.message ?? fallback;
}

export function productFactIssueMessages(
  fact: AdminProductRow["facts"][number],
) {
  return productFactObservableIssueMessages(fact);
}

export function productFactIssueSeverity(issues: readonly string[]) {
  return issues.some((issue) => issue.toLowerCase().includes("exceeds"))
    ? "high"
    : issues.length > 0
      ? "medium"
      : "none";
}

export function productFactSafetyLimitIncreaseLabel(
  fact: AdminProductRow["facts"][number],
) {
  if (fact.amount === null || fact.amount <= 0 || !fact.unit || !fact.maxUnit) {
    return null;
  }

  const doseUnit = normalizeDoseUnit(fact.unit);
  const limit = parseDoseLimit(fact.maxAmount, fact.maxUnit);

  if (!doseUnit || !limit) {
    return null;
  }

  const factDose = {
    amount: fact.amount,
    originalText: `${fact.amount} ${fact.unit}`,
    unit: doseUnit,
  };
  const supplementKey = fact.normalizedName || fact.name;
  const exceedsLimit = doseExceedsLimit(factDose, limit, supplementKey);

  if (exceedsLimit !== true) {
    return null;
  }

  const nextLimitAmount = doseAmountInLimitUnit(factDose, limit, supplementKey);

  if (nextLimitAmount === null) {
    return null;
  }

  const roundedAmount = Math.ceil(nextLimitAmount * 1_000_000) / 1_000_000;

  return `Increase limit to ${Number.isInteger(roundedAmount) ? roundedAmount.toFixed(0) : roundedAmount} ${fact.maxUnit}`;
}

const productDoseUnitOptions = supplementDoseUnits.filter(
  (unit) => !unit.endsWith("/day"),
);

export function productDoseUnitSelectOptions(
  currentUnit: string | null | undefined,
) {
  const trimmedCurrentUnit = currentUnit?.trim();

  return trimmedCurrentUnit &&
    !productDoseUnitOptions.includes(
      trimmedCurrentUnit as (typeof productDoseUnitOptions)[number],
    )
    ? [trimmedCurrentUnit, ...productDoseUnitOptions]
    : productDoseUnitOptions;
}

export function normalizedProductCountryCodes(
  countryCodes: readonly string[] | null | undefined,
  fallback: readonly string[] = [defaultProductCountryCode],
): ProductCountryCode[] {
  const codes = [
    ...new Set(
      (countryCodes ?? [])
        .map((code) => normalizeProductCountryCode(code))
        .filter((code): code is ProductCountryCode => Boolean(code)),
    ),
  ];

  return codes.length > 0
    ? codes
    : [
        ...new Set(
          fallback
            .map((code) => normalizeProductCountryCode(code))
            .filter((code): code is ProductCountryCode => Boolean(code)),
        ),
      ];
}

export function addProductCountryCode(
  countryCodes: readonly string[],
  countryCode: string,
): ProductCountryCode[] {
  return normalizedProductCountryCodes(
    [...countryCodes, countryCode],
    countryCodes,
  );
}

export function removeProductCountryCode(
  countryCodes: readonly string[],
  countryCode: string,
): ProductCountryCode[] {
  if (countryCodes.length <= 1) {
    return normalizedProductCountryCodes(countryCodes);
  }

  return normalizedProductCountryCodes(
    countryCodes.filter((code) => code !== countryCode),
    [countryCodes[0] ?? defaultProductCountryCode],
  );
}

export function productTranslationStatusClass(
  status: AdminProductRow["translations"][string]["status"],
) {
  if (status === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "draft") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-gray-200 bg-gray-50 text-gray-500";
}

export function productTranslationStatusLabel(
  status: AdminProductRow["translations"][string]["status"],
  locale: Locale,
) {
  const labels = productViewLabels[locale];

  if (status === "complete") {
    return labels.complete;
  }

  if (status === "draft") {
    return labels.draft;
  }

  return labels.missing;
}

export function productLocaleMeta(locale: string) {
  const registeredLocale = siteLocaleRegistry.find(
    (item) => item.code === locale,
  );

  return (
    registeredLocale ?? {
      code: locale,
      direction: "ltr" as const,
      fallbackLocale: "en",
      htmlLang: locale,
      isIndexable: false,
      isPublic: false,
      label: locale.toUpperCase(),
      nativeLabel: locale,
      sortOrder: 999,
    }
  );
}

export function productTranslationLocales(row: AdminProductRow) {
  const registeredCodes = new Set<string>(
    siteLocaleRegistry.map((item) => item.code),
  );
  const extraLocales = Object.keys(row.translations ?? {})
    .filter((code) => !registeredCodes.has(code))
    .map(productLocaleMeta);

  return [...siteLocaleRegistry, ...extraLocales].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
}

export function productTranslationFor(row: AdminProductRow, locale: string) {
  return (
    row.translations?.[locale] ?? {
      description: locale === "en" ? row.description : null,
      locale,
      status: "missing" as const,
      title: locale === "en" ? row.title : null,
      updatedAt: null,
    }
  );
}
