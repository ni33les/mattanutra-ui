import { requestLifetime, withRequestLifetime } from "@/lib/request-lifetime";

const encoder = new TextEncoder();

const DEFAULT_SNAPSHOT_INTERVAL_MS = 10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

function sseEvent(name: string, data: unknown) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function streamAdminSnapshots<T>({
  eventName,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  load,
  request,
  snapshotIntervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS,
  waitForSnapshotSignal
}: Readonly<{
  eventName: string;
  heartbeatIntervalMs?: number;
  load: (signal: AbortSignal) => Promise<T>;
  request: Request;
  snapshotIntervalMs?: number;
  waitForSnapshotSignal?: (timeoutMs: number, signal: AbortSignal) => Promise<boolean>;
}>) {
  const lifetime = new AbortController();
  let closed = false;
  let streaming = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  let onRequestAbort: (() => void) | undefined;

  function stop(reason?: unknown) {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(waitTimer);
    if (onRequestAbort) request.signal.removeEventListener("abort", onRequestAbort);
    lifetime.abort(reason);
  }

  async function untilClosed<Value>(work: () => Promise<Value>): Promise<Value> {
    lifetime.signal.throwIfAborted();
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(lifetime.signal.reason);
      lifetime.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([work(), aborted]);
    } finally {
      lifetime.signal.removeEventListener("abort", onAbort);
    }
  }

  function waitForInterval() {
    return new Promise<boolean>((resolve) => {
      waitTimer = setTimeout(() => { waitTimer = undefined; resolve(false); }, snapshotIntervalMs);
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    cancel(reason) {
      stop(reason);
    },
    start(controller) {
      onRequestAbort = () => {
        stop(request.signal.reason);
        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      };
      request.signal.addEventListener("abort", onRequestAbort, { once: true });
      if (request.signal.aborted) { onRequestAbort(); return; }

      async function sendSnapshot() {
        if (closed || streaming) {
          return;
        }

        streaming = true;

        try {
          const data = await untilClosed(() => withRequestLifetime(
            { ...requestLifetime(), signal: lifetime.signal },
            () => load(lifetime.signal)
          ));

          if (!closed) {
            controller.enqueue(sseEvent(eventName, data));
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(
              sseEvent("error", {
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to stream admin data"
              })
            );
          }
        } finally {
          streaming = false;
        }
      }

      function sendHeartbeat() {
        if (!closed) {
          controller.enqueue(
            sseEvent("pong", {
              at: new Date().toISOString()
            })
          );
        }
      }

      heartbeat = setInterval(sendHeartbeat, heartbeatIntervalMs);
      void sendSnapshot();
      sendHeartbeat();

      void (async function streamSnapshots() {
        while (!closed) {
          try {
            await untilClosed(() => waitForSnapshotSignal
              ? waitForSnapshotSignal(snapshotIntervalMs, lifetime.signal)
              : waitForInterval());
          } catch {
            if (closed) return;
            try {
              await untilClosed(waitForInterval);
            } catch {
              return;
            }
          }

          await sendSnapshot();
        }
      })();

    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    }
  });
}
