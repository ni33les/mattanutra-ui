import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { businessError } from "@/lib/agentic/contract/errors";

export const CLIENT_CONTRACT_VERSION_HEADER = "x-mattanutra-contract-version";
export function validateContractPin(pin?: string) {
  return pin === undefined || pin === AGENTIC_CONTRACT_VERSION ? null : businessError({
    reasonCode: "invalid_request", fieldPath: CLIENT_CONTRACT_VERSION_HEADER,
    message: `This service supports ${AGENTIC_CONTRACT_VERSION}. Use that version or omit the header.`
  });
}
