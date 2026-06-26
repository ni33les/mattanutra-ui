import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UploadRouteProps = Readonly<{
  params: Promise<{
    path?: string[];
  }>;
}>;

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);
const uploadCacheControl = "public, max-age=31536000, immutable";

function notFound() {
  return NextResponse.json(
    { message: "Not found" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 404,
    },
  );
}

function uploadFilePath(pathSegments: readonly string[]) {
  if (
    pathSegments.length < 1 ||
    pathSegments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    return null;
  }

  const uploadRoot = resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    "public",
    "uploads",
  );
  const filePath = resolve(uploadRoot, ...pathSegments);
  const rootPrefix = `${uploadRoot}${sep}`;

  return filePath.startsWith(rootPrefix) ? filePath : null;
}

async function localUploadResponse(
  { params }: UploadRouteProps,
  method: "GET" | "HEAD",
) {
  const { path = [] } = await params;
  const filePath = uploadFilePath(path);

  if (!filePath) {
    return notFound();
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return notFound();
    }

    const contentType =
      contentTypes.get(extname(filePath).toLowerCase()) ??
      "application/octet-stream";
    const headers = {
      "Cache-Control": uploadCacheControl,
      "Content-Length": String(fileStat.size),
      "Content-Type": contentType,
    };

    if (method === "HEAD") {
      return new Response(null, { headers });
    }

    return new Response(await readFile(filePath), { headers });
  } catch {
    return notFound();
  }
}

export async function GET(_request: Request, props: UploadRouteProps) {
  return localUploadResponse(props, "GET");
}

export async function HEAD(_request: Request, props: UploadRouteProps) {
  return localUploadResponse(props, "HEAD");
}
