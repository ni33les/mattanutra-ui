import { NextResponse } from "next/server";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import { deleteAdminSupplementAlias } from "@/lib/admin-supplements";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type AdminSupplementAliasRouteProps = Readonly<{
  params: Promise<{
    aliasId: string;
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

export async function DELETE(
  request: Request,
  { params }: AdminSupplementAliasRouteProps
) {
  const [{ aliasId, id }, body] = await Promise.all([
    params,
    request.json().catch(() => ({})) as Promise<Record<string, unknown>>
  ]);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardTokenAllowed(accessToken)) {
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

  if (!isUuid(id) || !isUuid(aliasId)) {
    return NextResponse.json(
      { message: "Supplement association not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const row = await deleteAdminSupplementAlias({
      actor: "admin_dashboard",
      aliasId,
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
    console.error("Unable to delete supplement association", {
      error: errorDetails(error),
      supplementAliasId: aliasId,
      supplementId: id
    });

    return NextResponse.json(
      { message: "Unable to delete supplement association" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
