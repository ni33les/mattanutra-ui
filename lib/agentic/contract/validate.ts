import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { PLAN_INPUT_SCHEMA, PLAN_BRANCH_SCHEMAS, type JsonSchema } from "@/lib/agentic/contract/schemas";

export type SchemaIssue = Readonly<{
  fieldPath: string;
  message: string;
  reasonCode: "required" | "unexpected_property" | "positive_number_required" | "unsupported_unit" | "duplicate_supplement" | "legacy_id" | "too_short" | "too_long" | "too_many_items" | "too_few_items" | "invalid_type" | "invalid_enum" | "out_of_range" | "invalid_pattern";
  permittedLimit?: number | string | readonly unknown[];
  actual?: number | string;
}>;
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, coerceTypes: false, useDefaults: false, removeAdditional: false, validateFormats: false });
const validators = new WeakMap<object, ValidateFunction>();
function validator(schema: JsonSchema) {
  let compiled = validators.get(schema);
  if (!compiled) { compiled = ajv.compile(schema); validators.set(schema, compiled); }
  return compiled;
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function pointerValue(value: unknown, pointer: string) {
  for (const part of pointer.split("/").slice(1)) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return value;
}
function fieldPath(pointer: string, extra?: string) {
  const parts = pointer.split("/").slice(1).map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (extra) parts.push(extra);
  return parts.map((part, i) => /^\d+$/.test(part) ? `[${part}]` : `${i ? "." : ""}${part}`).join("") || "request";
}
function issueFrom(error: ErrorObject, data: unknown): SchemaIssue {
  const value = pointerValue(data, error.instancePath);
  const path = fieldPath(error.instancePath, error.keyword === "required" ? error.params.missingProperty : error.keyword === "additionalProperties" ? error.params.additionalProperty : undefined);
  const base = { fieldPath: path };
  switch (error.keyword) {
    case "required": return { ...base, reasonCode: "required", message: `${path} is required.` };
    case "additionalProperties": return { ...base, reasonCode: "unexpected_property", message: `${path} is not a supported field.` };
    case "maxLength": return { ...base, reasonCode: "too_long", message: `${path} must contain at most ${error.params.limit} characters.`, permittedLimit: error.params.limit, actual: typeof value === "string" ? [...value].length : undefined };
    case "minLength": return { ...base, reasonCode: "too_short", message: `${path} must contain at least ${error.params.limit} characters.`, permittedLimit: error.params.limit, actual: typeof value === "string" ? [...value].length : undefined };
    case "maxItems": case "minItems": return { ...base, reasonCode: error.keyword === "maxItems" ? "too_many_items" : "too_few_items", message: `${path} must contain ${error.keyword === "maxItems" ? "at most" : "at least"} ${error.params.limit} items.`, permittedLimit: error.params.limit, actual: Array.isArray(value) ? value.length : undefined };
    case "minimum": case "maximum": case "exclusiveMinimum": case "exclusiveMaximum": return { ...base, reasonCode: "out_of_range", message: `${path} must be ${error.params.comparison} ${error.params.limit}.`, permittedLimit: error.params.limit, actual: typeof value === "number" ? value : undefined };
    case "type": return { ...base, reasonCode: "invalid_type", message: `${path} must be ${error.params.type}.`, permittedLimit: error.params.type };
    case "enum": case "const": return { ...base, reasonCode: path.endsWith("unit") ? "unsupported_unit" : "invalid_enum", message: `${path} must use a documented value.`, permittedLimit: error.params.allowedValues ?? String(error.params.allowedValue) };
    case "uniqueItems": return { ...base, reasonCode: "duplicate_supplement", message: `${path} must contain unique items.` };
    case "pattern": return { ...base, reasonCode: /sup_|prd_/.test(error.params.pattern) ? "legacy_id" : "invalid_pattern", message: `${path} does not match ${error.params.pattern}.`, permittedLimit: error.params.pattern };
    default: return { ...base, reasonCode: "invalid_type", message: `${path} does not match a documented request variant.` };
  }
}
function branch(schema: JsonSchema, data: unknown): JsonSchema {
  if (schema === PLAN_INPUT_SCHEMA && record(data)) {
    if (!("planHandle" in data)) return PLAN_BRANCH_SCHEMAS.create;
    if ("selectedOptionId" in data) return PLAN_BRANCH_SCHEMAS.select;
    if ("answers" in data) return PLAN_BRANCH_SCHEMAS.answer;
    return Object.keys(data).some(key => key !== "planHandle") ? PLAN_BRANCH_SCHEMAS.revise : PLAN_BRANCH_SCHEMAS.get;
  }
  if (record(data) && typeof data.ok === "boolean" && Array.isArray(schema.anyOf)) {
    const selected = schema.anyOf.find((option: JsonSchema) => record(option.properties) && record(option.properties.ok) && option.properties.ok.const === data.ok &&
      (!record(option.properties.status) || (!("const" in option.properties.status) || option.properties.status.const === data.status) && (!Array.isArray(option.properties.status.enum) || option.properties.status.enum.includes(data.status))));
    if (selected) return selected as JsonSchema;
  }
  return schema;
}
function matchingUnionBranch(schema: JsonSchema, error: ErrorObject, data: unknown) {
  for (const match of error.schemaPath.matchAll(/\/(?:anyOf|oneOf)\/\d+/g)) {
    const candidate = pointerValue(schema, error.schemaPath.slice(1, match.index! + match[0].length));
    if (!record(candidate) || !record(candidate.properties)) continue;
    for (const tag of ["certainty", "ok", "status"]) {
      const tagSchema = candidate.properties[tag];
      if (!record(tagSchema) || !("const" in tagSchema)) continue;
      let pointer = error.instancePath;
      while (true) {
        const value = pointerValue(data, pointer);
        if (record(value) && tag in value) { if (value[tag] !== tagSchema.const) return false; break; }
        if (!pointer) break;
        pointer = pointer.slice(0, pointer.lastIndexOf("/"));
      }
    }
  }
  return true;
}
export function validateToolIssues(schema: JsonSchema, value: unknown): SchemaIssue[] {
  const selected = branch(schema, value);
  const check = validator(selected);
  if (check(value)) return [];
  const errors = (check.errors ?? []).filter(error => error.keyword !== "anyOf" && error.keyword !== "oneOf" && matchingUnionBranch(selected, error, value));
  const issues = errors.map(error => issueFrom(error, value));
  return issues.filter((issue, index) => issues.findIndex(other => other.fieldPath === issue.fieldPath && other.reasonCode === issue.reasonCode) === index).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}
export function validateToolInput(schema: JsonSchema, value: unknown): SchemaIssue | null { return validateToolIssues(schema, value)[0] ?? null; }
export function schemaIssuesToError(issues: readonly SchemaIssue[]): AgenticErrorResult { return schemaIssueToError(issues[0] ?? { fieldPath: "request", message: "The request is not valid.", reasonCode: "invalid_type" }, issues); }
export function schemaIssueToError(issue: SchemaIssue, extras: readonly SchemaIssue[] = [issue]): AgenticErrorResult {
  return businessError({ fieldPath: issue.fieldPath, message: issue.message, reasonCode: issue.reasonCode === "unexpected_property" ? "unexpected_property" : "invalid_request", issues: extras.map(item => ({ ...item, messageKey: `mcp.errors.${item.reasonCode}` })) });
}
