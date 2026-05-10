import { NextResponse } from "next/server";
import { adminClawRequestAllowed } from "@/lib/admin-auth";
import {
  createBlogPost,
  listBlogPostsForApi
} from "@/lib/blog";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { message: "Blog API access is not authorized" },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mattanutra-openclaw-api"'
      },
      status: 401
    }
  );
}

export async function GET(request: Request) {
  if (!adminClawRequestAllowed(request)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const posts = await listBlogPostsForApi({
    locale: url.searchParams.get("locale"),
    status
  });

  return NextResponse.json(
    { posts },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function POST(request: Request) {
  if (!adminClawRequestAllowed(request)) {
    return unauthorized();
  }

  try {
    const post = await createBlogPost((await request.json()) as Record<
      string,
      unknown
    >);

    return NextResponse.json(
      { post },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to create blog post"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}
