import type { AnyData } from './dataTypes.ts';
import { formatToWGSLType } from './vertexFormatData.ts';
import { isPtr } from './wgslTypes.ts';

/**
 * A wrapper for `schema(item)` or `schema()` call on JS side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapper<T>(schema: AnyData, item?: T): T {
  const maybeType = (schema as { type: string })?.type;

  try {
    if (item !== undefined && isPtr(schema)) {
      return item;
    }
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
