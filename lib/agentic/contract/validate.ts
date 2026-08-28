import {
  businessError,
  type AgenticErrorResult
} from "@/lib/agentic/contract/errors";
import type { JsonSchema } from "@/lib/agentic/contract/schemas";

export type SchemaIssue = Readonly<{
  fieldPath: string;
  message: string;
  reasonCode:
    | "required"
    | "unexpected_property"
    | "positive_number_required"
    | "unsupported_unit"
    | "duplicate_supplement"
    | "legacy_id"
    | "too_short";
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function schemaType(schema: JsonSchema) {
  return typeof schema.type === "string" ? schema.type : null;
}

function resolveRef(
  root: JsonSchema,
  schema: JsonSchema
): JsonSchema {
  const ref = schema.$ref;

  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return schema;
  }

  const parts = ref.slice(2).split("/");
  let current: unknown = root;

  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return schema;
    }

    current = current[part];
  }

  return isRecord(current) ? (current as JsonSchema) : schema;
}

function joinPath(base: string, key: string) {
  if (!base) {
    return key.startsWith("[") ? `request${key}` : key;
  }

  return key.startsWith("[") ? `${base}${key}` : `${base}.${key}`;
}

function uniqueFailed(values: unknown[]) {
  const seen = new Set<string>();

  for (const value of values) {
    const key = JSON.stringify(value);

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function validateNode(
  root: JsonSchema,
  schema: JsonSchema,
  value: unknown,
  path: string
): SchemaIssue | null {
  const resolved = resolveRef(root, schema);

  if (Array.isArray(resolved.oneOf)) {
    const issues: SchemaIssue[] = [];

    for (const option of resolved.oneOf) {
      if (!isRecord(option)) {
        continue;
      }

      const issue = validateNode(root, option as JsonSchema, value, path);

      if (!issue) {
        return null;
      }

      issues.push(issue);
    }

    return (
      issues.find((item) => item.reasonCode === "unexpected_property") ??
      issues[0] ?? {
        fieldPath: path || "request",
        message: "Request does not match the tool schema.",
        reasonCode: "required"
      }
    );
  }

  if (Object.prototype.hasOwnProperty.call(resolved, "const")) {
    if (value !== resolved.const) {
      return {
        fieldPath: path || "request",
        message: "Value is not the required constant.",
        reasonCode: "required"
      };
    }
  }

  const type = schemaType(resolved);

  if (type === "object" || resolved.properties || resolved.additionalProperties === false) {
    if (!isRecord(value)) {
      return {
        fieldPath: path || "request",
        message: "Expected an object.",
        reasonCode: "required"
      };
    }

    const properties = isRecord(resolved.properties)
      ? (resolved.properties as Record<string, JsonSchema>)
      : {};
    const required = Array.isArray(resolved.required)
      ? resolved.required.filter((item): item is string => typeof item === "string")
      : [];

    for (const key of required) {
      if (!(key in value) || value[key] === undefined) {
        return {
          fieldPath: joinPath(path, key),
          message: `${key} is required.`,
          reasonCode: "required"
        };
      }
    }

    if (resolved.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          if (/^sexAtBirth$/i.test(key)) {
            if (!("sex" in value) || value.sex === undefined) {
              return {
                fieldPath: joinPath(path, "sex"),
                message: "sex is required.",
                reasonCode: "required"
              };
            }

            return {
              fieldPath: path || "profile",
              message: "Unexpected property.",
              reasonCode: "unexpected_property"
            };
          }

          return {
            fieldPath: joinPath(path, key),
            message: `Unexpected property ${key}.`,
            reasonCode: "unexpected_property"
          };
        }
      }
    }

    for (const [key, child] of Object.entries(properties)) {
      if (!(key in value) || value[key] === undefined) {
        continue;
      }

      const issue = validateNode(root, child, value[key], joinPath(path, key));

      if (issue) {
        return issue;
      }
    }

    return null;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      return {
        fieldPath: path || "request",
        message: "Expected an array.",
        reasonCode: "required"
      };
    }

    if (typeof resolved.minItems === "number" && value.length < resolved.minItems) {
      return {
        fieldPath: path || "request",
        message: "Array is too short.",
        reasonCode: "required"
      };
    }

    if (typeof resolved.maxItems === "number" && value.length > resolved.maxItems) {
      return {
        fieldPath: path || "request",
        message: "Array is too long.",
        reasonCode: "required"
      };
    }

    if (resolved.uniqueItems === true && uniqueFailed(value)) {
      return {
        fieldPath: path || "request",
        message: "Array items must be unique.",
        reasonCode: "duplicate_supplement" as SchemaIssue["reasonCode"]
      };
    }

    const itemSchema = isRecord(resolved.items)
      ? (resolved.items as JsonSchema)
      : null;

    if (itemSchema) {
      for (const [index, item] of value.entries()) {
        const issue = validateNode(root, itemSchema, item, joinPath(path, `[${index}]`));

        if (issue) {
          return issue;
        }
      }
    }

    return null;
  }

  if (type === "string") {
    if (typeof value !== "string") {
      return {
        fieldPath: path || "request",
        message: "Expected a string.",
        reasonCode: "required"
      };
    }

    if (typeof resolved.minLength === "number" && value.length < resolved.minLength) {
      return {
        fieldPath: path || "request",
        message: "String is too short.",
        reasonCode: "too_short"
      };
    }

    if (typeof resolved.maxLength === "number" && value.length > resolved.maxLength) {
      return {
        fieldPath: path || "request",
        message: "String is too long.",
        reasonCode: "required"
      };
    }

    if (typeof resolved.pattern === "string" && !new RegExp(resolved.pattern).test(value)) {
      const reasonCode = resolved.pattern.includes("sup_") || resolved.pattern.includes("prd_")
        ? "legacy_id"
        : "required";

      return {
        fieldPath: path || "request",
        message: "Value does not match the required pattern.",
        reasonCode: reasonCode as SchemaIssue["reasonCode"]
      };
    }
  }

  if (type === "integer" || type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return {
        fieldPath: path || "request",
        message: "Expected a number.",
        reasonCode: "positive_number_required"
      };
    }

    if (type === "integer" && !Number.isInteger(value)) {
      return {
        fieldPath: path || "request",
        message: "Expected an integer.",
        reasonCode: "required"
      };
    }

    if (typeof resolved.minimum === "number" && value < resolved.minimum) {
      return {
        fieldPath: path || "request",
        message: "Number is below the minimum.",
        reasonCode: "positive_number_required"
      };
    }

    if (
      typeof resolved.exclusiveMinimum === "number" &&
      value <= resolved.exclusiveMinimum
    ) {
      return {
        fieldPath: path || "request",
        message: "Number must be greater than zero.",
        reasonCode: "positive_number_required"
      };
    }

    if (typeof resolved.maximum === "number" && value > resolved.maximum) {
      return {
        fieldPath: path || "request",
        message: "Number is above the maximum.",
        reasonCode: "required"
      };
    }
  }

  if (type === "boolean" && typeof value !== "boolean") {
    return {
      fieldPath: path || "request",
      message: "Expected a boolean.",
      reasonCode: "required"
    };
  }

  if (Array.isArray(resolved.enum) && !resolved.enum.includes(value)) {
    return {
      fieldPath: path || "request",
      message: "Value is not an accepted enum member.",
      reasonCode: path.includes("unit") ? "unsupported_unit" : "required"
    };
  }

  return null;
}

