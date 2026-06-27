"use client";

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Sparkles, Upload } from "lucide-react";
import type {
  AdminProductDetailRow,
  AdminProductRow
} from "@/lib/admin-products";
import {
  adminLocalizedFallbackLabel,
  adminLocalizedProductText,
} from "@/lib/admin-localized-display";
import { siteLocaleRegistry, type Locale } from "@/lib/i18n";
import {
  productCountryLabel,
  productCountryOptions,
  type ProductCountryPricing,
} from "@/lib/product-countries";
import {
  defaultRegulatoryAgencyForCountry,
  regulatoryAgencyByCode,
  regulatoryAgencyOptionsForCountry,
} from "@/lib/product-regulatory-agencies";
import { supportedOrganisationCurrencies } from "@/lib/currencies";
import {
  adminLocaleTextClass,
  classNames,
} from "@/components/admin/dashboard-shared";
import { SafeImage } from "@/components/safe-image";
import {
  productBusinessState,
  productBusinessStateClass,
  productBusinessStateLabel,
  productDoseUnitSelectOptions,
  productFactIssueMessages,
  productFactIssueSeverity,
  productFactSafetyLimitIncreaseLabel,
  productLocaleMeta,
  productStatusLabel,
  productTranslationFor,
  productTranslationLocales,
  productTranslationStatusClass,
  productTranslationStatusLabel,
  type ProductCardRow,
  type ProductViewLabels,
} from "@/components/admin/product-view-helpers";
import { AdminModal } from "@/components/admin/ui";

function regulatoryApprovalSummary(
  approvals: readonly AdminProductRow["regulatoryApprovals"][number][] = [],
) {
  const active = approvals.filter(
    (approval) =>
      (approval.status === "verified" || approval.status === "sourced") &&
      approval.approvalNumber.trim(),
  );

  if (active.length < 1) {
    return "-";
  }

  const summary = active
    .slice(0, 2)
    .map(
      (approval) =>
        `${approval.agencyCode.replaceAll("_", " ")} ${approval.approvalNumber}`,
    )
    .join(", ");

  return active.length > 2 ? `${summary} +${active.length - 2}` : summary;
}

function productImageFallbackText(
  row: Pick<AdminProductRow, "brandName" | "platform" | "title">,
) {
  const source = row.brandName?.trim() || row.title.trim() || row.platform;
  const asciiParts = source.match(/[A-Za-z0-9]+/g);
  const initials =
    asciiParts && asciiParts.length > 1
      ? asciiParts
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
      : asciiParts?.[0]?.slice(0, 2).toUpperCase();

  return initials || [...source.replace(/\s+/g, "")].slice(0, 2).join("") || "MN";
}

export function ProductImageFallback({
  row,
  size = "md",
}: Readonly<{
  row: Pick<AdminProductRow, "brandName" | "platform" | "title">;
  size?: "md" | "lg";
}>) {
  return (
    <div
      className={classNames(
        "flex shrink-0 items-center justify-center bg-[linear-gradient(135deg,#F8FAFC_0%,#ECFDF5_100%)] font-semibold text-[#126B4F] ring-1 ring-gray-200",
        size === "lg"
          ? "size-24 rounded-xl text-lg"
          : "size-20 rounded-lg text-sm",
      )}
    >
      <span className="px-2 text-center leading-none">
        {productImageFallbackText(row)}
      </span>
    </div>
  );
}

export function AddProductFromUrlModal({
  error,
  onClose,
  onProductUrlChange,
  onSubmit,
  productUrl,
  saving,
  viewLabels,
}: Readonly<{
  error: string | null;
  onClose: () => void;
  onProductUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  productUrl: string;
  saving: boolean;
  viewLabels: ProductViewLabels;
}>) {
  return (
    <AdminModal
      closeDisabled={saving}
      closeLabel={viewLabels.close}
      onClose={onClose}
      panelClassName="max-w-lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-[#1FA77A]" />
          {viewLabels.addProductFromUrl}
        </span>
      }
    >
      <form className="space-y-4 p-5" onSubmit={onSubmit}>
        <label className="block space-y-2 text-sm font-medium text-gray-700">
          <span>{viewLabels.productUrl}</span>
          <input
            className="w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            disabled={saving}
            onChange={(event) => onProductUrlChange(event.target.value)}
            placeholder="https://"
            required
            type="url"
            value={productUrl}
          />
        </label>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            {viewLabels.close}
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? viewLabels.creatingProduct : viewLabels.createDraft}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

