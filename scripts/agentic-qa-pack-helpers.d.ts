declare module "*agentic-qa-pack-helpers.mjs" {
  export function isHttpUrl(value: unknown): boolean;
  export function lineImage(line: unknown): string;
  export function optionLines(plan: unknown, frozenItems?: unknown): unknown[];
  export function everyLineHasHttpImage(lines: unknown): boolean;
  export function isFixtureShapedId(productId: unknown): boolean;
  export function isFixtureLine(line: unknown): boolean;
  export function exactToolNames(names: unknown): boolean;
  export function planProfileHasSex(planTool: unknown): boolean;
  export function unpaidA9EnvGate(env: unknown): { detail: string; pass: boolean };
  export function hasOrderTrackDestination(...values: unknown[]): boolean;
  export function collectTrackPointer(
    order: unknown,
    execute: unknown,
    html: unknown
  ): unknown;
  export function withFromMcp(url: unknown): string;
  export function absolutize(origin: unknown, url: unknown): string;
}
