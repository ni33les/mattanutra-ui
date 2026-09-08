export function semanticJourney(value) {
  return Array.isArray(value) ? value.map(semanticJourney) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, semanticJourney(value[key])])) : value;
}
