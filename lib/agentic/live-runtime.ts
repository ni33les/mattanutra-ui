import { loadAgenticConfig } from "@/lib/agentic/config";
import {
  createAgenticRuntime,
  getAgenticRuntime,
  type AgenticRuntime
} from "@/lib/agentic/runtime";
import { createRuntimeStore } from "@/lib/agentic/store/postgres";

const globalLive = globalThis as typeof globalThis & {
  mattanutraLiveAgenticRuntime?: AgenticRuntime;
};

export function getLiveAgenticRuntime(request?: Request): AgenticRuntime {
  if (globalLive.mattanutraLiveAgenticRuntime) {
    return globalLive.mattanutraLiveAgenticRuntime;
  }

  try {
    globalLive.mattanutraLiveAgenticRuntime = createAgenticRuntime({
      config: loadAgenticConfig(request),
      store: createRuntimeStore()
    });
    return globalLive.mattanutraLiveAgenticRuntime;
  } catch {
    return getAgenticRuntime(request);
  }
}
