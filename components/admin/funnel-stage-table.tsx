import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

export const funnelStageColors = {
  entry: "#334155", start: "#0284c7", complete: "#2563eb", result: "#0f766e",
  conversion: "#15803d", order: "#7c3aed", delivered: "#a16207"
} as const;
export type FunnelTableRow = {
  id: string; label: string; count: number; color: keyof typeof funnelStageColors;
  denominator?: number | null; numerator?: number; entry?: boolean; target?: number; targetControl?: ReactNode;
  conversionBasis?: string; showDropoff?: boolean;
};
const columns = {
  en: ["Stage", "Count", "Drop-off", "Conversion", "Target", "Actual vs target"],
  th: ["ขั้นตอน", "จำนวน", "ไม่ไปต่อ", "อัตราการไปต่อ", "เป้าหมาย", "ผลต่างจากเป้าหมาย"],
  "zh-CN": ["阶段", "数量", "流失", "转化率", "目标", "与目标之差"]
};

export function FunnelStageTable({ rows, locale, targets = false, caption }: {
  rows: readonly FunnelTableRow[]; locale: Locale; targets?: boolean; caption: string;
}) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return <div className="mt-4 overflow-x-auto rounded-lg ring-1 ring-gray-200">
    <table className="min-w-full divide-y divide-gray-200 text-sm" data-testid="funnel-stage-table">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-gray-50"><tr>{columns[locale].slice(0, targets ? 6 : 4).map((name, index) =>
        <th scope="col" key={name} className={`whitespace-nowrap px-4 py-3 font-semibold text-gray-700 ${index ? "text-right" : "text-left"}`}>{name}</th>
      )}</tr></thead>
      <tbody className="divide-y divide-gray-100">{rows.map(row => {
        const linked = row.numerator;
        const valid = row.denominator != null && row.denominator > 0 && linked != null && linked >= 0 && linked <= row.denominator;
        const conversion = row.entry ? (row.count ? 100 : null) : valid ? 100 * linked! / row.denominator! : null;
        const dropoff = valid && row.showDropoff !== false ? row.denominator! - linked! : null;
        const delta = conversion != null && row.target != null ? conversion - row.target : null;
        const color = funnelStageColors[row.color];
        return <tr key={row.id} style={{ backgroundColor: `${color}08` }}>
          <th scope="row" className="min-w-44 px-4 py-3 text-left font-medium text-gray-900" style={{ borderLeft: `4px solid ${color}` }}>
            <span aria-hidden="true" className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />{row.label}
          </th>
          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{number.format(row.count)}</td>
          <td className="px-4 py-3 text-right tabular-nums text-gray-600">{dropoff == null ? "—" : number.format(dropoff)}</td>
          <td className="px-4 py-3 text-right tabular-nums text-gray-600">
            {conversion == null ? "—" : `${number.format(conversion)}%`}
            {valid && row.conversionBasis && <span className="mt-1 block text-xs text-gray-500">
              {number.format(linked!)} / {number.format(row.denominator!)} · {row.conversionBasis}
            </span>}
          </td>
          {targets && <><td className="px-4 py-3 text-right tabular-nums">{row.targetControl ?? (row.target == null ? "—" : `${number.format(row.target)}%`)}</td>
            <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${delta == null ? "text-gray-500" : delta >= 0 ? "text-green-700" : "text-red-700"}`}>
              {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${number.format(delta)} pp`}
            </td></>}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
