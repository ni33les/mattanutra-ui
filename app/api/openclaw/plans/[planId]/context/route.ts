import {
  openClawJson,
  requireOpenClawAccess,
  taskApiError
} from "@/lib/openclaw-api";
import { loadOpenClawPlanContext } from "@/lib/plan-concierge";

export const runtime = "nodejs";

type OpenClawPlanRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function GET(
  request: Request,
  { params }: OpenClawPlanRouteProps
) {
  const { unauthorized } = await requireOpenClawAccess(request, "tasks.read");

  if (unauthorized) {
    return unauthorized;
  }

  const { planId } = await params;

  try {
    const context = await loadOpenClawPlanContext(planId);

    if (!context) {
      return openClawJson({ message: "Plan not found" }, { status: 404 });
    }

    return openClawJson({ context });
  } catch (error) {
    return taskApiError(error, "Unable to load OpenClaw plan context");
  }
}
