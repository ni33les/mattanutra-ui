export type CallMeasurement = { requestBytes: number; responseBytes: number; structuredBytes: number; textBytes: number; fields: { field: string; bytes: number }[] };
export function bytes(value: unknown): number;
export function measureCall(call: { request: unknown; response: unknown }): CallMeasurement;
export function measureJourney(calls: { request: unknown; response: unknown }[]): { calls: number; requestBytes: number; responseBytes: number; measurements: CallMeasurement[] };
export function validateInventory(manifest: { file: string; reason: string; cases: string[] }[], discovered: string[], executedCases: string[]): true;
