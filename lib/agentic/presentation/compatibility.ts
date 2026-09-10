import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
/** The active MCP service accepts one contract; order recovery is independent. */
export function planContractCompatible(version: string | undefined) {
  return version === AGENTIC_CONTRACT_VERSION;
}
