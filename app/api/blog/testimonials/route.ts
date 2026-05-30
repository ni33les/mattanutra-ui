import {
  createTestimonial,
  listTestimonialsForApi
} from "@/lib/blog";
import {
  openClawJson,
  readJsonObject,
  requireOpenClawAccess
} from "@/lib/openclaw-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.read");

  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const testimonials = await listTestimonialsForApi(
    url.searchParams.get("locale"),
    status
  );

  return openClawJson({ testimonials });
}

export async function POST(request: Request) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.write");

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const testimonial = await createTestimonial(await readJsonObject(request));

    return openClawJson(
      { testimonial },
      {
        status: 201
      }
    );
  } catch (error) {
    return openClawJson(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create testimonial"
      },
      {
        status: 400
      }
    );
  }
}
