import { AsyncLocalStorage } from 'node:async_hooks';

type RecordedCall = {
  request: unknown;
  state: 'pending' | 'completed' | 'threw';
  response?: unknown;
  error?: { name: string; message: string };
};
export type RecordedMcpTranscript = { version: 1; calls: RecordedCall[] };

/** A paired report must not quietly fall back to comparing only PASS flags. */
export function assertRecordedMcpEvidence(report: unknown, label: string) {
  const value = report as { mcpTranscript?: RecordedMcpTranscript; cases?: Array<{ evidence?: { mcpTranscript?: RecordedMcpTranscript } }> };
  const transcripts = value?.mcpTranscript ? [value.mcpTranscript] : value?.cases?.map(row => row.evidence?.mcpTranscript);
  if (!transcripts?.length || transcripts.some(row => row?.version !== 1 || !Array.isArray(row.calls)) ||
    !transcripts.some(row => row!.calls.length > 0)) throw new Error(`${label}: complete MCP request/response evidence is missing`);
}

const currentCase = new AsyncLocalStorage<RecordedCall[]>();

/** Capture only public payloads, never runtime configuration, stores or credentials. */
export async function recordMcpCall<T>(request: unknown, execute: () => Promise<T>): Promise<T> {
  const calls = currentCase.getStore();
  if (!calls) return execute();
  const row: RecordedCall = { request: structuredClone(request), state: 'pending' };
  calls.push(row);
  try {
    const response = await execute();
    row.response = structuredClone(response);
    row.state = 'completed';
    return response;
  } catch (error) {
    row.error = { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) };
    row.state = 'threw';
    throw error;
  }
}

export function recordMcpCallSync<T>(request: unknown, execute: () => T): T {
  const calls = currentCase.getStore();
  if (!calls) return execute();
  const row: RecordedCall = { request: structuredClone(request), state: 'pending' };
  calls.push(row);
  try {
    const response = execute();
    row.response = structuredClone(response);
    row.state = 'completed';
    return response;
  } catch (error) {
    row.error = { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) };
    row.state = 'threw';
    throw error;
  }
}

/** Report-level scope for direct matcher probes; exceptions retain partial evidence. */
export async function captureMcpTranscript<T>(work: () => Promise<T>): Promise<{ result: T; transcript: RecordedMcpTranscript }> {
  const calls: RecordedCall[] = [];
  return currentCase.run(calls, async () => {
    try {
      const result = await work();
      if (calls.some(row => row.state === 'pending')) throw new Error('Report returned with an unfinished MCP call');
      return { result, transcript: { version: 1 as const, calls: structuredClone(calls) } };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      Object.assign(failure, { mcpTranscript: { version: 1, calls: structuredClone(calls) } });
      throw failure;
    }
  });
}

export async function withRecordedMcpEvidence<T extends { evidence: Record<string, unknown> }>(
  work: () => Promise<T>, onError: (error: unknown) => T
): Promise<T> {
  const calls: RecordedCall[] = [];
  return currentCase.run(calls, async () => {
    let result: T;
    try {
      result = await work();
      if (calls.some(row => row.state === 'pending')) throw new Error('Case returned with an unfinished MCP call');
    } catch (error) { result = onError(error); }
    return { ...result, evidence: { ...result.evidence, mcpTranscript: { version: 1, calls: structuredClone(calls) } } };
  });
}
