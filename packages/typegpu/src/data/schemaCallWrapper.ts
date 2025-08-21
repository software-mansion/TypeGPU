import type { AnyData } from './dataTypes.ts';
import { formatToWGSLType } from './vertexFormatData.ts';

/**
 * A wrapper for `schema(item)` or `schema()` call on JS side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapper<T>(schema: AnyData, item?: T): T {
  const maybeType = (schema as { type: string })?.type;

  // TgpuVertexFormatData are not callable
  const callSchema =
    (maybeType in formatToWGSLType
      ? formatToWGSLType[maybeType as keyof typeof formatToWGSLType]
      : schema) as unknown as ((item?: T) => T);

  if (typeof callSchema !== 'function') {
    // Not callable
    return item as T;
  }

  return item === undefined ? callSchema() : callSchema(item);
}
