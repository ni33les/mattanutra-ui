import { relative } from "node:path";

/** Preserve each test outcome/identity; elapsed time and diagnostic prose are not acceptance inputs. */
export function semanticTestEvent(event) {
  if (!["test:pass", "test:fail"].includes(event.type)) return null;
  const data = event.data;
  return { file: data.file ? relative(process.cwd(), data.file).replaceAll("\\", "/") : null,
    name: data.name, line: data.line ?? null, column: data.column ?? null, failureType: data.details?.error?.failureType ?? null, nesting: data.nesting, passed: event.type === "test:pass",
    skip: data.skip ?? false, todo: data.todo ?? false, type: data.details?.type ?? "test" };
}

export default async function* report(source) {
  for await (const event of source) {
    const row = semanticTestEvent(event);
    if (row) yield `${JSON.stringify(row)}\n`;
  }
}
