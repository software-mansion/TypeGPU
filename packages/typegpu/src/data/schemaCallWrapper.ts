import { $cast, $gpuCallable } from '../shared/symbols.ts';
import { type GPUCallable, hasCast, isGPUCallable, type ResolutionCtx } from '../types.ts';
import type { Snippet } from './snippet.ts';
import type { BaseData } from './wgslTypes.ts';

/**
 * A wrapper for `schema(item)` or `schema()` call on JS side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapper<T>(schema: BaseData, item?: T): T {
  const callSchema = schema as unknown as (item?: T) => T;

  if (hasCast(callSchema)) {
    return callSchema[$cast](item) as T;
  }

  if (typeof callSchema !== 'function') {
    // Not callable
    return item as T;
  }

  return item === undefined ? callSchema() : callSchema(item);
}

/**
 * A wrapper for `schema(item)` or `schema()` call on the GPU side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapperGPU(
  ctx: ResolutionCtx,
  schema: BaseData,
  item?: Snippet,
): Snippet {
  if (!isGPUCallable(schema)) {
    // Not callable
    return item as Snippet;
  }

  const callSchema = schema as GPUCallable<[unknown?]>;
  return item === undefined || item.value === undefined
    ? callSchema[$gpuCallable].call(ctx, [])
    : callSchema[$gpuCallable].call(ctx, [item]);
}