export function ProductImagePreview({
  alt = "",
  onImageLoad,
  previewImageUrl,
  row,
  size = "md",
}: Readonly<{
  alt?: string;
  onImageLoad?: (imageUrl: string) => void;
  previewImageUrl?: string | null;
  row: Pick<AdminProductRow, "brandName" | "imageUrl" | "platform" | "title">;
  size?: "md" | "lg";
}>) {
  const fallback = <ProductImageFallback row={row} size={size} />;
  const preview = previewImageUrl ? (
    <ProductImageBlobPreview
      alt={alt}
      imageUrl={previewImageUrl}
      size={size}
    />
  ) : null;

  if (!row.imageUrl) {
    return preview ?? fallback;
  }

  if (row.imageUrl.startsWith("blob:")) {
    return (
      <ProductImageBlobPreview
        alt={alt}
        imageUrl={row.imageUrl}
        size={size}
      />
    );
  }

  return (
    <SafeImage
      alt={alt}
      className={classNames(
        "shrink-0 object-cover ring-1 ring-gray-200",
        size === "lg"
          ? "size-24 rounded-xl"
          : "size-20 rounded-lg",
      )}
      fallback={preview ?? fallback}
      height={size === "lg" ? 96 : 80}
      onLoad={() => onImageLoad?.(row.imageUrl!)}
      src={row.imageUrl}
      width={size === "lg" ? 96 : 80}
    />
  );
}

function ProductImageBlobPreview({
  alt,
  imageUrl,
  size,
}: Readonly<{
  alt: string;
  imageUrl: string;
  size: "md" | "lg";
}>) {
  return (
    <div
      aria-label={alt || undefined}
      className={classNames(
        "shrink-0 bg-cover bg-center ring-1 ring-gray-200",
        size === "lg"
          ? "size-24 rounded-xl"
          : "size-20 rounded-lg",
      )}
      role={alt ? "img" : undefined}
      style={{
        backgroundImage: `url("${imageUrl.replace(/["\\]/g, "\\$&")}")`,
      }}
    />
  );
}

