// Resolve Next's CommonJS subpaths while executing the real HTTP route in Node.
export function resolve(specifier, context, nextResolve) {
  if (/^next\/(server|headers|cache|navigation)$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
  return nextResolve(specifier, context);
}
