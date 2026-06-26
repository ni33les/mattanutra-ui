import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { isUuid } from "@/lib/assessment-store";
import { mirrorImageToFirstParty } from "@/lib/first-party-image-mirror";

export const runtime = "nodejs";

type ProductImageResolveRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

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

function imageMirrorErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/http_status \(HTTP 403\)|HTTP 403/i.test(message)) {
    return "This image host blocks direct imports. Download the image and use Upload instead.";
  }

  return (
    message ||
    "Could not fetch this image. Upload the file or use a public image URL."
  );
}

export async function POST(
  request: Request,
  { params }: ProductImageResolveRouteProps,
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return unauthorized();
  }

  if (!isUuid(id)) {
    return badRequest("Product not found");
  }

  const imageUrl = textOrNull(body.imageUrl);

  if (!imageUrl) {
    return badRequest("Image URL is required");
  }

  try {
    const mirrored = await mirrorImageToFirstParty({
      entityId: id,
      evidenceUrl: textOrNull(body.evidenceUrl, 2000),
      imageUrl,
      namespace: "products",
      source: "admin_product_image_dropzone",
    });

    return NextResponse.json(
      {
        mirrored: mirrored.mirrored,
        skippedReason: mirrored.skippedReason,
        url: mirrored.url,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Unable to mirror product image URL", error);

    return NextResponse.json(
      {
        message: imageMirrorErrorMessage(error),
      },
      {
        headers: noStoreHeaders,
        status: 400,
      },
    );
  }
}
