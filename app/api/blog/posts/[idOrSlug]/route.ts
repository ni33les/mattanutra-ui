import {
  archiveBlogPost,
  getBlogPostForApi,
  updateBlogPost
} from "@/lib/blog";
import { isLocale } from "@/lib/i18n";
import {
  openClawJson,
  readJsonObject,
  requireOpenClawAccess
} from "@/lib/openclaw-api";

export const runtime = "nodejs";

type BlogPostRouteProps = Readonly<{
  params: Promise<{
    idOrSlug: string;
  }>;
}>;

function localeFromUrl(request: Request) {
  const value = new URL(request.url).searchParams.get("locale");

  return isLocale(value) ? value : undefined;
}

export async function GET(request: Request, { params }: BlogPostRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.read");

  if (unauthorized) {
    return unauthorized;
  }

  const { idOrSlug } = await params;
  const post = await getBlogPostForApi(idOrSlug, localeFromUrl(request));

  if (!post) {
    return openClawJson(
      { message: "Blog post not found" },
      {
        status: 404
      }
    );
  }

  return openClawJson({ post });
}

export async function PATCH(request: Request, { params }: BlogPostRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { idOrSlug } = await params;

  try {
    const post = await updateBlogPost(
      idOrSlug,
      await readJsonObject(request),
      localeFromUrl(request)
    );

    if (!post) {
      return openClawJson(
        { message: "Blog post not found" },
        {
          status: 404
        }
      );
    }

    return openClawJson({ post });
  } catch (error) {
    return openClawJson(
      {
        message:
          error instanceof Error ? error.message : "Unable to update blog post"
      },
      {
        status: 400
      }
    );
  }
}

export async function DELETE(request: Request, { params }: BlogPostRouteProps) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { idOrSlug } = await params;
  const post = await archiveBlogPost(idOrSlug, localeFromUrl(request));

  if (!post) {
    return openClawJson(
      { message: "Blog post not found" },
      {
        status: 404
      }
    );
  }

  return openClawJson({ post });
}
