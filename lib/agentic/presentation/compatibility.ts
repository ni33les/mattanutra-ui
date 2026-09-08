import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
/** 7.1 changes presentation only. A saved 7.0 basket or frozen checkout keeps
 * its original matching and payment identity. Earlier semantic versions still
 * require the existing explicit refresh flow. */
export function planContractCompatible(version: string | undefined) {
  return version === AGENTIC_CONTRACT_VERSION || version === "7.0.0";
}
