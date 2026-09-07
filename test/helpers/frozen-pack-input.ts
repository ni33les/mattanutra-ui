/** One captured input per paired acceptance run; callers preserve the raw evidence. */
export async function frozenPackInput<T extends object>(
  inputs: Record<string, unknown>, key: string, load: () => Promise<T>
): Promise<T> {
  if (Object.prototype.hasOwnProperty.call(inputs, key)) return inputs[key] as T;
  const input = await load();
  inputs[key] = input;
  return input;
}
