import { createHash } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { contentImageCacheControl } from "@/lib/content-image-storage";
import {
  imageUrlHost,
  isExternalRuntimeImageUrl,
  isFirstPartyImageUrl,
  normalizeRuntimeImageUrl
} from "@/lib/first-party-image-rules";

export type FirstPartyImageEnvironment = "dev" | "uat" | "prd";

export type FirstPartyImageStorageConfig = Readonly<{
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}>;

export type FirstPartyImageMirrorMetadata = Readonly<{
  byteSize: number;
  cacheControl: string;
  contentType: string;
  dimensions: {
    height: number | null;
    width: number | null;
  };
  environment: string;
  evidenceUrl: string | null;
  hash: string;
  mirroredAt: string;
  mirroredUrl: string;
  originalHost: string | null;
  originalUrl: string;
  source: string | null;
  storedKey: string;
}>;

export type FirstPartyImageMirrorResult = Readonly<{
  metadata: FirstPartyImageMirrorMetadata | null;
  mirrored: boolean;
  skippedReason: "empty" | "first_party" | "storage_unconfigured" | null;
  url: string | null;
}>;

export type FirstPartyImageValidationResult =
  | Readonly<{
      bytes: Buffer;
      contentType: string;
      extension: string;
      height: number | null;
      ok: true;
      sha256: string;
      width: number | null;
    }>
  | Readonly<{
      detail: string;
      ok: false;
      reason:
        | "decode_failed"
        | "fetch_failed"
        | "http_status"
        | "image_too_large"
        | "invalid_mime"
        | "invalid_url"
        | "unsupported_protocol";
    }>;

export type FirstPartyImageStoredBytesResult = Readonly<{
  cacheControl: string;
  contentType: string;
  dimensions: {
    height: number | null;
    width: number | null;
  };
  key: string;
  metadata: FirstPartyImageMirrorMetadata;
  mirrored: true;
  storage: "cloud";
  url: string;
}>;

type Fetcher = (
  url: string,
  init?: RequestInit
) => Promise<Pick<Response, "arrayBuffer" | "headers" | "ok" | "status">>;

type Uploader = (input: Readonly<{
  bytes: Buffer;
  cacheControl: string;
  contentType: string;
  key: string;
}>) => Promise<Readonly<{
  key: string;
  url: string;
}>>;

const allowedImageContentTypes = new Map<string, string>([
  ["image/avif", "avif"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
] as const);

const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function safePathSegment(value: string, fallback: string) {
  const segment = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return segment || fallback;
}

function normalizedContentType(value: string | null | undefined) {
  return value?.toLowerCase().split(";")[0]?.trim() ?? "";
}

function extensionFromContentType(value: string | null | undefined) {
  return allowedImageContentTypes.get(normalizedContentType(value)) ?? null;
}

function extensionFromSharpFormat(value: string | undefined) {
  if (value === "jpeg") {
    return "jpg";
  }

  return value && ["avif", "gif", "jpg", "png", "webp"].includes(value)
    ? value
    : null;
}

function contentTypeFromExtension(extension: string) {
  if (extension === "jpg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  if (extension === "gif") return "image/gif";

  return "application/octet-stream";
}

export async function validateFirstPartyImageBytes(input: Readonly<{
  bytes: Buffer;
  contentType?: string | null;
  maxBytes?: number;
}>): Promise<FirstPartyImageValidationResult> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const contentTypeHeader = input.contentType ?? null;
  const headerExtension = extensionFromContentType(contentTypeHeader);

  if (input.bytes.length > maxBytes) {
    return {
      detail: `Image is too large: ${input.bytes.length} bytes.`,
      ok: false,
      reason: "image_too_large"
    };
  }

  if (contentTypeHeader && !headerExtension) {
    return {
      detail: `Unsupported image content type: ${contentTypeHeader ?? "unknown"}.`,
      ok: false,
      reason: "invalid_mime"
    };
  }

  const metadata = await sharp(input.bytes).metadata().catch((error: unknown) => ({
    decodeError: error instanceof Error ? error.message : String(error)
  }));

  if ("decodeError" in metadata) {
    return {
      detail: metadata.decodeError,
      ok: false,
      reason: "decode_failed"
    };
  }

  const extension =
    extensionFromSharpFormat(metadata.format) ?? headerExtension;

  if (!extension) {
    return {
      detail: `Unsupported image content type: ${contentTypeHeader ?? "unknown"}.`,
      ok: false,
      reason: "invalid_mime"
    };
  }

  return {
    bytes: input.bytes,
    contentType: contentTypeFromExtension(extension),
    extension,
    height: metadata.height ?? null,
    ok: true,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    width: metadata.width ?? null
  };
}

function digitalOceanEndpointConfig(value: string) {
  try {
    const url = new URL(value);
    const parts = url.hostname.split(".");

    if (
      parts.length < 4 ||
      parts.at(-2) !== "digitaloceanspaces" ||
      parts.at(-1) !== "com"
    ) {
      return null;
    }

    const bucket = parts[0];
    const region = parts[1];

    return bucket && region
      ? {
          bucket,
          cdnBaseUrl: `${url.protocol}//${bucket}.${region}.cdn.digitaloceanspaces.com`,
          endpoint: `${url.protocol}//${region}.digitaloceanspaces.com`,
          region
        }
      : null;
  } catch {
    return null;
  }
}

function digitalOceanCredentialPair(value: string) {
  const separator = value.includes(":") ? ":" : value.includes("|") ? "|" : "";

  if (!separator) {
    throw new Error(
      "DO_SPACES_KEY must include both access and secret values as access:secret or access|secret."
    );
  }

  const separatorIndex = value.indexOf(separator);
  const accessKeyId = value.slice(0, separatorIndex).trim();
  const secretAccessKey = value.slice(separatorIndex + 1).trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "DO_SPACES_KEY must include both access and secret values as access:secret or access|secret."
    );
  }

  return { accessKeyId, secretAccessKey };
}

