import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { updateProductBrandCountries } from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type ProductBrandCountriesRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function countryCodesFromBody(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function PATCH(
  request: Request,
  { params }: ProductBrandCountriesRouteProps
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Manufacturer not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const row = await updateProductBrandCountries({
      actor: "admin_dashboard",
      brandId: id,
      countryCodes: countryCodesFromBody(body.countryCodes)
    });

    return NextResponse.json(
      { row },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to update manufacturer countries", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to update manufacturer countries"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }
}
