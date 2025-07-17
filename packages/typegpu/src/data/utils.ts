/**
 * A wrapper for `schema(item)` call.
 * Throws an error if the schema is not callable.
 */
export function schemaCloneWrapper<T>(schema: unknown, item: T): T {
  try {
    return (schema as unknown as ((item: T) => T))(item);
  } catch {
    const maybeType = (schema as { type: string })?.type;
    throw new Error(
      `Schema of type ${
        maybeType ?? '<unknown>'
      } is not callable or was called with invalid arguments.`,
    );
  }
}

/**
 * A wrapper for `schema()` call.
 * Throws an error if the schema is not callable.
 */
export function schemaDefaultWrapper<T>(schema: unknown): T {
  try {
    return (schema as unknown as (() => T))();
  } catch {
    const maybeType = (schema as { type: string })?.type;
    throw new Error(
      `Schema of type ${maybeType ?? '<unknown>'} is not callable.`,
    );
  }
}
