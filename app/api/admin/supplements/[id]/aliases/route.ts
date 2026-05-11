import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { addAdminSupplementAlias } from "@/lib/admin-supplements";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type AdminSupplementAliasesRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const databaseError = error as Error & {
    code?: string;
    detail?: string;
  };

  return {
    code: databaseError.code,
    detail: databaseError.detail,
    message: error.message,
    name: error.name
  };
}

export async function POST(
  request: Request,
  { params }: AdminSupplementAliasesRouteProps
) {
  const [{ id }, body] = await Promise.all([
    params,
    request.json().catch(() => ({})) as Promise<Record<string, unknown>>
  ]);
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
      { message: "Supplement not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const alias = textOrNull(body.alias);

  if (!alias) {
    return NextResponse.json(
      { message: "Supplement association name is required" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const row = await addAdminSupplementAlias({
      actor: "admin_api",
      alias,
      supplementId: id
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
    console.error("Unable to add supplement association", {
      error: errorDetails(error),
      supplementId: id
    });

    return NextResponse.json(
      { message: "Unable to add supplement association" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
