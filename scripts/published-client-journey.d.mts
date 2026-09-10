export interface JourneyResult {
  locale: string;
  discovery: string;
  terminal: unknown[];
  observations: Array<{ tool: string; arguments: Record<string, unknown>; result: unknown }>;
  measurements: Array<{status: string; structuredBytes: number; messageBytes: number}>;
  readyMs: number;
}
export function runConversationalJourney(options: {
  rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  locale?: string;
  discovery?: string;
  key?: string;
  wait?: (ms: number) => Promise<void>;
  checkout?: boolean;
}): Promise<JourneyResult>;
