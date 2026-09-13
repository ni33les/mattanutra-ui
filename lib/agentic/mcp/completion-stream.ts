import type { JsonRpcResponse } from "@/lib/agentic/mcp/rpc";
import { encodeJsonRpcSse } from "@/lib/agentic/mcp/transport";

export const PLAN_STREAM_WAIT_MS = 15_000;
export const PLAN_STREAM_FINISH_MS = 1_000;

type CompletionInput = {
  initial: JsonRpcResponse;
  signal: AbortSignal;
  subscribe: (notify: () => void, disconnect: () => void) => (() => void) | null;
  read: (signal: AbortSignal) => Promise<{ response: JsonRpcResponse; done: boolean }>;
  headers?: HeadersInit;
  waitMs?: number;
  onFinish?: (outcome: "result" | "processing" | "disconnected" | "read_failed", durationMs: number) => void;
};

/** One pending RPC, with comments only until its single substantive response.
 * The subscription observes work; closing it never cancels admitted matching. */
export function completionResponse(input: CompletionInput): Response | null {
  const started = performance.now();
  const end = started + Math.max(0, Math.min(input.waitMs ?? (PLAN_STREAM_WAIT_MS - PLAN_STREAM_FINISH_MS), PLAN_STREAM_WAIT_MS - PLAN_STREAM_FINISH_MS));
  const lifetime = new AbortController();
  let changed = false, closed = false;
  let wake: (() => void) | undefined;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let disconnect: (() => void) | undefined;
  const unsubscribe = input.subscribe(() => { changed = true; wake?.(); }, () => disconnect?.());
  if (!unsubscribe) return null;

  const cleanup = (outcome: Parameters<NonNullable<CompletionInput["onFinish"]>>[0]) => {
    if (closed) return;
    closed = true;
    clearTimeout(waitTimer); clearInterval(heartbeat);
    unsubscribe(); wake?.();
    if (disconnect) input.signal.removeEventListener("abort", disconnect);
    lifetime.abort(new Error("Completion observation closed"));
    input.onFinish?.(outcome, performance.now() - started);
  };
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      disconnect = () => { cleanup("disconnected"); try { controller.close(); } catch { /* reader closed */ } };
      input.signal.addEventListener("abort", disconnect, { once: true });
      if (input.signal.aborted) { disconnect(); return; }
      controller.enqueue(encoder.encode(": waiting for matching\n\n"));
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": waiting\n\n")); }, 5_000);
      let latest = input.initial;
      const finish = (outcome: "result" | "processing" | "read_failed") => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeJsonRpcSse(latest)));
        controller.close(); cleanup(outcome);
      };
      const run = async () => {
        while (!closed) {
          changed = false;
          // AbortSignal.timeout requires an integer; performance.now is fractional.
          const remaining = Math.max(1, Math.ceil(end + PLAN_STREAM_FINISH_MS - performance.now()));
          const readSignal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(Math.min(PLAN_STREAM_FINISH_MS, remaining))]);
          let onAbort: (() => void) | undefined;
          try {
            const result = await Promise.race([
              input.read(readSignal),
              new Promise<never>((_, reject) => {
                onAbort = () => reject(readSignal.reason);
                readSignal.addEventListener("abort", onAbort, { once: true });
                if (readSignal.aborted) onAbort();
              })
            ]);
            if (closed) return;
            latest = result.response;
            if (result.done) { finish("result"); return; }
          } finally { if (onAbort) readSignal.removeEventListener("abort", onAbort); }
          if (performance.now() >= end) { finish("processing"); return; }
          if (changed) continue;
          await new Promise<void>(resolve => {
            wake = () => { clearTimeout(waitTimer); wake = undefined; resolve(); };
            waitTimer = setTimeout(wake, Math.max(0, end - performance.now()));
          });
        }
      };
      void run().catch(() => { if (!closed) finish("read_failed"); });
    },
    cancel() { cleanup("disconnected"); }
  });
  const headers = new Headers(input.headers);
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-store, no-cache, no-transform");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  headers.set("x-mcp-transport", "sse-completion");
  return new Response(body, { status: 200, headers });
}
