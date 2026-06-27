import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  adminProductImageErrorDetails,
  adminProductImageStorageDiagnostics
} from "@/lib/admin-product-images";
import {
  firstPartyImageStorageConfigFromEnv,
  firstPartyImageStorageEnvironment,
  storeFirstPartyImageBytes
} from "@/lib/first-party-image-mirror";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
} as const;
const retryDelaysMs = [0, 500, 1500, 3000, 5000] as const;

function routeHeaders(requestId: string) {
  return {
    ...noStoreHeaders,
    "x-request-id": requestId
  };
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readinessForError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const text = `${name} ${message}`;

  if (/not configured|missing/i.test(text)) {
    return "missing";
  }

  if (/DO_SPACES_KEY|DO_SPACES_ACCESS_KEY_ID|DO_SPACES_SECRET_ACCESS_KEY|Set both/i.test(text)) {
    return "malformed";
  }

  if (/InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|CredentialsProviderError/i.test(text)) {
    return "auth-failed";
  }

  if (/publicly readable|CDN|HTTP 403|HTTP 404|content-type/i.test(text)) {
    return "cdn-not-readable";
  }

  return "failed";
}

async function tinyPng() {
  return sharp({
    create: {
      background: { alpha: 1, b: 84, g: 170, r: 45 },
      channels: 4,
      height: 4,
      width: 4
    }
  }).png().toBuffer();
}

async function verifyPublicImageUrl(url: string) {
  let lastError = "";

  for (const [index, delayMs] of retryDelaysMs.entries()) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "image/*,*/*;q=0.8"
        }
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (response.ok && contentType.toLowerCase().startsWith("image/")) {
        const bytes = Buffer.from(await response.arrayBuffer());

        if (bytes.length > 0) {
          return {
            attempts: index + 1,
            byteSize: bytes.length,
            contentType
          };
        }

        lastError = "CDN returned an empty image response.";
      } else {
        lastError = `CDN status=${response.status} content-type=${contentType || "unknown"}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Spaces probe object was not publicly readable: ${lastError}`);
}

async function deleteProbeObject(input: Readonly<{
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  key: string;
  region: string;
  secretAccessKey: string;
}>) {
  const client = new S3Client({
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey
    },
    endpoint: input.endpoint,
    forcePathStyle: false,
    region: input.region
  });

  await client.send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.key
    })
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const formData = await request.formData().catch(() => null);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(formData?.get("accessToken")) ??
    new URL(request.url).searchParams.get("access_token");

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found", requestId },
      {
        headers: routeHeaders(requestId),
        status: 404
      }
    );
  }

  const storage = adminProductImageStorageDiagnostics();
  const config = firstPartyImageStorageConfigFromEnv();

  if (!config) {
    return NextResponse.json(
      {
        message: "Product image storage is not configured.",
        readiness: "missing",
        requestId,
        storage
      },
      {
        headers: routeHeaders(requestId),
        status: 503
      }
    );
  }

  const environment = firstPartyImageStorageEnvironment();
  let deleted = false;
  let storedKey: string | null = null;

  try {
    const stored = await storeFirstPartyImageBytes({
      bytes: await tinyPng(),
      config,
      contentType: "image/png",
      entityId: `runtime-${Date.now()}`,
      environment,
      namespace: "product-image-probe",
      originalUrl: "operator:runtime-product-image-storage-probe",
      required: true,
      source: "operator_runtime_product_image_storage_probe"
    });
    storedKey = stored.key;
    const publicRead = await verifyPublicImageUrl(stored.url);

    await deleteProbeObject({
      accessKeyId: config.accessKeyId,
      bucket: config.bucket,
      endpoint: config.endpoint,
      key: stored.key,
      region: config.region,
      secretAccessKey: config.secretAccessKey
    });
    deleted = true;

    return NextResponse.json(
      {
        deleted,
        environment,
        key: stored.key,
        publicRead,
        readiness: "ready",
        requestId,
        storage,
        url: stored.url
      },
      { headers: routeHeaders(requestId) }
    );
  } catch (error) {
    console.error("Admin product image runtime storage probe failed", {
      deleted,
      environment,
      error: adminProductImageErrorDetails(error),
      requestId,
      storage,
      storedKey
    });

    return NextResponse.json(
      {
        deleted,
        error: adminProductImageErrorDetails(error),
        readiness: readinessForError(error),
        requestId,
        storage
      },
      {
        headers: routeHeaders(requestId),
        status: 502
      }
    );
  }
}
