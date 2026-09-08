import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
/** 7.1/7.2 change presentation only. A saved 7.0 basket or frozen checkout keeps
 * its original matching and payment identity. Earlier semantic versions still
 * require the existing explicit refresh flow. */
export function planContractCompatible(version: string | undefined) {
  return version === AGENTIC_CONTRACT_VERSION || version === "7.0.0" || version === "7.1.0" || version === "7.2.0" || version === "7.2.1" || version === "7.2.2";
}
