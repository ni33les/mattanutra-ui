import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { contentImageCacheControl } from "@/lib/content-image-storage";
import {
  fetchAndValidateFirstPartyImage,
  firstPartyImageStorageConfigFromEnv,
  firstPartyImageStorageEnvironment,
  firstPartyImageStorageKey,
  storeFirstPartyImageBytes,
  validateFirstPartyImageBytes,
  type FirstPartyImageMirrorMetadata
} from "@/lib/first-party-image-mirror";
import { updateAdminProduct } from "./admin-product-writes.ts";
import type { AdminProductRow } from "./admin-product-types.ts";

type ProductImageStorage = "cloud" | "local" | "existing";

export type AdminProductImageReadyPayload = Readonly<{
  byteSize: number | null;
  cacheControl: string | null;
  contentType: string | null;
  dimensions: {
    height: number | null;
    width: number | null;
  };
  key: string | null;
  source: "upload" | "url";
  status: "ready";
  storage: ProductImageStorage;
  url: string;
  verifiedAt: string;
}>;

export type AdminProductImageUpdateResult = Readonly<{
  image: AdminProductImageReadyPayload;
  row: AdminProductRow;
  url: string;
}>;

export class AdminProductImageError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.name = "AdminProductImageError";
    this.status = status;
  }
}

const maxProductImageUploadBytes = 6 * 1024 * 1024;
const productImageVerificationRetryDelaysMs = [0, 300, 900, 1800] as const;
const storageCredentialEnvKeys = [
  "DO_SPACES_ACCESS_KEY",
  "DO_SPACES_ACCESS_KEY_ID",
  "DO_SPACES_SECRET_ACCESS_KEY",
  "DO_SPACES_SECRET_KEY",
  "DO_SPACES_KEY"
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runtimeImageEnvironment(
  value = process.env.MATTANUTRA_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "prd" : "dev"),
) {
  return firstPartyImageStorageEnvironment(value);
}

export function localProductImageFallbackAllowed(
  environment = process.env.MATTANUTRA_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "prd" : "dev"),
  nodeEnvironment = process.env.NODE_ENV,
) {
  const normalizedEnvironment = runtimeImageEnvironment(environment);

  return normalizedEnvironment === "dev" && nodeEnvironment !== "production" && nodeEnvironment !== "test";
}

function storageFallbackEligible(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /storage is not configured|AccessDenied|CredentialsProviderError|InvalidAccessKeyId|SignatureDoesNotMatch|DO_SPACES_KEY|DO_SPACES_ACCESS_KEY_ID|DO_SPACES_SECRET_ACCESS_KEY/i.test(
    `${error.name} ${error.message}`,
  );
}

function storageCredentialError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /AccessDenied|CredentialsProviderError|InvalidAccessKeyId|SignatureDoesNotMatch|DO_SPACES_KEY|DO_SPACES_ACCESS_KEY_ID|DO_SPACES_SECRET_ACCESS_KEY/i.test(
    `${error.name} ${error.message}`,
  );
}

function storageUnavailableMessage(error: unknown) {
  if (storageCredentialError(error)) {
    return "Product image storage credentials are invalid. Check DO_SPACES_ACCESS_KEY_ID and DO_SPACES_SECRET_ACCESS_KEY, or legacy DO_SPACES_KEY=access:secret.";
  }

  return "Product image storage is not configured correctly for this environment.";
}

function storageEnvPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function storageCredentialMode() {
  const hasExplicitAccess =
    storageEnvPresent("DO_SPACES_ACCESS_KEY_ID") ||
    storageEnvPresent("DO_SPACES_ACCESS_KEY");
  const hasExplicitSecret =
    storageEnvPresent("DO_SPACES_SECRET_ACCESS_KEY") ||
    storageEnvPresent("DO_SPACES_SECRET_KEY");

  if (hasExplicitAccess || hasExplicitSecret) {
    return hasExplicitAccess && hasExplicitSecret
      ? "explicit"
      : "partial_explicit";
  }

  return storageEnvPresent("DO_SPACES_KEY") ? "legacy" : "missing";
}

function safeUrlSummary(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  if (text.startsWith("/")) {
    return {
      host: null,
      path: text
    };
  }

  try {
    const url = new URL(text);

    return {
      host: url.host,
      path: url.pathname
    };
  } catch {
    return {
      host: null,
      path: "invalid_url"
    };
  }
}

