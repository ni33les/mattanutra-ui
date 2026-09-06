import { loadAgenticConfig } from "@/lib/agentic/config";
import {
  createAgenticRuntime,
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

  globalLive.mattanutraLiveAgenticRuntime = createAgenticRuntime({
    config: loadAgenticConfig(request),
    store: createRuntimeStore()
  });
  return globalLive.mattanutraLiveAgenticRuntime;
}