function digitalOceanSecretFromKey(value: string) {
  const separator = value.includes(":") ? ":" : value.includes("|") ? "|" : "";

  if (!separator) {
    return value;
  }

  const secretAccessKey = value.slice(value.indexOf(separator) + 1).trim();

  if (!secretAccessKey) {
    throw new Error(
      "DO_SPACES_KEY must include a secret value when DO_SPACES_KEY_ID is set."
    );
  }

  return secretAccessKey;
}

/**
 * Spaces access key id used by the MattaNutra bucket (non-secret identifier).
 * Secret stays in DO_SPACES_KEY. Needed when KEY is secret-only rather than
 * legacy access:secret — PRD historically omitted DO_SPACES_KEY_ID while UAT
 * set it explicitly.
 */
const DEFAULT_DO_SPACES_KEY_ID = "DO801NRCNL3HYHXKRJEG";

function digitalOceanCredentialsFromEnv() {
  const explicitAccessKeyId = envValue(
    "DO_SPACES_ACCESS_KEY_ID",
    "DO_SPACES_ACCESS_KEY",
    "DO_SPACES_KEY_ID"
  );
  const explicitSecretAccessKey = envValue(
    "DO_SPACES_SECRET_ACCESS_KEY",
    "DO_SPACES_SECRET_KEY"
  );
  const digitalOceanSecretKey = envValue("DO_SPACES_KEY");
  const secretAccessKey = explicitSecretAccessKey || (
    explicitAccessKeyId && digitalOceanSecretKey
      ? digitalOceanSecretFromKey(digitalOceanSecretKey)
      : ""
  );

  if (explicitAccessKeyId || secretAccessKey) {
    if (!explicitAccessKeyId || !secretAccessKey) {
      throw new Error(
        "Set both DO_SPACES_KEY_ID and DO_SPACES_KEY, or DO_SPACES_ACCESS_KEY_ID and DO_SPACES_SECRET_ACCESS_KEY, for DigitalOcean Spaces storage."
      );
    }

    return {
      accessKeyId: explicitAccessKeyId,
      secretAccessKey
    };
  }

  const legacyCredential = digitalOceanSecretKey;

  if (!legacyCredential) {
    return null;
  }

  // Prefer access:secret / access|secret. If KEY is secret-only (no separator),
  // pair it with DO_SPACES_KEY_ID when present, else the known project key id.
  if (legacyCredential.includes(":") || legacyCredential.includes("|")) {
    return digitalOceanCredentialPair(legacyCredential);
  }

  return {
    accessKeyId: DEFAULT_DO_SPACES_KEY_ID,
    secretAccessKey: legacyCredential
  };
}

