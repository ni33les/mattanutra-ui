/** Lossless document-local factoring. Only schema nodes, never example data or
 * property maps, may be replaced by a reference. Runtime validation retains the
 * original definitions so precise field errors are unchanged. */
type Node = Record<string, unknown>;
const singles = new Set(["items", "contains", "not", "if", "then", "else", "additionalProperties", "propertyNames"]);
const lists = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const maps = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
function node(value: unknown): value is Node { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function children(value: Node, visit: (value: Node) => Node): Node {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    singles.has(key) && node(item) ? visit(item) : lists.has(key) && Array.isArray(item) ? item.map(row => node(row) ? visit(row) : row)
      : maps.has(key) && node(item) ? Object.fromEntries(Object.entries(item).map(([key, row]) => [key, node(row) ? visit(row) : row])) : item]));
}
export function factorSchema<T extends object>(schema: T): T {
  const root = JSON.parse(JSON.stringify(schema)) as Node;
  // Existing document-local references already have a deliberate scope.
  if (root.$defs || root.definitions || JSON.stringify(root).includes('"$id":')) return root as T;
  const counts = new Map<string, number>();
  function count(value: Node): Node {
    const key = JSON.stringify(value); counts.set(key, (counts.get(key) ?? 0) + 1);
    children(value, count); return value;
  }
  count(root);
  const keys = [...counts.keys()].filter(key => key.length > 96 && (counts.get(key)! - 1) * key.length > counts.get(key)! * 35 + 20).sort();
  const names = new Map(keys.map((key, i) => [key, `s${i}`]));
  const definitions: Node = {};
  function visit(value: Node): Node {
    const name = names.get(JSON.stringify(value));
    if (!name) return children(value, visit);
    if (!(name in definitions)) definitions[name] = children(value, visit);
    return { $ref: `#/$defs/${name}` };
  }
  const result = children(root, visit);
  if (Object.keys(definitions).length) result.$defs = definitions;
  return result as T;
}
