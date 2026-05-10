import { NextResponse } from "next/server";
import { adminClawRequestAllowed } from "@/lib/admin-auth";
import {
  archiveBlogPost,
  getBlogPostForApi,
  updateBlogPost
} from "@/lib/blog";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";

type BlogPostRouteProps = Readonly<{
  params: Promise<{
    idOrSlug: string;
  }>;
}>;

function unauthorized() {
  return NextResponse.json(
    { message: "Blog write access is not authorized" },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mattanutra-openclaw-api"'
      },
      status: 401
    }
  );
}

function localeFromUrl(request: Request) {
  const value = new URL(request.url).searchParams.get("locale");

  return isLocale(value) ? value : undefined;
}

export async function GET(request: Request, { params }: BlogPostRouteProps) {
  if (!adminClawRequestAllowed(request)) {
    return unauthorized();
  }

  const { idOrSlug } = await params;
  const post = await getBlogPostForApi(idOrSlug, localeFromUrl(request));

  if (!post) {
    return NextResponse.json(
      { message: "Blog post not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  return NextResponse.json(
    { post },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function PATCH(request: Request, { params }: BlogPostRouteProps) {
  if (!adminClawRequestAllowed(request)) {
    return unauthorized();
  }

  const { idOrSlug } = await params;

  try {
    const post = await updateBlogPost(
      idOrSlug,
      (await request.json()) as Record<string, unknown>,
      localeFromUrl(request)
    );

    if (!post) {
      return NextResponse.json(
        { message: "Blog post not found" },
        {
          headers: { "Cache-Control": "no-store" },
          status: 404
        }
      );
    }

    return NextResponse.json(
      { post },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to update blog post"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}

export async function DELETE(request: Request, { params }: BlogPostRouteProps) {
  if (!adminClawRequestAllowed(request)) {
    return unauthorized();
  }

  const { idOrSlug } = await params;
  const post = await archiveBlogPost(idOrSlug, localeFromUrl(request));

  if (!post) {
    return NextResponse.json(
      { message: "Blog post not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  return NextResponse.json(
    { post },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}
