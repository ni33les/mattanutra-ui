// Node's ESM resolver needs the extension that Next's bundler normally supplies.
export function resolve(specifier, context, nextResolve) {
  return nextResolve(["next/navigation", "next/link"].includes(specifier) ? `${specifier}.js` : specifier, context);
}