export function validateToolInput(
  schema: JsonSchema,
  value: unknown
): SchemaIssue | null {
  return validateToolIssues(schema, value)[0] ?? null;
}

export function validateToolIssues(
  schema: JsonSchema,
  value: unknown
): SchemaIssue[] {
  if (Array.isArray(schema.oneOf) && isRecord(value) && typeof value.operation === "string") {
    for (const option of schema.oneOf) {
      if (!isRecord(option)) {
        continue;
      }

      const properties = isRecord(option.properties)
        ? (option.properties as Record<string, JsonSchema>)
        : {};
      const operation = properties.operation;

      if (isRecord(operation) && operation.const === value.operation) {
        return collectNode(schema, option as JsonSchema, value, "");
      }
    }
  }

  const issue = validateNode(schema, schema, value, "");
  return issue ? [issue] : [];
}

function collectNode(
  root: JsonSchema,
  schema: JsonSchema,
  value: unknown,
  path: string
): SchemaIssue[] {
  const resolved = resolveRef(root, schema);
  const type = schemaType(resolved);

  if (type === "object" || resolved.properties || resolved.additionalProperties === false) {
    if (!isRecord(value)) {
      return [
        {
          fieldPath: path || "request",
          message: "Expected an object.",
          reasonCode: "required"
        }
      ];
    }

    const properties = isRecord(resolved.properties)
      ? (resolved.properties as Record<string, JsonSchema>)
      : {};
    const required = Array.isArray(resolved.required)
      ? resolved.required.filter((item): item is string => typeof item === "string")
      : [];
    const issues: SchemaIssue[] = [];

    for (const key of required) {
      if (!(key in value) || value[key] === undefined) {
        issues.push({
          fieldPath: joinPath(path, key),
          message: `${key} is required.`,
          reasonCode: "required"
        });
      }
    }

    if (resolved.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          if (/^sexAtBirth$/i.test(key)) {
            if (!("sex" in value) || value.sex === undefined) {
              issues.push({
                fieldPath: joinPath(path, "sex"),
                message: "sex is required.",
                reasonCode: "required"
              });
              continue;
            }

            issues.push({
              fieldPath: path || "profile",
              message: "Unexpected property.",
              reasonCode: "unexpected_property"
            });
            continue;
          }

          issues.push({
            fieldPath: joinPath(path, key),
            message: `Unexpected property ${key}.`,
            reasonCode: "unexpected_property"
          });
        }
      }
    }

    for (const [key, child] of Object.entries(properties)) {
      if (!(key in value) || value[key] === undefined) {
        continue;
      }

      issues.push(...collectNode(root, child, value[key], joinPath(path, key)));
    }

    return issues;
  }

  const issue = validateNode(root, schema, value, path);
  return issue ? [issue] : [];
}

