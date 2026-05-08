import { NextResponse } from "next/server";
import {
  archiveTestimonial,
  blogWriteAuthorized,
  getTestimonialForApi,
  updateTestimonial
} from "@/lib/blog";

export const runtime = "nodejs";

type TestimonialRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function unauthorized() {
  return NextResponse.json(
    { message: "Testimonial write access is not authorized" },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="mattanutra-admin-api"'
      },
      status: 401
    }
  );
}

export async function GET(
  request: Request,
  { params }: TestimonialRouteProps
) {
  if (!blogWriteAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;
  const testimonial = await getTestimonialForApi(id);

  if (!testimonial) {
    return NextResponse.json(
      { message: "Testimonial not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  return NextResponse.json(
    { testimonial },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function PATCH(
  request: Request,
  { params }: TestimonialRouteProps
) {
  if (!blogWriteAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;

  try {
    const testimonial = await updateTestimonial(
      id,
      (await request.json()) as Record<string, unknown>
    );

    if (!testimonial) {
      return NextResponse.json(
        { message: "Testimonial not found" },
        {
          headers: { "Cache-Control": "no-store" },
          status: 404
        }
      );
    }

    return NextResponse.json(
      { testimonial },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update testimonial"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: TestimonialRouteProps
) {
  if (!blogWriteAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await params;
  const testimonial = await archiveTestimonial(id);

  if (!testimonial) {
    return NextResponse.json(
      { message: "Testimonial not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  return NextResponse.json(
    { testimonial },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}
