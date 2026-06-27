import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import {
  adminProductImageErrorDetails,
  adminProductImageStorageDiagnostics
} from "@/lib/admin-product-images";
import {
  firstPartyImageStorageConfigFromEnv,
  firstPartyImageStorageEnvironment,
  storeFirstPartyImageBytes
} from "@/lib/first-party-image-mirror";

const retryDelaysMs = [0, 500, 1500, 3000, 5000] as const;

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
            byteSize: bytes.length,
            contentType,
            attempts: index + 1
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
  bucket: string;
  endpoint: string;
  key: string;
  region: string;
  accessKeyId: string;
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

async function main() {
  const config = firstPartyImageStorageConfigFromEnv();

  if (!config) {
    throw new Error(
      "Spaces image storage is not configured. Set DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, and DO_SPACES_CDN_ENDPOINT."
    );
  }

  const environment = firstPartyImageStorageEnvironment();
  const stored = await storeFirstPartyImageBytes({
    bytes: await tinyPng(),
    config,
    contentType: "image/png",
    entityId: `operator-${Date.now()}`,
    environment,
    namespace: "product-image-probe",
    originalUrl: "operator:spaces-image-storage-probe",
    required: true,
    source: "operator_spaces_image_storage_probe"
  });
  const publicRead = await verifyPublicImageUrl(stored.url);
  let deleted = false;

  try {
    await deleteProbeObject({
      accessKeyId: config.accessKeyId,
      bucket: config.bucket,
      endpoint: config.endpoint,
      key: stored.key,
      region: config.region,
      secretAccessKey: config.secretAccessKey
    });
    deleted = true;
  } finally {
    console.log(JSON.stringify({
      bucket: config.bucket,
      deleted,
      environment,
      key: stored.key,
      publicRead,
      readiness: "ready",
      storage: adminProductImageStorageDiagnostics(),
      url: stored.url
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: adminProductImageErrorDetails(error),
    readiness: readinessForError(error),
    storage: adminProductImageStorageDiagnostics()
  }, null, 2));
  process.exit(1);
});