function metadataDetails(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const metadata = value as Record<string, unknown>;

  return {
    attempts: metadata.attempts,
    extendedRequestId: metadata.extendedRequestId,
    httpStatusCode: metadata.httpStatusCode,
    requestId: metadata.requestId,
    totalRetryDelay: metadata.totalRetryDelay
  };
}

export function adminProductImageErrorDetails(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  const record = error as Error & {
    $metadata?: unknown;
    cause?: unknown;
    code?: unknown;
    Code?: unknown;
  };

  return {
    cause:
      record.cause && depth < 2
        ? adminProductImageErrorDetails(record.cause, depth + 1)
        : undefined,
    code: record.code ?? record.Code,
    message: error.message,
    metadata: metadataDetails(record.$metadata),
    name: error.name,
  };
}

export function adminProductImageStorageDiagnostics() {
  const envKeyPresence = Object.fromEntries(
    storageCredentialEnvKeys.map((key) => [key, storageEnvPresent(key)])
  );
  const diagnostics = {
    cdnEndpointConfigured:
      storageEnvPresent("DO_SPACES_CDN_ENDPOINT") ||
      storageEnvPresent("DO_SPACES_CDN_URL") ||
      storageEnvPresent("DO_SPACES_PUBLIC_BASE_URL"),
    credentialMode: storageCredentialMode(),
    endpointConfigured: storageEnvPresent("DO_SPACES_ENDPOINT"),
    envKeyPresence,
    environment: runtimeImageEnvironment(),
    fallbackAllowed: localProductImageFallbackAllowed(),
    readiness: "missing" as "configured" | "malformed" | "missing",
    storage: null as null | {
      bucket: string;
      endpoint: ReturnType<typeof safeUrlSummary>;
      publicBaseUrl: ReturnType<typeof safeUrlSummary>;
      region: string;
    },
    storageError: null as unknown
  };

  try {
    const config = firstPartyImageStorageConfigFromEnv();

    if (!config) {
      return diagnostics;
    }

    return {
      ...diagnostics,
      readiness: "configured" as const,
      storage: {
        bucket: config.bucket,
        endpoint: safeUrlSummary(config.endpoint),
        publicBaseUrl: safeUrlSummary(config.publicBaseUrl),
        region: config.region
      }
    };
  } catch (error) {
    return {
      ...diagnostics,
      readiness: "malformed" as const,
      storageError: adminProductImageErrorDetails(error)
    };
  }
}

function imageUploadLogContext(input: Readonly<{
  productId: string;
  requestId?: string | null;
}>) {
  return {
    environment: runtimeImageEnvironment(),
    fallbackAllowed: localProductImageFallbackAllowed(),
    productId: input.productId,
    requestId: input.requestId ?? null
  };
}

function productUploadOriginalUrl(fileName: string) {
  const trimmed = fileName.trim();

  return trimmed ? `upload:${trimmed}` : "upload:product-image";
}

async function uploadLocalProductImage(input: Readonly<{
  bytes: Buffer;
  contentType: string;
  originalFileName: string;
  productId: string;
  requestId?: string | null;
}>) {
  const validated = await validateFirstPartyImageBytes({
    bytes: input.bytes,
    contentType: input.contentType,
    maxBytes: maxProductImageUploadBytes,
  });

  if (!validated.ok) {
    throw new AdminProductImageError(
      validated.reason,
      validated.detail,
      400,
    );
  }

  const environment = runtimeImageEnvironment();
  const key = firstPartyImageStorageKey({
    entityId: input.productId,
    environment,
    extension: validated.extension,
    namespace: "products",
    sha256: validated.sha256,
  });
  const uploadPath = join(process.cwd(), "public", "uploads", key);

  await mkdir(dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, validated.bytes, { flag: "wx" }).catch(
    (error: unknown) => {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        )
      ) {
        throw error;
      }
    },
  );

  const mirroredAt = new Date().toISOString();
  const metadata: FirstPartyImageMirrorMetadata = {
    byteSize: validated.bytes.length,
    cacheControl: contentImageCacheControl,
    contentType: validated.contentType,
    dimensions: {
      height: validated.height,
      width: validated.width,
    },
    environment,
    evidenceUrl: null,
    hash: validated.sha256,
    mirroredAt,
    mirroredUrl: `/uploads/${key}`,
    originalHost: null,
    originalUrl: productUploadOriginalUrl(input.originalFileName),
    source: "admin_product_image_upload",
    storedKey: key,
  };

  return {
    byteSize: validated.bytes.length,
    cacheControl: contentImageCacheControl,
    contentType: validated.contentType,
    dimensions: {
      height: validated.height,
      width: validated.width,
    },
    key,
    metadata,
    storage: "local" as const,
    url: `/uploads/${key}`,
  };
}

