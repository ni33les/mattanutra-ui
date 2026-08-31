import type {
  AdminRetailStockData,
  AdminRetailStockRow,
  RetailStockMovementType,
  RetailStockStatus
} from "@/lib/admin-retail-stock";
import type {
  BackorderPolicy,
  RetailAvailabilityStatus
} from "@/lib/retail-cart-availability";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { SafeImage } from "@/components/safe-image";

export type StockDraft = Readonly<{
  backorderPolicy: BackorderPolicy;
  leadTimeDays: string;
  notes: string;
  retailPriceAmount: string;
  status: RetailStockStatus;
  stockQuantity: string;
  wholesalePriceAmount: string;
}>;

export type RetailStockAvailabilityStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock";

export const emptyStockDraft: StockDraft = {
  backorderPolicy: "allow",
  leadTimeDays: "0",
  notes: "",
  retailPriceAmount: "",
  status: "active",
  stockQuantity: "0",
  wholesalePriceAmount: ""
};

export function draftFromRow(row: AdminRetailStockRow): StockDraft {
  return {
    backorderPolicy: row.backorderPolicy,
    leadTimeDays: String(row.leadTimeDays),
    notes: row.notes ?? "",
    retailPriceAmount:
      row.retailOverridePriceAmount === null
        ? ""
        : String(row.retailOverridePriceAmount),
    status: row.status,
    stockQuantity: String(row.stockQuantity),
    wholesalePriceAmount:
      row.wholesalePriceAmount === null ? "" : String(row.wholesalePriceAmount)
  };
}

export function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function statusLabel(labels: AdminContent, status: RetailStockStatus) {
  if (status === "deleted") {
    return labels.access.deleted;
  }

  if (status === "disabled") {
    return labels.stock.unselected ?? labels.stock.disabled;
  }

  return labels.stock.selectedForSale ?? labels.access.active;
}

export function backorderPolicyLabel(
  labels: AdminContent,
  policy: BackorderPolicy
) {
  return policy === "deny"
    ? labels.stock.backorderDisabled
    : labels.stock.backorderAllowed;
}

export function backorderPolicyClass(policy: BackorderPolicy) {
  return policy === "deny"
    ? "bg-red-50 text-red-700 ring-red-100"
    : "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

export function movementLabel(labels: AdminContent, type: RetailStockMovementType) {
  const labelsByType: Record<RetailStockMovementType, string> = {
    adjustment: labels.stock.movementAdjustment,
    expiry_write_off: labels.stock.movementExpiryWriteOff,
    receive: labels.stock.movementReceive,
    return: labels.stock.movementReturn,
    sale: labels.stock.movementSale,
    transfer_in: labels.stock.movementTransferIn,
    transfer_out: labels.stock.movementTransferOut,
    void: labels.stock.movementVoid
  };

  return labelsByType[type];
}

export function stockAvailabilityStatus(
  row: AdminRetailStockRow,
  advice: AdminRetailStockData["reorderAdvice"][number] | undefined
): RetailStockAvailabilityStatus | null {
  if (row.status !== "active") {
    return null;
  }

  if (row.stockQuantity === 0) {
    return "out_of_stock";
  }

  const daysCover = advice?.daysCover ?? null;
  const leadTimeDays = advice?.leadTimeDays ?? row.leadTimeDays;

  if (
    (daysCover !== null && daysCover <= leadTimeDays + 1) ||
    (daysCover === null && row.stockQuantity < 3)
  ) {
    return "low_stock";
  }

  return "in_stock";
}

export function retailAvailabilityLabel(status: RetailAvailabilityStatus) {
  const labelsByStatus: Record<RetailAvailabilityStatus, string> = {
    available_now: "Available now",
    backorder: "Backorder",
    unavailable: "Unavailable"
  };

  return labelsByStatus[status];
}

export function ProductThumbnail({
  imageUrl,
  title
}: Readonly<{
  imageUrl: string | null;
  title: string;
}>) {
  const fallback = title.trim().slice(0, 2) || "MN";
  const fallbackNode = (
    <span className="px-1 text-center text-xs font-semibold text-gray-500">
      {fallback}
    </span>
  );

  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
      {imageUrl ? (
        <SafeImage
          alt=""
          className="size-full object-cover"
          height={56}
          loading="lazy"
          fallback={fallbackNode}
          src={imageUrl}
          width={56}
        />
      ) : (
        fallbackNode
      )}
    </div>
  );
}

export function StockNumberInput({
  disabled,
  label,
  max,
  min = 0,
  onChange,
  step = "1",
  value
}: Readonly<{
  disabled: boolean;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  step?: string;
  value: string;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-gray-500">
      {label}
      <input
        className="w-full rounded-md bg-white px-3 py-2 text-sm font-normal text-gray-900 ring-1 ring-inset ring-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}
