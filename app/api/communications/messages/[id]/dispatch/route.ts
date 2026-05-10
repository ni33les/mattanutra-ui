import {
  openClawJson,
  requireOpenClawRequest,
  taskApiError
} from "@/lib/openclaw-api";
import { dispatchCommunicationMessage } from "@/lib/communications";

export const runtime = "nodejs";

type DispatchRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

export async function POST(request: Request, { params }: DispatchRouteProps) {
  const unauthorized = requireOpenClawRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  try {
    const result = await dispatchCommunicationMessage(id);

    return openClawJson(
      { dispatch: result },
      { status: result.configured ? 200 : 202 }
    );
  } catch (error) {
    return taskApiError(error, "Unable to dispatch communication message");
  }
}
