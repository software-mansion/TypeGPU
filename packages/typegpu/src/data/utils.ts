export function deepCopy<T>(item: T, schema: unknown): T {
  let result = item;
  try {
    result = (
      schema as unknown as ((item: typeof result) => typeof result)
    )(item);
  } catch {
    const maybeType = (schema as { type: string })?.type;
    console.warn(`Schema of type ${maybeType ?? '<unknown>'} is not callable.`);
  }
  return result;
}
