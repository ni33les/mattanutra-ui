import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { uploadContentImage } from "@/lib/content-image-storage";

export const runtime = "nodejs";

const maxUploadBytes = 6 * 1024 * 1024;
const uploadMimeTypes = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const noStoreHeaders = {
  "Cache-Control": "no-store"
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
      status: 404
    }
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    {
      headers: noStoreHeaders,
      status: 400
    }
  );
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    message: error.message,
    name: error.name
  };
}

export async function POST(request: Request) {
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
    const upload = await uploadContentImage({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      extension,
      originalFileName: file.name
    });

    return NextResponse.json(
      {
        cacheControl: upload.cacheControl,
        contentType: file.type,
        fileName: file.name,
        key: upload.key,
        size: file.size,
        storage: upload.storage,
        url: upload.url
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Admin content image upload failed", errorDetails(error));

    return NextResponse.json(
      { message: "Could not upload this image" },
      {
        headers: noStoreHeaders,
        status: 500
      }
    );
  }
}
