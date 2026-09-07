/** Next's bundler normally resolves these extensionless server entry points. */
export async function resolve(specifier, context, nextResolve) {
  if (["next/server", "next/headers", "next/cache", "next/navigation"].includes(specifier)) return nextResolve(`${specifier}.js`, context);
  return nextResolve(specifier, context);
}
