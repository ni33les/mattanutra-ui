import { readFile } from "node:fs/promises";

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) return {format:'module',source:'export default {}',shortCircuit:true};
  if (url.endsWith('/content/checkout/web.json')) return {format:'module',source:`export default ${await readFile(new URL(url), 'utf8')};`,shortCircuit:true};
  return nextLoad(url,context);
}

// The real LINE panel imports Next's image component during static rendering.
export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/image' ? 'next/image.js' : specifier, context);
}
