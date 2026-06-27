import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { updateAdminProduct } from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";
import {
  uploadContentImage,
  uploadLocalContentImage,
} from "@/lib/content-image-storage";

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

function unauthorized() {
  return NextResponse.json(
    { message: "Not found" },
    {
      headers: noStoreHeaders,
      status: 404,
    },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    {
      headers: noStoreHeaders,
      status: 400,
    },
  );
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    message: error.message,
    name: error.name,
  };
}

function nonProductionUploadFallbackAllowed() {
  const environment = (
    process.env.MATTANUTRA_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "prd" : "dev")
  ).toLowerCase();

  return [
    "dev",
    "development",
    "local",
    "stage",
    "staging",
    "uat",
  ].includes(environment);
}

function cloudUploadCredentialFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /AccessDenied|CredentialsProviderError|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(
    `${error.name} ${error.message}`,
  );
}

export async function POST(
  request: Request,
  { params }: ProductImageUploadRouteProps,
) {
  const { id } = await params;
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return badRequest("Image upload requires multipart form data");
  }

  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(formData.get("accessToken"));

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  if (!isUuid(id)) {
    return badRequest("Product not found");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return badRequest("Image file is required");
  }

  if (file.size <= 0) {
    return badRequest("Image file is empty");
  }

  if (file.size > maxUploadBytes) {
    return badRequest("Image file must be 6 MB or smaller");
  }

  const extension = uploadMimeTypes.get(file.type);

  if (!extension) {
    return badRequest("Upload a JPG, PNG, WebP, or GIF image");
  }

  try {
    const uploadInput = {
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      extension,
      originalFileName: file.name,
    };
    let upload: Awaited<ReturnType<typeof uploadContentImage>>;

    try {
      upload = await uploadContentImage(uploadInput);
    } catch (cloudError) {
      if (
        !nonProductionUploadFallbackAllowed() ||
        !cloudUploadCredentialFailure(cloudError)
      ) {
        throw cloudError;
      }

      console.warn(
        "Admin product image cloud upload failed; using non-production local fallback",
        errorDetails(cloudError),
      );
      upload = await uploadLocalContentImage(uploadInput);
    }
    await updateAdminProduct({
      actor: "admin_dashboard",
      changeNote: "product_image_uploaded",
      id,
      imageUrl: upload.url,
    });

    return NextResponse.json(
      {
        cacheControl: upload.cacheControl,
        contentType: file.type,
        fallbackStorage: upload.storage === "local",
        fileName: file.name,
        key: upload.key,
        size: file.size,
        storage: upload.storage,
        url: upload.url,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Admin product image upload failed", errorDetails(error));

    return NextResponse.json(
      { message: "Could not upload this image" },
      {
        headers: noStoreHeaders,
        status: 500,
      },
    );
  }
}
