import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { streamAdminSnapshots } from "../lib/admin-sse.ts";
import { requestLifetime } from "../lib/request-lifetime.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function streamRequest() {
  const controller = new AbortController();
  const request = new Request("http://example.invalid/admin/events", { signal: controller.signal });
  return { controller, request };
}

test("ADMIN-SSE-01 an already-aborted request performs no snapshot load", async () => {
  const { controller, request } = streamRequest();
  controller.abort(new Error("Already disconnected"));
  let calls = 0;
  const response = streamAdminSnapshots({
    eventName: "visibility", request, snapshotIntervalMs: 10, heartbeatIntervalMs: 10,
    load: async () => { calls++; return { tasks: [] }; }
  });
  try {
    assert.equal(calls, 0);
    assert.deepEqual(await response.body!.getReader().read(), { done: true, value: undefined });
  } finally {
    if (!response.body!.locked) await response.body!.cancel();
  }
});

test("ADMIN-SSE-02 request abort cancels an active snapshot read through its request lifetime", async () => {
  const { controller, request } = streamRequest();
  const release = deferred<{ tasks: never[] }>();
  let readSignal: AbortSignal | undefined;
  let lifetimeSignal: AbortSignal | undefined;
  const response = streamAdminSnapshots({
    eventName: "visibility", request, snapshotIntervalMs: 10, heartbeatIntervalMs: 10,
    load: async (signal?: AbortSignal) => {
      readSignal = signal;
      lifetimeSignal = requestLifetime()?.signal;
      return release.promise;
    }
  });
  const reader = response.body!.getReader();
  try {
    await reader.read(); // Consume the unchanged initial heartbeat.
    controller.abort(new Error("Client disconnected while loading"));
    release.resolve({ tasks: [] });
    assert.ok(readSignal, "snapshot reads receive an observation cancellation signal");
    assert.equal(readSignal.aborted, true);
    assert.equal(lifetimeSignal, readSignal, "database helpers inherit the observation lifetime");
    assert.equal(getEventListeners(request.signal, "abort").length, 0);
    assert.equal((await reader.read()).done, true);
  } finally {
    release.resolve({ tasks: [] });
    await reader.cancel();
  }
});

test("ADMIN-SSE-03 reader cancellation aborts a signal wait and removes request listeners", async () => {
  const { request } = streamRequest();
  const entered = deferred<void>();
  const release = deferred<boolean>();
  let waitSignal: AbortSignal | undefined;
  const response = streamAdminSnapshots({
    eventName: "visibility", request, snapshotIntervalMs: 10, heartbeatIntervalMs: 10,
    load: async () => ({ tasks: [] }),
    waitForSnapshotSignal: async (_timeoutMs, signal?: AbortSignal) => {
      waitSignal = signal;
      entered.resolve();
      return release.promise;
    }
  });
  try {
    await entered.promise;
    await response.body!.cancel();
    assert.ok(waitSignal, "snapshot waits receive an observation cancellation signal");
    assert.equal(waitSignal.aborted, true);
    assert.equal(getEventListeners(request.signal, "abort").length, 0);
  } finally {
    release.resolve(false);
    if (!response.body!.locked) await response.body!.cancel();
  }
});

test("ADMIN-SSE-04 cancellation during a failing snapshot does not emit a late error event", async () => {
  const { controller, request } = streamRequest();
  const release = deferred<never>();
  const response = streamAdminSnapshots({
    eventName: "visibility", request, snapshotIntervalMs: 10, heartbeatIntervalMs: 10,
    load: () => release.promise
  });
  const reader = response.body!.getReader();
  try {
    await reader.read();
    controller.abort();
    release.reject(new Error("Late database cancellation"));
    assert.equal((await reader.read()).done, true);
    assert.equal(getEventListeners(request.signal, "abort").length, 0);
  } finally {
    await reader.cancel();
  }
});

test("ADMIN-SSE-05 snapshot, error and heartbeat event shapes remain compatible", async () => {
  for (const fail of [false, true]) {
    const { controller, request } = streamRequest();
    const response = streamAdminSnapshots({
      eventName: "agents", request, snapshotIntervalMs: 10, heartbeatIntervalMs: 10,
      load: async () => {
        if (fail) throw new Error("Snapshot unavailable");
        return { agents: [{ id: "agent-one" }] };
      }
    });
    const reader = response.body!.getReader();
    try {
      const decoder = new TextDecoder();
      const events = [decoder.decode((await reader.read()).value), decoder.decode((await reader.read()).value)];
      const heartbeat = events.find(value => value.startsWith("event: pong\n"));
      assert.ok(heartbeat);
      const heartbeatData = JSON.parse(heartbeat.split("data: ")[1]!);
      assert.ok(Number.isFinite(Date.parse(heartbeatData.at)));
      assert.ok(events.includes(fail
        ? 'event: error\ndata: {"message":"Snapshot unavailable"}\n\n'
        : 'event: agents\ndata: {"agents":[{"id":"agent-one"}]}\n\n'));
    } finally {
      controller.abort();
      await reader.cancel();
    }
  }
});