async function storeUploadedProductImage(input: Readonly<{
  bytes: Buffer;
  contentType: string;
  originalFileName: string;
  productId: string;
  requestId?: string | null;
}>) {
  const logContext = imageUploadLogContext(input);

  console.info("Admin product image storage attempt", {
    ...logContext,
    contentType: input.contentType,
    originalFileName: input.originalFileName,
    size: input.bytes.length,
    storage: adminProductImageStorageDiagnostics()
  });

  try {
    const stored = await storeFirstPartyImageBytes({
      bytes: input.bytes,
      contentType: input.contentType,
      entityId: input.productId,
      maxBytes: maxProductImageUploadBytes,
      namespace: "products",
      originalUrl: productUploadOriginalUrl(input.originalFileName),
      required: true,
      source: "admin_product_image_upload",
    });

    console.info("Admin product image storage succeeded", {
      ...logContext,
      byteSize: stored.metadata.byteSize,
      contentType: stored.contentType,
      dimensions: stored.dimensions,
      key: stored.key,
      storage: stored.storage,
      url: safeUrlSummary(stored.url)
    });

    return {
      byteSize: stored.metadata.byteSize,
      cacheControl: stored.cacheControl,
      contentType: stored.contentType,
      dimensions: stored.dimensions,
      key: stored.key,
      metadata: stored.metadata,
      storage: stored.storage,
      url: stored.url,
    };
  } catch (error) {
    console.error("Admin product image storage failed", {
      ...logContext,
      error: adminProductImageErrorDetails(error),
      storage: adminProductImageStorageDiagnostics()
    });

    if (
      !localProductImageFallbackAllowed() ||
      !storageFallbackEligible(error)
    ) {
      if (storageFallbackEligible(error)) {
        throw new AdminProductImageError(
          storageCredentialError(error)
            ? "image_storage_credentials_invalid"
            : "image_storage_unavailable",
          storageUnavailableMessage(error),
          502,
          { cause: error },
        );
      }

      throw error;
    }

    console.warn(
      "Admin product image cloud upload unavailable; using local workstation fallback",
      {
        ...logContext,
        error: adminProductImageErrorDetails(error)
      },
    );

    return uploadLocalProductImage(input);
  }
}

export async function verifyProductImageUrl(input: Readonly<{
  fetcher?: Parameters<typeof fetchAndValidateFirstPartyImage>[0]["fetcher"];
  imageUrl: string;
  maxBytes?: number;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}>) {
  const imageUrl = input.imageUrl.trim();

  if (!imageUrl) {
    throw new AdminProductImageError(
      "empty_image_url",
      "Image URL is required.",
      400,
    );
  }

  if (imageUrl.startsWith("/")) {
    return {
      contentType: null,
      height: null,
      width: null,
    };
  }

  const retryDelaysMs =
    input.retryDelaysMs ?? productImageVerificationRetryDelaysMs;
  let lastFailure: { detail: string; reason: string } | null = null;

  for (const [index, delayMs] of retryDelaysMs.entries()) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await fetchAndValidateFirstPartyImage({
      fetcher: input.fetcher,
      imageUrl,
      maxBytes: input.maxBytes ?? maxProductImageUploadBytes,
      timeoutMs: input.timeoutMs ?? 4000,
    });

    if (result.ok) {
      return {
        contentType: result.contentType,
        height: result.height,
        width: result.width,
      };
    }

    lastFailure = {
      detail: result.detail,
      reason: result.reason,
    };

    if (index === retryDelaysMs.length - 1) {
      break;
    }
  }

  throw new AdminProductImageError(
    "image_url_not_readable",
    `Stored product image is not publicly readable: ${
      lastFailure?.reason ?? "unknown"
    } (${lastFailure?.detail ?? "unknown"})`,
    502,
  );
}

