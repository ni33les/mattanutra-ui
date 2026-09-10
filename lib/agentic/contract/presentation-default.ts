import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";

export const CLIENT_CONTRACT_VERSION_HEADER = "x-mattanutra-contract-version";
type View = "conversation" | "full" | "status" | "details";
function version(value: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.exec(value.trim());
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** The legacy omitted-view exception exists only during the 7.2 release.
 * A version pin controls presentation; it never changes matching or payment. */
export function planResponseView(explicit: View | undefined, pin?: string, current = AGENTIC_CONTRACT_VERSION): View | AgenticErrorResult {
  const active = version(current)!;
  const requested = pin === undefined ? null : version(pin);
  const newer = requested && (requested[0] > active[0] || (requested[0] === active[0] &&
    (requested[1] > active[1] || (requested[1] === active[1] && requested[2] > active[2]))));
  if (pin !== undefined && (!requested || newer)) {
    return businessError({ reasonCode: "invalid_request", fieldPath: CLIENT_CONTRACT_VERSION_HEADER,
      message: `Use a valid contract version no newer than ${current}, or omit the header.` });
  }
  if (explicit) return explicit;
  const compatibilityWindow = (active[0] === 7 && active[1] === 2) || active[0] === 8;
  const olderPin = requested && (requested[0] < 7 || (requested[0] === 7 && requested[1] < 2));
  return compatibilityWindow && olderPin ? "full" : "conversation";
}
