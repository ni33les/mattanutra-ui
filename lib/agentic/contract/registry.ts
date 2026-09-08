import { AGENTIC_INPUT_SCHEMAS } from "@/lib/agentic/contract/schemas";
import { AGENTIC_OUTPUT_SCHEMAS } from "@/lib/agentic/contract/outputs";
import { factorSchema } from "@/lib/agentic/contract/factor-schema";

/** Every transport, generator and release checksum uses these same wire contracts. */
export const AGENTIC_CONTRACT_REGISTRY = Object.fromEntries(
  Object.entries(AGENTIC_INPUT_SCHEMAS).map(([name, inputSchema]) => [name, {
    // Hosts commonly compile individual union branches without carrying the
    // document's $defs. Keep callable inputs self-contained, exactly as info's
    // operation schema; factoring remains safe for explicitly fetched outputs.
    inputSchema: JSON.parse(JSON.stringify(inputSchema)), outputSchema: factorSchema(AGENTIC_OUTPUT_SCHEMAS[name as keyof typeof AGENTIC_OUTPUT_SCHEMAS])
  }])
) as { readonly [K in keyof typeof AGENTIC_INPUT_SCHEMAS]: Readonly<{ inputSchema: typeof AGENTIC_INPUT_SCHEMAS[K]; outputSchema: typeof AGENTIC_OUTPUT_SCHEMAS[K] }> };
