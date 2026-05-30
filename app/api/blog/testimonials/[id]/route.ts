import {
  archiveTestimonial,
  getTestimonialForApi,
  updateTestimonial
} from "@/lib/blog";
import {
  openClawJson,
  readJsonObject,
  requireOpenClawAccess
} from "@/lib/openclaw-api";

export const runtime = "nodejs";

type TestimonialRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function GET(
  request: Request,
  { params }: TestimonialRouteProps
) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.read");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const testimonial = await getTestimonialForApi(id);

  if (!testimonial) {
    return openClawJson(
      { message: "Testimonial not found" },
      {
        status: 404
      }
    );
  }

  return openClawJson({ testimonial });
}

export async function PATCH(
  request: Request,
  { params }: TestimonialRouteProps
) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  try {
    const testimonial = await updateTestimonial(
      id,
      await readJsonObject(request)
    );

    if (!testimonial) {
      return openClawJson(
        { message: "Testimonial not found" },
        {
          status: 404
        }
      );
    }

    return openClawJson({ testimonial });
  } catch (error) {
    return openClawJson(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update testimonial"
      },
      {
        status: 400
      }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: TestimonialRouteProps
) {
  const { unauthorized } = await requireOpenClawAccess(request, "content.write");

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;
  const testimonial = await archiveTestimonial(id);

  if (!testimonial) {
    return openClawJson(
      { message: "Testimonial not found" },
      {
        status: 404
      }
    );
  }

  return openClawJson({ testimonial });
}
