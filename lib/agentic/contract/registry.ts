import { AGENTIC_INPUT_SCHEMAS } from "@/lib/agentic/contract/schemas";
import { AGENTIC_OUTPUT_SCHEMAS } from "@/lib/agentic/contract/outputs";

/** Every transport, generator and release checksum uses these same wire contracts. */
export const AGENTIC_CONTRACT_REGISTRY = Object.fromEntries(
  Object.entries(AGENTIC_INPUT_SCHEMAS).map(([name, inputSchema]) => [name, {
    inputSchema, outputSchema: AGENTIC_OUTPUT_SCHEMAS[name as keyof typeof AGENTIC_OUTPUT_SCHEMAS]
  }])
) as { readonly [K in keyof typeof AGENTIC_INPUT_SCHEMAS]: Readonly<{ inputSchema: typeof AGENTIC_INPUT_SCHEMAS[K]; outputSchema: typeof AGENTIC_OUTPUT_SCHEMAS[K] }> };
