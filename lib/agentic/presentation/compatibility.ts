import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
/** Earlier results remain readable as history. Unexecuted plans require explicit
 * refresh under the new scoring policy; callers preserve frozen checkout recovery. */
export function planContractCompatible(version: string | undefined) {
  return version === AGENTIC_CONTRACT_VERSION;
}