function productImageSnapshot(input: Readonly<{
  byteSize: number | null;
  cacheControl: string | null;
  contentType: string | null;
  dimensions: {
    height: number | null;
    width: number | null;
  };
  key: string | null;
  source: "upload" | "url";
  storage: ProductImageStorage;
  url: string;
  verifiedAt: string;
}>) {
  return {
    productImageUpload: {
      byteSize: input.byteSize,
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      dimensions: input.dimensions,
      key: input.key,
      source: input.source,
      status: "ready",
      storage: input.storage,
      url: input.url,
      verifiedAt: input.verifiedAt,
    },
  };
}

export async function persistVerifiedAdminProductImageUrl(input: Readonly<{
  actor?: string | null;
  byteSize?: number | null;
  cacheControl?: string | null;
  changeNote: string;
  contentType?: string | null;
  dimensions?: {
    height: number | null;
    width: number | null;
  } | null;
  imageUrl: string;
  key?: string | null;
  productId: string;
  requestId?: string | null;
  source: "upload" | "url";
  storage?: ProductImageStorage;
}>): Promise<AdminProductImageUpdateResult> {
  const imageUrl = input.imageUrl.trim();
  const logContext = imageUploadLogContext(input);

  if (imageUrl.startsWith("/uploads/") && !localProductImageFallbackAllowed()) {
    throw new AdminProductImageError(
      "non_durable_image_url",
      "Local upload URLs cannot be saved in this environment. Uploads must be stored on durable image storage.",
      400,
    );
  }

  console.info("Admin product image verification attempt", {
    ...logContext,
    imageUrl: safeUrlSummary(imageUrl),
    storage: input.storage ?? "existing"
  });

  let verification: Awaited<ReturnType<typeof verifyProductImageUrl>>;

  try {
    verification = await verifyProductImageUrl({
      imageUrl,
    });
  } catch (error) {
    console.error("Admin product image verification failed", {
      ...logContext,
      error: adminProductImageErrorDetails(error),
      imageUrl: safeUrlSummary(imageUrl)
    });
    throw error;
  }

  console.info("Admin product image verification succeeded", {
    ...logContext,
    contentType: verification.contentType,
    dimensions: {
      height: verification.height,
      width: verification.width
    },
    imageUrl: safeUrlSummary(imageUrl)
  });
  const verifiedAt = new Date().toISOString();
  const dimensions = input.dimensions ?? {
    height: verification.height,
    width: verification.width,
  };
  const contentType = input.contentType ?? verification.contentType;
  const image: AdminProductImageReadyPayload = {
    byteSize: input.byteSize ?? null,
    cacheControl: input.cacheControl ?? null,
    contentType,
    dimensions,
    key: input.key ?? null,
    source: input.source,
    status: "ready",
    storage: input.storage ?? "existing",
    url: imageUrl,
    verifiedAt,
  };
  let row: AdminProductRow;

  try {
    row = await updateAdminProduct({
      actor: input.actor ?? "admin_dashboard",
      changeNote: input.changeNote,
      id: input.productId,
      imageUrl,
      sourceSnapshotPatch: productImageSnapshot(image),
    });
  } catch (error) {
    console.error("Admin product image persistence failed", {
      ...logContext,
      error: adminProductImageErrorDetails(error),
      imageUrl: safeUrlSummary(imageUrl)
    });
    throw error;
  }

  console.info("Admin product image persistence succeeded", {
    ...logContext,
    imageUrl: safeUrlSummary(row.imageUrl ?? imageUrl),
    storage: image.storage
  });

  return {
    image,
    row,
    url: row.imageUrl ?? imageUrl,
  };
}

export async function uploadAdminProductImage(input: Readonly<{
  actor?: string | null;
  bytes: Buffer;
  contentType: string;
  originalFileName: string;
  productId: string;
  requestId?: string | null;
}>): Promise<AdminProductImageUpdateResult> {
  const stored = await storeUploadedProductImage(input);

  return persistVerifiedAdminProductImageUrl({
    actor: input.actor ?? "admin_dashboard",
    byteSize: stored.byteSize,
    cacheControl: stored.cacheControl,
    changeNote: "product_image_uploaded",
    contentType: stored.contentType,
    dimensions: stored.dimensions,
    imageUrl: stored.url,
    key: stored.key,
    productId: input.productId,
    requestId: input.requestId,
    source: "upload",
    storage: stored.storage,
  });
}