export function firstPartyImageStorageEnvironment(
  value = process.env.MATTANUTRA_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "prd" : "dev")
) {
  const normalized = value.toLowerCase();
  const mapped =
    normalized === "production" || normalized === "prod"
      ? "prd"
      : normalized === "development" || normalized === "local"
        ? "dev"
        : normalized === "staging" || normalized === "stage"
          ? "uat"
          : normalized;

  return trimSlashes(mapped)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dev";
}

export function firstPartyImageStorageConfigFromEnv():
  | FirstPartyImageStorageConfig
  | null {
  const endpointConfig = digitalOceanEndpointConfig(envValue("DO_SPACES_ENDPOINT"));
  const credential = digitalOceanCredentialsFromEnv();

  if (!endpointConfig || !credential) {
    return null;
  }

  const { accessKeyId, secretAccessKey } = credential;
  const publicBaseUrl =
    envValue(
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_CDN_URL",
      "DO_SPACES_PUBLIC_BASE_URL"
    ) || endpointConfig.cdnBaseUrl;

  return {
    accessKeyId,
    bucket: endpointConfig.bucket,
    endpoint: endpointConfig.endpoint,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/g, ""),
    region: endpointConfig.region,
    secretAccessKey
  };
}

export function firstPartyImageMirroringRequired() {
  const environment = process.env.MATTANUTRA_ENV?.trim().toLowerCase();

  return (
    process.env.MATTANUTRA_IMAGE_MIRROR_REQUIRED === "1" ||
    process.env.IMAGE_MIRROR_REQUIRED === "true" ||
    process.env.NODE_ENV === "production" ||
    environment === "prd" ||
    environment === "prod" ||
    environment === "production" ||
    environment === "uat" ||
    environment === "staging" ||
    environment === "stage"
  );
}

export function firstPartyImageStorageKey(input: Readonly<{
  entityId: string;
  environment?: string;
  extension: string;
  namespace: string;
  sha256: string;
}>) {
  const environment = firstPartyImageStorageEnvironment(input.environment);
  const namespace = safePathSegment(input.namespace, "images");
  const entityId = safePathSegment(input.entityId, "entity");

  return `${environment}/${namespace}/${entityId}/${input.sha256}.${input.extension}`;
}

