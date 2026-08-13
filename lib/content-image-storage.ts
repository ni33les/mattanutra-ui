import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObjectCannedACL } from "@aws-sdk/client-s3";

type ContentImageUploadInput = Readonly<{
  bytes: Buffer;
  contentType: string;
  extension: string;
  originalFileName: string;
  uploadedAt?: Date;
}>;

type CloudStorageConfig = Readonly<{
  accessKeyId: string;
  acl: ObjectCannedACL | null;
  bucket: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
}>;

type DigitalOceanEndpoint = Readonly<{
  bucket: string;
  cdnBaseUrl: string;
  endpoint: string;
  originBaseUrl: string;
  region: string;
}>;

const contentImageCacheControl = "public, max-age=31536000, immutable";

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

function storageEnvironment() {
  const rawEnvironment =
    process.env.MATTANUTRA_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "prd" : "dev");
  const normalized = rawEnvironment.toLowerCase();
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

function digitalOceanEndpointConfig(value: string): DigitalOceanEndpoint | null {
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

    if (!bucket || !region) {
      return null;
    }

    return {
      bucket,
      cdnBaseUrl: `${url.protocol}//${bucket}.${region}.cdn.digitaloceanspaces.com`,
      endpoint: `${url.protocol}//${region}.digitaloceanspaces.com`,
      originBaseUrl: `${url.protocol}//${bucket}.${region}.digitaloceanspaces.com`,
      region
    };
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
 * Keep in sync with lib/first-party-image-mirror.ts — secret stays in DO_SPACES_KEY.
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

  if (legacyCredential.includes(":") || legacyCredential.includes("|")) {
    return digitalOceanCredentialPair(legacyCredential);
  }

  return {
    accessKeyId: DEFAULT_DO_SPACES_KEY_ID,
    secretAccessKey: legacyCredential
  };
}

function safeFileStem(fileName: string) {
  const stem = fileName.replace(/\.[^/.]+$/, "");
  const safeStem = stem
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return safeStem || "image";
}

function cloudStorageConfig(): CloudStorageConfig | null {
  const doEndpointConfig = digitalOceanEndpointConfig(
    envValue("DO_SPACES_ENDPOINT")
  );
  const doCredential = digitalOceanCredentialsFromEnv();

  if (!doEndpointConfig || !doCredential) {
    return null;
  }

  const { accessKeyId, secretAccessKey } = doCredential;
  const publicBaseUrl =
    envValue(
      "DO_SPACES_CDN_ENDPOINT",
      "DO_SPACES_CDN_URL",
      "DO_SPACES_PUBLIC_BASE_URL"
    ) ||
    doEndpointConfig.cdnBaseUrl;

  return {
    accessKeyId,
    acl: "public-read",
    bucket: doEndpointConfig.bucket,
    endpoint: doEndpointConfig.endpoint,
    forcePathStyle: false,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/g, ""),
    region: doEndpointConfig.region,
    secretAccessKey
  };
}

function contentImageKey({
  extension,
  originalFileName,
  uploadedAt = new Date()
}: Pick<
  ContentImageUploadInput,
  "extension" | "originalFileName" | "uploadedAt"
>) {
  const uploadDate = uploadedAt.toISOString().slice(0, 10);
  const fileName = `${randomUUID()}-${safeFileStem(originalFileName)}.${extension}`;

  return `${uploadDate}/${fileName}`;
}

function contentImageStorageKey(input: ContentImageUploadInput) {
  return `${storageEnvironment()}/content/${contentImageKey(input)}`;
}

async function uploadCloudContentImage(
  input: ContentImageUploadInput,
  config: CloudStorageConfig
) {
  const key = contentImageStorageKey(input);
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.forcePathStyle,
    region: config.region
  });

  await client.send(
    new PutObjectCommand({
      ...(config.acl ? { ACL: config.acl } : {}),
      Body: input.bytes,
      Bucket: config.bucket,
      CacheControl: contentImageCacheControl,
      ContentType: input.contentType,
      Key: key
    })
  );

  return {
    cacheControl: contentImageCacheControl,
    key,
    storage: "cloud" as const,
    url: `${config.publicBaseUrl}/${key}`
  };
}

export async function uploadLocalContentImage(input: ContentImageUploadInput) {
  const key = contentImageStorageKey(input);
  const uploadPath = join(process.cwd(), "public", "uploads", key);

  await mkdir(dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, input.bytes, { flag: "wx" });

  return {
    cacheControl: contentImageCacheControl,
    key,
    storage: "local" as const,
    url: `/uploads/${key}`
  };
}

export async function uploadContentImage(input: ContentImageUploadInput) {
  const config = cloudStorageConfig();

  if (config) {
    return uploadCloudContentImage(input, config);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Content image storage is not configured. Set DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, and DO_SPACES_SECRET_ACCESS_KEY."
    );
  }

  return uploadLocalContentImage(input);
}

export { contentImageCacheControl };
