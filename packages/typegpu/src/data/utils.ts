import type { AnyData } from './index.ts';
import { formatToWGSLType } from './vertexFormatData.ts';

/**
 * A wrapper for `schema(item)` or `schema()` call.
 * If the schema is a TgpuVertexFormatData, it instead calls the corresponding constructible schema.
 * Throws an error if the schema is not callable.
 */
export function schemaCallWrapper<T>(schema: AnyData, item?: T): T {
  const maybeType = (schema as { type: string })?.type;

  try {
    // TgpuVertexFormatData are not callable
    const callSchema = (maybeType in formatToWGSLType
      ? formatToWGSLType[maybeType as keyof typeof formatToWGSLType]
      : schema) as unknown as ((item?: T) => T);
    if (item === undefined) {
      return callSchema();
    }
    return callSchema(item);
  } catch (e) {
    throw new Error(
      `Schema of type ${
        maybeType ?? '<unknown>'
      } is not callable or was called with invalid arguments.`,
    );
  }
}
