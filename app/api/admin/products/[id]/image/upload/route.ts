import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
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
    const result = await uploadAdminProductImage({
      actor: "admin_dashboard",
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      originalFileName: file.name,
      productId: id,
    });

    return NextResponse.json(
      {
        cacheControl: result.image.cacheControl,
        contentType: file.type,
        fallbackStorage: result.image.storage === "local",
        fileName: file.name,
        image: result.image,
        key: result.image.key,
        row: result.row,
        size: file.size,
        storage: result.image.storage,
        url: result.url,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Admin product image upload failed", errorDetails(error));

    return NextResponse.json(
      {
        image: {
          reason:
            error instanceof AdminProductImageError ? error.code : "failed",
          status: "failed",
        },
        message:
          error instanceof AdminProductImageError
            ? error.message
            : "Could not upload this image",
      },
      {
        headers: noStoreHeaders,
        status: error instanceof AdminProductImageError ? error.status : 500,
      },
    );
  }
}
