import type { ChildProcess, SpawnOptions } from "node:child_process";

/** Environment returned after validating the isolated DEV database and replacing
 * provider credentials with local fixture settings. The input is never mutated. */
export type IsolatedValidationEnvironment = NodeJS.ProcessEnv & {
  MATTANUTRA_ENV: "dev";
  DB_ALLOW_DIRECT_CONNECTION: "true";
  DB_URL: string;
  TEST_DB_URL: string;
  DB_WORKER_URL: string;
  MCP_URL: "http://127.0.0.1:3100/api/mcp";
  MCP_ISOLATED_CANDIDATE: "1";
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100";
  AGENTIC_PAYMENT_PROVIDER: "mock";
  TH_RETAILER_ADAPTER: "mock_thailand";
  STRIPE_SECRET_KEY: "";
  SMTP_PASS: "";
  OPENAI_API_KEY: "";
  AGENTIC_CAPABILITY_KEY: string;
  ADMIN_SESSION_SECRET: string;
  MCP_QA_TOKEN: string;
  NODE_OPTIONS: string;
};

export function isolatedValidationEnvironment(
  input?: Readonly<NodeJS.ProcessEnv>
): IsolatedValidationEnvironment;

export function spawnValidationProcess(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
export function signalValidationProcess(
  child: Pick<ChildProcess, "pid" | "kill"> | null | undefined,
  signal?: NodeJS.Signals,
  platform?: NodeJS.Platform
): boolean;
export function validationClientMatrix(): Array<{ runId: "a" | "b"; locale: "en" | "th" | "zh-CN"; discovery: "resources" | "tools_only" }>;
export function releaseLintInputs(root?: string, baseRef?: string): {
  baseCommit: string;
  headCommit: string;
  files: string[];
  sha256: string;
};