function droppedImageUrl(dataTransfer: DataTransfer) {
  const uriList = dataTransfer
    .getData("text/uri-list")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  const plainText = dataTransfer.getData("text/plain").trim();
  const value = uriList || plainText;

  if (!value) {
    return null;
  }

  if (
    value.startsWith("/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  ) {
    return value;
  }

  return null;
}

export function ProductImageDropzone({
  accessToken,
  onImageUrlChange,
  onPreviewImageLoad,
  onPreviewImageUrlChange,
  previewImageUrl,
  productId,
  row,
  storedImageUrl,
  viewLabels,
}: Readonly<{
  accessToken: string;
  onImageUrlChange: (imageUrl: string | null) => void;
  onPreviewImageLoad?: (imageUrl: string) => void;
  onPreviewImageUrlChange?: (
    imageUrl: string | null,
    targetImageUrl?: string | null,
  ) => void;
  previewImageUrl?: string | null;
  productId: string;
  row: Pick<
    AdminProductRow,
    "brandName" | "imageUrl" | "platform" | "title"
  > & {
    imageCandidates?: readonly string[];
  };
  storedImageUrl?: string | null;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const uploadInputId = useId();
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [busyAction, setBusyAction] = useState<"upload" | "url" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const editableImageUrl = storedImageUrl ?? row.imageUrl ?? "";
  const imageCandidates = [...new Set(row.imageCandidates ?? [])].filter(
    (url) => url && url !== editableImageUrl
  );
  const busy = busyAction !== null;

  async function resultMessage(response: Response, fallback: string) {
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      url?: string;
    };

    return {
      message: result.message ?? fallback,
      url: typeof result.url === "string" ? result.url : null,
    };
  }

  async function applyImageUrl(nextImageUrl: string | null) {
    const imageUrl = nextImageUrl?.trim() ?? "";

    if (!imageUrl) {
      setDropError(null);
      onPreviewImageUrlChange?.(null);
      onImageUrlChange(null);
      return;
    }

    setBusyAction("url");
    setDropError(null);
    onPreviewImageUrlChange?.(null);

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/image/resolve`,
        {
          body: JSON.stringify({
            accessToken,
            imageUrl,
          }),
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { "x-admin-dashboard-token": accessToken } : {}),
          },
          method: "POST",
        },
      );
      const result = await resultMessage(response, viewLabels.imageMirrorError);

      if (!response.ok || !result.url) {
        throw new Error(result.message);
      }

      onImageUrlChange(result.url);
    } catch (error) {
      setDropError(
        error instanceof Error ? error.message : viewLabels.imageMirrorError,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadImageFile(file: File) {
    const previewUrl = URL.createObjectURL(file);

    onPreviewImageUrlChange?.(previewUrl);
    setBusyAction("upload");
    setDropError(null);

    try {
      const formData = new FormData();

      formData.set("accessToken", accessToken);
      formData.set("file", file);

      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/image/upload`,
        {
          body: formData,
          headers: accessToken
            ? { "x-admin-dashboard-token": accessToken }
            : undefined,
          method: "POST",
        },
      );
      const result = await resultMessage(response, viewLabels.imageUploadError);

      if (!response.ok || !result.url) {
        throw new Error(result.message);
      }

      onPreviewImageUrlChange?.(previewUrl, result.url);
      onImageUrlChange(result.url);
    } catch (error) {
      onPreviewImageUrlChange?.(null);
      setDropError(
        error instanceof Error ? error.message : viewLabels.imageUploadError,
      );
    } finally {
      setBusyAction(null);
    }
  }

  function uploadSelectedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void uploadImageFile(file);
    }

    event.target.value = "";
  }

  return (
    <div className="grid gap-3 text-sm font-medium text-gray-700">
      <span>{viewLabels.imageUrl}</span>
      <div
        className={classNames(
          "grid gap-3 rounded-xl border border-dashed bg-white p-3 transition sm:grid-cols-[auto_minmax(0,1fr)]",
          dragging
            ? "border-[#1FA77A] bg-emerald-50/60"
            : "border-gray-200"
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);

          if (event.dataTransfer.files.length > 0) {
            const file = event.dataTransfer.files.item(0);

            if (file) {
              void uploadImageFile(file);
            }

            return;
          }

          const imageUrl = droppedImageUrl(event.dataTransfer);

          if (!imageUrl) {
            setDropError(viewLabels.imageDropHint);
            return;
          }

          setDropError(null);
          void applyImageUrl(imageUrl);
        }}
      >
        <ProductImagePreview
          alt=""
          onImageLoad={onPreviewImageLoad}
          previewImageUrl={previewImageUrl}
          row={row}
          size="lg"
        />
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="block min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A] disabled:cursor-not-allowed disabled:bg-gray-50"
              defaultValue={editableImageUrl}
              disabled={busy}
              key={editableImageUrl}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applyImageUrl(urlInputRef.current?.value ?? "");
                }
              }}
              placeholder={viewLabels.imageDropHint}
              ref={urlInputRef}
              type="url"
            />
            <div className="flex shrink-0 gap-2">
              <button
                className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={() =>
                  void applyImageUrl(urlInputRef.current?.value ?? "")
                }
                type="button"
              >
                {busyAction === "url"
                  ? viewLabels.imageResolving
                  : viewLabels.imageUseUrl}
              </button>
              <input
                accept="image/gif,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                id={uploadInputId}
                onChange={uploadSelectedImage}
                type="file"
              />
              <label
                className={classNames(
                  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50",
                  busy ? "pointer-events-none opacity-60" : "",
                )}
                htmlFor={uploadInputId}
              >
                <Upload aria-hidden={true} className="size-4" strokeWidth={2.25} />
                {busyAction === "upload"
                  ? viewLabels.imageUploading
                  : viewLabels.imageUpload}
              </label>
            </div>
          </div>
          {dropError ? (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {dropError}
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-gray-500">
              {viewLabels.imageUploadHint}
            </p>
          )}
          {imageCandidates.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {viewLabels.imageCandidates}
              </p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {imageCandidates.map((imageUrl) => (
                  <button
                    className="rounded-lg ring-1 ring-gray-200 transition hover:ring-[#1FA77A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
                    draggable={true}
                    key={imageUrl}
                    onClick={() => {
                      setDropError(null);
                      void applyImageUrl(imageUrl);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/uri-list", imageUrl);
                      event.dataTransfer.setData("text/plain", imageUrl);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    title={imageUrl}
                    type="button"
                  >
                    <SafeImage
                      alt=""
                      className="size-14 rounded-lg object-cover"
                      fallback={
                        <div className="flex size-14 items-center justify-center rounded-lg bg-gray-50 text-[10px] font-semibold text-gray-400">
                          Image
                        </div>
                      }
                      height={56}
                      src={imageUrl}
                      width={56}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ProductCountryApprovalPatch = Readonly<{
  agencyCode?: string;
  agencyName?: string;
  approvalNumber?: string;
  evidenceUrl?: string | null;
}>;

function directCountryApproval(
  approvals: readonly AdminProductRow["regulatoryApprovals"][number][] = [],
  countryCode: string,
) {
  return (
    approvals.find(
      (approval) =>
        approval.scopeType === "country" &&
        approval.scopeCode.toUpperCase() === countryCode.toUpperCase(),
    ) ?? null
  );
}

function inheritedApprovalSummary(
  approvals: readonly AdminProductRow["regulatoryApprovals"][number][] = [],
) {
  return regulatoryApprovalSummary(
    approvals.filter((approval) => approval.scopeType === "region"),
  );
}

function approvalDisplayLabel(
  approval: AdminProductRow["regulatoryApprovals"][number] | null,
  fallback: string,
) {
  return approval
    ? `${approval.agencyName}: ${approval.approvalNumber}`
    : fallback;
}

export function LocalizedFallbackBadge({
  label,
}: Readonly<{
  label: string | null;
}>) {
  return label ? (
    <span className="inline-flex w-max rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  ) : null;
}

export function ProductCountryManager({
  addCountryLabel,
  allowedCountryCodes,
  countryCodes,
  countryPricing,
  disabledReason,
  label,
  onAdd,
  onPricingChange,
  onRegulatoryApprovalChange,
  onRemove,
  pricingLabels,
  regulatoryApprovals,
  variant = "default",
  removeLabel,
}: Readonly<{
  addCountryLabel: string;
  allowedCountryCodes?: readonly string[];
  countryCodes: readonly string[];
  countryPricing?: readonly ProductCountryPricing[];
  disabledReason?: string | null;
  label: string;
  onAdd: (countryCode: string) => void;
  onPricingChange?: (
    countryCode: string,
    patch: Partial<ProductCountryPricing>,
  ) => void;
  onRegulatoryApprovalChange?: (
    countryCode: string,
    patch: ProductCountryApprovalPatch,
  ) => boolean | void | Promise<boolean | void>;
  onRemove: (countryCode: string) => void;
  pricingLabels?: Readonly<{
    agency: string;
    approvalNumber: string;
    associateApproval: string;
    authority: string;
    cancel: string;
    country: string;
    currency: string;
    evidenceUrl: string;
    inheritedApproval: string;
    notAvailable: string;
    priceUpdated: string;
    rrp: string;
    saveAssociation: string;
  }>;
  regulatoryApprovals?: readonly AdminProductRow["regulatoryApprovals"][number][];
  variant?: "compact" | "default";
  removeLabel: string;
}>) {
  const safeCountryCodes = Array.isArray(countryCodes) ? [...countryCodes] : [];
  const allowedSet = allowedCountryCodes ? new Set(allowedCountryCodes) : null;
  const availableOptions = productCountryOptions.filter(
    (country) =>
      !safeCountryCodes.includes(country.code) &&
      (!allowedSet || allowedSet.has(country.code)),
  );
  const [approvalDialog, setApprovalDialog] = useState<Readonly<{
    agencyCode: string;
    approvalNumber: string;
    countryCode: string;
    evidenceUrl: string;
    saving: boolean;
  }> | null>(null);

  function openApprovalDialog(countryCode: string) {
    const approval = directCountryApproval(regulatoryApprovals, countryCode);
    const agency = approval
      ? regulatoryAgencyByCode(countryCode, approval.agencyCode)
      : defaultRegulatoryAgencyForCountry(countryCode);

    setApprovalDialog({
      agencyCode: agency.agencyCode,
      approvalNumber: approval?.approvalNumber ?? "",
      countryCode,
      evidenceUrl: approval?.evidenceUrl ?? "",
      saving: false,
    });
  }

  async function saveApprovalDialog() {
    if (!approvalDialog || !onRegulatoryApprovalChange) {
      return;
    }

    setApprovalDialog({
      ...approvalDialog,
      saving: true,
    });
    const agency = regulatoryAgencyByCode(
      approvalDialog.countryCode,
      approvalDialog.agencyCode,
    );
    const result = await onRegulatoryApprovalChange(
      approvalDialog.countryCode,
      {
        agencyCode: agency.agencyCode,
        agencyName: agency.agencyName,
        approvalNumber: approvalDialog.approvalNumber,
        evidenceUrl: approvalDialog.evidenceUrl.trim() || null,
      },
    );

    if (result !== false) {
      setApprovalDialog(null);
      return;
    }

    setApprovalDialog({
      ...approvalDialog,
      saving: false,
    });
  }

  return (
    <div
      className={classNames(
        "rounded-xl border border-gray-100 bg-gray-50",
        variant === "compact" ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <select
          aria-label={`${addCountryLabel}: ${label}`}
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(disabledReason) || availableOptions.length < 1}
          onChange={(event) => {
            if (event.target.value) {
              onAdd(event.target.value);
              event.target.value = "";
            }
          }}
          value=""
        >
          <option value="">{addCountryLabel}</option>
          {availableOptions.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </div>
      {onPricingChange ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  {pricingLabels?.country ?? "Country"}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {pricingLabels?.rrp ?? "RRP"}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {pricingLabels?.currency ?? "Currency"}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {pricingLabels?.approvalNumber ?? "Approval number"}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {pricingLabels?.priceUpdated ?? "Updated"}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {removeLabel}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {safeCountryCodes.map((countryCode) => {
                const pricing = countryPricing?.find(
                  (item) => item.countryCode === countryCode,
                );
                const approval = directCountryApproval(
                  regulatoryApprovals,
                  countryCode,
                );
                const inherited = inheritedApprovalSummary(
                  pricing?.effectiveRegulatoryApprovals,
                );

                return (
                  <tr key={countryCode}>
                    <td className="px-3 py-2 font-semibold text-emerald-800">
                      {productCountryLabel(countryCode)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-28 rounded-md bg-white px-2 py-1.5 text-xs text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                        inputMode="decimal"
                        min="0"
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          const validAmount =
                            event.target.value.trim() &&
                            Number.isFinite(parsed) &&
                            parsed >= 0;

                          onPricingChange(countryCode, {
                            rrpPriceAmount: validAmount ? parsed : null,
                          });
                        }}
                        placeholder="RRP"
                        step="0.01"
                        type="number"
                        value={pricing?.rrpPriceAmount ?? ""}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="w-24 rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                        onChange={(event) =>
                          onPricingChange(countryCode, {
                            currency: event.target.value,
                          })
                        }
                        value={pricing?.currency ?? "THB"}
                      >
                        {supportedOrganisationCurrencies.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className={classNames(
                          "text-left text-xs font-semibold underline-offset-2 hover:underline",
                          approval ? "text-[#126B4F]" : "text-amber-700",
                        )}
                        disabled={!onRegulatoryApprovalChange}
                        onClick={() => openApprovalDialog(countryCode)}
                        type="button"
                      >
                        {approvalDisplayLabel(
                          approval,
                          pricingLabels?.notAvailable ?? "Not available",
                        )}
                      </button>
                      {inherited !== "-" ? (
                        <p className="mt-1 text-[11px] font-medium text-gray-500">
                          {pricingLabels?.inheritedApproval ?? "Inherited"}:{" "}
                          {inherited}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {pricing?.priceUpdatedAt
                        ? new Date(pricing.priceUpdatedAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label={`${removeLabel}: ${productCountryLabel(countryCode)}`}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={safeCountryCodes.length <= 1}
                        onClick={() => onRemove(countryCode)}
                        type="button"
                      >
                        {removeLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {safeCountryCodes.map((countryCode) => (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700"
              key={countryCode}
            >
              {productCountryLabel(countryCode)}
              <button
                aria-label={`${removeLabel}: ${productCountryLabel(countryCode)}`}
                className="rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={safeCountryCodes.length <= 1}
                onClick={() => onRemove(countryCode)}
                type="button"
              >
                {removeLabel}
              </button>
            </span>
          ))}
        </div>
      )}
      {approvalDialog ? (
        <div
          aria-modal={true}
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl ring-1 ring-gray-200">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {pricingLabels?.associateApproval ??
                  "Associate approval number"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {productCountryLabel(approvalDialog.countryCode)}
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-semibold text-gray-700">
                {pricingLabels?.authority ?? "Authority"}
                <select
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  disabled={approvalDialog.saving}
                  onChange={(event) =>
                    setApprovalDialog({
                      ...approvalDialog,
                      agencyCode: event.target.value,
                    })
                  }
                  value={approvalDialog.agencyCode}
                >
                  {regulatoryAgencyOptionsForCountry(
                    approvalDialog.countryCode,
                  ).map((agency) => (
                    <option key={agency.agencyCode} value={agency.agencyCode}>
                      {agency.agencyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-gray-700">
                {pricingLabels?.approvalNumber ?? "Approval number"}
                <input
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  disabled={approvalDialog.saving}
                  onChange={(event) =>
                    setApprovalDialog({
                      ...approvalDialog,
                      approvalNumber: event.target.value,
                    })
                  }
                  value={approvalDialog.approvalNumber}
                />
              </label>
              <label className="text-sm font-semibold text-gray-700">
                {pricingLabels?.evidenceUrl ?? "Evidence URL"}
                <input
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  disabled={approvalDialog.saving}
                  onChange={(event) =>
                    setApprovalDialog({
                      ...approvalDialog,
                      evidenceUrl: event.target.value,
                    })
                  }
                  type="url"
                  value={approvalDialog.evidenceUrl}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={approvalDialog.saving}
                onClick={() => setApprovalDialog(null)}
                type="button"
              >
                {pricingLabels?.cancel ?? "Cancel"}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white ring-1 ring-[#1FA77A] hover:bg-[#168763] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={approvalDialog.saving}
                onClick={() => void saveApprovalDialog()}
                type="button"
              >
                {approvalDialog.saving
                  ? (pricingLabels?.saveAssociation ?? "Save association")
                  : (pricingLabels?.saveAssociation ?? "Save association")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {disabledReason ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

type ProductIdentifierType = AdminProductRow["identifiers"][number]["type"];

function identifierValue(
  row: Pick<AdminProductDetailRow, "identifiers">,
  type: ProductIdentifierType
) {
  const identifiers = Array.isArray(row.identifiers) ? row.identifiers : [];

  return (
    identifiers.find(
      (identifier) =>
        identifier.type === type && identifier.status === "active",
    )?.value ?? ""
  );
}

function normalizedDraftIdentifierValue(
  type: ProductIdentifierType,
  value: string,
) {
  const trimmed = value.trim();

  if (type === "ean13" || type === "upc") {
    return trimmed.replace(/[\s-]/g, "");
  }

  return trimmed.replace(/\s+/g, " ").toUpperCase();
}

export function ProductIdentifiersEditor({
  draft,
  setDraft,
  viewLabels,
}: Readonly<{
  draft: AdminProductDetailRow;
  setDraft: (row: AdminProductDetailRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const identifiers = Array.isArray(draft.identifiers) ? draft.identifiers : [];
  const identifierCandidates = Array.isArray(draft.identifierCandidates)
    ? draft.identifierCandidates
    : [];

  function updateIdentifier(type: ProductIdentifierType, value: string) {
    const trimmed = value.trim();
    const nextIdentifiers = identifiers.filter(
      (identifier) => identifier.type !== type,
    );

    setDraft({
      ...draft,
      identifiers: trimmed
        ? [
            ...nextIdentifiers,
            {
              confidence: "high",
              evidenceUrl: null,
              id: `draft:${type}`,
              normalizedValue: normalizedDraftIdentifierValue(type, trimmed),
              source: "admin",
              status: "active",
              type,
              updatedAt: null,
              value:
                type === "ean13" || type === "upc"
                  ? normalizedDraftIdentifierValue(type, trimmed)
                  : trimmed,
            },
          ]
        : nextIdentifiers,
    });
  }

  const candidateRows = identifierCandidates.filter(
    (candidate) =>
      candidate.status === "pending" || candidate.status === "conflict",
  );

  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {viewLabels.productIdentifiers}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {viewLabels.productIdentifiersHint}
          </p>
        </div>
        {candidateRows.length > 0 ? (
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
            {candidateRows.length} {viewLabels.identifierCandidates}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.ean13}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            inputMode="numeric"
            maxLength={17}
            onChange={(event) => updateIdentifier("ean13", event.target.value)}
            type="text"
            value={identifierValue(draft, "ean13")}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.upc}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            inputMode="numeric"
            maxLength={16}
            onChange={(event) => updateIdentifier("upc", event.target.value)}
            type="text"
            value={identifierValue(draft, "upc")}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.mattaNutraSku}
          <div className="mt-1 block w-full rounded-md bg-white px-3 py-2 font-mono text-xs text-gray-700 ring-1 ring-gray-200">
            {draft.id}
          </div>
        </label>
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.manufacturerSku}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateIdentifier("manufacturer_sku", event.target.value)
            }
            type="text"
            value={identifierValue(draft, "manufacturer_sku")}
          />
        </label>
      </div>
      {candidateRows.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.identifierType}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.identifierValue}
                </th>
                <th className="px-3 py-2 font-semibold">{viewLabels.source}</th>
                <th className="px-3 py-2 font-semibold">{viewLabels.status}</th>
                <th className="px-3 py-2 text-right font-semibold">
                  {viewLabels.approve}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {candidateRows.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {candidate.type}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{candidate.value}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {candidate.source}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {candidate.status}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={candidate.status === "conflict"}
                      onClick={() =>
                        updateIdentifier(candidate.type, candidate.value)
                      }
                      type="button"
                    >
                      {viewLabels.useCandidate}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ProductCard({
  href,
  locale,
  onSelect,
  row,
  viewLabels,
}: Readonly<{
  href?: string;
  locale: Locale;
  onSelect?: () => void;
  row: ProductCardRow;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const localized = adminLocalizedProductText(row, locale);
  const fallbackLabel = adminLocalizedFallbackLabel(localized.title, locale);
  const state = productBusinessState(row);
  const readyCountryPrice = row.countryPricing.find(
    (item) => item.rrpPriceAmount !== null && item.rrpPriceAmount > 0,
  );
  const approvalSummary = regulatoryApprovalSummary(row.regulatoryApprovals);
  const content = (
    <>
      <div className="flex gap-4">
        <ProductImagePreview row={row} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  {localized.title.value}
                </h3>
                <p className="text-sm font-medium text-gray-500">
                  {row.brandName?.trim() || viewLabels.notAvailable}
                </p>
                <LocalizedFallbackBadge label={fallbackLabel} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-semibold uppercase tracking-wide text-gray-400">
                    {viewLabels.markets}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {row.availableCountryCodes.length > 0 ? (
                      row.availableCountryCodes.map((countryCode) => (
                        <span
                          className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-700"
                          key={countryCode}
                        >
                          {countryCode}
                        </span>
                      ))
                    ) : (
                      <span className="font-medium text-gray-500">
                        {viewLabels.notAvailable}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-medium text-gray-700">
                    {approvalSummary !== "-"
                      ? approvalSummary
                      : viewLabels.notAvailable}
                  </span>
                </div>
                {readyCountryPrice?.rrpPriceAmount ? (
                  <>
                    <span
                      aria-label={viewLabels.rrp}
                      className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-100"
                    >
                      {readyCountryPrice.rrpPriceAmount}{" "}
                      {readyCountryPrice.currency}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.productAudience === "both" ? null : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                    {productStatusLabel(row.productAudience, locale)}
                  </span>
                )}
              </div>
            </div>
            <span
              className={classNames(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                productBusinessStateClass(state),
              )}
            >
              {productBusinessStateLabel(state, locale)}
            </span>
          </div>
          <div
            aria-label={viewLabels.translationStatus}
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500"
          >
            <span className="font-semibold uppercase tracking-wide text-gray-400">
              {viewLabels.translations}
            </span>
            {productTranslationLocales(row).map((siteLocale) => {
              const translation = productTranslationFor(row, siteLocale.code);

              return (
                <span
                  className={classNames(
                    "inline-flex items-center gap-1.5 font-semibold",
                    siteLocale.code === "zh-CN"
                      ? adminLocaleTextClass("zh-CN", "label")
                      : siteLocale.code === "th"
                        ? adminLocaleTextClass("th", "label")
                        : "uppercase tracking-wide",
                    translation.status === "missing"
                      ? "text-gray-400"
                      : "text-gray-600",
                  )}
                  key={siteLocale.code}
                  title={`${siteLocale.nativeLabel}: ${productTranslationStatusLabel(translation.status, locale)}`}
                >
                  <span
                    aria-hidden="true"
                    className={classNames(
                      "size-1.5 rounded-full",
                      translation.status === "complete"
                        ? "bg-emerald-500"
                        : translation.status === "draft"
                          ? "bg-amber-400"
                          : "bg-gray-300",
                    )}
                  />
                  {siteLocale.label}
                </span>
              );
            })}
          </div>
          {row.facts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.facts.slice(0, 6).map((fact) => (
                <span
                  className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  key={fact.id}
                >
                  {fact.name}
                  {fact.amount
                    ? ` ${fact.amount}${fact.unit ? ` ${fact.unit}` : ""}`
                    : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              {viewLabels.noParsedFacts}
            </p>
          )}
        </div>
      </div>
    </>
  );

  const className =
    "self-start rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md";

  return href ? (
    <a className={className} href={href}>
      {content}
    </a>
  ) : (
    <button className={className} onClick={onSelect} type="button">
      {content}
    </button>
  );
}

export function ProductFactsEditor({
  draft,
  onIncreaseSafetyLimit,
  saving,
  setDraft,
  viewLabels,
}: Readonly<{
  draft: AdminProductDetailRow;
  onIncreaseSafetyLimit: (
    row: AdminProductDetailRow,
    factId: string,
  ) => Promise<boolean>;
  saving: boolean;
  setDraft: (row: AdminProductDetailRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  type ProductFact = AdminProductDetailRow["facts"][number];

  function updateFact(index: number, patch: Partial<ProductFact>) {
    setDraft({
      ...draft,
      facts: draft.facts.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function removeFact(index: number) {
    setDraft({
      ...draft,
      facts: draft.facts.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addFact() {
    setDraft({
      ...draft,
      facts: [
        ...draft.facts,
        {
          amount: null,
          comparableAmount: null,
          confidence: "moderate",
          id: crypto.randomUUID(),
          itemType: "supplement",
          maxAmount: null,
          maxUnit: null,
          name: "",
          normalizedName: "",
          safetyFlags: [],
          source: "admin",
          sourceText: null,
          sourceUrl: null,
          supplementStatus: null,
          unit: null,
        },
      ],
    });
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {viewLabels.parsedFacts}
        </h3>
        <button
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
          onClick={addFact}
          type="button"
        >
          {viewLabels.addFact}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {draft.facts.length > 0 ? (
          draft.facts.map((fact, index) => {
            const factIssues = productFactIssueMessages(fact);
            const issueSeverity = productFactIssueSeverity(factIssues);
            const hasIssues = issueSeverity !== "none";
            const highSeverity = issueSeverity === "high";
            const safetyLimitIncreaseLabel =
              productFactSafetyLimitIncreaseLabel(fact);
            const inputClass = classNames(
              "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
              hasIssues ? "ring-amber-200" : "ring-gray-200",
            );

            return (
              <div
                className={classNames(
                  "grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]",
                  highSeverity
                    ? "border-red-200 bg-red-50 ring-1 ring-red-100"
                    : hasIssues
                      ? "border-amber-200 bg-amber-50 ring-1 ring-amber-100"
                      : "border-gray-100 bg-gray-50",
                )}
                key={fact.id}
              >
                <input
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, { name: event.target.value })
                  }
                  placeholder={viewLabels.ingredient}
                  value={fact.name}
                />
                <input
                  className={inputClass}
                  inputMode="decimal"
                  onChange={(event) => {
                    const parsed = Number(event.target.value);

                    updateFact(index, {
                      amount:
                        event.target.value.trim() &&
                        Number.isFinite(parsed) &&
                        parsed >= 0
                          ? parsed
                          : null,
                    });
                  }}
                  placeholder={viewLabels.amount}
                  value={fact.amount ?? ""}
                />
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, {
                      unit: event.target.value.trim() || null,
                    })
                  }
                  value={fact.unit ?? ""}
                >
                  <option value="">{viewLabels.unit}</option>
                  {productDoseUnitSelectOptions(fact.unit).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, {
                      confidence: event.target
                        .value as ProductFact["confidence"],
                    })
                  }
                  value={fact.confidence}
                >
                  <option value="high">{viewLabels.confidenceHigh}</option>
                  <option value="moderate">
                    {viewLabels.confidenceModerate}
                  </option>
                  <option value="low">{viewLabels.confidenceLow}</option>
                </select>
                <div className="flex items-center justify-end gap-2">
                  {safetyLimitIncreaseLabel ? (
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-[#126B4F] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving}
                      onClick={() => void onIncreaseSafetyLimit(draft, fact.id)}
                      type="button"
                    >
                      {viewLabels.increaseLimit}
                    </button>
                  ) : null}
                  <button
                    className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => removeFact(index)}
                    type="button"
                  >
                    {viewLabels.remove}
                  </button>
                </div>
                {fact.sourceText ? (
                  <p className="text-xs text-gray-500 sm:col-span-5">
                    {fact.sourceText}
                  </p>
                ) : null}
                {factIssues.length > 0 ? (
                  <div
                    className={classNames(
                      "flex flex-wrap items-center gap-1.5 text-xs font-medium sm:col-span-5",
                      highSeverity ? "text-red-800" : "text-amber-800",
                    )}
                  >
                    {factIssues.map((issue) => (
                      <span
                        className={classNames(
                          "rounded-full border bg-white px-2 py-1",
                          highSeverity ? "border-red-200" : "border-amber-200",
                        )}
                        key={issue}
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <span className="text-sm text-amber-700">
            {viewLabels.noParsedFacts}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProductTranslationEditor({
  draft,
  locale,
  setDraft,
  viewLabels,
}: Readonly<{
  draft: AdminProductDetailRow;
  locale: Locale;
  setDraft: (row: AdminProductDetailRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const [selectedTranslationLocale, setSelectedTranslationLocale] =
    useState<string>(siteLocaleRegistry[0]?.code ?? "en");
  const translationLocales = productTranslationLocales(draft);
  const activeTranslationLocale = translationLocales.some(
    (siteLocale) => siteLocale.code === selectedTranslationLocale,
  )
    ? selectedTranslationLocale
    : (translationLocales[0]?.code ?? "en");
  const activeTranslationMeta = productLocaleMeta(activeTranslationLocale);
  const activeTranslation = productTranslationFor(
    draft,
    activeTranslationLocale,
  );

  function translationFor(locale: string) {
    return productTranslationFor(draft, locale);
  }

  function updateTranslation(
    locale: string,
    patch: Readonly<{
      description?: string | null;
      status?: AdminProductDetailRow["translations"][string]["status"];
      title?: string | null;
    }>,
  ) {
    const current = translationFor(locale);
    const nextTranslation = {
      ...current,
      ...patch,
    };
    const hasTitle = Boolean(nextTranslation.title?.trim());
    const hasDescription = Boolean(nextTranslation.description?.trim());
    const inferredStatus =
      hasTitle && hasDescription
        ? ("complete" as const)
        : hasTitle || hasDescription
          ? ("draft" as const)
          : ("missing" as const);
    const nextStatus =
      patch.status ??
      (current.status === "complete" && hasTitle ? "complete" : inferredStatus);
    const translations = {
      ...(draft.translations ?? {}),
      [locale]: {
        ...nextTranslation,
        description: nextTranslation.description?.trim() || null,
        status: nextStatus,
        title: nextTranslation.title?.trim() || null,
      },
    };
    const englishTitle = translations.en?.title?.trim();
    const nextDraft: AdminProductDetailRow = {
      ...draft,
      translations,
      ...(locale === "en"
        ? {
            description: translations.en?.description ?? draft.description,
            ...(englishTitle ? { title: englishTitle } : {}),
          }
        : {}),
    };

    setDraft(nextDraft);
  }

  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {viewLabels.translations}
          </h3>
        </div>
        <span
          className={classNames(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            productTranslationStatusClass(activeTranslation.status),
          )}
        >
          {activeTranslationMeta.label}{" "}
          {productTranslationStatusLabel(activeTranslation.status, locale)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {translationLocales.map((siteLocale) => {
          const translation = translationFor(siteLocale.code);
          const selected = siteLocale.code === activeTranslationLocale;

          return (
            <button
              className={classNames(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
                siteLocale.code === "zh-CN"
                  ? adminLocaleTextClass("zh-CN", "label")
                  : siteLocale.code === "th"
                    ? adminLocaleTextClass("th", "label")
                    : "uppercase tracking-wide",
                productTranslationStatusClass(translation.status),
                selected
                  ? "ring-2 ring-[#1FA77A] ring-offset-1"
                  : "hover:border-emerald-200 hover:text-[#126B4F]",
              )}
              key={siteLocale.code}
              onClick={() => setSelectedTranslationLocale(siteLocale.code)}
              title={`${siteLocale.nativeLabel}: ${productTranslationStatusLabel(translation.status, locale)}`}
              type="button"
            >
              {siteLocale.label}{" "}
              {productTranslationStatusLabel(translation.status, locale)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.translationStatus} · {activeTranslationMeta.nativeLabel}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateTranslation(activeTranslationLocale, {
                status: event.target
                  .value as AdminProductDetailRow["translations"][string]["status"],
              })
            }
            value={activeTranslation.status}
          >
            <option value="complete">{viewLabels.complete}</option>
            <option value="draft">{viewLabels.draft}</option>
            <option value="missing">{viewLabels.missing}</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.title} · {activeTranslationMeta.nativeLabel}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateTranslation(activeTranslationLocale, {
                title: event.target.value,
              })
            }
            type="text"
            value={activeTranslation.title ?? ""}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          {viewLabels.description} · {activeTranslationMeta.nativeLabel}
          <textarea
            className="min-h-28 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateTranslation(activeTranslationLocale, {
                description: event.target.value,
              })
            }
            value={activeTranslation.description ?? ""}
          />
        </label>
      </div>
    </div>
  );
}
