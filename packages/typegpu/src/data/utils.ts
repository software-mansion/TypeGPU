/**
 * A wrapper for `schema(item)` call.
 * Logs a warning if the schema is not callable.
 */
export function schemaCallWrapper<T>(item: T, schema: unknown): T {
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
