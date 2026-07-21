/**
 * Thin structured logger for API / server paths.
 *
 * - Emits one JSON object per line (easy for DO/log drains).
 * - Redacts common secret and PII field names.
 * - Never throws from logging.
 *
 * Multi-instance: stdout is enough; no shared transport required.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<Record<string, unknown>>;

// Match secrets even when embedded in camelCase (e.g. stripeSecret, accessToken).
const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|refresh|private[_-]?key|credit[_-]?card|card[_-]?number|cvv|\bssn\b|session/i;

const EMAIL_KEY = /email|e-mail/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactEmail(value: string) {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");

  if (at < 1) {
    return "[redacted-email]";
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const localPreview = local.length <= 2 ? "*" : `${local[0]}***`;

  return `${localPreview}@${domain}`;
}

function redactString(key: string, value: string) {
  if (SENSITIVE_KEY.test(key)) {
    return "[redacted]";
  }

  if (EMAIL_KEY.test(key)) {
    return redactEmail(value);
  }

  return value;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(key, value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { stack: value.stack })
    };
  }

  if (depth >= 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, index) =>
      sanitizeValue(String(index), item, depth + 1)
    );
  }

  if (isPlainObject(value)) {
    if (SENSITIVE_KEY.test(key)) {
      return "[redacted]";
    }

    const out: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeValue(childKey, childValue, depth + 1);
    }

    return out;
  }

  return String(value);
}

export function sanitizeLogFields(
  fields?: LogFields | null
): Record<string, unknown> | undefined {
  if (!fields) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    out[key] = sanitizeValue(key, value, 0);
  }

  return out;
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields
) {
  try {
    const payload = {
      level,
      message,
      scope,
      ts: new Date().toISOString(),
      ...sanitizeLogFields(fields)
    };
    const line = JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    if (level === "debug") {
      if (process.env.NODE_ENV !== "production") {
        console.debug(line);
      }
      return;
    }

    console.info(line);
  } catch {
    // Logging must never break request handling.
  }
}

export type Logger = Readonly<{
  debug: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  child: (childScope: string) => Logger;
}>;

export function createLogger(scope: string): Logger {
  const base = scope.trim() || "app";

  return {
    child(childScope: string) {
      return createLogger(`${base}.${childScope.trim()}`);
    },
    debug(message, fields) {
      emit("debug", base, message, fields);
    },
    error(message, fields) {
      emit("error", base, message, fields);
    },
    info(message, fields) {
      emit("info", base, message, fields);
    },
    warn(message, fields) {
      emit("warn", base, message, fields);
    }
  };
}