export async function fetchAndValidateFirstPartyImage(input: Readonly<{
  fetcher?: Fetcher;
  imageUrl: string;
  maxBytes?: number;
  timeoutMs?: number;
}>): Promise<FirstPartyImageValidationResult> {
  const imageUrl = normalizeRuntimeImageUrl(input.imageUrl);
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const timeoutMs = input.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS;

  if (!imageUrl) {
    return {
      detail: "Image URL is empty or invalid.",
      ok: false,
      reason: "invalid_url"
    };
  }

  let url: URL;

  try {
    url = new URL(imageUrl);
  } catch {
    return {
      detail: "Image URL is not absolute.",
      ok: false,
      reason: "invalid_url"
    };
  }

  if (url.protocol !== "https:") {
    return {
      detail: `Unsupported image URL protocol: ${url.protocol}`,
      ok: false,
      reason: "unsupported_protocol"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (input.fetcher ?? fetch)(imageUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        detail: `HTTP ${response.status}`,
        ok: false,
        reason: "http_status"
      };
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return {
        detail: `Image is too large: ${contentLength} bytes.`,
        ok: false,
        reason: "image_too_large"
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    return validateFirstPartyImageBytes({
      bytes,
      contentType: response.headers.get("content-type"),
      maxBytes
    });
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      ok: false,
      reason: "fetch_failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadFirstPartyImageToSpaces(
  input: Readonly<{
    bytes: Buffer;
    cacheControl: string;
    config: FirstPartyImageStorageConfig;
    contentType: string;
    key: string;
  }>
) {
  const client = new S3Client({
    credentials: {
      accessKeyId: input.config.accessKeyId,
      secretAccessKey: input.config.secretAccessKey
    },
    endpoint: input.config.endpoint,
    forcePathStyle: false,
    region: input.config.region
  });

  await client.send(
    new PutObjectCommand({
      ACL: "public-read",
      Body: input.bytes,
      Bucket: input.config.bucket,
      CacheControl: input.cacheControl,
      ContentType: input.contentType,
      Key: input.key
    })
  );

  return {
    key: input.key,
    url: `${input.config.publicBaseUrl}/${input.key}`
  };
}

export async function storeFirstPartyImageBytes(input: Readonly<{
  config?: FirstPartyImageStorageConfig | null;
  entityId: string;
  environment?: string;
  evidenceUrl?: string | null;
  bytes: Buffer;
  contentType?: string | null;
  maxBytes?: number;
  namespace: string;
  originalUrl?: string | null;
  required?: boolean;
  source?: string | null;
  uploader?: Uploader;
}>): Promise<FirstPartyImageStoredBytesResult> {
  const validated = await validateFirstPartyImageBytes({
    bytes: input.bytes,
    contentType: input.contentType,
    maxBytes: input.maxBytes
  });

  if (!validated.ok) {
    throw new Error(
      `Unable to store image upload: ${validated.reason} (${validated.detail})`
    );
  }

  const config = input.config ?? firstPartyImageStorageConfigFromEnv();
  const required = input.required ?? firstPartyImageMirroringRequired();

  if (!config) {
    if (required) {
      throw new Error(
        "First-party image storage is not configured. Set DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, and DO_SPACES_CDN_ENDPOINT."
      );
    }

    throw new Error("First-party image storage is not configured.");
  }

  const environment = firstPartyImageStorageEnvironment(input.environment);
  const key = firstPartyImageStorageKey({
    entityId: input.entityId,
    environment,
    extension: validated.extension,
    namespace: input.namespace,
    sha256: validated.sha256
  });
  const stored = await (input.uploader ?? ((uploadInput) =>
    uploadFirstPartyImageToSpaces({
      ...uploadInput,
      config
    })) )({
      bytes: validated.bytes,
      cacheControl: contentImageCacheControl,
      contentType: validated.contentType,
      key
    });
  const mirroredAt = new Date().toISOString();
  const originalUrl =
    input.originalUrl?.trim() ||
    `upload:${input.namespace}:${input.entityId}:${validated.sha256}`;

  return {
    cacheControl: contentImageCacheControl,
    contentType: validated.contentType,
    dimensions: {
      height: validated.height,
      width: validated.width
    },
    key: stored.key,
    metadata: {
      byteSize: validated.bytes.length,
      cacheControl: contentImageCacheControl,
      contentType: validated.contentType,
      dimensions: {
        height: validated.height,
        width: validated.width
      },
      environment,
      evidenceUrl: input.evidenceUrl ?? null,
      hash: validated.sha256,
      mirroredAt,
      mirroredUrl: stored.url,
      originalHost: imageUrlHost(originalUrl),
      originalUrl,
      source: input.source ?? null,
      storedKey: stored.key
    },
    mirrored: true,
    storage: "cloud",
    url: stored.url
  };
}

export async function mirrorImageToFirstParty(input: Readonly<{
  config?: FirstPartyImageStorageConfig | null;
  entityId: string;
  environment?: string;
  evidenceUrl?: string | null;
  fetcher?: Fetcher;
  imageUrl: string | null | undefined;
  maxBytes?: number;
  namespace: string;
  required?: boolean;
  source?: string | null;
  timeoutMs?: number;
  uploader?: Uploader;
}>): Promise<FirstPartyImageMirrorResult> {
  const imageUrl = normalizeRuntimeImageUrl(input.imageUrl);

  if (!imageUrl) {
    return {
      metadata: null,
      mirrored: false,
      skippedReason: "empty",
      url: null
    };
  }

  if (isFirstPartyImageUrl(imageUrl)) {
    return {
      metadata: null,
      mirrored: false,
      skippedReason: "first_party",
      url: imageUrl
    };
  }

  if (!isExternalRuntimeImageUrl(imageUrl)) {
    throw new Error(`Image URL must be HTTPS: ${imageUrl}`);
  }

  const config = input.config ?? firstPartyImageStorageConfigFromEnv();
  const required = input.required ?? firstPartyImageMirroringRequired();

  if (!config) {
    if (required) {
      throw new Error(
        "First-party image mirroring requires DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, and DO_SPACES_CDN_ENDPOINT."
      );
    }

    return {
      metadata: null,
      mirrored: false,
      skippedReason: "storage_unconfigured",
      url: imageUrl
    };
  }

  const validated = await fetchAndValidateFirstPartyImage({
    fetcher: input.fetcher,
    imageUrl,
    maxBytes: input.maxBytes,
    timeoutMs: input.timeoutMs
  });

  if (!validated.ok) {
    throw new Error(
      `Unable to mirror image ${imageUrl}: ${validated.reason} (${validated.detail})`
    );
  }

  const environment = firstPartyImageStorageEnvironment(input.environment);
  const key = firstPartyImageStorageKey({
    entityId: input.entityId,
    environment,
    extension: validated.extension,
    namespace: input.namespace,
    sha256: validated.sha256
  });
  const stored = await (input.uploader ?? ((uploadInput) =>
    uploadFirstPartyImageToSpaces({
      ...uploadInput,
      config
    })) )({
      bytes: validated.bytes,
      cacheControl: contentImageCacheControl,
      contentType: validated.contentType,
      key
    });
  const mirroredAt = new Date().toISOString();

  return {
    metadata: {
      byteSize: validated.bytes.length,
      cacheControl: contentImageCacheControl,
      contentType: validated.contentType,
      dimensions: {
        height: validated.height,
        width: validated.width
      },
      environment,
      evidenceUrl: input.evidenceUrl ?? null,
      hash: validated.sha256,
      mirroredAt,
      mirroredUrl: stored.url,
      originalHost: imageUrlHost(imageUrl),
      originalUrl: imageUrl,
      source: input.source ?? null,
      storedKey: stored.key
    },
    mirrored: true,
    skippedReason: null,
    url: stored.url
  };
}

export async function mirrorImageUrlListToFirstParty(input: Readonly<{
  config?: FirstPartyImageStorageConfig | null;
  entityId: string;
  environment?: string;
  evidenceUrl?: string | null;
  fetcher?: Fetcher;
  imageUrls: readonly string[];
  namespace: string;
  required?: boolean;
  source?: string | null;
  uploader?: Uploader;
}>): Promise<Readonly<{
  metadata: FirstPartyImageMirrorMetadata[];
  urls: string[];
}>> {
  const sourceUrls = [...new Set(input.imageUrls
    .map((url) => normalizeRuntimeImageUrl(url))
    .filter((url): url is string => Boolean(url)))];
  const mirroredUrls: string[] = [];
  const metadata: FirstPartyImageMirrorMetadata[] = [];

  for (const imageUrl of sourceUrls) {
    const result = await mirrorImageToFirstParty({
      config: input.config,
      entityId: input.entityId,
      environment: input.environment,
      evidenceUrl: input.evidenceUrl,
      fetcher: input.fetcher,
      imageUrl,
      namespace: input.namespace,
      required: input.required,
      source: input.source,
      uploader: input.uploader
    });

    if (result.url && !mirroredUrls.includes(result.url)) {
      mirroredUrls.push(result.url);
    }

    if (result.metadata) {
      metadata.push(result.metadata);
    }
  }

  return {
    metadata,
    urls: [...new Set([...mirroredUrls, ...sourceUrls])]
  };
}

export function assertFirstPartyImageMirrorDatabaseTarget(
  connection: string | undefined,
  environment: FirstPartyImageEnvironment
) {
  if (!connection) {
    throw new Error("DB_URL is required for first-party image mirroring.");
  }

  const url = new URL(connection);
  const database = url.pathname.replace(/^\/+/, "");

  if (!database || database.toLowerCase() === "defaultdb") {
    throw new Error("First-party image mirroring refuses to run against defaultdb.");
  }

  if (environment === "uat" && !/uat/i.test(database)) {
    throw new Error(`First-party image mirroring expected a UAT database, got ${database}.`);
  }

  if (environment === "prd" && !/(prd|prod)/i.test(database)) {
    throw new Error(`First-party image mirroring expected a PRD database, got ${database}.`);
  }
}
