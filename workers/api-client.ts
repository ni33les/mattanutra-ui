type JsonRecord = Record<string, unknown>;
const DEFAULT_WORKER_API_TIMEOUT_MS = 60_000;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type WorkerAgentConfig = Readonly<{
  capabilities: readonly string[];
  id: string;
  metadata?: JsonRecord;
  model?: string | null;
  name: string;
  taskTypes: readonly string[];
  type: "ai" | "deterministic" | "external" | "human" | "system";
}>;

export type WorkerRegistration = Readonly<{
  agent: Readonly<{
    capabilities: string[];
    id: string;
    name: string;
    type: string;
  }>;
  polling: Readonly<{
    leaseSeconds: number;
    waitSeconds: number;
  }>;
  session: Readonly<{
    id: string;
  }>;
}>;

export class WorkerApiError extends Error {
  readonly bodyText: string;
  readonly path: string;
  readonly status: number;
  readonly url: string;

  constructor(input: Readonly<{
    bodyText: string;
    path: string;
    status: number;
    url: string;
  }>) {
    super(
      `${input.path} failed with ${input.status}: ${input.bodyText.slice(0, 500)}`
    );
    this.bodyText = input.bodyText;
    this.name = "WorkerApiError";
    this.path = input.path;
    this.status = input.status;
    this.url = input.url;
  }
}

export function isWorkerAuthConfigurationError(error: unknown) {
  if (error instanceof WorkerApiError) {
    return (
      error.status === 401 &&
      /worker api access is not authorized/i.test(error.bodyText)
    );
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /\/api\/workers\/register failed with 401: .*worker api access is not authorized/i.test(
    error.message
  );
}

export class WorkerApiClient {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs: number;

  constructor(input: Readonly<{ baseUrl: string; timeoutMs?: number; token: string }>) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.timeoutMs =
      input.timeoutMs ??
      positiveInteger(
        process.env.WORKER_API_TIMEOUT_MS,
        DEFAULT_WORKER_API_TIMEOUT_MS
      );
    this.token = input.token;
  }

  async get<T>(path: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json"
        },
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");

        throw new WorkerApiError({
          bodyText: text,
          path,
          status: response.status,
          url
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof WorkerApiError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      const cause =
        error instanceof Error &&
        error.cause &&
        typeof error.cause === "object" &&
        "message" in error.cause
          ? String(error.cause.message)
          : "";
      const suffix = cause && cause !== message ? `: ${cause}` : "";

      throw new Error(`${path} fetch failed for ${url}: ${message}${suffix}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async post<T>(path: string, body: JsonRecord) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");

        throw new WorkerApiError({
          bodyText: text,
          path,
          status: response.status,
          url
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof WorkerApiError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      const cause =
        error instanceof Error &&
        error.cause &&
        typeof error.cause === "object" &&
        "message" in error.cause
          ? String(error.cause.message)
          : "";
      const suffix = cause && cause !== message ? `: ${cause}` : "";

      throw new Error(`${path} fetch failed for ${url}: ${message}${suffix}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  register(input: Readonly<{
    agent: WorkerAgentConfig;
    concurrency: number;
    instanceId: string;
    metadata?: JsonRecord;
    workerVersion?: string | null;
  }>) {
    return this.post<WorkerRegistration>("/api/workers/register", {
      agent: {
        capabilities: input.agent.capabilities,
        id: input.agent.id,
        metadata: input.agent.metadata ?? {},
        model: input.agent.model ?? null,
        name: input.agent.name,
        type: input.agent.type
      },
      capabilities: input.agent.capabilities,
      concurrency: input.concurrency,
      instanceId: input.instanceId,
      metadata: input.metadata ?? {},
      taskTypes: input.agent.taskTypes,
      workerVersion: input.workerVersion ?? null
    });
  }

  heartbeat(input: Readonly<{
    agentId: string;
    currentTaskId?: string | null;
    status: "idle" | "offline" | "polling" | "working";
    workerSessionId: string;
  }>) {
    return this.post("/api/workers/heartbeat", input);
  }

  reserve(input: Readonly<{
    agent: WorkerRegistration["agent"];
    leaseSeconds: number;
    taskTypes: readonly string[];
    waitSeconds: number;
    workerSessionId: string;
  }>) {
    return this.post<{
      agent?: WorkerRegistration["agent"];
      reservationId?: string;
      task?: Readonly<{ id: string; taskType: string }> | null;
    }>("/api/tasks/reserve", input);
  }

  workItem(input: Readonly<{
    reservationId: string;
    taskId: string;
    workerSessionId: string;
  }>) {
    const params = new URLSearchParams({
      reservationId: input.reservationId,
      workerSessionId: input.workerSessionId
    });

    return this.get<{
      workItem?: JsonRecord;
    }>(`/api/tasks/${input.taskId}/work-item?${params.toString()}`);
  }

  renew(input: Readonly<{
    agentId: string;
    leaseSeconds: number;
    reservationId: string;
    taskId: string;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/renew`, input);
  }

  progress(input: Readonly<{
    agentId: string;
    leaseSeconds: number;
    reservationId: string;
    resultPayload: JsonRecord;
    taskId: string;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/progress`, input);
  }

  complete(input: Readonly<{
    agentId: string;
    reservationId: string;
    resultPayload: JsonRecord;
    taskId: string;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/complete`, input);
  }

  fail(input: Readonly<{
    agentId: string;
    errorMessage: string;
    reservationId: string;
    resultPayload?: JsonRecord;
    taskId: string;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/fail`, {
      ...input,
      resultPayload: input.resultPayload ?? {}
    });
  }

  comment(input: Readonly<{
    agentId: string;
    authorName?: string | null;
    authorType?: string | null;
    body: string;
    commentType?: string | null;
    metadata?: JsonRecord;
    reservationId: string;
    taskId: string;
    visibility?: string | null;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/comment`, {
      ...input,
      metadata: input.metadata ?? {}
    });
  }

  spawn(input: Readonly<{
    actorType?: string | null;
    businessValue?: number | null;
    context?: JsonRecord;
    createdByAgentId: string;
    dependencies?: ReadonlyArray<Readonly<{ taskId: string; type?: string | null }>>;
    description?: string | null;
    groupLabel?: string | null;
    id?: string | null;
    idempotencyKey?: string | null;
    idempotencyScopeKey?: string | null;
    maxAttempts?: number | null;
    payload?: JsonRecord;
    planId?: string | null;
    rayId?: string | null;
    reasoningEffort?: string | null;
    requiredCapabilities?: readonly string[];
    reservationId: string;
    scheduledFor?: string | null;
    taskGroupId?: string | null;
    taskId: string;
    taskType: string;
    title: string;
    workerSessionId: string;
  }>) {
    return this.post(`/api/tasks/${input.taskId}/spawn`, {
      ...input,
      payload: input.payload ?? {}
    });
  }

  sendCommunication(input: JsonRecord) {
    return this.post<JsonRecord>("/api/communications/send", input);
  }
}
