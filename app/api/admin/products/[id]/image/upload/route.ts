import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  adminProductImageErrorDetails,
  adminProductImageStorageDiagnostics,
  AdminProductImageError,
  uploadAdminProductImage,
} from "@/lib/admin-product-images";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type ProductImageUploadRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

const maxUploadBytes = 6 * 1024 * 1024;
const uploadMimeTypes = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const noStoreHeaders = {
  "Cache-Control": "no-store",
} as const;

function textOrNull(value: unknown, limit = 4000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, limit) : null;
}

function routeHeaders(requestId: string) {
  return {
    ...noStoreHeaders,
    "x-request-id": requestId,
  };
}

function unauthorizedWithRequestId(requestId: string) {
  return NextResponse.json(
    { message: "Not found", requestId },
    {
      headers: routeHeaders(requestId),
      status: 404,
    },
  );
}

function badRequest(message: string, requestId: string) {
  return NextResponse.json(
    { message, requestId },
    {
      headers: routeHeaders(requestId),
      status: 400,
    },
  );
}

export async function POST(
  request: Request,
  { params }: ProductImageUploadRouteProps,
) {
  const requestId = randomUUID();
  const { id } = await params;
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return badRequest("Image upload requires multipart form data", requestId);
  }

  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(formData.get("accessToken"));

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorizedWithRequestId(requestId);
  }

  if (!isUuid(id)) {
    return badRequest("Product not found", requestId);
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return badRequest("Image file is required", requestId);
  }

  if (file.size <= 0) {
    return badRequest("Image file is empty", requestId);
  }

  if (file.size > maxUploadBytes) {
    return badRequest("Image file must be 6 MB or smaller", requestId);
  }

  const extension = uploadMimeTypes.get(file.type);

  if (!extension) {
    return badRequest("Upload a JPG, PNG, WebP, or GIF image", requestId);
  }

  console.info("Admin product image upload started", {
    contentType: file.type,
    fileName: file.name,
    productId: id,
    requestId,
    size: file.size,
    storage: adminProductImageStorageDiagnostics()
  });

  try {
    const result = await uploadAdminProductImage({
      actor: "admin_dashboard",
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      originalFileName: file.name,
      productId: id,
      requestId,
    });

    console.info("Admin product image upload completed", {
      productId: id,
      requestId,
      storage: result.image.storage,
      url: result.url,
    });

    return NextResponse.json(
      {
        cacheControl: result.image.cacheControl,
        contentType: file.type,
        fallbackStorage: result.image.storage === "local",
        fileName: file.name,
        image: result.image,
        key: result.image.key,
        requestId,
        row: result.row,
        size: file.size,
        storage: result.image.storage,
        url: result.url,
      },
      { headers: routeHeaders(requestId) },
    );
  } catch (error) {
    const storage = adminProductImageStorageDiagnostics();
    const details = adminProductImageErrorDetails(error);
    const code =
      error instanceof AdminProductImageError ? error.code : "failed";
    const provider =
      details && typeof details === "object"
        ? (details as { code?: unknown; name?: unknown; message?: unknown })
        : null;
    const providerCode =
      typeof provider?.code === "string"
        ? provider.code
        : typeof provider?.name === "string"
          ? provider.name
          : null;
    const message =
      error instanceof AdminProductImageError
        ? error.message
        : "Could not upload this image";

    console.error("Admin product image upload failed", {
      code,
      error: details,
      fileName: file.name,
      productId: id,
      providerCode,
      requestId,
      size: file.size,
      storage
    });

    return NextResponse.json(
      {
        code,
        image: {
          requestId,
          reason: code,
          status: "failed",
        },
        // Safe operator diagnostics (no secrets). Helps correlate UI failures
        // with DO runtime logs via requestId.
        message,
        providerCode,
        requestId,
        storage: {
          credentialMode: storage.credentialMode,
          environment: storage.environment,
          keyShape: storage.keyShape,
          readiness: storage.readiness,
          resolvedCredentials: storage.resolvedCredentials,
          storage: storage.storage
        }
      },
      {
        headers: routeHeaders(requestId),
        status: error instanceof AdminProductImageError ? error.status : 500,
      },
    );
  }
}
