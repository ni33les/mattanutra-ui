import { NextResponse } from "next/server";
import {
  blogWriteAuthorized,
  createTestimonial,
  listTestimonialsForApi
} from "@/lib/blog";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    { message: "Testimonial write access is not authorized" },
    {
      headers: { "Cache-Control": "no-store" },
      status: 401
    }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  if (status && status !== "published" && !blogWriteAuthorized(request)) {
    return unauthorized();
  }

  const testimonials = await listTestimonialsForApi(
    url.searchParams.get("locale"),
    status
  );

  return NextResponse.json(
    { testimonials },
    {
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function POST(request: Request) {
  if (!blogWriteAuthorized(request)) {
    return unauthorized();
  }

  try {
    const testimonial = await createTestimonial(
      (await request.json()) as Record<string, unknown>
    );

    return NextResponse.json(
      { testimonial },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create testimonial"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 400
      }
    );
  }
}
