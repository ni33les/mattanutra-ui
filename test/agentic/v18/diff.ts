import {
  EXISTING_PRESENTATION_ROOTS,
  FORBIDDEN_DIFF_PREFIXES,
  LOCALE_PRESENTATION_ROOTS
} from "./manifest.ts";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function jsonPointerDiff(left: unknown, right: unknown, path = ""): string[] {
  if (Object.is(left, right)) {
    return [];
  }
  if (left == null || right == null || typeof left !== typeof right) {
    return [path || "/"];
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    const out: string[] = [];
    for (let index = 0; index < length; index += 1) {
      out.push(...jsonPointerDiff(left[index], right[index], `${path}/${index}`));
    }
    return out;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    const out: string[] = [];
    for (const key of keys) {
      out.push(...jsonPointerDiff(left[key], right[key], `${path}/${key}`));
    }
    return out;
  }
  if (left === right) {
    return [];
  }
  return [path || "/"];
}

const OPAQUE_KEYS = new Set(["planHandle", "evidenceHandle", "correlationId"]);

export function canonicalizeOpaque(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeOpaque);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        OPAQUE_KEYS.has(key) ? "<handle>" : canonicalizeOpaque(value[key])
      ])
  );
}

function underRoot(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

export function isForbiddenLocalePath(path: string) {
  return FORBIDDEN_DIFF_PREFIXES.some((root) => underRoot(path, root));
}

export function isPermittedPresentationPath(path: string) {
  return LOCALE_PRESENTATION_ROOTS.some((root) => underRoot(path, root))
    || path === "/compactDecision/nextAction"
    || /^\/compactDecision\/advice\/\d+\/(message|uncertainty)$/.test(path);
}

export function isClosedAllowlistPath(path: string) {
  return isPermittedPresentationPath(path)
    || EXISTING_PRESENTATION_ROOTS.some((root) => underRoot(path, root));
}

export function firstForbiddenDiff(paths: readonly string[]) {
  return paths.find((path) => isForbiddenLocalePath(path)) ?? null;
}

export function atPointer(value: unknown, pointer: string): unknown {
  if (!pointer || pointer === "/") {
    return value;
  }
  const parts = pointer.split("/").slice(1);
  let current: unknown = value;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
      continue;
    }
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
