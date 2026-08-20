import { loadAgenticConfig } from "@/lib/agentic/config";
import {
  createAgenticRuntime,
  getAgenticRuntime,
  type AgenticRuntime
} from "@/lib/agentic/runtime";
import { createRuntimeStore } from "@/lib/agentic/store/postgres";

let liveRuntime: AgenticRuntime | null = null;

export function getLiveAgenticRuntime(request?: Request): AgenticRuntime {
  if (liveRuntime) {
    return liveRuntime;
  }

  try {
    liveRuntime = createAgenticRuntime({
      config: loadAgenticConfig(request),
      store: createRuntimeStore()
    });
    return liveRuntime;
  } catch {
    return getAgenticRuntime(request);
  }
}
