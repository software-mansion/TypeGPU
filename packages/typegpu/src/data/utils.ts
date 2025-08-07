import { formatToWGSLType } from './vertexFormatData';

/**
 * A wrapper for `schema(item)` call.
 * Throws an error if the schema is not callable.
 */
export function schemaCloneWrapper<T>(schema: unknown, item: T): T {
  const maybeType = (schema as { type: string })?.type;

  try {
    // TgpuVertexFormatData are not callable
    const cloningSchema = maybeType in formatToWGSLType
      ? formatToWGSLType[maybeType as keyof typeof formatToWGSLType]
      : schema;
    return (cloningSchema as unknown as ((item: T) => T))(item);
  } catch (e) {
    console.log(e);
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
  const maybeType = (schema as { type: string })?.type;

  try {
    // TgpuVertexFormatData are not callable
    const cloningSchema = maybeType in formatToWGSLType
      ? formatToWGSLType[maybeType as keyof typeof formatToWGSLType]
      : schema;
    return (cloningSchema as unknown as (() => T))();
  } catch {
    throw new Error(
      `Schema of type ${maybeType ?? '<unknown>'} is not callable.`,
    );
  }
}