export function schemaIssuesToError(issues: readonly SchemaIssue[]): AgenticErrorResult {
  const issue = issues[0] ?? {
    fieldPath: "request",
    message: "The request is not valid.",
    reasonCode: "required" as const
  };
  return schemaIssueToError(issue, issues);
}

export function schemaIssueToError(
  issue: SchemaIssue,
  extras: readonly SchemaIssue[] = [issue]
): AgenticErrorResult {
  const reasonCode =
    issue.reasonCode === "duplicate_supplement"
      ? "duplicate_supplement"
      : issue.reasonCode === "legacy_id"
        ? "legacy_id"
        : issue.reasonCode;

  const listed = extras.length > 0 ? extras : [issue];
  const mappedReason =
    reasonCode === "unexpected_property" ? "unexpected_property" : "invalid_request";
  return businessError({
    fieldPath: issue.fieldPath,
    issues: listed.map((item) => {
      const code =
        item.reasonCode === "duplicate_supplement"
          ? "duplicate_supplement"
          : item.reasonCode === "legacy_id"
            ? "legacy_id"
            : item.reasonCode;
      return {
        fieldPath: item.fieldPath,
        messageKey: `mcp.errors.${code}`,
        reasonCode: code
      };
    }),
    message: issue.message,
    reasonCode: mappedReason
  });
}
