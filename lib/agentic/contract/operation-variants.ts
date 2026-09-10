import type { TSchema } from "@sinclair/typebox";

/** Expose every flat field to hosts while preserving mutually exclusive branches. */
export function visibleOperationVariants<T extends TSchema>(schema: T): T {
  const variants = schema.anyOf as TSchema[];
  const keys = [...new Set(variants.flatMap(row => Object.keys(row.properties)))];
  const properties = Object.fromEntries(keys.map(key => {
    const choices = [...new Map(variants.filter(row => row.properties[key]).map(row => {
      const value = row.properties[key]; return [JSON.stringify(value), value] as const;
    })).values()];
    if (choices.length === 1) return [key, choices[0]];
    if (choices.every(row => row.type === "string" && (row.enum || typeof row.const === "string"))) {
      const firstDefault = choices.find(row => row.default !== undefined);
      return [key, { type: "string", enum: [...new Set(choices.flatMap(row => row.enum ?? [row.const]))],
        ...(firstDefault ? { default: firstDefault.default } : {}), ...(choices[0].description ? { description: choices[0].description } : {}) }];
    }
    return [key, { anyOf: choices }];
  }));
  const required = (variants[0].required as string[]).filter(key => variants.every(row => row.required.includes(key)));
  return { ...schema, type: "object", properties, required, additionalProperties: false };
}
